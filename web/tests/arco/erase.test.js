// Borrado ARCO (PCIT-221) contra los emuladores de Auth, Firestore y Storage, y Azurite.
// Ejecutar con: npm run test:rules (Azurite se enciende y apaga dentro de la prueba).

import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { fileURLToPath } from 'node:url'
import { BlobServiceClient } from '@azure/storage-blob'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createEraser } from '../../server/arco/erase.js'

const PROJECT = process.env.ACECAM_RULES_PROJECT || 'demo-acecam'
const bytes = Buffer.alloc(1024, 7)

let azurite
let app
let db
let auth
let bucket
let container
let eraser

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
  app = initializeApp({ projectId: PROJECT, storageBucket: `${PROJECT}.appspot.com` }, `arco-${Date.now()}`)
  db = getFirestore(app)
  auth = getAuth(app)
  bucket = getStorage(app).bucket()
  container = BlobServiceClient.fromConnectionString('UseDevelopmentStorage=true').getContainerClient('videos')
  await container.createIfNotExists()
  eraser = createEraser({ db, auth, bucket, container })
}, 60_000)

afterAll(async () => {
  if (app) await deleteApp(app)
  azurite?.kill()
})

const VIDEOS = [
  'orgs/org-a/matches/m-a1/video.mp4', 'orgs/org-a/matches/m-a1/processed.mp4',
  'orgs/org-a/matches/m-a2/video.mp4', 'orgs/org-a/applications/app-a/video.mp4',
  'orgs/org-b/matches/m-b1/video.mp4',
]

// Dos clubes. El A tiene dueña (owner-a), un entrenador (coach-a), dos jugadores y dos partidos.
async function seed() {
  for (const collection of ['users', 'orgs', 'invites', 'players', 'matches', 'applications', 'platformAudit']) {
    await db.recursiveDelete(db.collection(collection))
  }
  for (const uid of ['owner-a', 'coach-a', 'owner-b']) {
    await auth.deleteUser(uid).catch(() => {})
    await auth.createUser({ uid, email: `${uid}@club.test` })
  }
  const now = new Date()
  const set = (path, data) => db.doc(path).set(data)
  await set('orgs/org-a', { name: 'Club A', ownerId: 'owner-a', plan: 'pro', createdAt: now })
  await set('orgs/org-a/usage/2026-11', { analyses: 2 })
  await set('orgs/org-a/applicationForms/Enlace0000000000001', { createdAt: now })
  await set('orgs/org-b', { name: 'Club B', ownerId: 'owner-b', plan: 'pro', createdAt: now })
  await set('users/owner-a', { email: 'owner-a@club.test', orgId: 'org-a', role: 'admin' })
  await set('users/coach-a', { email: 'coach-a@club.test', orgId: 'org-a', role: 'coach' })
  await set('users/owner-b', { email: 'owner-b@club.test', orgId: 'org-b', role: 'admin' })
  await set('invites/coach-a@club.test', { email: 'coach-a@club.test', orgId: 'org-a', status: 'aceptada' })
  await set('invites/nueva@club.test', { email: 'nueva@club.test', orgId: 'org-a', status: 'pendiente' })
  await set('players/p-a1', { orgId: 'org-a', fullName: 'Jugadora Uno' })
  await set('players/p-a2', { orgId: 'org-a', fullName: 'Jugador Dos' })
  await set('players/p-b1', { orgId: 'org-b', fullName: 'Jugadora B' })
  await set('matches/m-a1', { orgId: 'org-a', playerId: 'p-a1', createdBy: 'coach-a', videoPath: VIDEOS[0] })
  await set('matches/m-a1/coachNotes/coach-a', { text: 'Nota de coach-a' })
  await set('matches/m-a1/coachNotes/owner-a', { text: 'Nota de owner-a' })
  await set('matches/m-a2', { orgId: 'org-a', playerId: 'p-a2', createdBy: 'coach-a', videoPath: VIDEOS[2] })
  await set('matches/m-b1', { orgId: 'org-b', playerId: 'p-b1', createdBy: 'owner-b', videoPath: VIDEOS[4] })
  await set('applications/app-a', { orgId: 'org-a', playerId: 'p-a1', fullName: 'Jugadora Uno' })
  await set('platformAudit/vieja', { createdAt: new Date('2024-01-01T00:00:00Z'), entity: 'orgs' })
  await set('platformAudit/nueva', { createdAt: now, entity: 'orgs' })

  for (const name of VIDEOS) {
    await bucket.file(name).save(bytes, { contentType: 'video/mp4' })
    await container.getBlockBlobClient(name).uploadData(bytes)
  }
}

const exists = async path => (await db.doc(path).get()).exists
const inFirebase = async name => (await bucket.file(name).exists())[0]
const inAzure = name => container.getBlobClient(name).exists()
const hasAccount = uid => auth.getUser(uid).then(() => true, () => false)

beforeEach(seed, 60_000)

describe('borrado ARCO (PCIT-221)', () => {
  it('el plan, sin --execute, no borra nada', async () => {
    const report = await eraser.execute(await eraser.planOrg('org-a'))
    expect(report.dryRun).toBe(true)
    expect(report.azureBlobs.sort()).toEqual(VIDEOS.filter(name => name.startsWith('orgs/org-a/')).sort())
    expect(report.authUids.sort()).toEqual(['coach-a', 'owner-a'])
    expect(await exists('orgs/org-a')).toBe(true)
    expect(await inAzure(VIDEOS[0])).toBe(true)
    expect(await hasAccount('coach-a')).toBe(true)
  })

  it('una organización se borra entera, en Firestore, los dos almacenamientos y Auth, sin tocar otra', async () => {
    await eraser.execute(await eraser.planOrg('org-a'), { dryRun: false })
    for (const path of ['orgs/org-a', 'orgs/org-a/usage/2026-11', 'orgs/org-a/applicationForms/Enlace0000000000001',
      'users/owner-a', 'users/coach-a', 'invites/coach-a@club.test', 'invites/nueva@club.test',
      'players/p-a1', 'players/p-a2', 'matches/m-a1', 'matches/m-a1/coachNotes/coach-a', 'matches/m-a2', 'applications/app-a']) {
      expect(await exists(path), path).toBe(false)
    }
    for (const name of VIDEOS.slice(0, 4)) {
      expect(await inFirebase(name), name).toBe(false)
      expect(await inAzure(name), name).toBe(false)
    }
    expect(await hasAccount('owner-a')).toBe(false)
    expect(await hasAccount('coach-a')).toBe(false)
    // El club B queda intacto.
    expect(await exists('orgs/org-b')).toBe(true)
    expect(await exists('matches/m-b1')).toBe(true)
    expect(await inAzure(VIDEOS[4])).toBe(true)
    expect(await inFirebase(VIDEOS[4])).toBe(true)
    expect(await hasAccount('owner-b')).toBe(true)
  })

  it('un jugador: su ficha, sus partidos con videos y notas, y sus postulaciones; nada de otro jugador', async () => {
    await eraser.execute(await eraser.planPlayer('p-a1'), { dryRun: false })
    for (const path of ['players/p-a1', 'matches/m-a1', 'matches/m-a1/coachNotes/coach-a', 'applications/app-a']) {
      expect(await exists(path), path).toBe(false)
    }
    for (const name of [VIDEOS[0], VIDEOS[1], VIDEOS[3]]) {
      expect(await inAzure(name), name).toBe(false)
      expect(await inFirebase(name), name).toBe(false)
    }
    expect(await exists('players/p-a2')).toBe(true)
    expect(await exists('matches/m-a2')).toBe(true)
    expect(await inAzure(VIDEOS[2])).toBe(true)
  })

  it('una postulación: el documento y su video', async () => {
    await eraser.execute(await eraser.planApplication('app-a'), { dryRun: false })
    expect(await exists('applications/app-a')).toBe(false)
    expect(await inAzure(VIDEOS[3])).toBe(false)
    expect(await exists('players/p-a1')).toBe(true)
  })

  it('un miembro: cuenta, ficha, notas privadas e invitación; los partidos que creó se quedan', async () => {
    const report = await eraser.execute(await eraser.planUser('coach-a'), { dryRun: false })
    expect(report.authUids).toEqual(['coach-a'])
    expect(await hasAccount('coach-a')).toBe(false)
    for (const path of ['users/coach-a', 'matches/m-a1/coachNotes/coach-a', 'invites/coach-a@club.test']) {
      expect(await exists(path), path).toBe(false)
    }
    expect(await exists('matches/m-a1')).toBe(true)
    expect(await exists('matches/m-a1/coachNotes/owner-a')).toBe(true)
    expect(await inAzure(VIDEOS[0])).toBe(true)
  })

  it('la dueña de una organización no se borra como miembro', async () => {
    await expect(eraser.planUser('owner-a')).rejects.toMatchObject({ code: 'arco/owner' })
  })

  it('la bitácora se depura solo antes de la fecha indicada', async () => {
    await eraser.execute(await eraser.planAudit(new Date('2025-01-01T00:00:00Z')), { dryRun: false })
    expect(await exists('platformAudit/vieja')).toBe(false)
    expect(await exists('platformAudit/nueva')).toBe(true)
  })

  it('volver a ejecutar el mismo borrado no falla', async () => {
    await eraser.execute(await eraser.planOrg('org-a'), { dryRun: false })
    const again = await eraser.execute(await eraser.planOrg('org-a'), { dryRun: false })
    expect(again.azureBlobs).toEqual([])
    expect(again.authUids).toEqual([])
  })

  it('rechaza IDs con rutas', async () => {
    await expect(eraser.planOrg('../org-b')).rejects.toThrow(TypeError)
    await expect(eraser.planPlayer('a/b')).rejects.toThrow(TypeError)
  })
})
