// Servicio de videos de postulación en Azure Container Apps (PCIT-251).
// Variables de entorno:
//   AZURE_STORAGE_ACCOUNT     cuenta de almacenamiento (acecamvideosfba600)
//   AZURE_STORAGE_CONTAINER   contenedor privado de videos (por defecto, videos)
//   AZURE_CLIENT_ID           identidad administrada con permiso de escritura en Blob
//   FIREBASE_PROJECT_ID       proyecto de Firebase (acecam-e93a2)
//   FIREBASE_SERVICE_ACCOUNT  JSON de una cuenta de servicio que puede actualizar la postulación (secreto)
//   ALLOWED_ORIGIN            origen exacto de la web (https://acecam-e93a2.web.app)
//   SERVICE_HOST              host público del servicio; en Container Apps se deduce del nombre y el dominio
//   ACECAM_FFPROBE            ruta absoluta de ffprobe (por defecto, /usr/bin/ffprobe)
//   PORT                      por defecto, 8080

import { createServer } from 'node:http'
import { DefaultAzureCredential } from '@azure/identity'
import { BlobServiceClient } from '@azure/storage-blob'
import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { createLocalVideoProbe } from '../video-import/probe.js'
import { createApplicationVideoApp } from './app.js'

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Falta la variable de entorno ${name}.`)
  return value
}

const account = required('AZURE_STORAGE_ACCOUNT')
if (!/^[a-z0-9]{3,24}$/.test(account)) throw new Error('AZURE_STORAGE_ACCOUNT no es un nombre de cuenta válido.')
const origin = new URL(required('ALLOWED_ORIGIN')).origin
// Container Apps define CONTAINER_APP_NAME y CONTAINER_APP_ENV_DNS_SUFFIX.
const serviceHost = process.env.SERVICE_HOST
  || (process.env.CONTAINER_APP_NAME && process.env.CONTAINER_APP_ENV_DNS_SUFFIX
    ? `${process.env.CONTAINER_APP_NAME}.${process.env.CONTAINER_APP_ENV_DNS_SUFFIX}` : null)
if (!serviceHost) throw new Error('Falta SERVICE_HOST (o las variables de Container Apps).')

const firebase = initializeApp({
  credential: cert(JSON.parse(required('FIREBASE_SERVICE_ACCOUNT'))),
  projectId: required('FIREBASE_PROJECT_ID'),
})
const container = new BlobServiceClient(
  `https://${account}.blob.core.windows.net`,
  new DefaultAzureCredential({ managedIdentityClientId: process.env.AZURE_CLIENT_ID }),
).getContainerClient(process.env.AZURE_STORAGE_CONTAINER || 'videos')

const handler = createApplicationVideoApp({
  db: getFirestore(firebase),
  container,
  probe: createLocalVideoProbe({ executable: process.env.ACECAM_FFPROBE || '/usr/bin/ffprobe' }),
  verifyIdToken: token => getAuth(firebase).verifyIdToken(token),
  origin,
  serviceHost,
})

createServer((request, response) => {
  const started = Date.now()
  // Registro sin datos personales: método, ruta sin IDs, estado y duración.
  response.on('finish', () => console.log(JSON.stringify({
    method: request.method,
    path: (request.url ?? '').startsWith('/api/application-video/') ? '/api/application-video/…' : request.url?.split('?')[0],
    status: response.statusCode,
    ms: Date.now() - started,
  })))
  handler(request, response)
}).listen(Number(process.env.PORT || 8080), () => console.log('Servicio de videos de postulación listo'))
