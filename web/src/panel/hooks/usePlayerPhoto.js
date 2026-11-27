import { useEffect, useState } from 'react'

/** Resuelve player.photoPath a una URL de objeto (mismo patrón que ProcessedVideo.jsx):
 * pide el blob con el SDK autenticado, nunca una URL de descarga pública. */
export function usePlayerPhoto(photoService, playerId, path) {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    if (!path || !playerId || !photoService) return
    let active = true
    let objectUrl
    const context = { photoService, playerId, path }
    photoService.load({ playerId, path }).then(blob => {
      if (!active) return
      objectUrl = URL.createObjectURL(blob)
      setState({ ...context, status: 'ready', url: objectUrl })
    }).catch(() => { if (active) setState({ ...context, status: 'error' }) })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [photoService, playerId, path])

  if (!path || !playerId || !photoService) return { status: 'idle', url: null }
  const current = state.photoService === photoService && state.playerId === playerId && state.path === path
  return current ? { status: state.status, url: state.url ?? null } : { status: 'loading', url: null }
}
