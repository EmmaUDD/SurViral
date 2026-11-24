/** Fuente de datos del frontend. Por defecto, datos GRD reales; VITE_DATA_MODE=simulated vuelve a la demostración. */
const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
export const DATA_MODE: 'real' | 'simulated' = env?.VITE_DATA_MODE === 'simulated' ? 'simulated' : 'real';
export const SIMULATED = DATA_MODE === 'simulated';
