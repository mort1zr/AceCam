# PCIT-196 · Vincular Google Forms y Sheets con AceCam

## Preparar una prueba

1. En Google Forms, crea un formulario de prueba. Usa **Nombre completo**, **Fecha de nacimiento** (tipo Fecha), **Ciudad**, **Correo de contacto**, **Año de graduación** y **Autorización** como títulos de pregunta. Si el formulario recopila el correo automáticamente, usa esa columna en lugar de duplicarla.
2. En **Autorización**, explica que las respuestas se usan para evaluar la postulación en AceCam y contactar al postulante. Añade el enlace a la política de privacidad y usa **Sí, autorizo** como opción afirmativa. Para menores, la autorización la da su apoderado. Usa **Nombre del apoderado**, **Teléfono del apoderado** y **Correo del apoderado** para sus datos. **Academia** y **Mensaje** son opcionales.
3. En **Respuestas**, selecciona **Vincular con Hojas de cálculo** y crea o elige una hoja. Mantén el acceso de la hoja restringido a las personas autorizadas. Guarda el enlace para responder al formulario y la URL de la pestaña de respuestas, incluido el parámetro `gid`.
   Puedes agregar **Enlace de YouTube** como respuesta corta opcional. AceCam lo guarda y muestra en la postulación; no descarga el video ni inicia un análisis. También admite el título **Enlaces de video** para hasta cinco enlaces, uno por línea.
4. En el proyecto de Google Cloud del equipo, habilita **Google Sheets API**, configura el consentimiento y crea un cliente OAuth de tipo **Aplicación web**. Registra el origen exacto que abras en el navegador. En el ensayo local de AceCam es `http://127.0.0.1:5176`. Si el cliente externo está en modo de prueba, registra ambas cuentas como usuarias de prueba. Comparte la hoja solo con la cuenta que debe poder leerla.
5. Configura el ID público del cliente en `VITE_GOOGLE_SHEETS_CLIENT_ID` en `web/.env.local` y reinicia Vite. El navegador solo usa el ID de cliente. No se configura un secreto OAuth en AceCam ni en la compilación web.

## Sincronizar

En **Reclutamiento → Google Forms y Sheets**, el dueño o administrador guarda los dos enlaces. Se puede registrar un formulario por organización. Envía una respuesta ficticia y comprueba que aparezca en Sheets. Luego pulsa **Sincronizar con Google Sheets** en AceCam y autoriza la lectura con una cuenta que pueda abrir la hoja. La bandeja se actualiza al guardar las respuestas.

Google Forms escribe en la hoja al recibir la respuesta. AceCam lee la pestaña cuando se pulsa el botón. El permiso de Google es de lectura y el token se usa durante esa sincronización.

La lectura usa `spreadsheets.get` para resolver el nombre de la pestaña por su `gid`, y luego `spreadsheets.values.get` para leer esa pestaña con fechas numéricas. Ambos admiten `spreadsheets.readonly`. PCIT-253 corrige el uso anterior de `batchGetByDataFilter`, que devolvía `ACCESS_TOKEN_SCOPE_INSUFFICIENT` con ese permiso. No hace falta ampliar OAuth a permisos de escritura. El cambio requiere integrar y desplegar la nueva web antes de repetir la prueba real.

Para cerrar la prueba, verifica que la respuesta aparezca una sola vez en la bandeja después de sincronizar dos veces. Confirma que una cuenta sin acceso a la hoja reciba un error y que la bandeja conserve su contenido. Usa respuestas ficticias para esta verificación.

## Web publicada

Registra `https://acecam-e93a2.web.app` como origen autorizado del cliente web y configura `VITE_GOOGLE_SHEETS_CLIENT_ID` como variable de GitHub del entorno que construye la web. Tras integrar y desplegar la versión, repite la prueba en esa URL. La configuración de Hosting debe permitir la ventana de autorización de Google. Hosting conserva `Cross-Origin-Opener-Policy: same-origin-allow-popups` para el popup OAuth. El chequeo de PCIT-215 admite ese valor y `same-origin`, y continúa rechazando `unsafe-none`. Es la configuración indicada por [Google Identity Services](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid) para autorizar APIs mediante una ventana emergente.

- [Vincular las respuestas a una hoja](https://support.google.com/docs/answer/2917686)
- [Configurar un cliente OAuth web](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
