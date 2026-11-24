import type { CategoryValue } from '../types/dashboard.ts';
import { number } from '../utils/format.ts';

/** Ranking de tasas por 100.000 beneficiarios. Omite las categorías sin tasa (por ejemplo, edad desconocida). */
export function RateBars({ values, label, sort = true }: { values: CategoryValue[]; label: string; sort?: boolean }) {
  const rows = values.filter(v => v.rate != null);
  const shown = sort ? [...rows].sort((a, b) => b.rate! - a.rate!) : rows;
  const maximum = Math.max(0.1, ...shown.map(v => v.rate!));
  return <>
    <div className="ranking-columns" aria-hidden="true"><span>{label}</span><span>Tasa por 100.000 / hospitalizaciones</span></div>
    <ol className="diagnosis-bars">{shown.map((d, i) => <li key={d.id}><div className="diagnosis-row"><span className="rank-index">{String(i + 1).padStart(2, '0')}</span><span className="diagnosis-name">{d.label}</span><span className="diagnosis-number">{number(d.rate!, 1)} <span>{number(d.value)}</span></span></div><div className="bar-track" aria-hidden="true"><div style={{ width: `${100 * d.rate! / maximum}%` }} /></div></li>)}</ol>
    <p className="chart-reading">Hospitalizaciones anuales por 100.000 beneficiarios FONASA. Numerador: solo hospitales presentes todos los años (cohorte constante); el conteo mostrado incluye todos los hospitales.</p>
  </>;
}
