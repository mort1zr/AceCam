# PCIT-230 · Peso del bundle y división del código

Se midió el build de producción (`npm run build`) antes y después. Las pantallas ya se cargaban con `lazy()` en `App.jsx`; lo que pesaba de más era Firestore completo, Recharts en la lista de partidos y Auth con código de ventanas emergentes que la app no usa.

**JavaScript que descarga cada ruta al entrar** (entrada; en el panel, también `rutas`, `AppLayout`, `firebase` y el chunk de la página, con sus importaciones estáticas; gzip nivel 9)

| Ruta | Antes | Después |
|---|---|---|
| `/` (landing) | 476 kB · 150 kB gzip | 465 kB · 145 kB gzip |
| `/dashboard` | 1602 kB · 489 kB gzip | 1480 kB · 450 kB gzip |
| `/partidos` | 1504 kB · 461 kB gzip | 1045 kB · 325 kB gzip |

**Chunks principales** (cifras de Vite)

| Chunk | Antes | Después |
|---|---|---|
| Firestore (`index.esm`) | 581 kB · 173 kB gzip | 472 kB · 142 kB gzip |
| Entrada (`index`) | 397 kB · 123 kB gzip (React, Auth y landing juntos) | 111 kB · 36 kB gzip, más `react` 257 kB · 81 kB y `firebase-auth` 97 kB · 29 kB |
| Recharts | 324 kB · 97 kB gzip (`useNombreOrganizacion`), más unos 66 kB dentro de `Dashboard` | 373 kB · 107 kB gzip (`recharts`) |
| `Dashboard` | 107 kB · 31 kB gzip | 40 kB · 13 kB gzip |
| `Partidos` | 18 kB · 6 kB gzip | 8 kB · 3 kB gzip, más `MatchReport` 11 kB · 4 kB al abrir un reporte |
| CSS (`index.css`) | 96 kB · 18 kB gzip | 96 kB · 18 kB gzip (sin cambios) |

Ya no aparece el aviso de chunks de más de 500 kB.

**Cambios**

- `AuthProvider.jsx` toma `doc` y `onSnapshot` de `lib/firebase.js` en vez de `import('firebase/firestore')`. Importar el módulo entero impedía descartar el código de Firestore que no se usa.
- `firebaseAuth.js` usa `initializeAuth` con las mismas tres persistencias que `getAuth`, pero sin el soporte de ventanas emergentes y redirecciones, que la app no usa.
- `Partidos.jsx` carga `MatchReport` con `lazy()`. La lista ya no descarga Recharts: se descarga al abrir el primer reporte, y mientras tanto (unos 110 kB gzip) el área queda vacía.
- `vite.config.js` separa `react`, `firebase-auth` y `recharts` en chunks propios, para que el navegador los mantenga en caché aunque cambie el código de la app.
- `Partidos.test.jsx` espera el título del reporte con `findByRole`, porque ahora carga de forma diferida.

**Se dejó a propósito**

- `PdfJugador` sigue cargándose con el dashboard. El PDF se genera con la impresión del navegador, sin librerías pesadas, así que diferirlo ahorraría muy poco.
- `doc` y `onSnapshot` en `lib/firebase.js` solo se usan a través del `import()` de `AuthProvider.jsx`. Si se quitan, la sesión iniciada no termina de cargar.
- El CSS no cambia: lo depura PCIT-231.

Para verificarlo, ejecuta `npx vitest run`, `npm run lint` y `npm run build` desde `web/`.
