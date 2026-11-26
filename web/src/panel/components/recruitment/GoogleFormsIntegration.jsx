import { useEffect, useRef, useState } from 'react'
import { readGoogleFormResponses } from '../../lib/googleFormsApplications.js'
import { authorizeGoogleSheets, loadGoogleSheetsAuthorization, readGoogleSheet } from '../../lib/googleSheets.js'
import { importGoogleFormApplications } from '../../lib/services/googleFormsRecruitment.js'
import { googleFormsSource, googleSheetUrl, loadGoogleFormsSource, saveGoogleFormsSource } from '../../lib/services/googleFormsSource.js'

export default function GoogleFormsIntegration({ db, orgId, uid }) {
  const clientId = import.meta.env.VITE_GOOGLE_SHEETS_CLIENT_ID?.trim()
  const [source, setSource] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [oauth, setOAuth] = useState(null)
  const [formUrl, setFormUrl] = useState('')
  const [sheetUrl, setSheetUrl] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [authorizationError, setAuthorizationError] = useState('')
  const [notice, setNotice] = useState('')
  const [result, setResult] = useState(null)
  const transfer = useRef(null)

  useEffect(() => {
    let active = true
    loadGoogleFormsSource(db, orgId).then(saved => {
      if (!active) return
      setSource(saved)
      if (saved) {
        setFormUrl(saved.formUrl)
        setSheetUrl(googleSheetUrl(saved))
      }
      setLoaded(true)
    }, () => {
      if (active) setError('No pudimos cargar la configuración. Vuelve a abrir esta sección.')
    })
    if (clientId) {
      loadGoogleSheetsAuthorization().then(client => {
        if (active) setOAuth(client)
      }, failure => {
        if (active) setAuthorizationError(failure.message)
      })
    }
    return () => {
      active = false
      transfer.current?.abort()
    }
  }, [clientId, db, orgId])

  async function save(event) {
    event.preventDefault()
    if (busy) return
    setNotice('')
    setError('')
    setResult(null)
    let next
    try {
      next = googleFormsSource({ formUrl, sheetUrl })
    } catch (failure) {
      setError(failure.message)
      return
    }
    setBusy('save')
    try {
      await saveGoogleFormsSource(db, orgId, next)
      setSource(next)
      setFormUrl(next.formUrl)
      setSheetUrl(googleSheetUrl(next))
      setNotice('Formulario de Google registrado.')
    } catch {
      setError('No pudimos registrar el formulario. Inténtalo de nuevo.')
    } finally {
      setBusy('')
    }
  }

  async function sync() {
    if (!source || !oauth || transfer.current || busy) return
    const controller = new AbortController()
    transfer.current = controller
    const { signal } = controller
    setBusy('sync')
    setError('')
    setNotice('')
    setResult(null)
    try {
      const token = await authorizeGoogleSheets(oauth, clientId)
      signal.throwIfAborted()
      const values = await readGoogleSheet(source, token, signal)
      const { rows, invalidRows } = readGoogleFormResponses(values)
      const saved = await importGoogleFormApplications(db, { orgId, uid, source, rows, signal })
      if (!signal.aborted) setResult({ ...saved, invalidRows })
    } catch (failure) {
      if (!signal.aborted) setError(failure instanceof TypeError
        ? 'No pudimos conectarnos a Google Sheets. Revisa tu conexión e inténtalo de nuevo.'
        : failure.message)
    } finally {
      transfer.current = null
      if (!signal.aborted) setBusy('')
    }
  }

  const changed = source && (formUrl !== source.formUrl || sheetUrl !== googleSheetUrl(source))

  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      <form aria-label="Registrar Google Forms y Sheets" onSubmit={save} className="space-y-3">
        <p className="text-sm">Vincula el formulario con una hoja en Google Forms. Luego pega el enlace para responder y el de la pestaña donde llegan las respuestas.</p>
        <div className="players-field">
          <label htmlFor="google-form-url">Enlace del formulario</label>
          <input id="google-form-url" type="url" required value={formUrl} disabled={!loaded || Boolean(busy)} onChange={e => setFormUrl(e.target.value)} />
        </div>
        <div className="players-field">
          <label htmlFor="google-sheet-url">Enlace de la pestaña de respuestas</label>
          <input id="google-sheet-url" type="url" required value={sheetUrl} disabled={!loaded || Boolean(busy)} onChange={e => setSheetUrl(e.target.value)} />
        </div>
        <button type="submit" className="players-button-secondary" disabled={!loaded || Boolean(busy)}>
          {busy === 'save' ? 'Guardando…' : 'Guardar enlaces'}
        </button>
      </form>
      {source && (
        <div className="flex flex-wrap items-center gap-3">
          <a className="text-sm underline" href={source.formUrl} target="_blank" rel="noopener noreferrer">Abrir formulario</a>
          <button type="button" className="players-button-secondary" onClick={sync} disabled={!oauth || Boolean(changed) || Boolean(busy)}>
            {busy === 'sync' ? 'Sincronizando…' : 'Sincronizar con Google Sheets'}
          </button>
        </div>
      )}
      {!clientId && <p className="text-sm text-muted">AceCam necesita un ID de cliente de Google para sincronizar la hoja.</p>}
      {authorizationError && <p className="players-field-error" role="alert">{authorizationError}</p>}
      {error && <p className="players-field-error" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {result && (
        <div className="space-y-2 text-sm">
          <p role="status">Nuevas: {result.imported}. Ya importadas: {result.existing}. Filas para revisar: {result.invalidRows.length + result.failed.length}.</p>
          {result.invalidRows.length > 0 && (
            <ul className="max-h-40 list-disc overflow-auto pl-5">
              {result.invalidRows.map(row => <li key={row.number}>Fila {row.number}. {row.message}</li>)}
            </ul>
          )}
          {result.failed.length > 0 && <p role="alert">No se guardaron las filas {result.failed.join(', ')}. Revisa tu sesión y vuelve a sincronizar.</p>}
        </div>
      )}
    </div>
  )
}
