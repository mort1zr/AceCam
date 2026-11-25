# PCIT-251 · Videos de postulación en Azure

Entrega en el entorno compartido de PCIT-147, sobre la base local de PCIT-182. El formulario
público de postulación adjunta el video a un **servicio propio en Azure Container Apps**
(`acecam-application-video`), que lo valida y lo guarda privado en Azure Blob. Antes, en la web
publicada, la ruta `/api/application-video/…` devolvía el HTML de AceCam.

## Cómo funciona

1. La persona envía la postulación (Firestore, como siempre) y el formulario manda el archivo a
   `POST {VITE_APPLICATION_VIDEO_API_URL}/api/application-video/{orgId}/{formId}/{applicationId}`.
2. El servicio comprueba que la postulación existe, viene del formulario público, tiene el
   consentimiento de video y aún no tiene video. Guarda el archivo en disco temporal y lo revisa
   con `ffprobe`: MP4/MOV, hasta 500 MB, mínimo 1280×720 y de 25 a 60 FPS. La duración sigue
   `videoRequirements.js` (PCIT-147).
3. Si es válido, lo guarda en `orgs/{orgId}/applications/{applicationId}/video.{mp4,mov}` del
   contenedor privado `videos` **sin sobrescribir** (`If-None-Match: *`) y marca `videoPaths` en la
   postulación. Un reintento con el mismo archivo termina la carga; con otro archivo, se rechaza.
4. El equipo lo ve con `GET` a la misma ruta, con su sesión de Firebase: solo entrenadores y
   administradores activos (no suspendidos) de esa organización. Respuesta `private, no-store`.

El mismo código (`web/server/video-import/applicationVideo.js`) sirve para la demo local
(Firebase Storage) y para Azure (Blob): cambia solo el adaptador de almacenamiento.

## Seguridad

| Control | Cómo |
| --- | --- |
| Origen | Solo `https://acecam-e93a2.web.app` (CORS con preflight). Otro origen recibe 403 |
| Host | El servicio solo responde a su propio nombre (`SERVICE_HOST`) |
| Archivo | Se valida con `ffprobe` **antes** de guardar; uno por postulación; una carga a la vez |
| Almacenamiento | Contenedor privado; sin enlaces públicos; identidad administrada `acecam-videos-api` (sin claves) |
| Firestore | Cuenta de servicio del worker (`FIREBASE_SERVICE_ACCOUNT_WORKER`). En Firestore los roles son de todo el proyecto, así que una cuenta aparte tendría el mismo permiso |
| Registros | Método, ruta sin IDs, estado y duración; sin datos personales |

## Puesta en marcha

1. Fusionar en `main`: el pipeline construye `ghcr.io/mort1zr/acecam-application-video`, comprueba
   que no arranca sin configuración y que trae `ffprobe`, y crea la Container App (0,5 vCPU,
   1 GiB, de 0 a 1 réplica).
2. Crear la variable de GitHub `VITE_APPLICATION_VIDEO_API_URL` con la URL que muestra el resumen
   del despliegue (`https://acecam-application-video.<dominio del entorno>`) y volver a desplegar
   la web. Sin esa variable, el formulario no ofrece adjuntar video.
3. La CSP de `firebase.json` ya permite ese host en `connect-src`.

## Pruebas

- `tests/azure/applicationVideo.azure.test.js` (Azurite y emuladores): `/healthz`; preflight solo
  para la web; un video válido queda privado en Blob y adjunto, y un reintento no lo duplica;
  rechazo por resolución y por FPS sin guardar nada; lectura solo del equipo (otra organización,
  una cuenta suspendida y una petición sin sesión, rechazadas); otro origen, rechazado.
- `tests/storage/applicationVideo.test.js`: la demo local sigue igual.
- `Postular.test.jsx`: con la variable, el video va al servicio de Azure; sin ella, en
  producción no se ofrece adjuntar video.

## Verificación en el entorno compartido (pendiente)

Con datos ficticios: versión y URL desplegadas, un adjunto válido de más de 60 s (requiere que
PCIT-147 haya quitado el tope de duración de `videoRequirements.js`), un rechazo por resolución
o FPS, y la evidencia de que otra organización no puede leerlo.

**Límite conocido:** el servicio corta una carga a los 120 s. Con una conexión lenta, un archivo
cercano a 500 MB puede no alcanzar a subir; conviene probar con un clip de pocos MB.
