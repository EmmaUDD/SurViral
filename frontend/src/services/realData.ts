import type { FilterOptions, Option } from '../types/dashboard.ts';
import { ageBands } from '../utils/ages.ts';
import { communes, regions, sexes } from './catalog.ts';

/** Contenido de public/data/grd-meta.json (generado por scripts/prepare_grd_data.py). */
export interface GrdMeta {
  rows: number;
  baseDate: string;
  minDate: string;
  maxDate: string;
  maxStay: number;
  ageLabels: string[];
  diagnoses: Option[];
  source: string;
  /** Egresos no exportados por no ser hospitalización (CMA, hospitalización diurna). */
  excludedTotal?: number;
  excludedActivities?: Record<string, number>;
  sourceFile: string;
  /** Beneficiarios FONASA: [año, CUT (0 = sin comuna), sexo, tramo (255 = desconocido), personas]. */
  population?: { source: string; file: string; rows: [number, number, number, number, number][] };
  sourceModified: string;
  generatedAt: string;
}

/** Un egreso por posición. Códigos: ver scripts/prepare_grd_data.py. */
export interface GrdDataset {
  meta: GrdMeta;
  day: Uint16Array;      // días desde meta.baseDate (fecha de alta)
  stay: Uint16Array;     // días de estadía; NO_STAY si falta
  commune: Uint16Array;  // CUT como número; 0 = sin comuna
  region: Uint8Array;    // COD_REGION como número; 0 = sin región
  age: Uint8Array;       // índice en ageBands; UNKNOWN_U8 = desconocido
  sex: Uint8Array;       // 0 femenino, 1 masculino, 2 desconocido
  diag: Uint8Array;      // índice en meta.diagnoses
  cohort: Uint8Array;    // 1 = hospital presente en todos los años (HOSPITAL_EN_COHORTE)
}
export const NO_STAY = 65535;
export const UNKNOWN_U8 = 255;
export const SEX_IDS = ['female', 'male', 'unknown'] as const;

export function decodeDataset(meta: GrdMeta, buffer: ArrayBuffer): GrdDataset {
  const n = meta.rows;
  if (buffer.byteLength !== 11 * n) throw new Error(`Archivo de datos inconsistente: se esperaban ${11 * n} bytes y llegaron ${buffer.byteLength}. Vuelve a ejecutar scripts/prepare_grd_data.py.`);
  if (meta.ageLabels.length !== ageBands.length || meta.ageLabels.some((label, i) => label !== ageBands[i].label)) throw new Error('Los tramos de edad del archivo de datos no coinciden con src/utils/ages.ts.');
  return {
    meta,
    day: new Uint16Array(buffer, 0, n),
    stay: new Uint16Array(buffer, 2 * n, n),
    commune: new Uint16Array(buffer, 4 * n, n),
    region: new Uint8Array(buffer, 6 * n, n),
    age: new Uint8Array(buffer, 7 * n, n),
    sex: new Uint8Array(buffer, 8 * n, n),
    diag: new Uint8Array(buffer, 9 * n, n),
    cohort: new Uint8Array(buffer, 10 * n, n),
  };
}

export function realFilterOptions(meta: GrdMeta): FilterOptions {
  const years: number[] = [];
  for (let y = Number(meta.minDate.slice(0, 4)); y <= Number(meta.maxDate.slice(0, 4)); y++) years.push(y);
  return {
    minDate: meta.minDate, maxDate: meta.maxDate, years, regions, communes,
    ages: [...ageBands.map(({ id, label }) => ({ id, label })), { id: 'unknown', label: 'Edad desconocida' }],
    sexes, diagnoses: meta.diagnoses,
  };
}

let pending: Promise<GrdDataset> | null = null;
/** Descarga una sola vez los archivos de public/data; los reintentos vuelven a descargar si falló. */
export function loadDataset(): Promise<GrdDataset> {
  pending ??= (async () => {
    const base = `${(import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'}data/`;
    const [metaResponse, binResponse] = await Promise.all([fetch(`${base}grd-meta.json`), fetch(`${base}grd.bin`)]);
    const missing = 'No se encontraron los datos GRD del frontend. Ejecuta "npm run prepare-data" en la carpeta frontend.';
    // Vite responde index.html (200) a rutas inexistentes: se valida el tipo de contenido.
    if (!metaResponse.ok || !binResponse.ok || !metaResponse.headers.get('content-type')?.includes('json')) throw new Error(missing);
    return decodeDataset(await metaResponse.json() as GrdMeta, await binResponse.arrayBuffer());
  })().catch(error => { pending = null; throw error; });
  return pending;
}
