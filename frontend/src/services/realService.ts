import type { DashboardService, FilterOptions } from '../types/dashboard.ts';
import { logisticFromSeries } from '../utils/logistic.ts';
import { validateFiltersAgainst } from './catalog.ts';
import { loadDataset, realFilterOptions, type GrdDataset } from './realData.ts';
import { summarizeReal } from './realAggregate.ts';

let options: FilterOptions | null = null;
async function ready(signal?: AbortSignal): Promise<{ data: GrdDataset; options: FilterOptions }> {
  const data = await loadDataset();
  if (signal?.aborted) throw new DOMException('Consulta cancelada', 'AbortError');
  options ??= realFilterOptions(data.meta);
  return { data, options };
}

export const realService: DashboardService = {
  // La vista de vacunación muestra un aviso en modo real: no se mezclan cifras ficticias con GRD.
  async getVaccination() { throw new Error('Vacunación real no integrada: faltan validar unidad, campaña, población y base territorial.'); },
  async getFilterOptions(signal) { return structuredClone((await ready(signal)).options); },
  async getOverview(filters, signal) { const { data, options } = await ready(signal); return summarizeReal(filters, data, options); },
  async getLogisticPreview(filters, horizon, signal) {
    const { data, options } = await ready(signal);
    validateFiltersAgainst(filters, options);
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > 12) throw new Error('El horizonte debe ser un número entero entre 1 y 12 meses.');
    return logisticFromSeries(filters, horizon, f => summarizeReal(f, data, options).monthly, 'real');
  },
};
