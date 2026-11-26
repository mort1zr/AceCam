import { VideoImportError } from '../video-import/errors.js'
import { createVideoImportHttpHandler } from '../video-import/http.js'
import { createVideoImporter } from '../video-import/importer.js'
import { createLocalVideoProbe } from '../video-import/probe.js'
import { createVideoSourceDownloader, createYtDlpResolver } from '../video-import/youtube.js'
import { PLANES, planVigente } from '../../src/panel/lib/planes.js'
import { MAX_VIDEO_FPS, MIN_VIDEO_FPS, videoRequirementsError } from '../../src/panel/lib/videoRequirements.js'

export const YOUTUBE_IMPORT_PATH = '/api/videos/import-youtube'

/** Composes the Azure API route with an atomic store supplied by the caller. */
export function createAzureYouTubeImportHandler({
  origin, requestOrigin, verifyIdToken, db, store,
  ytDlp, ffprobe, maxBytes = 24 * 1024 * 1024,
  resolveYouTube = createYtDlpResolver({ executable: ytDlp }),
  probeVideo = createLocalVideoProbe({ executable: ffprobe }),
  mediaTransport,
}) {
  if (typeof verifyIdToken !== 'function' || typeof db?.doc !== 'function') {
    throw new TypeError('La importación exige Firebase Auth y Firestore.')
  }
  const download = createVideoSourceDownloader({
    directDownload: () => { throw new VideoImportError('youtube-source') },
    resolveYouTube,
    mediaTransport,
  })
  const importVideo = createVideoImporter({
    async authorize({ bearerToken }) {
      const { uid } = await verifyIdToken(bearerToken)
      if (typeof uid !== 'string' || !uid || uid.includes('/')) return null
      const profile = (await db.doc(`users/${uid}`).get()).data()
      if (profile?.suspended === true || !['admin', 'coach'].includes(profile?.role) ||
          typeof profile.orgId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(profile.orgId)) return null
      const org = (await db.doc(`orgs/${profile.orgId}`).get()).data()
      if (!org || org.archived === true) return null
      const now = new Date()
      const limit = PLANES[planVigente(org, now)].limite
      if (limit === 0) return null
      const month = now.toISOString().slice(0, 7)
      const usage = (await db.doc(`orgs/${profile.orgId}/usage/${month}`).get()).data()
      if (limit != null && (usage?.analyses ?? 0) >= limit) return null
      return { orgId: profile.orgId, actorId: uid }
    },
    store,
    download,
    async probe(input) {
      const metadata = await probeVideo(input)
      if (metadata.extension !== 'mp4') throw new VideoImportError('youtube-format')
      if (videoRequirementsError(metadata)) throw new VideoImportError('resolution')
      if (!Number.isFinite(metadata.fps) || metadata.fps < MIN_VIDEO_FPS || metadata.fps > MAX_VIDEO_FPS) {
        throw new VideoImportError('fps')
      }
      return metadata
    },
    maxBytes,
    maxConcurrent: 1,
  })
  const handle = createVideoImportHttpHandler({ importVideo, origin, requestOrigin })
  return async request => {
    if (new URL(request.url).pathname !== YOUTUBE_IMPORT_PATH) return new Response(null, { status: 404 })
    const browserOrigin = request.headers.get('origin')
    if (browserOrigin !== null && browserOrigin !== origin) return new Response(null, { status: 403, headers: { Vary: 'Origin' } })
    const response = request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : await handle(request)
    response.headers.set('Vary', 'Origin')
    if (browserOrigin === origin) {
      response.headers.set('Access-Control-Allow-Origin', origin)
      response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
      response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    }
    return response
  }
}
