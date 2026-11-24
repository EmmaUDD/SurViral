import type { AgeGroup } from '../types/dashboard.ts';

/** Tramos del proyecto (TRAMO_EDAD en Procesamiento/limpieza_basica_GRD.ipynb). Orden = código del binario real. */
export const ageBands: { id: Exclude<AgeGroup, 'all' | 'unknown'>; label: string; min: number; max: number }[] = [
  { id: '0to4', label: 'Infancia (0-4)', min: 0, max: 4 },
  { id: '5to14', label: 'Niñez y adolescencia (5-14)', min: 5, max: 14 },
  { id: '15to29', label: 'Jóvenes (15-29)', min: 15, max: 29 },
  { id: '30to49', label: 'Adultos (30-49)', min: 30, max: 49 },
  { id: '50to64', label: 'Adultos maduros (50-64)', min: 50, max: 64 },
  { id: '65plus', label: 'Adultos mayores (65+)', min: 65, max: 109 },
];
