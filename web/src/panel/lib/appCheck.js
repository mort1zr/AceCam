// Firebase App Check con reCAPTCHA v3 (PCIT-219).
// Demuestra a Firestore y Storage que la petición sale de la web de AceCam, no de un bot que
// copió la configuración pública de Firebase (sobre todo el formulario público de postulación).
//
// Se activa solo con VITE_FIREBASE_APPCHECK_SITE_KEY. Sin esa variable, o con los emuladores,
// no hace nada: así la web, los emuladores y la CI siguen igual hasta que se configure.
// En desarrollo contra el proyecto real se puede usar un token de depuración
// (VITE_FIREBASE_APPCHECK_DEBUG_TOKEN); nunca en un build de producción, porque quedaría
// publicado dentro del JavaScript.

/** Configuración de App Check a partir de las variables de Vite, o null si no se usa. */
export function appCheckSettings(env, { useEmulators = false } = {}) {
  const siteKey = String(env.VITE_FIREBASE_APPCHECK_SITE_KEY ?? '').trim()
  if (!siteKey || useEmulators) return null
  const debugToken = String(env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN ?? '').trim()
  return { siteKey, debugToken: env.DEV && debugToken ? debugToken : null }
}

/**
 * Inicializa App Check si corresponde. Devuelve la instancia o null.
 * Las funciones de Firebase se reciben como parámetro para poder probarlo sin red.
 */
export function startAppCheck(app, settings, { initializeAppCheck, ReCaptchaV3Provider, scope = globalThis }) {
  if (!settings) return null
  // El SDK lee este valor global antes de inicializar; solo existe en desarrollo.
  if (settings.debugToken) scope.FIREBASE_APPCHECK_DEBUG_TOKEN = settings.debugToken
  return initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(settings.siteKey),
    isTokenAutoRefreshEnabled: true,
  })
}
