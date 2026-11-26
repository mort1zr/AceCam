import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { VideoImportError } from '../video-import/errors.js'
import { createAzureYouTubeImportHandler, YOUTUBE_IMPORT_PATH } from './youtubeImport.js'

const origin = 'https://acecam.example'
const requestOrigin = 'http://localhost'
const videoId = 'abcdefghijk'
const url = `https://youtu.be/${videoId}`
const matchId = 'match-a'
const videoPath = `orgs/org-a/matches/${matchId}/video.mp4`
const validVideo = { width: 1280, height: 720, fps: 25, durationSeconds: 90, extension: 'mp4' }

function setup({ profile = { role: 'coach', orgId: 'org-a' }, org = { plan: 'basico' }, used, metadata = validVideo } = {}) {
  const verifyIdToken = vi.fn(async () => ({ uid: 'coach-a' }))
  const documents = { 'users/coach-a': profile, 'orgs/org-a': org }
  const db = { doc: key => ({ get: async () => ({ data: () => key.startsWith('orgs/org-a/usage/') ? { analyses: used } : documents[key] }) }) }
  const probeVideo = vi.fn(async () => metadata)
  const resolveYouTube = vi.fn(async () => ({ videoId, mediaUrl: 'https://test.googlevideo.com/videoplayback' }))
  const mediaTransport = {
    resolve: async () => [{ address: '8.8.8.8', family: 4 }],
    request: (_url, _options, receive) => {
      const req = new EventEmitter()
      req.end = () => queueMicrotask(() => receive(Object.assign(Readable.from([Buffer.from('prueba')]), {
        statusCode: 200, headers: { 'content-type': 'video/mp4' },
      })))
      return req
    },
  }
  const store = {
    find: vi.fn(async () => null),
    putIfAbsent: vi.fn(async ({ orgId, actorId, matchId, sourceHash }) => ({ orgId, actorId, matchId, sourceHash, videoPath })),
  }
  const handler = createAzureYouTubeImportHandler({ origin, requestOrigin, verifyIdToken, db, store, probeVideo, resolveYouTube, mediaTransport })
  const send = ({ method = 'POST', path = YOUTUBE_IMPORT_PATH, from = origin, token = 'test', body = { url, matchId } } = {}) => handler(new Request(requestOrigin + path, {
    method,
    headers: { Origin: from, 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  }))
  return { send, verifyIdToken, resolveYouTube, probeVideo, store }
}

describe('ruta de importación de YouTube para la API de Azure', () => {
  it('devuelve la ruta confirmada por el adaptador, con identidad verificada y un video mayor de 60 s', async () => {
    const { send, verifyIdToken, resolveYouTube, store } = setup()
    const response = await send()
    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
    expect(await response.json()).toEqual({ videoPath })
    expect(verifyIdToken).toHaveBeenCalledWith('test')
    expect(resolveYouTube).toHaveBeenCalledWith(expect.objectContaining({ url: `https://www.youtube.com/watch?v=${videoId}` }))
    expect(store.putIfAbsent).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org-a', actorId: 'coach-a', matchId, metadata: validVideo }))
  })

  it('acepta la solicitud previa del sitio configurado y rechaza otros orígenes, rutas o solicitudes sin token', async () => {
    const { send, verifyIdToken } = setup()
    const preflight = await send({ method: 'OPTIONS' })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(origin)
    const foreign = await send({ from: 'https://otra.example' })
    expect(foreign.status).toBe(403)
    expect(foreign.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect((await send({ path: '/api/videos/sign' })).status).toBe(404)
    expect((await send({ token: '' })).status).toBe(401)
    expect((await send({ body: { url, matchId, orgId: 'org-b' } })).status).toBe(400)
    expect(verifyIdToken).not.toHaveBeenCalled()
  })

  it.each([
    [{ profile: { role: 'coach', orgId: 'org-a', suspended: true } }],
    [{ profile: { role: 'viewer', orgId: 'org-a' } }],
    [{ org: { archived: true } }],
    [{ org: { plan: 'free' } }],
    [{ used: 30 }],
    [{ org: null }],
  ])('rechaza perfiles u organizaciones inactivos antes de consultar medios (%j)', async options => {
    const { send, resolveYouTube, store } = setup(options)
    expect((await send()).status).toBe(403)
    expect(resolveYouTube).not.toHaveBeenCalled()
    expect(store.find).not.toHaveBeenCalled()
  })

  it.each([
    [{ width: 640, height: 360 }, 'resolution'],
    [{ fps: 24 }, 'fps'],
    [{ fps: 61 }, 'fps'],
    [{ extension: 'mov' }, 'youtube-format'],
  ])('impide guardar medios incompatibles (%j)', async (changes, code) => {
    const { send, store } = setup({ metadata: { ...validVideo, ...changes } })
    const response = await send()
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ error: { code: `import/${code}` } })
    expect(store.putIfAbsent).not.toHaveBeenCalled()
  })

  it('distingue los enlaces ajenos a YouTube y los videos de YouTube no disponibles', async () => {
    const { send, resolveYouTube, store } = setup()
    const direct = await send({ body: { url: 'https://otro.example/video.mp4', matchId } })
    expect(direct.status).toBe(400)
    expect(resolveYouTube).not.toHaveBeenCalled()
    resolveYouTube.mockRejectedValue(new VideoImportError('youtube-unavailable'))
    const unavailable = await send()
    expect(unavailable.status).toBe(422)
    expect(await unavailable.json()).toMatchObject({ error: { code: 'import/youtube-unavailable' } })
    expect(store.putIfAbsent).not.toHaveBeenCalled()
  })
})
