import { getBlob, ref } from 'firebase/storage'

const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']

export function createPlayerPhotoService({ storage, orgId }) {
  if (!storage || typeof orgId !== 'string' || !orgId || /[/\\]/.test(orgId)) throw new TypeError('Photo requires an authenticated organization.')
  return {
    async load({ playerId, path }) {
      const valid = typeof playerId === 'string' && playerId && !/[/\\]/.test(playerId)
        && EXTENSIONS.some(extension => path === `orgs/${orgId}/players/${playerId}/photo.${extension}`)
      if (!valid) throw new TypeError('Invalid player photo path.')
      // Authenticated SDK request: no public download URL or permanent bearer token.
      return getBlob(ref(storage, path), 5 * 1024 * 1024)
    },
  }
}
