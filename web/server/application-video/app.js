// Servicio de videos de postulación en Azure (PCIT-251, base local de PCIT-182).
// El formulario público adjunta el video aquí; el servicio comprueba formato, tamaño, resolución y
// FPS con ffprobe antes de guardarlo en Azure Blob privado y de marcarlo en la postulación.
// El equipo del club lo ve a través de este mismo servicio, con su sesión de Firebase.

import { azureBlobObjects, createApplicationVideoMiddleware, createApplicationVideoStore } from '../video-import/applicationVideo.js'

/** Solo un miembro activo (entrenador o administrador) ve los videos de su organización. */
export function createMemberAuthorizer({ verifyIdToken, db }) {
  return async ({ bearerToken }) => {
    const { uid } = await verifyIdToken(bearerToken)
    const profile = (await db.collection('users').doc(uid).get()).data()
    if (!profile || profile.suspended === true || !['coach', 'admin'].includes(profile.role)) return null
    return { orgId: profile.orgId, actorId: uid }
  }
}

/** Manejador HTTP: GET /healthz y las rutas /api/application-video/… */
export function createApplicationVideoApp({ db, container, probe, verifyIdToken, origin, serviceHost }) {
  const middleware = createApplicationVideoMiddleware({
    origin,
    serviceHost,
    cors: true,
    probe,
    authorize: createMemberAuthorizer({ verifyIdToken, db }),
    store: createApplicationVideoStore({ db, objects: azureBlobObjects(container) }),
  })
  return (request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('ok')
      return
    }
    middleware(request, response, () => {
      response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        .end(JSON.stringify({ error: 'No encontrado.' }))
    })
  }
}
