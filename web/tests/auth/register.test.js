// Registro e inicio de sesión (PCIT-21) contra los emuladores de Auth y Firestore,
// con las reglas reales de firestore.rules. Ejecutar con: npm run test:rules

import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, doc, getDoc, getFirestore } from 'firebase/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAuthService } from '../../src/panel/lib/auth.js'
import { invitarMiembro } from '../../src/panel/lib/invitaciones.js'

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
