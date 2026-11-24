# PCIT-216 · OWASP Top 10 y OWASP ASVS nivel 1

Parte 8/11 de la seguridad de AceCam ([PCIT-67](PCIT-67-seguridad-de-datos.md)). Relaciona cada
riesgo de OWASP con el control que ya existe en el repositorio, la prueba o etapa del pipeline
que lo verifica y lo que falta. Revisado el 24/11/2026 sobre `main` (`d14bbd5`) más la rama
`panel_web/conexiones-5ys063` (PCIT-215, PCIT-221 y PCIT-228).

Lo que falta se anota como **hallazgo** (H1, H2…) al final, con tarea y responsable.

## 1. OWASP Top 10 (2021)

| Riesgo | Control en AceCam | Cómo se verifica | Falta |
| --- | --- | --- | --- |
| **A01 Control de acceso roto** | Reglas de Firestore y Storage por organización y rol, cerradas por defecto (`firebase/*.rules`). API de videos de Azure con las mismas condiciones (`web/server/azure-videos/access.js`) y enlaces SAS de 10–15 min con permiso mínimo (leer o escribir). Notas privadas solo para su autor. El worker escribe con el Admin SDK, nunca la web | Matriz de acceso: cada fila y rol contra los emuladores (`tests/rules/accessMatrix.rules.test.js`, `tests/storage/…`) y contra la API de Azure con Azurite (`tests/azure/accessMatrix.azure.test.js`). Control de cobertura: ninguna regla sin prueba (`checkRulesCoverage.mjs`). Job `web-reglas` | **H1**: aceptar una invitación sin verificar el correo (R1). Corregido en `872f9b3`, pendiente de rehacer sobre la rama de Fabián (PCIT-220) |
| **A02 Fallos criptográficos** | Solo HTTPS: HSTS de 1 año con subdominios y `upgrade-insecure-requests`. Firebase y Azure cifran en reposo. Contraseñas gestionadas por Firebase Auth (no las guarda AceCam). Sin claves en la web: Azure firma con identidad administrada (*user delegation SAS*), GitHub entra en Azure por OIDC | `checkHeaders.mjs` en cada vista previa y en producción (PCIT-215). gitleaks en cada PR | **H2**: desactivar la clave compartida de la cuenta de almacenamiento (`devsecops.md` §5.4, PCIT-228) |
| **A03 Inyección** | Firestore no usa consultas en texto: no hay inyección de consultas. React escapa todo lo que muestra; no hay `dangerouslySetInnerHTML` ni `eval`. CSP sin `unsafe-inline` ni `unsafe-eval` en scripts. La API de Azure valida la ruta con una expresión cerrada y rechaza campos extra. `yt-dlp` y `ffprobe` se llaman sin shell, con argumentos fijos | CodeQL (`security-extended`) en JavaScript, Python y los workflows. Pruebas de rutas inventadas y campos extra (`tests/azure/azureVideos.test.js`). `checkHeaders.mjs` y `check:csp` | — |
| **A04 Diseño inseguro** | Inventario de datos y clasificación (PCIT-209). Matriz de acceso escrita antes que las pruebas (PCIT-210). Revisión de reglas con hallazgos (PCIT-217). Datos de menores con consentimiento del apoderado. Topes de tamaño (500 MB), resolución y duración (90 s en Azure). Plazos de conservación y borrado ARCO (PCIT-221) | Documentos de PCIT-67 y este. Pruebas de la revisión (`securityReview.rules.test.js`) y del borrado (`tests/arco/erase.test.js`) | **H3**: no hay límite de peticiones propio en la API de videos de Azure (depende de la sesión de Firebase) |
| **A05 Configuración insegura** | Cabeceras de seguridad en `firebase.json` (CSP, HSTS, nosniff, DENY, Referrer-Policy, Permissions-Policy, COOP). Contenedor de Azure privado, CORS solo para la web. Imágenes Docker sin root (`USER node`, `USER worker`); la del worker con la base fijada por *digest*. La web no arranca si falta una variable `VITE_FIREBASE_*` | `checkHeaders.mjs` (PCIT-215), ZAP Baseline sobre producción, `check:csp`, OpenSSF Scorecard | **H4**: ZAP solo escanea producción, no la vista previa de cada PR (PCIT-214). **H14**: la web no detecta valores de ejemplo en `VITE_FIREBASE_*` (ya pasó en producción el 12/11) |
| **A06 Componentes vulnerables** | Dependencias fijadas con lockfile (`package-lock.json`, `requirements*.txt` con versión exacta). Dependabot semanal para npm, pip y Actions | npm audit, pip-audit, Dependency Review (bloquea en PR), OWASP Dependency-Check contra NVD | **H5**: PyTorch 2.5.1 con avisos conocidos, se informa sin bloquear hasta PCIT-168. Varias PRs de Dependabot abiertas sin revisar |
| **A07 Fallos de identificación y autenticación** | Firebase Auth: contraseñas cifradas, bloqueo temporal por intentos (`auth/too-many-requests`), tokens de 1 h verificados en cada petición a la API. Los errores no muestran el detalle técnico | `auth.test.js`, `tests/auth/register.test.js` contra el emulador | **H6**: contraseña mínima de 6 caracteres (ASVS pide 12). **H7**: no hay recuperación de contraseña en la web. **H8**: sin segundo factor para administradores. **H13**: el inicio de sesión dice "No existe una cuenta con ese correo" (`auth/user-not-found`), lo que permite averiguar qué correos están registrados |
| **A08 Fallos de integridad del software y los datos** | Actions fijadas por SHA. Pesos del modelo verificados con sha256 antes de cargarlos con `torch.load` (`download_models.py --strict`). Imágenes construidas en el pipeline y publicadas solo desde `main`. CODEOWNERS: `.github/`, reglas y dependencias necesitan a @mort1zr | `download_models.py --verify --strict` en la imagen del worker. actionlint. Scorecard | **H9**: `tracknet.pt` sin sha256 registrado. **H10**: 2 falsos positivos de gitleaks sin marcar (`.gitleaksignore`), que dejan el escaneo semanal en rojo |
| **A09 Fallos de registro y monitoreo** | La API de videos registra método, ruta, estado y duración, sin datos personales (Log Analytics, 30 días). Bitácora de cambios de plataforma (`platformAudit`, PCIT-203). Resumen de cada despliegue en Actions | Pruebas de la bitácora en las reglas. Resúmenes del pipeline | **H11**: nadie recibe alertas: ni de errores de la API, ni de un worker que falla, ni del gasto en Azure (PCIT-218 y alerta de presupuesto de PCIT-228) |
| **A10 Falsificación de peticiones del lado del servidor (SSRF)** | El importador por enlace solo acepta HTTPS al puerto 443, hosts en lista blanca, sin IP literal ni credenciales en la URL, máximo 3 redirecciones revisadas una a una, y comprueba que la IP resuelta sea pública y la fija para no resolver dos veces (`web/server/video-import/download.js`). La API de Azure no descarga URLs | `download.test.js`, `youtube.test.js`, `importer.test.js` | **H12**: al llevar la importación de YouTube a la API de Azure (PCIT-243, Fabián), mantener la lista blanca y la comprobación de IP pública |

## 2. OWASP ASVS 4.0.3, nivel 1 (lo que aplica a la web)

✅ cumple · ❌ no cumple · ⚠️ parcial · — no aplica

### V2 Autenticación

| Requisito | Estado | Evidencia o motivo |
| --- | --- | --- |
| 2.1.1 Contraseñas de al menos 12 caracteres | ❌ | `MIN_PASSWORD_LENGTH = 6` en `web/src/panel/lib/auth.js` (**H6**) |
| 2.1.2 Se admiten contraseñas de 64 caracteres o más | ✅ | Firebase Auth no limita por debajo de 64; la web no pone máximo |
| 2.1.7 Se rechazan contraseñas filtradas | ❌ | Sin comprobación (**H6**) |
| 2.1.8–2.1.9 Sin reglas de composición y con medidor de fuerza | ⚠️ | No hay reglas de composición; tampoco medidor |
| 2.2.1 Defensa contra fuerza bruta | ✅ | Firebase Auth bloquea temporalmente tras muchos intentos (`auth/too-many-requests`) |
| 2.2.3 Aviso al usuario de cambios en su cuenta | — | La web no permite cambiar correo ni contraseña todavía |
| 2.5.1–2.5.6 Recuperación de cuenta | ❌ | No hay "olvidé mi contraseña" (**H7**) |

### V3 Sesiones

| Requisito | Estado | Evidencia o motivo |
| --- | --- | --- |
| 3.1.1 El token de sesión no va en la URL | ✅ | El ID token de Firebase va en `Authorization: Bearer`. Los enlaces SAS sí van en la URL, pero son de un solo recurso y caducan en 10–15 min |
| 3.2.1 Token nuevo al iniciar sesión | ✅ | Firebase Auth |
| 3.3.1 Cerrar sesión invalida la sesión | ⚠️ | `signOut` borra el token del navegador, pero un ID token ya emitido vale hasta 1 h |
| 3.4.x Cookies seguras | — | La sesión no usa cookies |

### V4 Control de acceso

| Requisito | Estado | Evidencia o motivo |
| --- | --- | --- |
| 4.1.1 El control de acceso se aplica en el servidor | ✅ | Reglas de Firestore y Storage y API de Azure; la web solo oculta botones |
| 4.1.2 Los datos de control de acceso no los cambia el usuario | ✅ | `orgId` y `role` no se pueden editar (reglas y matriz) |
| 4.1.3 Mínimo privilegio | ✅ | Matriz de acceso; entrenador solo lo suyo; notas solo del autor |
| 4.1.5 Falla cerrado | ✅ | Sin ficha o sin campo, las reglas niegan (PCIT-217) |
| 4.2.1 Protección contra IDOR | ✅ | Cada documento comprueba `orgId`/`createdBy`; la matriz prueba otro club y otro entrenador |
| 4.3.1 Interfaces de administración protegidas | ⚠️ | `/admin` exige `platformAdmins/{uid}`; falta segundo factor (**H8**) |

### V5 Validación y codificación

| Requisito | Estado | Evidencia o motivo |
| --- | --- | --- |
| 5.1.3 Validación de entradas en el servidor | ✅ | Reglas con tipos, longitudes y campos permitidos (`hasOnly`); API de Azure con esquema cerrado |
| 5.2.x Sanitización / 5.3.3 Escape de salida | ✅ | React escapa por defecto; sin HTML crudo |
| 5.2.6 Protección contra SSRF | ✅ | Importador con lista blanca e IP pública (A10) |
| 5.3.4–5.3.8 Inyección de consultas o comandos | ✅ | Firestore sin consultas en texto; procesos sin shell |

### V7 Errores y registros

| Requisito | Estado | Evidencia o motivo |
| --- | --- | --- |
| 7.1.1–7.1.2 Sin credenciales ni datos personales en los registros | ✅ | La API registra método, ruta, estado y duración; el borrado ARCO guarda solo rutas e IDs |
| 7.4.1 Errores genéricos al usuario | ✅ | `authErrorMessage`, `videoErrorMessage`: nunca el error técnico |

### V8 Protección de datos

| Requisito | Estado | Evidencia o motivo |
| --- | --- | --- |
| 8.2.1 Sin caché de datos sensibles | ✅ | Respuestas de la API con `Cache-Control: no-store`; videos de postulación `private, no-store` |
| 8.3.1 Datos sensibles fuera de la URL | ⚠️ | Rutas con IDs, no datos personales; los enlaces SAS llevan la firma en la URL (caducan) |
| 8.3.4 Inventario de datos sensibles | ✅ | Inventario de PCIT-209, con Azure (PCIT-228) |
| 8.3.x Borrado a petición y plazos | ✅ | `scripts/borrarDatos.mjs` y plazos en la política (PCIT-221) |

### V9 Comunicaciones

| Requisito | Estado | Evidencia o motivo |
| --- | --- | --- |
| 9.1.1 TLS en todas las conexiones | ✅ | Firebase Hosting y Azure solo HTTPS; HSTS comprobado en cada despliegue |

### V10 Código malicioso

| Requisito | Estado | Evidencia o motivo |
| --- | --- | --- |
| 10.3.1–10.3.2 Integridad de lo que se descarga y se ejecuta | ⚠️ | Pesos verificados con sha256 salvo `tracknet.pt` (**H9**); Actions por SHA |

### V12 Archivos

| Requisito | Estado | Evidencia o motivo |
| --- | --- | --- |
| 12.1.1 Tamaño máximo de archivo | ✅ | 500 MB en la web, en `storage.rules` y en el worker |
| 12.2.1 Tipo de archivo comprobado | ✅ | Solo MP4/MOV por extensión y `Content-Type`; el worker comprueba resolución y FPS antes de analizar |
| 12.4.1 Archivos subidos fuera del alcance público | ✅ | Contenedor privado; solo enlaces temporales |

### V13 API

| Requisito | Estado | Evidencia o motivo |
| --- | --- | --- |
| 13.1.3 Sin datos sensibles en la URL de la API | ✅ | `POST /api/videos/sign` con cuerpo JSON |
| 13.2.1 Solo los métodos necesarios | ✅ | La API admite `POST /api/videos/sign`, `GET /healthz` y el preflight de CORS |
| 13.2.6 Origen comprobado (CORS) | ✅ | Solo el origen de la web; otro origen recibe 403 |

### V14 Configuración

| Requisito | Estado | Evidencia o motivo |
| --- | --- | --- |
| 14.2.1 Componentes actualizados | ⚠️ | Auditorías en cada PR; PyTorch pendiente (**H5**) |
| 14.4.x Cabeceras de seguridad | ✅ | Siete cabeceras comprobadas en cada despliegue (PCIT-215) |

## 3. Hallazgos

| ID | Hallazgo | Riesgo | Tarea | Responsable |
| --- | --- | --- | --- | --- |
| H1 | Invitación aceptada sin verificar el correo | Alto | PCIT-220 (rehacer sobre la rama de Fabián) | Axel, con Fabián |
| H2 | Clave compartida del almacenamiento activa | Medio | PCIT-228 (paso manual) | Axel |
| H3 | Sin límite de peticiones propio en la API de videos | Bajo | Nueva tarea | Axel |
| H4 | ZAP no escanea la vista previa de cada PR | Medio | PCIT-214 | Axel |
| H5 | PyTorch con avisos; PRs de Dependabot acumuladas | Medio | PCIT-168 | Aaron / mort1zr |
| H6 | Contraseña mínima de 6 caracteres y sin comprobar filtradas | Medio | Nueva tarea (cambia `auth.js`: coordinar con Fabián) | Axel |
| H7 | Sin recuperación de contraseña | Medio | Nueva tarea | Fabián o Axel |
| H8 | Sin segundo factor en administración de plataforma | Medio | Nueva tarea (requiere Identity Platform) | mort1zr |
| H9 | `tracknet.pt` sin sha256 | Medio | Pendiente de `devsecops.md` §7 | Aaron |
| H10 | Falsos positivos de gitleaks sin marcar | Bajo | Decisión del dueño del pipeline | mort1zr |
| H11 | Sin alertas de errores, del worker ni de gasto | Medio | PCIT-218 y PCIT-228 | Axel |
| H12 | SSRF al mover la importación de YouTube a Azure | Medio | PCIT-243 | Fabián |
| H13 | El inicio de sesión revela si un correo está registrado | Bajo | Nueva tarea (un mensaje igual para correo o contraseña incorrectos; cambia `auth.js`: coordinar con Fabián) | Axel |
| H14 | La web no rechaza valores de ejemplo en `VITE_FIREBASE_*` | Bajo | Nueva tarea (comprobación en `firebaseConfig.js` y en el despliegue) | Axel |
