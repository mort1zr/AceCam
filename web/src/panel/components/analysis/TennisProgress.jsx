import PelotaTitulo from '../layout/PelotaTitulo.jsx'

export default function TennisProgress({ label, value }) {
  return (
    <div className="analysis-meter" data-indeterminate={value == null} style={value == null ? undefined : { '--analysis-meter-value': `${value}%` }}>
      <progress className="analysis-meter-native" aria-label={label} max={100} value={value ?? undefined} />
      <div className="analysis-meter-track" aria-hidden="true" />
      <div className="analysis-meter-visual" aria-hidden="true">
        <div className="analysis-meter-fill" />
        <div className="analysis-meter-marker">
          <PelotaTitulo className="analysis-meter-ball" />
        </div>
      </div>
    </div>
  )
}
