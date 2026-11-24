// Filas storage.* de la matriz de acceso (PCIT-210) contra la API de videos de Azure (PCIT-228).
// En producción los videos están en Azure Blob (PCIT-222): quien decide es la API de videos
// (web/server/azure-videos), no storage.rules. Esta prueba recorre las mismas filas y roles que
// tests/storage/accessMatrix.storage.test.js, pero pidiendo enlaces a la API y usándolos en
// Azurite. Ejecutar con: npm run test:rules (Azurite se enciende y apaga dentro de la prueba).

import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { fileURLToPath } from 'node:url'
import { BlobServiceClient } from '@azure/storage-blob'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAzureVideoHandler } from '../../server/azure-videos/http.js'
import { createSasSigner } from '../../server/azure-videos/sas.js'
import { MATRIX, ROLES, expected } from '../rules/accessMatrix.js'

const ORIGIN = 'http://localhost:5173'
const CONTAINER = 'videos'
const PROJECT = process.env.ACECAM_RULES_PROJECT || 'demo-acecam'
const ORG = 'org-a'
const VIDEO = `orgs/${ORG}/matches/m-a/video.mp4`
const NEW_VIDEO = `orgs/${ORG}/matches/m-nuevo/video.mp4`
const PROCESSED = `orgs/${ORG}/matches/m-a/processed.mp4`
const APPLICATION_VIDEO = `orgs/${ORG}/applications/app-a/video.mp4`
const bytes = new Uint8Array(2048).fill(7)

const UIDS = {
  visitante: null,
  sinOrganizacion: 'sin-org',
  entrenador: 'coach-a',
  otroEntrenador: 'coach2-a',
  admin: 'admin-a',
  entrenadorAjeno: 'coach-b',
  adminAjeno: 'admin-b',
  plataforma: 'plataforma',
}

// Donde Azure es más estricto que storage.rules, a propósito. Cualquier otra diferencia falla.
const AZURE_DIFFERENCES = {
  // La API solo firma enlaces para subir o leer: desde la web nadie borra videos en Azure.
  // El borrado lo hará el proceso de eliminación de datos (PCIT-221), no el navegador.
  'storage.videoDelete': [],
}

let azurite
let app
let container
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

  app = initializeApp({ projectId: PROJECT }, `azure-matrix-${Date.now()}`)
  const db = getFirestore(app)
  // Los mismos datos de partida que la matriz de Firestore, reducidos a lo que lee la API.
  for (const [uid, orgId, role] of [
    ['admin-a', 'org-a', 'admin'], ['coach-a', 'org-a', 'coach'], ['coach2-a', 'org-a', 'coach'],
    ['admin-b', 'org-b', 'admin'], ['coach-b', 'org-b', 'coach'],
  ]) await db.doc(`users/${uid}`).set({ email: `${uid}@acecam.test`, displayName: `Cuenta ${uid}`, orgId, role, createdAt: new Date() })
  await db.doc('users/sin-org').delete()
  await db.doc('platformAdmins/plataforma').set({ createdAt: new Date() })
  await db.doc('matches/m-a').set({ orgId: ORG, createdBy: 'coach-a', status: 'listo', videoPath: VIDEO })
  await db.doc('matches/m-nuevo').delete()
  for (const uid of Object.values(UIDS).filter(Boolean)) tokens[uid] = await idToken(uid)

  const serviceClient = BlobServiceClient.fromConnectionString('UseDevelopmentStorage=true')
  container = serviceClient.getContainerClient(CONTAINER)
  await container.createIfNotExists()
  handler = createAzureVideoHandler({
    verifyIdToken: token => getAuth(app).verifyIdToken(token),
    db,
    signer: createSasSigner({ serviceClient, container: CONTAINER, allowHttp: true }),
    origin: ORIGIN,
  })
}, 120_000)

afterAll(async () => {
  if (app) await deleteApp(app)
  azurite?.kill()
})

// Antes de cada intento, los blobs vuelven a su estado inicial.
async function seedBlobs() {
  await container.getBlockBlobClient(NEW_VIDEO).deleteIfExists()
  await container.getBlockBlobClient(PROCESSED).deleteIfExists()
  await container.getBlockBlobClient(VIDEO).uploadData(bytes, { metadata: { uploadedby: 'coach-a' } })
}

/** Pide un enlace a la API como `role`. Devuelve el enlace firmado o null si la API lo niega. */
async function sign(role, path, operation) {
  const uid = UIDS[role]
  const response = await handler(new Request(`${ORIGIN}/api/videos/sign`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer ${tokens[uid]}` } : {}) },
    body: JSON.stringify({ path, operation }),
  }))
  // 400 (operación o ruta que la API no admite), 401 (sin sesión) y 403 (sin permiso) son "denegado".
  expect([200, 400, 401, 403]).toContain(response.status)
  return response.status === 200 ? response.json() : null
}

const upload = async (role, path) => {
  const signed = await sign(role, path, 'upload')
  if (!signed) return false
  return (await fetch(signed.url, { method: 'PUT', headers: signed.headers, body: bytes })).status === 201
}

const read = async (role, path) => {
  const signed = await sign(role, path, 'read')
  if (!signed) return false
  return (await fetch(signed.url)).status === 200
}

const OPERATIONS = {
  'storage.videoRead': role => read(role, VIDEO),
  'storage.videoUpload': role => upload(role, NEW_VIDEO),
  'storage.videoDelete': async role => (await sign(role, VIDEO, 'delete')) !== null,
  'storage.processedWrite': role => upload(role, PROCESSED),
  'storage.applicationVideoRead': role => read(role, APPLICATION_VIDEO),
}

const storageRows = MATRIX.filter(row => row.id.startsWith('storage.'))
const allowedInAzure = (row, role) => (row.id in AZURE_DIFFERENCES
  ? AZURE_DIFFERENCES[row.id].includes(role)
  : expected(row, role))

describe('matriz de acceso de Storage contra la API de videos de Azure (PCIT-228)', () => {
  it('cada fila de Storage de la matriz tiene su operación en Azure, y no sobra ninguna', () => {
    expect(Object.keys(OPERATIONS).sort()).toEqual(storageRows.map(row => row.id).sort())
  })

  it('las diferencias con storage.rules solo quitan permisos, nunca los añaden', () => {
    for (const [id, roles] of Object.entries(AZURE_DIFFERENCES)) {
      const row = storageRows.find(candidate => candidate.id === id)
      for (const role of roles) expect(expected(row, role), `${id} · ${role}`).toBe(true)
    }
  })

  for (const row of storageRows) {
    describe(`${row.id} · ${row.operacion} ${row.recurso}`, () => {
      for (const role of Object.keys(ROLES)) {
        const allowed = allowedInAzure(row, role)
        it(`${role} (${ROLES[role]}) → ${allowed ? 'permitido' : 'denegado'}`, async () => {
          await seedBlobs()
          expect(await OPERATIONS[row.id](role)).toBe(allowed)
        })
      }
    })
  }
})
