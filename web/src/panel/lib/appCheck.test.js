import { describe, expect, it, vi } from 'vitest'
import { appCheckSettings, startAppCheck } from './appCheck.js'

const fakes = () => {
  const initializeAppCheck = vi.fn(() => ({ appCheck: true }))
  const ReCaptchaV3Provider = vi.fn(function Provider(key) { this.key = key })
  return { initializeAppCheck, ReCaptchaV3Provider, scope: {} }
}

describe('App Check (PCIT-219)', () => {
  it('sin clave, o con los emuladores, no hace nada', () => {
    expect(appCheckSettings({})).toBeNull()
    expect(appCheckSettings({ VITE_FIREBASE_APPCHECK_SITE_KEY: '   ' })).toBeNull()
    expect(appCheckSettings({ VITE_FIREBASE_APPCHECK_SITE_KEY: 'clave' }, { useEmulators: true })).toBeNull()
    const deps = fakes()
    expect(startAppCheck({}, null, deps)).toBeNull()
    expect(deps.initializeAppCheck).not.toHaveBeenCalled()
  })

  it('con clave, inicializa reCAPTCHA v3 con renovación automática del token', () => {
    const app = { name: 'app' }
    const deps = fakes()
    const settings = appCheckSettings({ VITE_FIREBASE_APPCHECK_SITE_KEY: ' clave-publica ' })
    expect(settings).toEqual({ siteKey: 'clave-publica', debugToken: null })
    expect(startAppCheck(app, settings, deps)).toEqual({ appCheck: true })
    expect(deps.ReCaptchaV3Provider).toHaveBeenCalledWith('clave-publica')
    const [calledApp, options] = deps.initializeAppCheck.mock.calls[0]
    expect(calledApp).toBe(app)
    expect(options.isTokenAutoRefreshEnabled).toBe(true)
    expect(options.provider.key).toBe('clave-publica')
    expect(deps.scope.FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined()
  })

  it('el token de depuración solo se usa en desarrollo, nunca en un build de producción', () => {
    const env = { VITE_FIREBASE_APPCHECK_SITE_KEY: 'clave', VITE_FIREBASE_APPCHECK_DEBUG_TOKEN: 'token-dev' }
    expect(appCheckSettings({ ...env, DEV: false, PROD: true }).debugToken).toBeNull()
    const settings = appCheckSettings({ ...env, DEV: true })
    expect(settings.debugToken).toBe('token-dev')
    const deps = fakes()
    startAppCheck({}, settings, deps)
    expect(deps.scope.FIREBASE_APPCHECK_DEBUG_TOKEN).toBe('token-dev')
  })
})
