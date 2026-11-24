import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Table2 } from 'lucide-react';
import type { TimePoint } from '../types/dashboard.ts';
import { downloadCsv, monthLabel, number } from '../utils/format.ts';
import { SIMULATED } from '../services/mode.ts';

export function MonthlyChart({ points }: { points: TimePoint[] }) {
  const hasRate = points.some(p => p.rate != null);
  const [metric, setMetric] = useState<'rate' | 'count'>('rate');
  const useRate = hasRate && metric === 'rate';
  const data = points.map(p => ({ ...p, shown: useRate ? p.rate ?? null : p.value }));
  const format = (v: number) => useRate ? number(v, 1) : number(v);
  const name = useRate ? 'Hospitalizaciones por 100.000 beneficiarios' : 'Hospitalizaciones';
  return <>
    {hasRate && <div className="metric-toggle" role="group" aria-label="Medida de la serie"><button className={`button ${useRate ? 'primary' : ''}`} aria-pressed={useRate} onClick={() => setMetric('rate')}>Tasa por 100.000</button><button className={`button ${useRate ? '' : 'primary'}`} aria-pressed={!useRate} onClick={() => setMetric('count')}>Conteo</button></div>}
    <div className="chart-axis-label">{useRate ? 'Hospitalizaciones del mes por 100.000 beneficiarios FONASA' : 'Hospitalizaciones · número de eventos'}</div>
    <div className="monthly-chart" aria-label="Evolución mensual de hospitalizaciones respiratorias; valores en tabla desplegable">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={data} margin={{ top: 18, right: 20, left: 0, bottom: 8 }} accessibilityLayer>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="period" tickFormatter={p => monthLabel(String(p))} axisLine={false} tickLine={false} minTickGap={24} tickMargin={13} tick={{ fill: '#5c707e', fontSize: 12 }} />
          <YAxis allowDecimals={useRate} axisLine={false} tickLine={false} width={45} tickFormatter={v => format(Number(v))} domain={[0, 'auto']} tick={{ fill: '#5c707e', fontSize: 12 }} />
          <Tooltip labelFormatter={p => monthLabel(String(p), true)} formatter={value => [format(Number(value)), name]} contentStyle={{ border: '1px solid #dce6ec', borderRadius: 10, color: '#153B50', fontSize: 13 }} />
          <Line type="linear" dataKey="shown" name={name} stroke="#2876A8" strokeWidth={3} dot={points.length <= 24 ? { r: 4, fill: '#fff', strokeWidth: 2 } : false} activeDot={{ r: 6 }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
    <div className="chart-bottom"><span><i className="line-swatch" />{useRate ? 'Tasa: solo hospitales presentes todos los años (cohorte constante), sobre los beneficiarios FONASA del año' : `Hospitalizaciones respiratorias${SIMULATED ? ' · datos ficticios' : ' · todos los hospitales'}`}</span>{points.some(p => p.partial) && <span className="partial-note">El rango incluye meses parciales</span>}</div>
    <div className="chart-tools"><details><summary><Table2 size={15} />Ver datos del gráfico</summary><div className="table-wrap"><table><caption>Serie mensual{SIMULATED ? ' simulada' : ''}. Mes del egreso; un mes parcial solo incluye los días seleccionados.</caption><thead><tr><th>Mes</th><th>Eventos</th>{hasRate && <th>Tasa por 100.000</th>}<th>Período</th></tr></thead><tbody>{points.map(p => <tr key={p.period}><th scope="row">{monthLabel(p.period, true)}</th><td>{p.value === null ? 'No disponible' : number(p.value)}</td>{hasRate && <td>{p.rate == null ? '—' : number(p.rate, 1)}</td>}<td>{p.partial ? 'Parcial' : 'Completo'}</td></tr>)}</tbody></table></div></details><button className="text-button" onClick={() => downloadCsv([[SIMULATED ? 'DATOS SIMULADOS — no son resultados del proyecto' : 'GRD 2019–2024 · hospitalizaciones con diagnóstico principal J00–J99 (sin CMA)'], ['Mes de egreso', 'Eventos', ...(hasRate ? ['Tasa por 100.000 beneficiarios (cohorte constante)'] : []), 'Período'], ...points.map(p => [p.period, p.value === null ? 'No disponible' : String(p.value), ...(hasRate ? [p.rate == null ? '' : p.rate.toFixed(2)] : []), p.partial ? 'Parcial' : 'Completo'])], SIMULATED ? 'surviral-serie-SIMULADA.csv' : 'surviral-serie-GRD.csv')}><Download size={14} />Descargar serie</button></div>
  </>;
}
