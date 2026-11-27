import { useEffect, useId, useRef, useState } from 'react'
import TarjetaJugador from '../dashboard/TarjetaJugador.jsx'
import { usePlayerPhoto } from '../../hooks/usePlayerPhoto.js'
import { checkPhotoFile, photoErrorMessage } from '../../lib/photoUpload.js'

/** Tarjeta del jugador con la foto de perfil (si tiene) y sus controles de subir/quitar.
 * La foto se guarda y se borra por separado del resto de la ficha (service.updatePhoto). */
export default function PlayerPhotoCard({ player, metrics, indice, ranking, allowed, service, actorId, photoService, photoUploadService }) {
  const id = useId()
  const active = useRef(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const photo = usePlayerPhoto(photoService, player.id, player.photoPath)
  const canEditPhoto = allowed && Boolean(service.updatePhoto) && Boolean(photoUploadService)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])

  async function handleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy) return
    setError(null)
    try {
      checkPhotoFile(file)
    } catch (validationError) {
      setError(photoErrorMessage(validationError))
      return
    }
    setBusy(true)
    setProgress(0)
    const previousPath = player.photoPath
    try {
      const path = await photoUploadService.uploadPlayerPhoto({
        file, orgId: player.orgId, actorId, playerId: player.id, onProgress: value => { if (active.current) setProgress(value) },
      })
      await service.updatePhoto(player, path)
      if (previousPath && previousPath !== path) await photoUploadService.removePlayerPhoto(previousPath)
    } catch (uploadError) {
      if (active.current) setError(photoErrorMessage(uploadError))
    } finally {
      if (active.current) { setBusy(false); setProgress(null) }
    }
  }

  async function removePhoto() {
    if (busy || !player.photoPath) return
    setBusy(true)
    setError(null)
    const previousPath = player.photoPath
    try {
      await service.updatePhoto(player, null)
      await photoUploadService.removePlayerPhoto(previousPath)
    } catch (removeError) {
      if (active.current) setError(photoErrorMessage(removeError))
    } finally {
      if (active.current) setBusy(false)
    }
  }

  return (
    <div className="players-profile-carta">
      <TarjetaJugador player={player} metrics={metrics} indice={indice} ranking={ranking} photoUrl={photo.status === 'ready' ? photo.url : null} />
      {canEditPhoto && (
        <div className="players-photo-actions">
          <label htmlFor={`${id}-photo`} className="players-button-secondary">
            {busy ? `Subiendo… ${progress ?? 0}%` : player.photoPath ? 'Cambiar foto' : 'Subir foto'}
          </label>
          <input
            id={`${id}-photo`} type="file" className="players-photo-input" disabled={busy}
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={handleFile}
          />
          {player.photoPath && <button type="button" className="players-button-secondary" disabled={busy} onClick={removePhoto}>Quitar foto</button>}
          {error && <p role="alert" className="players-field-error">{error}</p>}
        </div>
      )}
    </div>
  )
}
