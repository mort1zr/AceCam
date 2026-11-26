# AceCam · Revisión local del 26 de noviembre de 2026

## Código integrado y conservado

Rama de trabajo: `panel_web/conexiones`. Se descargaron las ramas de origin y se integraron `origin/main` (`446c2ce`) y `origin/panel_web/conexiones` (`8df8693`). No quedan commits de esas referencias por incorporar. Las otras ramas remotas todavía no integradas son propuestas de Dependabot.

Los cambios locales anteriores se respaldaron antes de fusionar mediante el stash `e0cb85ef429359d8fed7b47f0d8bc674a239297b`, que se conserva. Se resolvieron los cruces de CI, CSP y requisitos de video sin perder las aportaciones de main.

Entregas locales nuevas, aún sin publicar:

- `8e51137` · PCIT-243: ruta protegida de YouTube, preparación de imagen y pasos de despliegue. Tarea local finalizada en Jira; la imagen y el despliegue siguen en PCIT-248.
- `6c0e611` · PCIT-196: conexión base con Google Forms/Sheets y compatibilidad del popup OAuth con el chequeo de cabeceras. La autorización real de Google sigue pendiente.
- `ac96c21` · PCIT-252: prueba de credenciales compatible con Windows, conservando el control de permisos reales en POSIX. Tarea de 1 punto, pasada por En curso y cerrada tras verificar.

## Avances que llegaron desde main

- Worker automático en GitHub Actions; videos en Azure Blob y estado en Firestore. Según la evidencia de Axel en PCIT-226/247, el [run 45719212049](https://github.com/mort1zr/AceCam/actions/runs/45719212049) procesó el partido `ip0SBgVOFaDKL8IknyYx`. Falta la revisión del reporte y reproducción desde la web (PCIT-249).
- Adjuntos privados de postulación en una API separada de Azure (PR #45, PCIT-251), con validación de calidad y acceso por organización.
- Integración de administración e invitaciones con correo verificado, Stripe en modo de prueba, mejoras de carga de gráficos/Partidos y controles de seguridad.

La evidencia del despliegue proviene de Jira y de los commits integrados; esta revisión no accedió al portal de Azure ni hizo una prueba autenticada en producción.

## Verificación ejecutada en Windows

| Comprobación | Resultado |
| --- | --- |
| Web/API: `npm test -- --maxWorkers=2` | 450 aprobadas |
| Reglas, integración Firebase y Azurite: `npm run test:rules` | 433 + 214 aprobadas |
| Cobertura de reglas Firestore | 51 reglas probadas, 5 cerradas, ninguna sin prueba |
| Modelo: `python -m pytest -q` | 362 aprobadas; las 7 de emuladores se verificaron aparte |
| Worker con Firestore/Storage emulados | 7 aprobadas, incluidos recorridos de 4 y 61 segundos |
| Scoring: `pytest tests/test_scoring.py --cov=scoring --cov-fail-under=100` | 27 aprobadas, cobertura 100 %; incluidas en la suite del modelo |
| Build de web y comprobación CSP | Correctos |
| Lint web / ruff del modelo | Sin errores; lint web informa advertencias existentes |
| `git diff --check` | Correcto |

Son 1466 pruebas aprobadas entre las suites sin contar dos veces las ejecuciones dirigidas. Se instalaron las dependencias Azure fijadas por el proyecto en el entorno virtual local. El modelo se verificó con Python 3.12 local; la CI y la imagen utilizan Python 3.11/Linux.

La prueba del importador simula la respuesta de YouTube; no sustituye descargar un clip autorizado desde la imagen desplegada. La prueba larga del pipeline sustituye los detectores y no mide precisión del modelo. Docker, autorización real de Google y comprobaciones autenticadas en nube quedan fuera de la validación local.

## Pendientes para el cierre del equipo

| Prioridad | Responsable / Jira | Acción y evidencia que falta |
| --- | --- | --- |
| 1 | Axel · PCIT-249 | Abrir el reporte del partido ya procesado y reproducir su MP4 desde la web; registrar versión, partido y resultado. |
| 2 | Axel · PCIT-251; cierre relacionado PCIT-147 | Confirmar API y variable `VITE_APPLICATION_VIDEO_API_URL`; adjuntar video válido >60 s, rechazar baja calidad y comprobar aislamiento entre organizaciones. |
| 3 | Axel · PCIT-250; cierre relacionado PCIT-205 | Verificar en el entorno compartido que suspensión bloquea el acceso y reactivación lo recupera. |
| 4 | Axel · PCIT-248 → PCIT-244; historia PCIT-234 | Publicar/integrar primero la base local; construir y probar la imagen, configurar credenciales de importación y banderas, descargar clip autorizado y comprobar análisis completo en la web. |
| 5 | Fabián / responsable del proyecto Google · PCIT-196 y PCIT-69 | Habilitar Sheets API y cliente OAuth web, configurar su ID público; probar hoja privada con y sin permiso y sincronizar dos veces sin duplicados. Es una integración opcional. |
| 6 | Axel / propietario del proyecto · PCIT-219 y PCIT-67 | Resolver la configuración pendiente de App Check y validar su activación antes de dar por cerrado el conjunto de seguridad. |
| 7 | Axel · PCIT-222 | Cerrar la historia global de almacenamiento después de acreditar sus verificaciones compartidas. |
| 8 | Aaron · PCIT-206, PCIT-207, PCIT-208 | Completar documentación de software, Design Thinking y paper. |

El worker en GitHub Actions limita los videos a **600 segundos**, y su programación puede retrasarse. PCIT-147 no acredita todavía el criterio de duración sin límite en nube. Para una presentación inmediata, el operador autorizado puede lanzar **Worker del modelo → Run workflow** desde main.

No crear nuevamente un Container Apps Job: el worker operativo ya utiliza GitHub Actions. Las tareas de Azure y validación compartida permanecen asignadas a Axel; Fabián entrega las bases locales.

No corresponde marcar todas las historias como Listo hasta contar con la evidencia anterior. Los commits de esta revisión permanecen locales y requieren publicación antes de que Axel pueda desplegarlos.

## Actualización del acuerdo de duración

Fabián acordó un máximo de 10 minutos (600 segundos) por precaución. Se resuelve la decisión pendiente de PCIT-147 sobre duración sin límite. El cambio posterior de interfaz muestra el máximo y valida archivos locales antes de subirlos. El backend conserva su configuración existente. Las verificaciones compartidas de PCIT-249/251 siguen pendientes.
