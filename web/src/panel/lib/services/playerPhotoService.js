import { doc, getDoc } from 'firebase/firestore'
import { PHOTO_CONTENT_TYPE, playerPhotoId } from '../photoUpload.js'

/** Lee la foto de perfil guardada en Firestore (players/{playerId}/media/photo-…) como Blob. */
export function createPlayerPhotoService({ db, orgId }) {
  if (!db || typeof orgId !== 'string' || !orgId || /[/\\]/.test(orgId)) throw new TypeError('Photo requires an authenticated organization.')
  return {
    async load({ playerId, path }) {
      if (!playerPhotoId(playerId, path)) throw new TypeError('Invalid player photo path.')
      const snapshot = await getDoc(doc(db, path))
      const data = snapshot.exists() ? snapshot.data() : null
      if (!data || data.orgId !== orgId || data.contentType !== PHOTO_CONTENT_TYPE || typeof data.data?.toUint8Array !== 'function') {
        throw new Error('Player photo unavailable.')
      }
      return new Blob([data.data.toUint8Array()], { type: PHOTO_CONTENT_TYPE })
    },
  }
}
