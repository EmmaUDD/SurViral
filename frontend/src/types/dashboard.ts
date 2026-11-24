/** Contratos provisionales: requieren validación con el equipo de datos. */
export type Sex = 'female' | 'male' | 'unknown';
export type AgeGroup = 'all' | '0to4' | '5to14' | '15to29' | '30to49' | '50to64' | '65plus' | 'unknown';
export interface Filters {
  startDate: string;
  endDate: string;
  region: string;
  commune: string;
  /** Selección múltiple por códigos CUT; vacía = sin restricción adicional. */
  communes?: string[];
  age: AgeGroup;
  sex: 'all' | Sex;
  diagnosis: string;
}
export interface Option { id: string; label: string }
export interface FilterOptions {
  minDate: string;
  maxDate: string;
  years: number[];
  regions: Option[];
  communes: (Option & { region: string })[];
  ages: Option[];
  sexes: Option[];
  diagnoses: Option[];
}
export interface Measure {
  value: number | null;
  status: 'available' | 'unavailable';
  reason?: 'zero_denominator' | 'no_events' | 'missing_values' | 'no_universe' | 'no_population';
  unit: 'events' | 'percent' | 'days' | 'rate';
  validCount: number;
}
export interface TimePoint {
  period: string;
  value: number | null;
  status: 'available' | 'unavailable';
  partial: boolean;
  /** Hospitalizaciones de la cohorte por 100.000 beneficiarios en el período (no anualizada). */
  rate?: number | null;
}
export interface CategoryValue {
  id: string;
  label: string;
  value: number;
  percent: number | null;
  /** Hospitalizaciones (cohorte) por 100.000 beneficiarios por año; ausente sin datos de población. */
  rate?: number | null;
  /** Hospitalizaciones de la cohorte en el numerador de la tasa (estabilidad). */
  rateEvents?: number;
  /** Tasa ajustada por edad (método directo); solo sin filtro de edad. */
  adjustedRate?: number | null;
}
export interface SourceMetadata {
  mode: 'simulated' | 'real';
  source: string;
  version: string;
  updatedAt: string;
  minDate: string;
  maxDate: string;
  territorialBasis: 'residencia_simulada' | 'atencion_simulada' | 'residencia' | 'atencion';
  temporalBasis: 'discharge' | 'admission';
  definition: string;
  appliedFilters: Filters;
  respiratoryTotal: number;
  universeTotal: number;
  missingStay: number;
  unknownAge: number;
  unknownSex: number;
  warnings: string[];
  /** Tasas: numerador solo con hospitales de la cohorte constante. */
  rate?: { cohortEvents: number; outsideCohort: number; personYears: number };
}
export interface Overview {
  status: 'ready' | 'empty';
  indicators: { hospitalizations: Measure; proportion: Measure; medianStay: Measure; rate?: Measure };
  monthly: TimePoint[];
  diagnoses: CategoryValue[];
  /** Detalle por código CIE-10 cuando diagnoses viene agrupado. */
  diagnosisCodes?: CategoryValue[];
  territories: CategoryValue[];
  communes: CategoryValue[];
  regionalMonthly: { id: string; label: string; points: TimePoint[] }[];
  demographics: { age: CategoryValue[]; sex: CategoryValue[] };
  meta: SourceMetadata;
}
export interface DashboardService {
  getVaccination(query: import('./vaccination.ts').VaccinationQuery, signal?: AbortSignal): Promise<import('./vaccination.ts').VaccinationResponse>;
  getFilterOptions(signal?: AbortSignal): Promise<FilterOptions>;
  getOverview(filters: Filters, signal?: AbortSignal): Promise<Overview>;
  getLogisticPreview(filters: Filters, horizon: number, signal?: AbortSignal): Promise<import('./logistic.ts').LogisticPreview>;
}
