import type { TimePoint } from '../types/dashboard.ts';

/**
 * Macrozonas del Ministerio de Ciencia (5) más la Región Metropolitana como serie propia,
 * ordenadas de norte a sur. Ids de región = COD_REGION.
 */
export const macrozones: { id: string; label: string; regions: string[] }[] = [
  { id: 'norte', label: 'Norte', regions: ['15', '01', '02', '03'] },
  { id: 'centro', label: 'Centro', regions: ['04', '05'] },
  { id: 'metropolitana', label: 'Metropolitana', regions: ['13'] },
  { id: 'centro-sur', label: 'Centro Sur', regions: ['06', '07', '16', '08'] },
  { id: 'sur', label: 'Sur', regions: ['09', '14', '10'] },
  { id: 'austral', label: 'Austral', regions: ['11', '12'] },
];

export interface MacrozoneSeries { id: string; label: string; points: TimePoint[] }

/** Suma de conteos regionales por macrozona (sin tasa): respaldo cuando la fuente no entrega población. */
export function macrozonesFromRegions(rows: { id: string; points: TimePoint[] }[]): MacrozoneSeries[] {
  return macrozones
    .map(z => ({ zone: z, members: rows.filter(r => z.regions.includes(r.id)) }))
    .filter(({ members }) => members.length > 0)
    .map(({ zone, members }) => ({
      id: zone.id,
      label: zone.label,
      points: members[0].points.map((p, i) => ({ ...p, value: members.reduce((sum, r) => sum + (r.points[i]?.value ?? 0), 0), rate: undefined })),
    }));
}
