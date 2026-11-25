import { Suspense, lazy } from 'react'

const DashboardEvolution = lazy(() => import('./DashboardEvolution.jsx'))

export default function EvolutionPanel({ playerId, evolution, sample, renderEvolution }) {
  return (
    <section className="dashboard-panel dashboard-evolution" aria-labelledby="dashboard-evolution-title">
      <div className="dashboard-panel-heading"><div><p className="players-eyebrow">El rendimiento, en perspectiva</p><h2 id="dashboard-evolution-title">Evolución del jugador</h2></div><span className="dashboard-unit">Partidos analizados</span></div>
      {renderEvolution ? renderEvolution({ playerId }) : <Suspense fallback={<div className="dashboard-grafico-espera" />}><DashboardEvolution playerId={playerId} evolution={evolution} sample={sample} /></Suspense>}
    </section>
  )
}
