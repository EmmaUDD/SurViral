import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { decodeDataset, realFilterOptions, NO_STAY, UNKNOWN_U8, type GrdMeta } from '../src/services/realData.ts';
import { summarizeReal, UNKNOWN_REGION_ID } from '../src/services/realAggregate.ts';
import { logisticFromSeries } from '../src/utils/logistic.ts';
import { ageBands } from '../src/utils/ages.ts';
import { defaultFilters } from '../src/app/defaults.ts';
import type { Filters, Overview } from '../src/types/dashboard.ts';

type Row = { day: number; stay: number; commune: number; region: number; age: number; sex: number; diag: number; cohort?: number };
type PopRow = [number, number, number, number, number];
function build(rows: Row[], diagnoses = ['J18', 'J45'], population?: PopRow[]) {
  const n = rows.length, buffer = new ArrayBuffer(11 * n);
  const cols = [new Uint16Array(buffer, 0, n), new Uint16Array(buffer, 2 * n, n), new Uint16Array(buffer, 4 * n, n), new Uint8Array(buffer, 6 * n, n), new Uint8Array(buffer, 7 * n, n), new Uint8Array(buffer, 8 * n, n), new Uint8Array(buffer, 9 * n, n), new Uint8Array(buffer, 10 * n, n)];
  rows.forEach((r, i) => [r.day, r.stay, r.commune, r.region, r.age, r.sex, r.diag, r.cohort ?? 1].forEach((v, c) => { cols[c][i] = v; }));
  const meta: GrdMeta = { rows: n, baseDate: '2019-01-01', minDate: '2019-01-01', maxDate: '2024-12-31', maxStay: 100, ageLabels: ageBands.map(b => b.label), diagnoses: diagnoses.map(id => ({ id, label: id })), source: 'prueba', sourceFile: 'prueba', sourceModified: '2026-01-01', generatedAt: '2026-01-01', ...(population ? { population: { source: 'prueba', file: 'prueba', rows: population } } : {}) };
  const data = decodeDataset(meta, buffer);
  return { data, options: realFilterOptions(meta) };
}
const day = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse('2019-01-01T00:00:00Z')) / 86_400_000);
const sum = (values: { value: number | null }[]) => values.reduce((s, v) => s + (v.value ?? 0), 0);

function assertPartitions(data: Overview) {
  const total = data.indicators.hospitalizations.value;
  for (const values of [data.monthly, data.diagnoses, data.territories, data.demographics.age, data.demographics.sex]) assert.equal(sum(values), total);
}

test('Datos reales: conteos, mediana, desconocidos y fechas inclusivas sobre un conjunto pequeño', () => {
  const { data, options } = build([
    { day: day('2024-01-01'), stay: 0, commune: 13101, region: 13, age: 0, sex: 0, diag: 0 },
    { day: day('2024-01-31'), stay: 4, commune: 13101, region: 13, age: 5, sex: 1, diag: 0 },
    { day: day('2024-02-15'), stay: 10, commune: 8101, region: 8, age: UNKNOWN_U8, sex: 2, diag: 1 },
    { day: day('2024-03-01'), stay: NO_STAY, commune: 0, region: 0, age: 1, sex: 1, diag: 1 },
    { day: day('2023-12-31'), stay: 7, commune: 13101, region: 13, age: 0, sex: 0, diag: 0 },
  ]);
  const all = summarizeReal({ ...defaultFilters, startDate: '2024-01-01', endDate: '2024-03-01' }, data, options);
  assert.equal(all.indicators.hospitalizations.value, 4);
  assertPartitions(all);
  assert.equal(all.indicators.medianStay.value, 4);
  assert.equal(all.meta.missingStay, 1);
  assert.equal(all.meta.unknownAge, 1);
  assert.equal(all.meta.unknownSex, 1);
  assert.equal(all.indicators.proportion.reason, 'no_universe');
  assert.equal(all.territories.find(t => t.id === UNKNOWN_REGION_ID)?.value, 1);
  assert.deepEqual(all.monthly.map(p => [p.period, p.value, p.partial]), [['2024-01', 2, false], ['2024-02', 1, false], ['2024-03', 1, true]]);
  assert.equal(all.regionalMonthly.find(r => r.id === '13')?.points[0].value, 2);

  const asthma = summarizeReal({ ...defaultFilters, diagnosis: 'J45' }, data, options);
  assert.equal(asthma.indicators.hospitalizations.value, 2);
  assert.equal(asthma.meta.universeTotal, 4, 'El diagnóstico no cambia el universo');
  const santiago = summarizeReal({ ...defaultFilters, region: '13', commune: '13101', age: '65plus' }, data, options);
  assert.equal(santiago.indicators.hospitalizations.value, 1);
  assert.equal(santiago.territories.length, 1);
  const unknownAge = summarizeReal({ ...defaultFilters, age: 'unknown' }, data, options);
  assert.equal(unknownAge.indicators.hospitalizations.value, 1);
  const empty = summarizeReal({ ...defaultFilters, startDate: '2024-06-01', endDate: '2024-06-30' }, data, options);
  assert.equal(empty.status, 'empty');
  assert.equal(empty.indicators.medianStay.reason, 'no_events');
  assert.throws(() => summarizeReal({ ...defaultFilters, diagnosis: 'pneumonia' }, data, options), /Diagnóstico no disponible/);
  assert.throws(() => summarizeReal({ ...defaultFilters, startDate: '2018-12-31' }, data, options));
});

test('Datos reales: los diagnósticos se entregan completos y ordenados (el gráfico agrupa al mostrar)', () => {
  const codes = Array.from({ length: 13 }, (_, i) => `J${String(i).padStart(2, '0')}`);
  const rows: Row[] = codes.flatMap((_, d) => Array.from({ length: d + 1 }, () => ({ day: day('2024-05-05'), stay: 1, commune: 13101, region: 13, age: 2, sex: 0, diag: d })));
  const { data, options } = build(rows, codes);
  const result = summarizeReal(defaultFilters, data, options);
  assert.equal(result.diagnoses.length, codes.length);
  assert.deepEqual(result.diagnoses.map(d => d.id), [...codes].reverse());
  assertPartitions(result);
});

test('Datos reales: selección de varias comunas de regiones distintas', () => {
  const { data, options } = build([
    { day: day('2024-01-10'), stay: 1, commune: 13101, region: 13, age: 0, sex: 0, diag: 0 },
    { day: day('2024-01-11'), stay: 2, commune: 8101, region: 8, age: 0, sex: 1, diag: 0 },
    { day: day('2024-01-12'), stay: 3, commune: 8101, region: 8, age: 0, sex: 1, diag: 1 },
    { day: day('2024-01-13'), stay: 4, commune: 5101, region: 5, age: 0, sex: 0, diag: 1 },
  ]);
  const both = summarizeReal({ ...defaultFilters, communes: ['13101', '08101'] }, data, options);
  assert.equal(both.indicators.hospitalizations.value, 3);
  assert.deepEqual(both.communes.map(c => [c.id, c.value]).sort(), [['08101', 2], ['13101', 1]]);
  assert.deepEqual(both.territories.map(t => t.id).sort(), ['08', '13']);
  assertPartitions(both);
  const all = summarizeReal(defaultFilters, data, options);
  assert.equal(all.communes.length, options.communes.length);
  assert.equal(sum(all.communes), 4);
  assert.throws(() => summarizeReal({ ...defaultFilters, communes: ['99999'] }, data, options));
  assert.throws(() => summarizeReal({ ...defaultFilters, communes: ['13101', '13101'] }, data, options));
});

test('Datos reales: tasas por 100.000 con cohorte, personas-año y filtros del denominador', () => {
  const rows: Row[] = [
    { day: day('2023-03-01'), stay: 1, commune: 13101, region: 13, age: 0, sex: 0, diag: 0 },
    { day: day('2023-04-01'), stay: 1, commune: 13101, region: 13, age: 5, sex: 1, diag: 1 },
    { day: day('2023-05-01'), stay: 1, commune: 8101, region: 8, age: 0, sex: 0, diag: 0, cohort: 0 },
    { day: day('2024-05-01'), stay: 1, commune: 8101, region: 8, age: 0, sex: 0, diag: 0 },
  ];
  const population: PopRow[] = [
    [2023, 13101, 0, 0, 1_000], [2023, 13101, 1, 5, 1_000], [2023, 8101, 0, 0, 2_000], [2023, 0, 0, 0, 1_000],
    [2024, 13101, 0, 0, 1_000], [2024, 13101, 1, 5, 1_000], [2024, 8101, 0, 0, 2_000], [2024, 0, 0, 0, 1_000],
  ];
  const { data, options } = build(rows, ['J18', 'J45'], population);
  const y2023 = summarizeReal({ ...defaultFilters, startDate: '2023-01-01', endDate: '2023-12-31' }, data, options);
  // Numerador: 2 de la cohorte (el egreso fuera de la cohorte no cuenta). Denominador: 5.000 beneficiarios, incluida la comuna desconocida.
  assert.equal(y2023.meta.rate?.cohortEvents, 2);
  assert.equal(y2023.meta.rate?.outsideCohort, 1);
  assert.equal(y2023.indicators.rate?.value, 100_000 * 2 / 5_000);
  assert.equal(y2023.territories.find(t => t.id === '13')?.rate, 100_000 * 2 / 2_000);
  assert.equal(y2023.territories.find(t => t.id === '08')?.rate, 0);
  assert.equal(y2023.demographics.age[0].rate, 100_000 * 1 / 4_000);
  assert.ok(y2023.meta.warnings.some(w => w.includes('cohorte')), 'Aviso cuando ≥ 5 % queda fuera de la cohorte');
  const asthma = summarizeReal({ ...defaultFilters, startDate: '2023-01-01', endDate: '2023-12-31', diagnosis: 'J45' }, data, options);
  assert.equal(asthma.indicators.rate?.value, 100_000 * 1 / 5_000, 'El diagnóstico cambia el numerador, no el denominador');
  // Medio año: la población cuenta como personas-año proporcionales a los días cubiertos.
  const half = summarizeReal({ ...defaultFilters, startDate: '2024-01-01', endDate: '2024-06-30', region: '08' }, data, options);
  assert.ok(Math.abs(half.meta.rate!.personYears - 2_000 * 182 / 366) < 1e-6);
  assert.ok(Math.abs(half.indicators.rate!.value! - 100_000 / (2_000 * 182 / 366)) < 1e-6);
  const unknownSex = summarizeReal({ ...defaultFilters, sex: 'unknown' }, data, options);
  assert.equal(unknownSex.indicators.rate?.reason, 'no_population');
  const withoutPopulation = build(rows);
  assert.equal(summarizeReal(defaultFilters, withoutPopulation.data, withoutPopulation.options).indicators.rate?.reason, 'no_population');
});

test('Datos reales: el decodificador rechaza archivos inconsistentes', () => {
  const { data } = build([{ day: 0, stay: 0, commune: 13101, region: 13, age: 0, sex: 0, diag: 0 }]);
  assert.throws(() => decodeDataset({ ...data.meta, rows: 2 }, new ArrayBuffer(11)), /inconsistente/);
  assert.throws(() => decodeDataset({ ...data.meta, ageLabels: ['0-4'] }, new ArrayBuffer(11)), /tramos/);
});

const META = new URL('../public/data/grd-meta.json', import.meta.url), BIN = new URL('../public/data/grd.bin', import.meta.url);
test('Archivos GRD generados: hospitalizaciones coinciden con el notebook de limpieza', { skip: !existsSync(META) && 'Ejecuta npm run prepare-data' }, () => {
  const meta = JSON.parse(readFileSync(META, 'utf-8')) as GrdMeta, bytes = readFileSync(BIN);
  const data = decodeDataset(meta, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const options = realFilterOptions(meta);
  const full: Filters = { ...defaultFilters, startDate: meta.minDate, endDate: meta.maxDate };
  const all = summarizeReal(full, data, options);
  // 410.038 egresos del parquet − 36.644 CMA y hospitalización diurna (ES_HOSPITALIZACION = False).
  assert.equal(all.indicators.hospitalizations.value, 373_394);
  assert.equal(meta.excludedTotal, 36_644);
  assert.equal(all.monthly.length, 72);
  assertPartitions(all);
  // Distribución TRAMO_EDAD 2019 de las hospitalizaciones (ES_HOSPITALIZACION = True) del parquet.
  const y2019 = summarizeReal({ ...defaultFilters, startDate: '2019-01-01', endDate: '2019-12-31' }, data, options);
  assert.deepEqual(y2019.demographics.age.map(a => a.value), [31573, 8256, 3962, 5605, 9641, 29568, 1]);
  assert.equal(summarizeReal(defaultFilters, data, options).indicators.hospitalizations.value, 80_819);
  // Tasas nacionales de la sección 7 del notebook (cohorte constante / beneficiarios FONASA × 100.000).
  for (const [year, expected] of [[2019, 597.0], [2020, 208.5], [2023, 493.3], [2024, 459.3]] as const) {
    const rate = summarizeReal({ ...defaultFilters, startDate: `${year}-01-01`, endDate: `${year}-12-31` }, data, options).indicators.rate?.value;
    assert.ok(rate != null && Math.abs(rate - expected) < 0.05, `${year}: ${rate} ≠ ${expected}`);
  }
  for (const region of options.regions) assertPartitions(summarizeReal({ ...full, region: region.id }, data, options));
  const logistic = logisticFromSeries(defaultFilters, 1, f => summarizeReal(f, data, options).monthly, 'real');
  assert.equal(logistic.mode, 'real');
});
