// Prueba de concepto de videos en Azure Blob (PCIT-223, historia PCIT-222).
// Azurite (emulador oficial de Azure Storage) + emuladores de Auth y Firestore.
// Ejecutar con: npm run test:rules   (Azurite se enciende y apaga dentro de la prueba)

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BlobServiceClient } from '@azure/storage-blob'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAzureVideoHandler } from '../../server/azure-videos/http.js'
import { createSasSigner } from '../../server/azure-videos/sas.js'
import { createAzureVideoImportStore } from '../../server/azure-videos/importStore.js'
import { createFirestoreAnalysisService } from '../../src/panel/lib/services/firestoreAnalysisService.js'
import { createAzureYouTubeVideoImporter } from '../../src/panel/lib/services/httpVideoImportService.js'
import { usagePeriod } from '../../src/panel/lib/usage.js'

const ORIGIN = 'http://localhost:5173'
const CONTAINER = 'videos'
const PROJECT = process.env.ACECAM_RULES_PROJECT || 'demo-acecam'
const VIDEO = 'orgs/org-a/matches/m-a/video.mp4'
const PROCESSED = 'orgs/org-a/matches/m-a/processed.mp4'
const NEW_VIDEO = 'orgs/org-a/matches/m-nuevo/video.mp4'
const bytes = new Uint8Array(4096).fill(7)

let azurite
let app
let db
let serviceClient
let handler
const tokens = {}

const waitForPort = (port, deadline = Date.now() + 30_000) => new Promise((resolve, reject) => {
  const attempt = () => {
    const socket = createConnection({ host: '127.0.0.1', port }, () => { socket.end(); resolve() })
    socket.on('error', () => (Date.now() > deadline ? reject(new Error('Azurite no arrancó')) : setTimeout(attempt, 250)))
  }
  attempt()
})

async function idToken(uid) {
  const auth = getAuth(app)
  const email = `${uid}@acecam.test`
  await auth.deleteUser(uid).catch(() => {})
  await auth.createUser({ uid, email, password: 'clave-de-prueba' })
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'clave-de-prueba', returnSecureToken: true }),
  })
  return (await response.json()).idToken
}

beforeAll(async () => {
  const bin = fileURLToPath(new URL('../../node_modules/azurite/dist/src/blob/main.js', import.meta.url))
  azurite = spawn(process.execPath, [bin, '--blobHost', '127.0.0.1', '--blobPort', '10000', '--inMemoryPersistence', '--skipApiVersionCheck', '--silent'], { stdio: 'ignore' })
  await waitForPort(10000)

  app = initializeApp({ projectId: PROJECT }, `azure-videos-${Date.now()}`)
  db = getFirestore(app)
  for (const [uid, orgId, role] of [['coach-a', 'org-a', 'coach'], ['coach2-a', 'org-a', 'coach'], ['admin-a', 'org-a', 'admin'], ['coach-b', 'org-b', 'coach']]) {
    await db.doc(`users/${uid}`).set({ orgId, role, email: `${uid}@acecam.test`, displayName: uid, createdAt: new Date() })
    tokens[uid] = await idToken(uid)
  }
  await db.doc('matches/m-a').set({ orgId: 'org-a', createdBy: 'coach-a', status: 'listo', videoPath: VIDEO })
  await db.doc('matches/m-nuevo').delete()

  // "UseDevelopmentStorage=true" apunta a Azurite con su cuenta pública de desarrollo.
  serviceClient = BlobServiceClient.fromConnectionString('UseDevelopmentStorage=true')
  const container = serviceClient.getContainerClient(CONTAINER)
  await container.createIfNotExists()
  await container.getBlockBlobClient(VIDEO).uploadData(bytes, { metadata: { uploadedby: 'coach-a' } })
  await container.getBlockBlobClient(PROCESSED).uploadData(bytes)

  const signer = createSasSigner({ serviceClient, container: CONTAINER, allowHttp: true })
  handler = createAzureVideoHandler({ verifyIdToken: token => getAuth(app).verifyIdToken(token), db, signer, origin: ORIGIN })
}, 60_000)

afterAll(async () => {
  if (app) await deleteApp(app)
  azurite?.kill()
})

const sign = (uid, body) => handler(new Request(`${ORIGIN}/api/videos/sign`, {
  method: 'POST',
  headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer ${tokens[uid] ?? uid}` } : {}) },
  body: JSON.stringify(body),
}))

const upload = (signed, data = bytes) => fetch(signed.url, { method: 'PUT', headers: signed.headers, body: data })

describe('almacenamiento de importaciones de YouTube en Azurite', () => {
  it('confirma un único Blob privado tras guardar y reutiliza el recibo de Firestore al reintentar', async () => {
    const container = serviceClient.getContainerClient(CONTAINER)
    const store = createAzureVideoImportStore({ db, container })
    const matchId = `yt-${Date.now()}`
    const videoPath = `orgs/org-a/matches/${matchId}/video.mp4`
    // Carpeta temporal privada (mkdtemp, permisos 0700): nadie más puede crear o cambiar el archivo.
    const tempDir = await mkdtemp(join(tmpdir(), 'acecam-'))
    const localPath = join(tempDir, `${matchId}.mp4`)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const record = {
      orgId: 'org-a', actorId: 'coach-a', matchId, sourceHash: 'video-de-prueba',
      localPath, sha256, bytes: bytes.length, metadata: { extension: 'mp4', contentType: 'video/mp4' },
    }
    await writeFile(localPath, bytes, { flag: 'wx' })
    try {
      expect(await store.find(record)).toBeNull()
      await expect(store.putIfAbsent({ ...record, localPath: `${localPath}.missing` })).rejects.toThrow()
      expect(await container.getBlobClient(videoPath).exists()).toBe(false)
      const results = await Promise.all([store.putIfAbsent(record), store.putIfAbsent(record)])
      expect(results).toEqual([expect.objectContaining({ videoPath }), expect.objectContaining({ videoPath })])
      expect(await createAzureVideoImportStore({ db, container }).find(record)).toEqual(results[0])
      const blob = container.getBlobClient(videoPath)
      expect(await blob.downloadToBuffer()).toEqual(Buffer.from(bytes))
      expect((await blob.getProperties()).metadata).toEqual({ uploadedby: 'coach-a', sha256 })
      expect((await fetch(blob.url)).ok).toBe(false)
      await expect(store.find({ ...record, actorId: 'coach2-a' })).rejects.toMatchObject({ code: 'import/conflict' })
      await expect(store.putIfAbsent({ ...record, sourceHash: 'otro-video' })).rejects.toMatchObject({ code: 'import/conflict' })
      expect((await db.doc(`matches/${matchId}`).get()).exists).toBe(false)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('encola una sola vez después de confirmar Blob, conserva la cuota y no encola un enlace no disponible', async () => {
    const orgId = 'org-yt-cola'
    const actorId = 'coach-yt-cola'
    const playerId = 'player-yt-cola'
    const matchId = 'match-yt-cola'
    const failedId = 'match-yt-error'
    const quotaId = 'match-yt-cuota'
    const usage = db.doc(`orgs/${orgId}/usage/${usagePeriod()}`)
    const videoPath = `orgs/${orgId}/matches/${matchId}/video.mp4`
    const tempDir = await mkdtemp(join(tmpdir(), 'acecam-'))
    const localPath = join(tempDir, 'cola.mp4')
    const container = serviceClient.getContainerClient(CONTAINER)
    const store = createAzureVideoImportStore({ db, container })
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
    const env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host, port: Number(port) } })
    try {
      await writeFile(localPath, bytes, { flag: 'wx' })
      await Promise.all([
        db.doc(`users/${actorId}`).set({ orgId, role: 'coach', email: `${actorId}@acecam.test`, displayName: actorId, createdAt: new Date() }),
        db.doc(`orgs/${orgId}`).set({ name: 'Club de pruebas', plan: 'basico' }),
        db.doc(`players/${playerId}`).set({ orgId, createdBy: actorId, fullName: 'Valeria Torres' }),
      ])
      const clientDb = env.authenticatedContext(actorId, { email: `${actorId}@acecam.test` }).firestore()
      const input = { sourceType: 'link', url: 'https://youtu.be/abcdefghijk', playerId, playerPosition: 'abajo', opponent: 'Rival de prueba', matchDate: '2026-01-01' }
      let calls = 0
      const importVideo = createAzureYouTubeVideoImporter({
        enabled: true, apiUrl: 'https://azure-videos.example', origin: ORIGIN,
        getSession: async () => ({ orgId, actorId, token: 'test-token' }),
        async fetcher(_url, { body, signal }) {
          calls++
          const request = JSON.parse(body)
          if (request.matchId === failedId) return Response.json({ error: { code: 'import/youtube-unavailable' } }, { status: 422 })
          expect(request).toEqual({ url: input.url, matchId })
          expect((await db.doc(`matches/${matchId}`).get()).exists).toBe(false)
          expect((await usage.get()).exists).toBe(false)
          const receipt = await store.putIfAbsent({
            orgId, actorId, matchId, localPath, signal, sourceHash: 'fuente-de-prueba', bytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'), metadata: { extension: 'mp4', contentType: 'video/mp4' },
          })
          return Response.json({ videoPath: receipt.videoPath })
        },
      })
      const service = () => createFirestoreAnalysisService({ db: clientDb, orgId, actorId, importVideo, maxBytes: 5000,
        uploadVideo: () => { throw new Error('Esta prueba usa un enlace.') },
      })
      const analysis = service()
      await expect(analysis.enqueue(input, { requestId: failedId })).rejects.toMatchObject({ code: 'import/youtube-unavailable' })
      expect((await db.doc(`matches/${failedId}`).get()).exists).toBe(false)
      expect((await usage.get()).exists).toBe(false)
      const submission = analysis.enqueue(input, { requestId: matchId })
      expect(analysis.enqueue(input, { requestId: matchId })).toBe(submission)
      expect(await submission).toMatchObject({ id: matchId, status: 'en cola', videoPath })
      expect(await service().enqueue(input, { requestId: matchId })).toMatchObject({ id: matchId, videoPath })
      expect((await usage.get()).data()).toMatchObject({ analyses: 1, lastMatchId: matchId })
      expect(await container.getBlobClient(videoPath).downloadToBuffer()).toEqual(Buffer.from(bytes))
      expect(await container.getBlobClient(`orgs/${orgId}/matches/${failedId}/video.mp4`).exists()).toBe(false)
      await usage.update({ analyses: 30 })
      await expect(service().enqueue(input, { requestId: quotaId })).rejects.toMatchObject({ code: 'analysis/limit' })
      expect((await db.doc(`matches/${quotaId}`).get()).exists).toBe(false)
      expect(calls).toBe(2)
    } finally {
      await env.cleanup()
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})

describe('videos en Azure Blob con enlaces temporales (PCIT-223)', () => {
  it('bloquea nuevas firmas de lectura y escritura mientras la cuenta está suspendida', async () => {
    const profile = db.doc('users/admin-a')
    const read = { path: PROCESSED, operation: 'read' }
    const write = { path: NEW_VIDEO, operation: 'upload' }
    expect((await sign('admin-a', read)).status).toBe(200)
    await profile.update({ suspended: true })
    try {
      expect((await sign('admin-a', read)).status).toBe(403)
      expect((await sign('admin-a', write)).status).toBe(403)
    } finally {
      await profile.update({ suspended: false })
    }
    expect((await sign('admin-a', read)).status).toBe(200)
  })

  it('el entrenador sube un video nuevo y luego lo lee con un enlace temporal', async () => {
    const response = await sign('coach-a', { path: NEW_VIDEO, operation: 'upload' })
    expect(response.status).toBe(200)
    const signed = await response.json()
    expect(signed.headers['x-ms-meta-uploadedby']).toBe('coach-a')
    expect((await upload(signed)).status).toBe(201)

    const read = await (await sign('coach-a', { path: NEW_VIDEO, operation: 'read' })).json()
    const download = await fetch(read.url)
    expect(download.status).toBe(200)
    expect(download.headers.get('content-type')).toBe('video/mp4')
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes)
  })

  it('antes de crear el partido, solo quien subió el video puede leerlo', async () => {
    expect((await sign('coach2-a', { path: NEW_VIDEO, operation: 'read' })).status).toBe(403)
    expect((await sign('admin-a', { path: NEW_VIDEO, operation: 'read' })).status).toBe(200)
  })

  it('un partido creado: lo leen su entrenador y el admin, no otro entrenador ni otro club', async () => {
    expect((await sign('coach-a', { path: VIDEO, operation: 'read' })).status).toBe(200)
    expect((await sign('admin-a', { path: VIDEO, operation: 'read' })).status).toBe(200)
    expect((await sign('coach2-a', { path: VIDEO, operation: 'read' })).status).toBe(403)
    expect((await sign('coach-b', { path: VIDEO, operation: 'read' })).status).toBe(403)
    expect((await sign('coach-b', { path: NEW_VIDEO, operation: 'upload' })).status).toBe(403)
  })

  it('el video procesado se lee, pero nadie lo sube desde la web', async () => {
    expect((await sign('coach-a', { path: PROCESSED, operation: 'read' })).status).toBe(200)
    expect((await sign('admin-a', { path: PROCESSED, operation: 'upload' })).status).toBe(403)
  })

  it('sin sesión o con un token falso no hay enlace', async () => {
    expect((await sign(null, { path: VIDEO, operation: 'read' })).status).toBe(401)
    expect((await sign('token-falso', { path: VIDEO, operation: 'read' })).status).toBe(401)
  })

  it('rechaza rutas inventadas, campos extra y otros orígenes', async () => {
    for (const path of ['orgs/org-a/matches/m-a/../../org-b/x.mp4', 'orgs/org-a/applications/a/video.mp4', 'otra/ruta.mp4']) {
      expect((await sign('admin-a', { path, operation: 'read' })).status, path).toBe(400)
    }
    expect((await sign('admin-a', { path: VIDEO, operation: 'read', extra: 1 })).status).toBe(400)
    expect((await sign('admin-a', { path: VIDEO, operation: 'delete' })).status).toBe(400)
    const foreign = await handler(new Request(`${ORIGIN}/api/videos/sign`, {
      method: 'POST', headers: { Origin: 'https://otro-sitio.test', Authorization: `Bearer ${tokens['admin-a']}` },
      body: JSON.stringify({ path: VIDEO, operation: 'read' }),
    }))
    expect(foreign.status).toBe(403)
  })

  it('un enlace de lectura no sirve para escribir', async () => {
    const read = await (await sign('coach-a', { path: VIDEO, operation: 'read' })).json()
    const overwrite = await fetch(read.url, { method: 'PUT', headers: { 'x-ms-blob-type': 'BlockBlob' }, body: new Uint8Array(10) })
    expect(overwrite.status).toBe(403)
  })

  it('un enlace caducado deja de funcionar', async () => {
    const past = createSasSigner({ serviceClient, container: CONTAINER, allowHttp: true, now: () => new Date(Date.now() - 20 * 60_000) })
    const expired = await past.sign(VIDEO, { permissions: 'r', minutes: 10 })
    expect((await fetch(expired.url)).status).toBe(403)
  })
})
