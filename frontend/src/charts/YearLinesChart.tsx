import { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Table2 } from 'lucide-react';
import type { TimePoint } from '../types/dashboard.ts';
import { number } from '../utils/format.ts';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
// Paleta categórica validada (validate_palette.js, modo claro). El color sigue al año, no a su posición:
// 2019 siempre usa el mismo tono aunque cambie el rango. Tres tonos quedan bajo 3:1 de contraste con el fondo,
// por eso la leyenda y la tabla siempre están disponibles.
const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
const colorOf = (year: string) => PALETTE[((Number(year) - 2019) % PALETTE.length + PALETTE.length) % PALETTE.length];

/** Comparación de meses equivalentes: una línea por año, enero a diciembre. */
export function YearLinesChart({ points }: { points: TimePoint[] }) {
  const hasRate = points.some(p => p.rate != null);
  const [metric, setMetric] = useState<'rate' | 'count'>('rate');
  const useRate = hasRate && metric === 'rate';
  const years = [...new Set(points.map(p => p.period.slice(0, 4)))];
  const pointOf = (year: string, month: number) => points.find(p => p.period === `${year}-${String(month).padStart(2, '0')}`);
  const valueOf = (p?: TimePoint) => !p || p.status !== 'available' ? null : useRate ? p.rate ?? null : p.value;
  const rows = MONTHS.map((month, i) => Object.fromEntries([['month', month], ...years.map(y => [y, valueOf(pointOf(y, i + 1))])]));
  const format = (v: number) => useRate ? number(v, 1) : number(v);
  const partial = points.some(p => p.partial);
  return <>
    {hasRate && <div className="metric-toggle" role="group" aria-label="Medida del gráfico por año"><button className={`button ${useRate ? 'primary' : ''}`} aria-pressed={useRate} onClick={() => setMetric('rate')}>Tasa por 100.000</button><button className={`button ${useRate ? '' : 'primary'}`} aria-pressed={!useRate} onClick={() => setMetric('count')}>Conteo</button></div>}
    <div className="chart-axis-label">{useRate ? 'Hospitalizaciones del mes por 100.000 beneficiarios FONASA' : 'Hospitalizaciones · número de eventos'}</div>
    <div className="monthly-chart" aria-label="Hospitalizaciones por mes de egreso, una línea por año; valores en tabla desplegable">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={rows} margin={{ top: 18, right: 20, left: 0, bottom: 8 }} accessibilityLayer>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tickMargin={13} interval={0} tick={{ fill: '#5c707e', fontSize: 12 }} />
          <YAxis allowDecimals={useRate} axisLine={false} tickLine={false} width={50} tickFormatter={v => format(Number(v))} domain={[0, 'auto']} tick={{ fill: '#5c707e', fontSize: 12 }} />
          <Tooltip formatter={(value, name) => [value == null ? '—' : format(Number(value)), name]} itemSorter={item => -Number(item.value ?? 0)} contentStyle={{ border: '1px solid #dce6ec', borderRadius: 10, color: '#153B50', fontSize: 13 }} />
          <Legend verticalAlign="top" height={36} iconType="plainline" />
          {years.map(y => <Line key={y} dataKey={y} name={y} type="linear" stroke={colorOf(y)} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
    <div className="chart-bottom"><span>{useRate ? 'Tasa: hospitales presentes todos los años (cohorte constante) / beneficiarios FONASA del año' : 'Conteo de hospitalizaciones (todos los hospitales; en 2023–2024 se suman hospitales nuevos)'}</span>{partial && <span className="partial-note">El rango incluye meses parciales</span>}</div>
    <div className="chart-tools"><details><summary><Table2 size={15} />Ver datos del gráfico</summary><div className="table-wrap"><table><caption>{useRate ? 'Hospitalizaciones del mes por 100.000 beneficiarios FONASA' : 'Hospitalizaciones por mes de egreso'}. —: fuera del rango seleccionado.</caption><thead><tr><th>Mes</th>{years.map(y => <th key={y}>{y}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={String(row.month)}><th scope="row">{row.month}</th>{years.map(y => <td key={y}>{row[y] == null ? '—' : format(Number(row[y]))}</td>)}</tr>)}</tbody></table></div></details></div>
    <p className="fine-print">Permite comparar meses equivalentes entre años. {years.length < 2 ? 'Amplía el rango (botón «2019–2024») para comparar varios años.' : 'Los meses parciales no son comparables con meses completos.'}</p>
  </>;
}
