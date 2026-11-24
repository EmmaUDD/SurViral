import type { CategoryValue, FilterOptions, Filters, Measure, Overview, TimePoint } from '../types/dashboard.ts';
import { ageBands } from '../utils/ages.ts';
import { regions, validateFiltersAgainst } from './catalog.ts';
import { NO_STAY, SEX_IDS, UNKNOWN_U8, type GrdDataset, type GrdMeta } from './realData.ts';

export const UNKNOWN_REGION_ID = 'unknown';

const DAY_MS = 86_400_000;
const dayIndex = (base: string, date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${base}T00:00:00Z`)) / DAY_MS);
const monthIndex = (baseYear: number, date: string) => (Number(date.slice(0, 4)) - baseYear) * 12 + Number(date.slice(5, 7)) - 1;

const monthLookups = new WeakMap<GrdMeta, Uint16Array>();
/** Mes (relativo a enero del año base) de cada día del rango de datos. */
function monthOfDay(meta: GrdMeta): Uint16Array {
  let lookup = monthLookups.get(meta);
  if (!lookup) {
    const baseYear = Number(meta.baseDate.slice(0, 4)), days = dayIndex(meta.baseDate, meta.maxDate) + 1, origin = Date.parse(`${meta.baseDate}T00:00:00Z`);
    lookup = new Uint16Array(days);
    for (let d = 0; d < days; d++) lookup[d] = monthIndex(baseYear, new Date(origin + d * DAY_MS).toISOString().slice(0, 10));
    monthLookups.set(meta, lookup);
  }
  return lookup;
}

function measure(value: number | null, unit: Measure['unit'], validCount: number, reason?: Measure['reason']): Measure {
  return { value, status: value === null ? 'unavailable' : 'available', unit, validCount, ...(reason ? { reason } : {}) };
}

function medianFromHistogram(histogram: Uint32Array, count: number): number | null {
  if (!count) return null;
  const lower = Math.floor((count - 1) / 2), upper = Math.floor(count / 2);
  let seen = 0, low: number | null = null;
  for (let value = 0; value < histogram.length; value++) {
    seen += histogram[value];
    if (low === null && seen > lower) low = value;
    if (seen > upper) return (low! + value) / 2;
  }
  return null;
}

export function summarizeReal(filters: Filters, data: GrdDataset, options: FilterOptions): Overview {
  validateFiltersAgainst(filters, options);
  const { meta } = data;
  const baseYear = Number(meta.baseDate.slice(0, 4));
  const startDay = dayIndex(meta.baseDate, filters.startDate), endDay = dayIndex(meta.baseDate, filters.endDate);
  const firstMonth = monthIndex(baseYear, filters.startDate), months = monthIndex(baseYear, filters.endDate) - firstMonth + 1;
  const regionCode = filters.region === 'all' ? -1 : Number(filters.region);
  const communeCode = filters.commune === 'all' ? -1 : Number(filters.commune);
  const communeSet = filters.communes?.length ? new Set(filters.communes.map(Number)) : null;
  const ageCode = filters.age === 'all' ? -1 : filters.age === 'unknown' ? UNKNOWN_U8 : ageBands.findIndex(b => b.id === filters.age);
  const sexCode = filters.sex === 'all' ? -1 : SEX_IDS.indexOf(filters.sex);
  const diagCode = filters.diagnosis === 'all' ? -1 : meta.diagnoses.findIndex(d => d.id === filters.diagnosis);
  const monthOf = monthOfDay(meta);

  const monthCounts = new Uint32Array(months), regionMonth = new Uint32Array(17 * months), regionCounts = new Uint32Array(17);
  const diagCounts = new Uint32Array(meta.diagnoses.length), ageCounts = new Uint32Array(ageBands.length + 1), sexCounts = new Uint32Array(3);
  const stays = new Uint32Array(meta.maxStay + 1), communeCounts = new Uint32Array(65536);
  let universe = 0, selected = 0, missingStay = 0;
  const { day, stay, commune, region, age, sex, diag } = data;
  for (let i = 0; i < meta.rows; i++) {
    const d = day[i];
    if (d < startDay || d > endDay) continue;
    if (regionCode >= 0 && region[i] !== regionCode) continue;
    if (communeCode >= 0 && commune[i] !== communeCode) continue;
    if (communeSet && !communeSet.has(commune[i])) continue;
    if (ageCode >= 0 && age[i] !== ageCode) continue;
    if (sexCode >= 0 && sex[i] !== sexCode) continue;
    universe++;
    // El diagnóstico solo define el numerador, igual que en la fuente simulada.
    if (diagCode >= 0 && diag[i] !== diagCode) continue;
    selected++;
    const m = monthOf[d] - firstMonth, r = region[i];
    monthCounts[m]++; regionMonth[r * months + m]++; regionCounts[r]++; communeCounts[commune[i]]++;
    diagCounts[diag[i]]++; sexCounts[sex[i]]++;
    ageCounts[age[i] === UNKNOWN_U8 ? ageBands.length : age[i]]++;
    if (stay[i] === NO_STAY) missingStay++; else stays[stay[i]]++;
  }

  const percent = (value: number) => selected ? 100 * value / selected : null;
  const category = (id: string, label: string, value: number): CategoryValue => ({ id, label, value, percent: percent(value) });
  const monthly: TimePoint[] = Array.from({ length: months }, (_, m) => {
    const absolute = firstMonth + m, year = baseYear + Math.floor(absolute / 12), month = absolute % 12 + 1;
    const period = `${year}-${String(month).padStart(2, '0')}`;
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return { period, value: monthCounts[m], status: 'available', partial: filters.startDate > `${period}-01` || filters.endDate < end };
  });

  // Todos los diagnósticos con egresos, de mayor a menor; DiagnosisBars agrupa los menos frecuentes al mostrar.
  const diagnoses = diagCode >= 0
    ? [category(meta.diagnoses[diagCode].id, meta.diagnoses[diagCode].label, selected)]
    : meta.diagnoses.map((o, i) => category(o.id, o.label, diagCounts[i])).filter(o => o.value > 0).sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));

  const selectedRegions = communeSet ? new Set(options.communes.filter(c => communeSet.has(Number(c.id))).map(c => c.region)) : null;
  const shownRegions = regions.filter(r => (filters.region === 'all' || r.id === filters.region) && (!selectedRegions || selectedRegions.has(r.id)));
  const territories = shownRegions.map(r => category(r.id, r.label, regionCounts[Number(r.id)]));
  if (filters.region === 'all' && !communeSet && regionCounts[0] > 0) territories.push(category(UNKNOWN_REGION_ID, 'Sin región de residencia registrada', regionCounts[0]));
  const communes = options.communes
    .filter(c => (filters.region === 'all' || c.region === filters.region) && (filters.commune === 'all' || c.id === filters.commune) && (!communeSet || communeSet.has(Number(c.id))))
    .map(c => category(c.id, c.label, communeCounts[Number(c.id)]));

  const validStays = selected - missingStay;
  const median = medianFromHistogram(stays, validStays);
  const unknownRegion = filters.region === 'all' && !communeSet ? regionCounts[0] : 0;
  return {
    status: selected ? 'ready' : 'empty',
    indicators: {
      hospitalizations: measure(selected, 'events', selected),
      proportion: measure(null, 'percent', universe, 'no_universe'),
      medianStay: measure(median, 'days', validStays, median === null ? selected ? 'missing_values' : 'no_events' : undefined),
    },
    monthly,
    regionalMonthly: shownRegions.map(r => ({ ...r, points: monthly.map((p, m) => ({ ...p, value: regionMonth[Number(r.id) * months + m] })) })),
    diagnoses,
    territories,
    communes,
    demographics: {
      age: [...ageBands.map((b, i) => category(b.id, b.label, ageCounts[i])), category('unknown', 'Edad desconocida', ageCounts[ageBands.length])],
      sex: options.sexes.map((o, i) => category(o.id, o.label, sexCounts[i])),
    },
    meta: {
      mode: 'real', source: meta.source, version: `${meta.sourceFile} · ${meta.sourceModified}`, updatedAt: meta.generatedAt,
      minDate: meta.minDate, maxDate: meta.maxDate,
      territorialBasis: 'residencia', temporalBasis: 'discharge',
      definition: 'Egresos hospitalarios con diagnóstico principal CIE-10 J00–J99 (capítulo respiratorio). Fecha de referencia: alta. Territorio: comuna de residencia del paciente.',
      appliedFilters: { ...filters }, respiratoryTotal: selected, universeTotal: universe,
      missingStay, unknownAge: ageCounts[ageBands.length], unknownSex: sexCounts[2],
      warnings: [
        'Los archivos GRD del proyecto contienen solo egresos respiratorios; la proporción sobre el total de egresos no es calculable.',
        ...(unknownRegion ? [`${unknownRegion} egresos sin comuna de residencia registrada se cuentan en los totales, pero no en el mapa ni en el mapa de calor.`] : []),
      ],
    },
  };
}
