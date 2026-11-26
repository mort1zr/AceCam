// Registro e inicio de sesión (PCIT-21) contra los emuladores de Auth y Firestore,
// con las reglas reales de firestore.rules. Ejecutar con: npm run test:rules

import { deleteApp, initializeApp } from 'firebase/app'
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { applyActionCode, connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, doc, getDoc, getFirestore, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAuthService } from '../../src/panel/lib/auth.js'
import { invitarDesdePlataforma, invitarMiembro } from '../../src/panel/lib/invitaciones.js'

const PROJECT = process.env.ACECAM_RULES_PROJECT || 'demo-acecam'
const HOST = '127.0.0.1'

let app
let auth
let db
let service

beforeAll(async () => {
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || `${HOST}:9099`
  await fetch(`http://${authHost}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' })
  app = initializeApp({ projectId: PROJECT, apiKey: 'demo-api-key' }, `auth-test-${Date.now()}`)
  auth = getAuth(app)
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true })
  db = getFirestore(app)
  connectFirestoreEmulator(db, HOST, Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':').at(-1) || 8080))
  service = createAuthService({ auth, db })
})

afterAll(async () => {
  await auth?.signOut()
  if (app) await deleteApp(app)
})

const account = { name: 'Coach Nuevo', orgName: 'Universidad Nueva', email: 'Nuevo@AceCam.test', password: 'acecam123' }

describe('registro con las reglas reales', () => {
  it('crea la cuenta, su organización y su ficha de coach', async () => {
    const { user, orgId } = await service.registerCoach(account)

    expect(user.email).toBe('nuevo@acecam.test')
    expect(user.displayName).toBe('Coach Nuevo')
    const profile = (await getDoc(doc(db, 'users', user.uid))).data()
    expect(profile).toMatchObject({ email: 'nuevo@acecam.test', displayName: 'Coach Nuevo', orgId, role: 'coach' })
    const org = (await getDoc(doc(db, 'orgs', orgId))).data()
    expect(org).toMatchObject({ name: 'Universidad Nueva', ownerId: user.uid, plan: 'free' })
  })

  it('cierra e inicia sesión', async () => {
    await service.logout()
    expect(auth.currentUser).toBeNull()
    await service.login({ email: account.email, password: account.password })
    expect(auth.currentUser?.email).toBe('nuevo@acecam.test')
  })

  it('rechaza un correo en uso y una contraseña incorrecta', async () => {
    await service.logout()
    await expect(service.registerCoach(account)).rejects.toMatchObject({ code: 'auth/email-already-in-use' })
    await expect(service.login({ email: account.email, password: 'mala-clave' })).rejects.toHaveProperty('code')
  })
})

// El emulador de Auth guarda los correos de verificación: abrir su enlace verifica la cuenta.
async function verificarCorreo(email) {
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || `${HOST}:9099`
  const { oobCodes } = await (await fetch(`http://${authHost}/emulator/v1/projects/${PROJECT}/oobCodes`)).json()
  const codigo = oobCodes.filter(c => c.email === email && c.requestType === 'VERIFY_EMAIL').at(-1)
  expect(codigo, `correo de verificación para ${email}`).toBeTruthy()
  await fetch(codigo.oobLink)
}

describe('registro con invitación (PCIT-40 y PCIT-220)', () => {
  let orgId

  it('crea la cuenta, envía el correo de verificación y todavía no se une', async () => {
    const { user: owner } = await service.login({ email: account.email, password: account.password })
    orgId = (await getDoc(doc(db, 'users', owner.uid))).data().orgId
    await invitarMiembro({ db, orgId, uid: owner.uid, email: 'Invitada@Club.test', role: 'coach' })
    await service.logout()

    const invitada = { name: 'Coach Invitada', email: 'invitada@club.test', password: 'acecam123', invited: true }
    const result = await service.registerCoach(invitada)
    expect(result).toMatchObject({ joined: false, verificationPending: true })
    expect((await getDoc(doc(db, 'users', result.user.uid))).exists()).toBe(false)
    // Sin verificar, las reglas no dejan leer la invitación ni unirse.
    await expect(getDoc(doc(db, 'invites', 'invitada@club.test'))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(service.completeInvitedSignup()).rejects.toMatchObject({ code: 'auth/email-not-verified' })
  })

  it('reenvía el correo de verificación', async () => {
    await expect(service.resendVerification()).resolves.toBeUndefined()
  })

  it('tras verificar el correo se une con el rol de la invitación', async () => {
    await verificarCorreo('invitada@club.test')
    const result = await service.completeInvitedSignup()
    expect(result).toMatchObject({ orgId, joined: true })
    const profile = (await getDoc(doc(db, 'users', result.user.uid))).data()
    expect(profile).toMatchObject({ email: 'invitada@club.test', displayName: 'Coach Invitada', orgId, role: 'coach' })
    const invite = (await getDoc(doc(db, 'invites', 'invitada@club.test'))).data()
    expect(invite).toMatchObject({ status: 'aceptada', acceptedBy: result.user.uid })
  })

  it('con el enlace de invitación pero sin invitación, falla al verificar y no deja la cuenta a medias', async () => {
    await service.logout()
    const sinInvitacion = { name: 'Sin Invitación', email: 'sininvitacion@club.test', password: 'acecam123', invited: true }
    await service.registerCoach(sinInvitacion)
    await verificarCorreo('sininvitacion@club.test')
    await expect(service.completeInvitedSignup()).rejects.toMatchObject({ code: 'invite/not-found' })
    expect(auth.currentUser).toBeNull()
    // La cuenta se borró: puede registrarse con su propia organización.
    await expect(service.registerCoach({ ...sinInvitacion, invited: false, orgName: 'Club Propio' })).resolves.toMatchObject({ joined: false })
  })
})

it('incorpora al primer administrador con invitación de plataforma auditada y correo verificado', async () => {
  const env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { host: HOST, port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':').at(-1) || 8080) },
  })
  const uid = 'operador-invitaciones'
  const orgId = 'organizacion-sin-miembros'
  const email = 'primer-admin@acecam.test'
  const invited = { name: 'Primera Administradora', email, password: 'acecam123', invited: true }
  const platform = env.authenticatedContext(uid, { email: 'operador@acecam.test' }).firestore()
  try {
    await env.withSecurityRulesDisabled(async context => {
      const admin = context.firestore()
      await setDoc(doc(admin, 'platformAdmins', uid), {})
      await setDoc(doc(admin, 'orgs', orgId), { name: 'Club Nuevo', ownerId: null, plan: 'free', archived: false })
    })
    const request = { db: platform, uid, orgId, email, role: 'admin' }
    await expect(invitarDesdePlataforma(request)).resolves.toBe(email)
    await assertFails(invitarDesdePlataforma(request))
    await assertFails(invitarDesdePlataforma({ ...request, orgId: 'no-existe', email: 'otro@acecam.test' }))
    await assertFails(invitarDesdePlataforma({
      ...request, uid: 'externo', db: env.authenticatedContext('externo').firestore(), email: 'fuera@acecam.test',
    }))

    const unverified = env.authenticatedContext('sin-verificar', { email, email_verified: false }).firestore()
    const join = writeBatch(unverified)
    join.set(doc(unverified, 'users', 'sin-verificar'), {
      email, orgId, role: 'admin', displayName: 'Sin verificar', createdAt: serverTimestamp(),
    })
    join.update(doc(unverified, 'invites', email), {
      status: 'aceptada', acceptedBy: 'sin-verificar', acceptedAt: serverTimestamp(),
    })
    await assertFails(join.commit())

    await service.logout()
    // PCIT-220: con el enlace se crea la cuenta y se envía el correo; sin verificarlo, ni el
    // registro ni el inicio de sesión unen al club (la web muestra "Verifica tu correo").
    const pending = await service.registerCoach(invited)
    expect(pending).toMatchObject({ joined: false, verificationPending: true })
    await service.logout()
    const { user: sinVerificar } = await service.login(invited)
    expect((await getDoc(doc(db, 'users', sinVerificar.uid))).exists()).toBe(false)
    const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || `${HOST}:9099`
    const response = await fetch(`http://${authHost}/emulator/v1/projects/${PROJECT}/oobCodes`)
    const { oobCodes } = await response.json()
    const verification = oobCodes.find(code => code.email === email && code.requestType === 'VERIFY_EMAIL')
    await applyActionCode(auth, verification.oobCode)
    const { user } = await service.login(invited)
    expect((await getDoc(doc(db, 'users', user.uid))).data()).toMatchObject({ orgId, role: 'admin' })
    const invitation = (await getDoc(doc(db, 'invites', email))).data()
    expect(invitation).toMatchObject({ status: 'aceptada', acceptedBy: user.uid })
    const audit = (await getDoc(doc(platform, 'platformAudit', invitation.platformAuditId))).data()
    expect(audit).toMatchObject({ actorId: uid, before: null, after: { orgId, role: 'admin', status: 'pendiente' } })
  } finally {
    await env.cleanup()
  }
})
