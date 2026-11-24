import type { TimePoint } from '../types/dashboard.ts';
import { SIMULATED } from '../services/mode.ts';
export function Heatmap({rows}:{rows:{id:string;label:string;points:TimePoint[]}[]}) {
  const periods=[...new Set(rows.flatMap(r=>r.points.map(p=>p.period)))].sort();
  // Escala por fila: cada región con su propio máximo, para comparar su estacionalidad aunque su volumen sea pequeño.
  const rowMax=new Map(rows.map(r=>[r.id,Math.max(1,...r.points.map(p=>p.value??0))]));
  return <><div className="table-wrap heatmap"><table><caption>{SIMULATED ? 'Hospitalizaciones simuladas' : 'Hospitalizaciones'}. Cada celda muestra el conteo exacto; la intensidad es relativa al mes más alto de cada región (no compara regiones entre sí). * Mes parcial.</caption><thead><tr><th scope="col">Región / período</th>{periods.map(p=><th scope="col" key={p}>{p.slice(5)}/{p.slice(2,4)}</th>)}</tr></thead><tbody>{rows.map(r=>{const max=rowMax.get(r.id)!;return <tr key={r.id}><th scope="row">{r.label}</th>{periods.map(period=>{const point=r.points.find(p=>p.period===period);const v=point?.value; return <td key={period} style={{background:v==null?'#eef2f5':`rgba(40,118,168,${.08+.72*v/max})`,color:v!=null&&v/max>.55?'white':'#153B50'}} title={`${r.label}, ${period}: ${v??'no disponible'}${point?.partial?' (mes parcial)':''}`}>{v??'—'}{point?.partial?'*':''}</td>;})}</tr>;})}</tbody></table></div></>;
}
