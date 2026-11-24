// Firestore y Storage para el panel (PCIT-20). La app y Auth se inicializan en firebaseAuth.js;
// el panel importa { auth, db, storage } desde aquí y la landing solo carga firebaseAuth.js.

import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectStorageEmulator, getStorage } from 'firebase/storage'
import { app, auth, emulatorHost, useEmulators } from './firebaseAuth.js'
import { appCheckSettings, startAppCheck } from './appCheck.js'
import { EMULATOR_PORTS } from './firebaseConfig.js'

export { auth }
export { doc, onSnapshot } from 'firebase/firestore'
// PCIT-219: App Check antes de Firestore y Storage, para que sus peticiones lleven el token.
// Sin VITE_FIREBASE_APPCHECK_SITE_KEY (o con los emuladores) no hace nada.
// La recarga en caliente de Vite no lo inicializa dos veces.
if (!import.meta.hot?.data.appCheck) {
  startAppCheck(app, appCheckSettings(import.meta.env, { useEmulators }), { initializeAppCheck, ReCaptchaV3Provider })
  if (import.meta.hot) import.meta.hot.data.appCheck = true
}
export const db = getFirestore(app)
export const storage = getStorage(app)

// La recarga en caliente de Vite vuelve a ejecutar este módulo:
// solo se conecta a los emuladores la primera vez.
if (useEmulators && !import.meta.hot?.data.conectado) {
  connectFirestoreEmulator(db, emulatorHost, EMULATOR_PORTS.firestore)
  connectStorageEmulator(storage, emulatorHost, EMULATOR_PORTS.storage)
  if (import.meta.hot) import.meta.hot.data.conectado = true
}
