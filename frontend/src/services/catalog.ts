import type { FilterOptions, Filters, Option } from '../types/dashboard.ts';
import communeCatalog from '../assets/communes.json' with { type: 'json' };

/** Catálogo territorial común a datos simulados y reales (ids = COD_REGION y CUT). */
export const regions: Option[] = [
  ['15', 'Arica y Parinacota'], ['01', 'Tarapacá'], ['02', 'Antofagasta'],
  ['03', 'Atacama'], ['04', 'Coquimbo'], ['05', 'Valparaíso'],
  ['13', 'Metropolitana'], ['06', 'O’Higgins'], ['07', 'Maule'],
  ['16', 'Ñuble'], ['08', 'Biobío'], ['09', 'La Araucanía'],
  ['14', 'Los Ríos'], ['10', 'Los Lagos'], ['11', 'Aysén'], ['12', 'Magallanes'],
].map(([id, label]) => ({ id, label }));

export const communes: (Option & { region: string })[] = communeCatalog;

export const sexes: Option[] = [{ id: 'female', label: 'Femenino' }, { id: 'male', label: 'Masculino' }, { id: 'unknown', label: 'Sexo desconocido' }];

export function validateFiltersAgainst(f: Filters, options: FilterOptions): void {
  for (const date of [f.startDate, f.endDate]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Selecciona fechas válidas.');
  }
  if (f.startDate > f.endDate) throw new Error('La fecha inicial no puede ser posterior a la fecha final.');
  if (f.startDate < options.minDate || f.endDate > options.maxDate) throw new Error(`La cobertura abarca del ${options.minDate.split('-').reverse().join('/')} al ${options.maxDate.split('-').reverse().join('/')}.`);
  if (f.region !== 'all' && !options.regions.some(o => o.id === f.region)) throw new Error('Territorio no disponible.');
  if (f.commune !== 'all') {
    const commune = options.communes.find(c => c.id === f.commune);
    if (!commune || commune.region !== f.region) throw new Error('La comuna no corresponde a la región seleccionada.');
  }
  if (f.diagnosis !== 'all' && !options.diagnoses.some(o => o.id === f.diagnosis)) throw new Error('Diagnóstico no disponible.');
  if (f.age !== 'all' && !options.ages.some(o => o.id === f.age)) throw new Error('Grupo etario no disponible.');
  if (f.sex !== 'all' && !options.sexes.some(o => o.id === f.sex)) throw new Error('Sexo no disponible.');
}
