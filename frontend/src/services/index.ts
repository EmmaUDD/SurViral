import type { DashboardService } from '../types/dashboard.ts';
import { realService } from './realService.ts';
import { SIMULATED } from './mode.ts';

// Punto único de sustitución: datos GRD reales (public/data) o, con VITE_DATA_MODE=simulated,
// la demostración. El servicio simulado se carga solo cuando se usa: genera sus eventos al importarse.
const service = (): Promise<DashboardService> => SIMULATED ? import('./mockService.ts').then(m => m.mockService) : Promise.resolve(realService);

export const dashboardService: DashboardService = {
  getVaccination: (query, signal) => service().then(s => s.getVaccination(query, signal)),
  getFilterOptions: signal => service().then(s => s.getFilterOptions(signal)),
  getOverview: (filters, signal) => service().then(s => s.getOverview(filters, signal)),
  getLogisticPreview: (filters, horizon, signal) => service().then(s => s.getLogisticPreview(filters, horizon, signal)),
};
