import { useContext, useEffect, useMemo, useState } from 'react'
import { Link, UNSAFE_LocationContext } from 'react-router'
import { parseYouTubeUrl } from '../lib/videoSources.js'
import { DataTable, StatusBadge } from '../components/ui'
import { usePlanVista } from '../context/PlanVistaContext.js'
import { MATCH_STATUS } from '../lib/schema.js'
import { quotaLow, quotaReached, remainingAnalyses } from '../lib/usage.js'
import AnalysisForm from '../components/analysis/AnalysisForm.jsx'
import TennisProgress from '../components/analysis/TennisProgress.jsx'
import PlayerForm from '../components/players/PlayerForm.jsx'
import { usePlayers } from '../hooks/usePlayers.js'
import { useAnalysisQueue } from '../hooks/useAnalysisQueue.js'
import { createFirestoreAnalysisService } from '../lib/services/firestoreAnalysisService.js'
import { createFirestorePlayersService } from '../lib/services/firestorePlayersService.js'
import './jugadores.css'
import './analizar.css'
import PaginacionTabla, { tamanosPagina } from '../components/ui/PaginacionTabla.jsx'
import { EsqueletoTabla } from '../components/dashboard/EsqueletoDashboard.jsx'
import '../components/dashboard/esqueleto.css'
import PelotaTitulo from '../components/layout/PelotaTitulo.jsx'

const fechaCorta = (value) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : (value ?? '—')

const sinConexion = { mode: 'offline', supportsLinks: false, supportsYouTube: false }

const processingLabels = new Map([
  ['preparing', 'Preparando el video…'],
  ['analyzing', 'El modelo está analizando el video…'],
  ['detecting', 'Detectando jugadores, pelota y cancha…'],
  ['calculating', 'Calculando métricas…'],
  ['rendering', 'Generando el video anotado…'],
  ['encoding', 'Preparando el video para reproducirlo…'],
  ['saving', 'Guardando el resultado…'],
])

const stageRanges = new Map([
  ['preparing', [0, 4]],
  ['analyzing', [4, 6]],
  ['detecting', [6, 60]],
  ['calculating', [60, 66]],
  ['rendering', [66, 90]],
  ['encoding', [90, 97]],
  ['saving', [97, 100]],
])

function overallPercent(stage, done, total, hasFrames) {
  const range = stageRanges.get(stage)
  if (!range) return null
  const [from, to] = range
  const fraction = hasFrames ? done / total : 0
  return Math.min(99, Math.round(from + (to - from) * fraction))
}

function remainingLabel(elapsed, percent) {
  if (elapsed === null || percent === null || percent < 8 || elapsed < 15) return null
  const left = Math.max(1, Math.round((elapsed * (100 - percent)) / percent))
  if (left < 60) return 'Falta menos de 1 min'
  return `Faltan unos ${Math.round(left / 60)} min`
}

function ProcessingProgress({ match, playerName }) {
  const startedAt = match.startedAt?.toMillis?.()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!Number.isFinite(startedAt)) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [startedAt])

  const elapsed = Number.isFinite(startedAt)
    ? Math.max(0, Math.floor((now - startedAt) / 1000))
    : null
  const { done, total } = match.analysisFrames ?? {}
  const hasFrames = Number.isInteger(done) && Number.isInteger(total) && total > 0 && done >= 0 && done <= total
  const label = `Análisis de ${playerName} contra ${match.opponent} (${match.matchDate})`
  const percent = overallPercent(match.analysisStage, done, total, hasFrames)
  const remaining = remainingLabel(elapsed, percent)

  return (
    <div className="analysis-processing">
      <div className="analysis-progress-heading">
        <span role="status">{processingLabels.get(match.analysisStage) ?? processingLabels.get('analyzing')}</span>
        {percent !== null && <strong className="analysis-progress-value">{percent} %</strong>}
      </div>
      <TennisProgress label={label} value={percent} />
      {(hasFrames || elapsed !== null) && (
        <dl className="analysis-progress-details">
          {hasFrames && <div><dt>Fotogramas de la etapa</dt><dd>{done} de {total}</dd></div>}
          {elapsed !== null && (
            <div><dt>Tiempo transcurrido</dt><dd>{elapsed >= 60 ? `${Math.floor(elapsed / 60)} min ` : ''}{elapsed % 60} s</dd></div>
          )}
        </dl>
      )}
      {remaining && <p className="analysis-progress-estimate">{remaining}</p>}
    </div>
  )
}

function Cabecera() {
  return (
    <header className="analysis-head">
      <p className="players-eyebrow">Del partido a los datos</p>
      <h1 id="analysis-title">
        Analizar video<PelotaTitulo />
      </h1>
      <p>
        Consulta la etapa y el tiempo transcurrido en la cola mientras se analiza tu video.
      </p>
    </header>
  )
}

function Guia() {
  return (
    <aside className="analysis-guide">
      <p className="players-eyebrow">Una buena toma, mejores datos</p>
      <h2>Antes de empezar</h2>
      <ul>
        <li>Elige una toma donde se vea la cancha completa.</li>
        <li>Identifica al jugador al inicio del video.</li>
        <li>Vincula el partido a su perfil para seguir su evolución.</li>
      </ul>
      <p>Los indicadores aparecerán cuando el procesamiento termine.</p>
    </aside>
  )
}

function Cola({ columns, rows, loading, error, onRetry }) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(tamanosPagina[0])
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, pages)
  const visibleRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const ready = !loading && !error
  return (
    <section className="analysis-queue" aria-labelledby="analysis-queue-title">
      <div className="analysis-queue-heading">
        <div>
          <h2 id="analysis-queue-title">Cola de análisis</h2>
          <p className="analysis-muted">
            En cola → Procesando → Listo. Si ocurre un problema, el partido mostrará Error.
          </p>
        </div>
        <span className="analysis-count">
          {loading ? 'Cargando…' : `${rows.length} ${rows.length === 1 ? 'partido' : 'partidos'}`}
        </span>
      </div>
      {loading ? (
        <EsqueletoTabla etiqueta="partidos" />
      ) : (
        <DataTable
          resizable
          cards
          caption="Partidos y estado del análisis"
          columns={columns}
          rows={visibleRows}
          error={error}
          onRetry={onRetry}
          emptyTitle="El próximo análisis empieza aquí"
          emptyDescription="Carga un video y vincúlalo a un jugador. Su estado aparecerá en esta lista."
        />
      )}
      {ready && (
        <PaginacionTabla
          total={rows.length}
          page={currentPage}
          pageSize={pageSize}
          etiqueta="partidos"
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size)
            setPage(1)
          }}
        />
      )}
    </section>
  )
}

// Aviso cuando la organización llegó al límite de análisis de su plan (PCIT-41).
function LimiteAlcanzado({ usados, limite }) {
  return (
    <div className="analysis-limit" role="alert">
      <strong>Llegaste al límite de tu plan</strong>
      <span>
        Tu organización ya usó {usados} de {limite} análisis este mes. Para analizar más
        partidos, cambia de plan o espera al próximo mes.
      </span>
      <Link to="/configuracion" className="players-button-secondary">
        Ver mi plan
      </Link>
    </div>
  )
}

// Aviso previo: quedan pocos análisis en el mes (PCIT-41).
function QuedanPocos({ usados, limite }) {
  const quedan = remainingAnalyses(usados, limite)
  return (
    <div className="analysis-limit analysis-limit--low" role="status">
      <strong>{quedan === 1 ? 'Te queda 1 análisis este mes' : `Te quedan ${quedan} análisis este mes`}</strong>
      <span>
        Tu organización usó {usados} de {limite}. Al llegar al límite no se podrán analizar más
        partidos hasta el próximo mes.
      </span>
      <Link to="/configuracion" className="players-button-secondary">
        Ver mi plan
      </Link>
    </div>
  )
}

function AnalysisWorkspace({ service, playersService }) {
  const state = useContext(UNSAFE_LocationContext)?.location?.state
  const recruitmentVideo = state?.recruitmentVideo
  const initialUrl = parseYouTubeUrl(recruitmentVideo?.url)?.url ?? ''
  const players = usePlayers(playersService)
  const queue = useAnalysisQueue(service)
  const { uso } = usePlanVista()
  const sinAnalisis = service.mode === 'live' && quotaReached(uso.usados, uso.limite)
  const quedanPocos = service.mode === 'live' && quotaLow(uso.usados, uso.limite)
  const [playerId, setPlayerId] = useState(() => typeof recruitmentVideo?.playerId === 'string' ? recruitmentVideo.playerId : '')
  const [showNewPlayer, setShowNewPlayer] = useState(false)
  const playerName = (id) =>
    players.rows.find((player) => player.id === id)?.fullName ?? 'Jugador no disponible'
  const columns = [
    {
      key: 'playerId',
      label: 'Jugador',
      render: playerName,
    },
    { key: 'opponent', label: 'Rival' },
    { key: 'matchDate', label: 'Fecha', render: fechaCorta },
    {
      key: 'status',
      label: 'Estado',
      render: (status, match) => (
        <>
          <StatusBadge status={status} />
          {status === MATCH_STATUS.error && typeof match.errorMessage === 'string' && match.errorMessage.trim() && (
            <p className="analysis-muted">{match.errorMessage}</p>
          )}
          {status === MATCH_STATUS.processing && (
            <ProcessingProgress match={match} playerName={playerName(match.playerId)} />
          )}
        </>
      ),
    },
  ]
  return (
    <section className="players-page analysis-page" aria-labelledby="analysis-title">
      {service.mode === 'demo' && (
        <aside className="players-demo-notice">
          <strong>Modo demostración</strong>
          <span>
            Datos ficticios. No se suben, descargan ni procesan videos. La cola se reinicia al
            recargar.
          </span>
        </aside>
      )}
      <Cabecera />
      {sinAnalisis && <LimiteAlcanzado usados={uso.usados} limite={uso.limite} />}
      {quedanPocos && <QuedanPocos usados={uso.usados} limite={uso.limite} />}
      {showNewPlayer && (
        <PlayerForm
          service={playersService}
          onCancel={() => setShowNewPlayer(false)}
          onCreated={(player) => {
            setPlayerId(player.id)
            setShowNewPlayer(false)
          }}
        />
      )}
      <div className="analysis-layout">
        <AnalysisForm
          service={service}
          initialUrl={initialUrl}
          players={players.rows}
          playersLoading={players.loading}
          playersError={players.error}
          playerId={playerId}
          onPlayerChange={setPlayerId}
          onNewPlayer={() => setShowNewPlayer(true)}
          playerCreationOpen={showNewPlayer}
          disabled={sinAnalisis}
        />
        <Guia />
      </div>
      <Cola
        columns={columns}
        rows={queue.rows}
        loading={queue.loading}
        error={queue.error}
        onRetry={queue.retry}
      />
    </section>
  )
}

function AnalisisSinConexion() {
  return (
    <section className="players-page analysis-page" aria-labelledby="analysis-title">
      <Cabecera />
      <div className="analysis-offline" role="status">
        <strong>El análisis aún no está disponible</strong>
        <span>
          Cuando tu sesión de equipo esté disponible, podrás cargar videos y consultar su estado.
        </span>
      </div>
      <div className="analysis-layout">
        <AnalysisForm
          service={sinConexion}
          players={[]}
          playersLoading={false}
          playersError={null}
          playerId=""
          onPlayerChange={() => {}}
          onNewPlayer={() => {}}
          playerCreationOpen={false}
          disabled
        />
        <Guia />
      </div>
      <Cola
        columns={[
          { key: 'playerId', label: 'Jugador' },
          { key: 'opponent', label: 'Rival' },
          { key: 'matchDate', label: 'Fecha' },
          { key: 'status', label: 'Estado' },
        ]}
        rows={[]}
        loading={false}
        error={null}
      />
    </section>
  )
}

export default function Analizar({
  service,
  playersService,
  db,
  session,
  uploadVideo,
  importVideo,
  maxBytes,
}) {
  const uid = session?.uid
  const orgId = session?.orgId
  const role = session?.role ?? 'coach'
  const hasInjectedServices = service != null || playersService != null
  const liveServices = useMemo(() => {
    if (
      hasInjectedServices ||
      !db || !['coach', 'admin'].includes(role) ||
      typeof uid !== 'string' ||
      !uid.trim() ||
      typeof orgId !== 'string' ||
      !orgId.trim() ||
      typeof uploadVideo !== 'function' ||
      !Number.isFinite(maxBytes) ||
      maxBytes <= 0
    )
      return null

    const identity = { db, orgId, actorId: uid, role }
    return {
      analysis: createFirestoreAnalysisService({ ...identity, uploadVideo, importVideo, maxBytes }),
      players: createFirestorePlayersService(identity),
    }
  }, [hasInjectedServices, db, uid, orgId, role, uploadVideo, importVideo, maxBytes])

  const analysis = service ?? liveServices?.analysis
  const players = playersService ?? liveServices?.players
  if (!analysis || !players || analysis.scopeKey !== players.scopeKey)
    return <AnalisisSinConexion />
  return <AnalysisWorkspace key={analysis.scopeKey} service={analysis} playersService={players} />
}
