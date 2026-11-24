import { useState } from 'react';
import geometry from '../assets/chile-map.json';
import type { CategoryValue } from '../types/dashboard.ts';
import { number } from '../utils/format.ts';
import { SIMULATED } from '../services/mode.ts';

const colors = ['#e2eff7', '#b1d5eb', '#77b2d5', '#408fbe', '#185b87'];
export function ChileMap({ values, regions, selected, onSelect }: { values: CategoryValue[]; regions: {id:string;label:string}[]; selected: string; onSelect:(id:string)=>void }) {
  const [hover, setHover] = useState<string | null>(null);
  const hasRate = values.some(v => v.rate != null);
  const [metric, setMetric] = useState<'rate' | 'count'>('rate');
  const useRate = hasRate && metric === 'rate';
  const measureOf = (v: CategoryValue) => useRate ? (v.rate ?? 0) : v.value;
  const format = (v: CategoryValue) => useRate ? (v.rate == null ? '—' : number(v.rate, 1)) : number(v.value);
  const maximum = Math.max(useRate ? 0.1 : 1,...values.filter(v=>regions.some(r=>r.id===v.id)).map(measureOf));
  const get = (id:string) => values.find(v=>v.id===id);
  const fill = (id:string) => { const v=get(id); return !v ? '#e8edf0' : colors[Math.min(4, Math.floor(measureOf(v)/maximum*4))]; };
  const choose = (id:string) => onSelect(selected===id?'all':id);
  const focus = hover ? regions.find(r=>r.id===hover) : null;
  return <>
    {hasRate && <div className="metric-toggle" role="group" aria-label="Medida del mapa"><button className={`button ${useRate ? 'primary' : ''}`} aria-pressed={useRate} onClick={() => setMetric('rate')}>Tasa por 100.000</button><button className={`button ${useRate ? '' : 'primary'}`} aria-pressed={!useRate} onClick={() => setMetric('count')}>Conteo</button></div>}
    <div className="map-status" aria-live="polite">{focus ? <><strong>{focus.label}</strong><span>{get(focus.id) ? useRate ? `${format(get(focus.id)!)} por 100.000 beneficiarios · ${number(get(focus.id)!.value)} hospitalizaciones` : `${number(get(focus.id)!.value)} hospitalizaciones${SIMULATED ? ' simuladas' : ''}` : 'Fuera de la selección territorial'}</span></> : <><strong>Chile · 16 regiones</strong><span>Selecciona una región en el mapa o en la lista</span></>}</div>
    <div className="chile-map-layout">
      <div className="map-geography"><svg className="chile-svg" viewBox="0 0 185 680" aria-label="Mapa interactivo de las regiones de Chile" role="group">
        {geometry.regions.map(r=><path key={r.id} d={r.d} fill={fill(r.id)} fillRule="evenodd" stroke={selected===r.id?'#153B50':'#fff'} strokeWidth={selected===r.id?1.8:.6} tabIndex={0} role="button" aria-pressed={selected===r.id} aria-label={`${regions.find(v=>v.id===r.id)?.label}: ${get(r.id)?.value ?? 'fuera de selección'}. Seleccionar región`} onClick={()=>choose(r.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(r.id);}}} onMouseEnter={()=>setHover(r.id)} onMouseLeave={()=>setHover(null)} onFocus={()=>setHover(r.id)} onBlur={()=>setHover(null)}><title>{regions.find(v=>v.id===r.id)?.label}</title></path>)}
      </svg><div className="island-insets">{geometry.insets.map(island=><button key={island.label} onClick={()=>choose('05')} aria-label={`${island.label}, seleccionar Valparaíso`}><svg viewBox="0 0 125 65" aria-hidden="true"><path d={island.d} fill={fill('05')}/></svg><span>{island.label}</span></button>)}</div></div>
      <div className="region-list"><div className="ranking-columns"><span>Región</span><span>{useRate ? 'Tasa' : 'Eventos'}</span></div>{regions.map(r=><button key={r.id} className={selected===r.id?'selected':''} aria-pressed={selected===r.id} onClick={()=>choose(r.id)} onMouseEnter={()=>setHover(r.id)} onMouseLeave={()=>setHover(null)}><span className="region-dot" style={{background:fill(r.id)}}/><span>{r.label}</span><strong>{get(r.id) ? format(get(r.id)!) : '—'}</strong></button>)}<button className="map-reset" onClick={()=>onSelect('all')}>Ver todas las regiones</button></div>
    </div>
    <div className="map-legend"><span>0</span>{colors.map(c=><i key={c} style={{background:c}}/>)}<span>{useRate ? `${number(maximum, 1)} por 100.000` : `${number(maximum)} eventos`}</span></div>
    <p className="fine-print">{useRate ? 'Color: hospitalizaciones anuales por 100.000 beneficiarios FONASA (hospitales de la cohorte constante), sin ajustar por edad.' : 'Color: conteo, no tasa poblacional.'} Gris / —: fuera de la selección. Islas en recuadros a distinta escala. Geometría referencial de <a href="https://github.com/caracena/chile-geojson" target="_blank" rel="noreferrer">Chile GeoJSON</a>; no incluye territorio antártico. {SIMULATED ? 'Cifras ficticias.' : 'Región de residencia del paciente.'}</p>
  </>;
}
