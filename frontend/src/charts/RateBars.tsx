import type { CategoryValue } from '../types/dashboard.ts';
import { number } from '../utils/format.ts';

/** Menos de 20 hospitalizaciones en el numerador: error relativo > 22 %, la tasa se marca como inestable. */
export const MIN_STABLE_EVENTS = 20;

/** Ranking de tasas por 100.000 beneficiarios. Omite las categorías sin tasa (por ejemplo, edad desconocida). */
export function RateBars({ values, label, sort = true }: { values: CategoryValue[]; label: string; sort?: boolean }) {
  const rateOf = (v: CategoryValue) => v.rate;
  const rows = values.filter(v => rateOf(v) != null);
  const shown = sort ? [...rows].sort((a, b) => rateOf(b)! - rateOf(a)!) : rows;
  const maximum = Math.max(0.1, ...shown.map(v => rateOf(v)!));
  const unstable = shown.some(v => v.rateEvents != null && v.rateEvents < MIN_STABLE_EVENTS);
  return <>
    <div className="ranking-columns" aria-hidden="true"><span>{label}</span><span>Tasa por 100.000 / hospitalizaciones</span></div>
    <ol className="diagnosis-bars">{shown.map((d, i) => <li key={d.id}><div className="diagnosis-row"><span className="rank-index">{String(i + 1).padStart(2, '0')}</span><span className="diagnosis-name">{d.label}{d.rateEvents != null && d.rateEvents < MIN_STABLE_EVENTS ? ' *' : ''}</span><span className="diagnosis-number">{number(rateOf(d)!, 1)} <span>{number(d.value)}</span></span></div><div className="bar-track" aria-hidden="true"><div style={{ width: `${100 * rateOf(d)! / maximum}%` }} /></div></li>)}</ol>
    <p className="chart-reading">Hospitalizaciones anuales por 100.000 beneficiarios FONASA. Numerador: solo hospitales presentes todos los años (cohorte constante); el conteo mostrado incluye todos los hospitales.{unstable ? ` * Menos de ${MIN_STABLE_EVENTS} hospitalizaciones: tasa inestable.` : ''}</p>
  </>;
}
