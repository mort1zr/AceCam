# PCIT-231 · Depuración del código

Se revisó `web/src` con `knip`, normal y con `--production`. Cada caso se confirmó con búsquedas en `src`, `scripts`, `server`, `tests` y `previews`, incluidos los nombres de clase armados con plantillas. En total se quitaron 95 líneas netas.

**Archivos eliminados (72 líneas)**

- `src/panel/components/dashboard/DashboardDetails.jsx`: ningún archivo lo importaba. `lib/dashboardDetails.js` sigue en uso.
- `src/compartido/components/PageStub.jsx`: ningún archivo lo importaba.

**Estilos eliminados (20 líneas, 0,9 KB)**

- `jugadores.css`: `.players-title-dot`, `.players-table-hint`, `.players-form-heading` y `.players-required-note`.
- `dashboard.css`: `.dashboard-chip`.
- `reportePdf.css`: `.rp-movimiento`.
- `tarjetaJugador.css`: `.tarjeta-jugador-bandera`.

**Exportaciones y constantes**

- Se borró `SCHEMA_VERSION` de `schema.js`: nadie la leía y `docs/firestore-schema.md` no la menciona.
- `workerDashboardStatistics.js` usa ahora `MATCH_STATS_VERSION` de `schema.js` en lugar de su propia copia del mismo valor.
- Dejaron de exportarse porque solo se usan dentro de su archivo: `THEME_KEY` y `readStoredTheme` (`theme.js`), `TrazoVacio`, `SECCIONES_POR_PLAN`, `VIDEO_EXTENSIONS`, `PLANES_CHECKOUT` y `PERIODOS` (`contratarPlan.js`), `aFecha` (`inicio.js`), `combinarMetricas` y `LIMIT_ERROR_CODE`.

**Se dejó a propósito**

- `src/panel/previews/*`: `knip` los marca como sin uso, pero los cargan las páginas de `web/previews/*.html`.
- `googleFormsApplications.js` y `services/googleFormsRecruitment.js`: hoy solo los usa su prueba. Son la importación de PCIT-197, que todavía no tiene pantalla.
- `videoErrorMessage` (`videoUpload.js`): solo la usan las pruebas, aunque traduce los errores de subida a mensajes claros. Hay que decidir si la pantalla de análisis debe usarla.
- `recordPlatformChange` (`platformAudit.js`): todavía no se usa. PCIT-203 la reserva para PCIT-204 y PCIT-205.
- `COURT_SURFACES` y `CONSENT_METHODS` en `schema.js`: no se usan, pero describen valores documentados en `docs/firestore-schema.md`.
- `parseVideoLinks` sigue exportada: `publicApplications.js` también lo usa Postular, que queda fuera del alcance.
- `aFecha` sigue repetida en `inicio.js` y `planes.js`. Unirlas haría que `planes.js` cargara `inicio.js` y todo lo que este importa.
- Dependencias: todas se usan. `azurite` se llama por su ruta desde `tests/azure`.
- Las clases `ac-tone-*`, `tarjeta-jugador--*`, `panel-jugador-destacado--*` y `entrada-*` se arman con plantillas, y todos sus valores aparecen en el JSX.
- Quedan fuera del alcance: landing, Precios, Login, Registro, Postular, `src/index.css` y `scripts/`.

Para verificarlo, ejecuta `npx vitest run`, `npm run lint` y `npm run build` desde `web/`.
