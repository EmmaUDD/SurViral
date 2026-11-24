import { summarize, validateFilters } from './aggregate.ts';
import { events, type SimulatedEvent } from './data.ts';
import type { Filters } from '../types/dashboard.ts';
import type { LogisticPreview } from '../types/logistic.ts';
import { logisticFromSeries } from '../utils/logistic.ts';
export { fitBinary, quantile75, sigmoid } from '../utils/logistic.ts';

export function logisticPreview(filters:Filters, source:readonly SimulatedEvent[]=events, horizon=1):LogisticPreview {
  validateFilters(filters);
  return logisticFromSeries(filters, horizon, f=>summarize(f,source).monthly, 'simulated');
}
