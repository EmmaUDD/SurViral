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

const PER = 100_000;
const weightCache = new WeakMap<GrdMeta, Float64Array>();
/** Pesos de la población estándar: beneficiarios FONASA del país, 2019-2024, por tramo de edad conocido. */
export function standardWeights(meta: GrdMeta): Float64Array {
  let weights = weightCache.get(meta);
  if (!weights) {
    weights = new Float64Array(ageBands.length);
    for (const [, , , ageId, persons] of meta.population?.rows ?? []) if (ageId !== UNKNOWN_U8) weights[ageId] += persons;
    const total = weights.reduce((sum, w) => sum + w, 0);
    if (total > 0) weights.forEach((w, i) => { weights![i] = w / total; });
    weightCache.set(meta, weights);
  }
  return weights;
}
/** Años completos o parciales cubiertos por [startDate, endDate]: fracción del año para pasar de beneficiarios a personas-año. */
function yearFractions(startDate: string, endDate: string): Map<number, number> {
  const fractions = new Map<number, number>();
  for (let year = Number(startDate.slice(0, 4)); year <= Number(endDate.slice(0, 4)); year++) {
    const from = Math.max(Date.parse(`${year}-01-01T00:00:00Z`), Date.parse(`${startDate}T00:00:00Z`));
    const to = Math.min(Date.parse(`${year}-12-31T00:00:00Z`), Date.parse(`${endDate}T00:00:00Z`));
    const days = Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1);
    fractions.set(year, (to - from + DAY_MS) / days);
  }
  return fractions;
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
  // Filtro de diagnóstico: un código CIE-10 o un grupo (todos sus códigos).
  const groupIndex = meta.diagnosisGroups?.findIndex(g => g.id === filters.diagnosis) ?? -1;
  const diagMatch = filters.diagnosis === 'all' ? null : Uint8Array.from(meta.diagnoses, d => Number(groupIndex >= 0 ? d.group === groupIndex : d.id === filters.diagnosis));
  const monthOf = monthOfDay(meta);

  const monthCounts = new Uint32Array(months), regionMonth = new Uint32Array(17 * months), regionCounts = new Uint32Array(17);
  const diagCounts = new Uint32Array(meta.diagnoses.length), ageCounts = new Uint32Array(ageBands.length + 1), sexCounts = new Uint32Array(3);
  const stays = new Uint32Array(meta.maxStay + 1), communeCounts = new Uint32Array(65536);
  let universe = 0, selected = 0, missingStay = 0;
  const regionCohort = new Uint32Array(17), ageCohort = new Uint32Array(ageBands.length + 1);
  const communeCohort = new Uint32Array(65536), monthCohort = new Uint32Array(months);
  const regionAgeCohort = new Uint32Array(17 * ageBands.length);
  let cohortSelected = 0;
  const { day, stay, commune, region, age, sex, diag, cohort } = data;
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
    if (diagMatch && !diagMatch[diag[i]]) continue;
    selected++;
    const m = monthOf[d] - firstMonth, r = region[i];
    monthCounts[m]++; regionMonth[r * months + m]++; regionCounts[r]++; communeCounts[commune[i]]++;
    diagCounts[diag[i]]++; sexCounts[sex[i]]++;
    ageCounts[age[i] === UNKNOWN_U8 ? ageBands.length : age[i]]++;
    if (stay[i] === NO_STAY) missingStay++; else stays[stay[i]]++;
    if (cohort[i]) {
      cohortSelected++; regionCohort[r]++; communeCohort[commune[i]]++; monthCohort[m]++;
      ageCohort[age[i] === UNKNOWN_U8 ? ageBands.length : age[i]]++;
      if (age[i] !== UNKNOWN_U8) regionAgeCohort[r * ageBands.length + age[i]]++;
    }
  }

  // Denominador: beneficiarios FONASA con los mismos filtros de territorio, edad y sexo (el diagnóstico no lo cambia).
  const population = meta.population?.rows;
  const rateAvailable = !!population && filters.age !== 'unknown' && filters.sex !== 'unknown';
  const fractions = yearFractions(filters.startDate, filters.endDate);
  let personYears = 0;
  const regionPY = new Float64Array(17), agePY = new Float64Array(ageBands.length + 1), communePY = new Float64Array(65536);
  const regionAgePY = new Float64Array(17 * ageBands.length), yearPopulation = new Map<number, number>();
  if (rateAvailable) for (const [year, cut, sexId, ageId, persons] of population) {
    const fraction = fractions.get(year);
    if (!fraction) continue;
    const r = Math.floor(cut / 1000);
    if (regionCode >= 0 && r !== regionCode) continue;
    if (communeCode >= 0 && cut !== communeCode) continue;
    if (communeSet && !communeSet.has(cut)) continue;
    if (ageCode >= 0 && ageId !== ageCode) continue;
    if (sexCode >= 0 && sexId !== sexCode) continue;
    const py = persons * fraction;
    personYears += py; regionPY[r] += py; communePY[cut] += py; agePY[ageId === UNKNOWN_U8 ? ageBands.length : ageId] += py;
    if (ageId !== UNKNOWN_U8) regionAgePY[r * ageBands.length + ageId] += py;
    yearPopulation.set(year, (yearPopulation.get(year) ?? 0) + persons);
  }
  const rateOf = (events: number, py: number) => rateAvailable && py > 0 ? PER * events / py : null;
  // Tasa ajustada por edad (método directo) con la población estándar del país; solo sin filtro de edad.
  const weights = rateAvailable && ageCode < 0 ? standardWeights(meta) : null;
  const adjustedOf = (r: number) => {
    if (!weights) return null;
    let total = 0;
    for (let a = 0; a < ageBands.length; a++) {
      const py = regionAgePY[r * ageBands.length + a];
      if (py <= 0) return null;
      total += weights[a] * regionAgeCohort[r * ageBands.length + a] / py;
    }
    return PER * total;
  };

  const percent = (value: number) => selected ? 100 * value / selected : null;
  const category = (id: string, label: string, value: number, rate?: number | null): CategoryValue => ({ id, label, value, percent: percent(value), ...(rate === undefined ? {} : { rate }) });
  const monthly: TimePoint[] = Array.from({ length: months }, (_, m) => {
    const absolute = firstMonth + m, year = baseYear + Math.floor(absolute / 12), month = absolute % 12 + 1;
    const period = `${year}-${String(month).padStart(2, '0')}`;
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const population = yearPopulation.get(year);
    return { period, value: monthCounts[m], status: 'available', partial: filters.startDate > `${period}-01` || filters.endDate < end, ...(rateAvailable ? { rate: population ? PER * monthCohort[m] / population : null } : {}) };
  });

  // Códigos con egresos, de mayor a menor; con grupos disponibles, el ranking principal es por grupo.
  const byValue = (a: CategoryValue, b: CategoryValue) => b.value - a.value || a.id.localeCompare(b.id);
  const diagnosisCodes = meta.diagnoses.map((o, i) => category(o.id, o.label, diagCounts[i])).filter(o => o.value > 0).sort(byValue);
  const groups = meta.diagnosisGroups;
  const diagnoses = groups?.length
    ? groups.map((g, gi) => category(g.id, g.label, meta.diagnoses.reduce((sum, d, i) => sum + (d.group === gi ? diagCounts[i] : 0), 0))).filter(o => o.value > 0).sort(byValue)
    : diagnosisCodes;

  const selectedRegions = communeSet ? new Set(options.communes.filter(c => communeSet.has(Number(c.id))).map(c => c.region)) : null;
  const shownRegions = regions.filter(r => (filters.region === 'all' || r.id === filters.region) && (!selectedRegions || selectedRegions.has(r.id)));
  const territories = shownRegions.map(r => ({ ...category(r.id, r.label, regionCounts[Number(r.id)], rateOf(regionCohort[Number(r.id)], regionPY[Number(r.id)])), ...(rateAvailable ? { rateEvents: regionCohort[Number(r.id)], adjustedRate: adjustedOf(Number(r.id)) } : {}) }));
  if (filters.region === 'all' && !communeSet && regionCounts[0] > 0) territories.push(category(UNKNOWN_REGION_ID, 'Sin región de residencia registrada', regionCounts[0]));
  const communes = options.communes
    .filter(c => (filters.region === 'all' || c.region === filters.region) && (filters.commune === 'all' || c.id === filters.commune) && (!communeSet || communeSet.has(Number(c.id))))
    .map(c => ({ ...category(c.id, c.label, communeCounts[Number(c.id)], rateOf(communeCohort[Number(c.id)], communePY[Number(c.id)])), ...(rateAvailable ? { rateEvents: communeCohort[Number(c.id)] } : {}) }));

  const validStays = selected - missingStay;
  const median = medianFromHistogram(stays, validStays);
  const unknownRegion = filters.region === 'all' && !communeSet ? regionCounts[0] : 0;
  return {
    status: selected ? 'ready' : 'empty',
    indicators: {
      hospitalizations: measure(selected, 'events', selected),
      proportion: measure(null, 'percent', universe, 'no_universe'),
      medianStay: measure(median, 'days', validStays, median === null ? selected ? 'missing_values' : 'no_events' : undefined),
      rate: measure(rateOf(cohortSelected, personYears), 'rate', cohortSelected, rateAvailable && personYears > 0 ? undefined : 'no_population'),
    },
    monthly,
    regionalMonthly: shownRegions.map(r => ({ ...r, points: monthly.map((p, m) => ({ ...p, value: regionMonth[Number(r.id) * months + m] })) })),
    diagnoses,
    ...(groups?.length ? { diagnosisCodes } : {}),
    territories,
    communes,
    demographics: {
      age: [...ageBands.map((b, i) => category(b.id, b.label, ageCounts[i], rateOf(ageCohort[i], agePY[i]))), category('unknown', 'Edad desconocida', ageCounts[ageBands.length], null)],
      sex: options.sexes.map((o, i) => category(o.id, o.label, sexCounts[i])),
    },
    meta: {
      mode: 'real', source: meta.source, version: `${meta.sourceFile} · ${meta.sourceModified}`, updatedAt: meta.generatedAt,
      minDate: meta.minDate, maxDate: meta.maxDate,
      territorialBasis: 'residencia', temporalBasis: 'discharge',
      definition: 'Hospitalizaciones con diagnóstico principal CIE-10 J00–J99 (capítulo respiratorio); excluye cirugía mayor ambulatoria y hospitalización diurna. Fecha de referencia: alta. Territorio: comuna de residencia del paciente.',
      appliedFilters: { ...filters }, respiratoryTotal: selected, universeTotal: universe,
      missingStay, unknownAge: ageCounts[ageBands.length], unknownSex: sexCounts[2],
      rate: { cohortEvents: cohortSelected, outsideCohort: selected - cohortSelected, personYears },
      warnings: [
        'Los archivos GRD del proyecto contienen solo egresos respiratorios; la proporción sobre el total de egresos no es calculable.',
        ...(meta.excludedTotal ? [`Se excluyen ${meta.excludedTotal.toLocaleString('es-CL')} egresos que no son hospitalizaciones (cirugía mayor ambulatoria y hospitalización diurna) en todo el período.`] : []),
        ...(selected && (selected - cohortSelected) / selected >= 0.05 ? [`${(100 * (selected - cohortSelected) / selected).toLocaleString('es-CL', { maximumFractionDigits: 1 })} % de las hospitalizaciones de esta selección son de hospitales que entraron al GRD en 2023–2024. La tasa usa solo la cohorte de hospitales presentes todos los años, por lo que no es comparable con otros territorios o años.`] : []),
        ...(unknownRegion ? [`${unknownRegion} egresos sin comuna de residencia registrada se cuentan en los totales, pero no en el mapa ni en el mapa de calor.`] : []),
      ],
    },
  };
}
