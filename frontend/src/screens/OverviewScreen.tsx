import { Activity, ArrowRight, Clock3, Layers3, Percent, ShieldCheck } from 'lucide-react';
import type { Overview } from '../types/dashboard.ts';
import { MetricCard } from '../components/MetricCard.tsx';
import { Panel } from '../components/Panel.tsx';
import { EmptyState } from '../components/AsyncState.tsx';
import { MonthlyChart } from '../charts/MonthlyChart.tsx';
import { DiagnosisBars } from '../charts/DiagnosisBars.tsx';
import { ChileMap } from '../charts/ChileMap.tsx';
import { DistributionChart } from '../charts/DistributionChart.tsx';
import { dateLabel, number } from '../utils/format.ts';
import { SIMULATED } from '../services/mode.ts';

export function OverviewScreen({ data, reset, methodology, regions, onRegion }: { data: Overview; reset: () => void; methodology: () => void; regions: {id:string;label:string}[]; onRegion: (id:string) => void }) {
  const { indicators, meta } = data;
  const specific = meta.appliedFilters.diagnosis !== 'all';
  return <div className="overview-content">
    <div className="section-kicker"><span>La selección en cifras</span><span>Eventos de hospitalización · {SIMULATED ? 'datos ficticios' : 'GRD 2019–2024'}</span></div>
    <div className="metric-grid">
      <MetricCard title={specific ? 'Hospitalizaciones del diagnóstico' : 'Hospitalizaciones respiratorias'} measure={indicators.hospitalizations} detail="Eventos del período y población seleccionados" icon={Activity} />
      {indicators.rate && meta.rate
        ? <MetricCard title="Tasa anual por 100.000 beneficiarios FONASA" measure={indicators.rate} detail={`${number(meta.rate.cohortEvents)} hospitalizaciones en hospitales de la cohorte / ${number(Math.round(meta.rate.personYears))} beneficiarios-año`} icon={Percent} tone="teal" />
        : <MetricCard title="Proporción entre egresos" measure={indicators.proportion} detail={`${number(meta.respiratoryTotal)} respiratorios / ${number(meta.universeTotal)} egresos del universo`} icon={Percent} tone="teal" />}
      <MetricCard title="Estancia mediana" measure={indicators.medianStay} detail={`${number(indicators.medianStay.validCount)} estancias válidas · ${number(meta.missingStay)} sin información`} icon={Clock3} tone="navy" />
    </div>
    {data.status === 'empty' && <EmptyState reset={reset} />}
    <Panel title="Hospitalizaciones en el tiempo" subtitle="¿Cómo cambia el número de eventos durante el período seleccionado?" action={<span className="panel-tag">Agrupación mensual</span>}>
      <MonthlyChart points={data.monthly} />
      <p className="interpretation"><span>Cómo leerlo</span>Cada punto cuenta eventos con egreso en ese mes, dentro de los filtros aplicados. {SIMULATED ? 'Describe la distribución de esta simulación; no representa incidencia ni una tendencia comprobada en Chile.' : 'Son conteos de egresos, no de personas: no representan incidencia ni tasas poblacionales.'}</p>
    </Panel>
    <div className="lower-grid">
      <div className="context-stack"><Panel title="Patologías respiratorias" subtitle="¿Qué grupos diagnósticos concentran los eventos seleccionados?" action={<Layers3 size={19} className="muted-icon" aria-hidden="true" />}>
        <DiagnosisBars values={data.diagnoses} total={meta.respiratoryTotal} />
      </Panel>
        <Panel title="Contexto de la consulta" subtitle="Qué representan estas cifras">
          <dl className="context-list"><div><dt>Universo seleccionado</dt><dd>{number(meta.universeTotal)} {SIMULATED ? 'egresos ficticios' : 'hospitalizaciones respiratorias (todos los diagnósticos J)'}</dd></div><div><dt>Período aplicado</dt><dd>{dateLabel(meta.appliedFilters.startDate)} — {dateLabel(meta.appliedFilters.endDate)}</dd></div><div><dt>Referencia territorial</dt><dd>{SIMULATED ? 'Región de atención simulada' : 'Región de residencia del paciente'}</dd></div><div><dt>Datos demográficos ausentes*</dt><dd>Edad: {number(meta.unknownAge)} · sexo: {number(meta.unknownSex)}</dd></div></dl>
          <p className="fine-print">*En los eventos respiratorios de la selección. Las categorías desconocidas se conservan cuando el filtro las incluye.</p>
          <button className="text-button context-link" onClick={methodology}>Consultar definiciones y cobertura<ArrowRight size={15} /></button>
        </Panel>
      </div>
      <Panel title="Distribución territorial" subtitle="Selecciona una región para explorar sus hospitalizaciones."><ChileMap values={data.territories} regions={regions} selected={meta.appliedFilters.region} onSelect={onRegion}/></Panel>
    </div>
    <div className="explore-grid overview-demographics"><Panel title="Distribución por edad" subtitle="Hospitalizaciones por grupo etario."><DistributionChart values={data.demographics.age}/></Panel><Panel title="Distribución por sexo" subtitle={SIMULATED ? 'Categorías registradas en los eventos simulados.' : 'Categorías registradas en los egresos.'}><DistributionChart values={data.demographics.sex} color="#2876A8"/></Panel></div>
    <div className="source-footer"><ShieldCheck size={17} />{SIMULATED ? <p><strong>Demostración reproducible.</strong> Todos los paneles parten de la misma fuente ficticia. Definiciones, cobertura y clasificación diagnóstica reales pendientes de validación con el equipo.</p> : <p><strong>{meta.source}.</strong> Todos los paneles parten del mismo archivo ({meta.version}). {meta.warnings.join(' ')}</p>}</div>
  </div>;
}
