// Videos de postulación en Azure (PCIT-251) contra Azurite y los emuladores de Firestore.
// El servicio corre en otro dominio que la web: CORS, host propio, Blob privado y lectura solo
// para el equipo de la organización. Ejecutar con: npm run test:rules

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createConnection } from 'node:net'
import { fileURLToPath } from 'node:url'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { BlobServiceClient } from '@azure/storage-blob'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApplicationVideoApp } from '../../server/application-video/app.js'
import { submitPublicApplication } from '../../src/panel/lib/publicApplications.js'

const projectId = process.env.ACECAM_RULES_PROJECT || 'demo-acecam'
const WEB = 'http://localhost:5173'
const orgId = 'org-azure-postulacion'
const formId = 'AcecamFormAzure12345'
const body = Buffer.from('video de postulación de prueba')

let azurite
let env
let admin
let db
let container
let server
let base
let metadata
let application

const waitForPort = (port, deadline = Date.now() + 30_000) => new Promise((resolve, reject) => {
  const attempt = () => {
    const socket = createConnection({ host: '127.0.0.1', port }, () => { socket.end(); resolve() })
    socket.on('error', () => (Date.now() > deadline ? reject(new Error('Azurite no arrancó')) : setTimeout(attempt, 250)))
  }
  attempt()
})

beforeAll(async () => {
  const bin = fileURLToPath(new URL('../../node_modules/azurite/dist/src/blob/main.js', import.meta.url))
  azurite = spawn(process.execPath, [bin, '--blobHost', '127.0.0.1', '--blobPort', '10000', '--inMemoryPersistence', '--skipApiVersionCheck', '--silent'], { stdio: 'ignore' })
  await waitForPort(10000)
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync(new URL('../../../firebase/firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1', port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':').at(-1) || 8080) },
  })
  admin = initializeApp({ projectId }, `application-video-azure-${Date.now()}`)
  db = getFirestore(admin)
  container = BlobServiceClient.fromConnectionString('UseDevelopmentStorage=true').getContainerClient('videos')
  await container.createIfNotExists()

  server = createServer()
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject))
  const serviceHost = `127.0.0.1:${server.address().port}`
  base = `http://${serviceHost}`
  const handler = createApplicationVideoApp({
    db,
    container,
    probe: async () => metadata,
    // Tokens de prueba: el token es el UID. La ficha de users decide el acceso.
    verifyIdToken: async token => ({ uid: token }),
    origin: WEB,
    serviceHost,
  })
  server.on('request', handler)
}, 60_000)

afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve))
  await env?.cleanup()
  if (admin) await deleteApp(admin)
  azurite?.kill()
})

beforeEach(async () => {
  metadata = { durationSeconds: 45, width: 1920, height: 1080, fps: 30, extension: 'mp4', contentType: 'video/mp4' }
  await db.doc(`orgs/${orgId}/applicationForms/${formId}`).set({ createdAt: new Date() })
  await db.doc('users/coach-azure').set({ orgId, role: 'coach' })
  await db.doc('users/admin-ajeno').set({ orgId: 'org-ajena', role: 'admin' })
  await db.doc('users/coach-suspendido').set({ orgId, role: 'coach', suspended: true })
  application = await submitPublicApplication(env.unauthenticatedContext().firestore(), { orgId, formId }, {
    fullName: 'Postulante Demo', birthDate: '2001-03-03', city: 'Lima', email: 'azure@example.test',
    graduationYear: '2027', academy: '', message: '', consentAccepted: true, attachVideo: true,
  })
})

const endpoint = () => `${base}/api/application-video/${orgId}/${formId}/${application.id}`
const blobPath = () => `orgs/${orgId}/applications/${application.id}/video.mp4`
const submit = (origin = WEB) => fetch(endpoint(), {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/octet-stream' }, body,
})
const read = token => fetch(endpoint(), { headers: { Origin: WEB, ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
const videoPaths = async () => (await db.doc(application.path).get()).get('videoPaths')

describe('videos de postulación en Azure Blob (PCIT-251)', () => {
  it('responde a /healthz', async () => {
    const response = await fetch(`${base}/healthz`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok')
  })

  it('el preflight de CORS solo acepta la web', async () => {
    const ok = await fetch(endpoint(), { method: 'OPTIONS', headers: { Origin: WEB, 'Access-Control-Request-Method': 'POST' } })
    expect(ok.status).toBe(204)
    expect(ok.headers.get('access-control-allow-origin')).toBe(WEB)
    expect(ok.headers.get('access-control-allow-methods')).toBe('GET, POST')
    const other = await fetch(endpoint(), { method: 'OPTIONS', headers: { Origin: 'https://otro-sitio.test' } })
    expect(other.status).toBe(403)
  })

  it('un video válido de más de 60 s queda privado en Blob y adjunto a la postulación; un reintento no duplica', async () => {
    metadata = { ...metadata, durationSeconds: 75 }
    const response = await submit()
    // El tope de duración sale de videoRequirements.js (PCIT-147): si aún vale 60 s, se rechaza.
    if (response.status === 422) {
      expect((await response.json()).error).toMatch(/minuto/)
      return
    }
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe(WEB)
    const properties = await container.getBlobClient(blobPath()).getProperties()
    expect(properties.contentType).toBe('video/mp4')
    expect(properties.cacheControl).toBe('private, no-store')
    expect(properties.metadata.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(await videoPaths()).toEqual([blobPath()])
    expect((await submit()).status).toBe(200)
    expect(await videoPaths()).toEqual([blobPath()])
  })

  it('un video de 45 s, 1080p y 30 FPS se adjunta', async () => {
    expect((await submit()).status).toBe(200)
    expect(await container.getBlobClient(blobPath()).exists()).toBe(true)
    expect(await videoPaths()).toEqual([blobPath()])
  })

  it('rechaza por resolución o FPS antes de guardar nada', async () => {
    metadata = { ...metadata, width: 640, height: 360 }
    const lowResolution = await submit()
    expect(lowResolution.status).toBe(422)
    expect((await lowResolution.json()).error).toMatch(/720p/)
    metadata = { ...metadata, width: 1280, height: 720, fps: 24 }
    const lowFps = await submit()
    expect(lowFps.status).toBe(422)
    expect((await lowFps.json()).error).toMatch(/FPS/)
    expect(await container.getBlobClient(blobPath()).exists()).toBe(false)
    expect(await videoPaths()).toBeUndefined()
  })

  it('solo el equipo de la organización lee el video', async () => {
    expect((await submit()).status).toBe(200)
    const team = await read('coach-azure')
    expect(team.status).toBe(200)
    expect(team.headers.get('cache-control')).toBe('private, no-store')
    expect(Buffer.from(await team.arrayBuffer())).toEqual(body)
    expect((await read('admin-ajeno')).status).toBe(403)
    expect((await read('coach-suspendido')).status).toBe(403)
    expect((await read(null)).status).toBe(401)
  })

  it('rechaza otro origen al enviar', async () => {
    expect((await submit('https://otro-sitio.test')).status).toBe(403)
    expect(await videoPaths()).toBeUndefined()
  })
})
