import { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Table2 } from 'lucide-react';
import { monthLabel, number } from '../utils/format.ts';
import type { MacrozoneSeries } from '../utils/macrozones.ts';

// Paleta categórica validada (validate_palette.js, modo claro): orden fijo por macrozona, de norte a sur.
// Tres tonos quedan bajo 3:1 de contraste con el fondo: por eso la leyenda y la tabla siempre están visibles.
const COLORS: Record<string, string> = {
  norte: '#eb6834', centro: '#1baf7a', metropolitana: '#2a78d6', 'centro-sur': '#eda100', sur: '#e87ba4', austral: '#008300',
};

export function MacrozoneChart({ series }: { series: MacrozoneSeries[] }) {
  const hasRate = series.some(s => s.points.some(p => p.rate != null));
  const [metric, setMetric] = useState<'rate' | 'count'>('rate');
  const useRate = hasRate && metric === 'rate';
  const periods = series[0]?.points.map(p => p.period) ?? [];
  const valueOf = (p: { value: number | null; rate?: number | null }) => useRate ? p.rate ?? null : p.value;
  const rows = periods.map((period, i) => Object.fromEntries([['period', period], ...series.map(s => [s.id, valueOf(s.points[i])])]));
  const format = (v: number) => useRate ? number(v, 1) : number(v);
  const partial = series.some(s => s.points.some(p => p.partial));
  return <>
    {hasRate && <div className="metric-toggle" role="group" aria-label="Medida del gráfico por macrozona"><button className={`button ${useRate ? 'primary' : ''}`} aria-pressed={useRate} onClick={() => setMetric('rate')}>Tasa por 100.000</button><button className={`button ${useRate ? '' : 'primary'}`} aria-pressed={!useRate} onClick={() => setMetric('count')}>Conteo</button></div>}
    <div className="chart-axis-label">{useRate ? 'Hospitalizaciones del mes por 100.000 beneficiarios FONASA' : 'Hospitalizaciones · número de eventos'}</div>
    <div className="monthly-chart" aria-label="Hospitalizaciones mensuales por macrozona; valores en tabla desplegable">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={rows} margin={{ top: 18, right: 20, left: 0, bottom: 8 }} accessibilityLayer>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="period" tickFormatter={p => monthLabel(String(p))} axisLine={false} tickLine={false} minTickGap={24} tickMargin={13} tick={{ fill: '#5c707e', fontSize: 12 }} />
          <YAxis allowDecimals={useRate} axisLine={false} tickLine={false} width={50} tickFormatter={v => format(Number(v))} domain={[0, 'auto']} tick={{ fill: '#5c707e', fontSize: 12 }} />
          <Tooltip labelFormatter={p => monthLabel(String(p), true)} formatter={(value, name) => [value == null ? '—' : format(Number(value)), name]} itemSorter={item => -Number(item.value ?? 0)} contentStyle={{ border: '1px solid #dce6ec', borderRadius: 10, color: '#153B50', fontSize: 13 }} />
          <Legend verticalAlign="top" height={36} iconType="plainline" />
          {series.map(s => <Line key={s.id} dataKey={s.id} name={s.label} type="linear" stroke={COLORS[s.id] ?? '#5c707e'} strokeWidth={2} dot={false} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
    <div className="chart-bottom"><span>{useRate ? 'Tasa: hospitales presentes todos los años (cohorte constante) / beneficiarios FONASA de la macrozona en el año' : 'Conteo de hospitalizaciones (todos los hospitales); refleja también el tamaño de cada macrozona'}</span>{partial && <span className="partial-note">El rango incluye meses parciales</span>}</div>
    <div className="chart-tools"><details><summary><Table2 size={15} />Ver datos del gráfico</summary><div className="table-wrap"><table><caption>{useRate ? 'Hospitalizaciones del mes por 100.000 beneficiarios FONASA' : 'Hospitalizaciones por mes'} según macrozona. Macrozonas del Ministerio de Ciencia; la Región Metropolitana se muestra aparte.</caption><thead><tr><th>Mes</th>{series.map(s => <th key={s.id}>{s.label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={String(row.period)}><th scope="row">{monthLabel(String(row.period), true)}</th>{series.map(s => <td key={s.id}>{row[s.id] == null ? '—' : format(Number(row[s.id]))}</td>)}</tr>)}</tbody></table></div></details></div>
    <p className="fine-print">Norte: Arica y Parinacota, Tarapacá, Antofagasta y Atacama · Centro: Coquimbo y Valparaíso · Metropolitana · Centro Sur: O'Higgins, Maule, Ñuble y Biobío · Sur: La Araucanía, Los Ríos y Los Lagos · Austral: Aysén y Magallanes.</p>
  </>;
}
