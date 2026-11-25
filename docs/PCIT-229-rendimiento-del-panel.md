# PCIT-229 · Rendimiento del panel (Lighthouse y carga)

Medición del panel ya optimizado (después de PCIT-232, PCIT-230 y PCIT-231), con sesión
iniciada en la cuenta de demostración `test@test.com` y los datos de `npm run seed`.

## Lighthouse

Lighthouse 13.6 contra `npm run build` servido con `vite preview`, en modo Puppeteer para
reutilizar la sesión. Móvil usa el perfil por defecto (4G lenta simulada y CPU ×4) y
escritorio el perfil de escritorio de Lighthouse.

| Pantalla | Modo | Rendimiento | Accesibilidad | Mejores prácticas | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|
| Dashboard | Móvil | 92 | 100 | 100 | 3,3 s | 40 ms | 0 |
| Jugadores | Móvil | 99 | 100 | 100 | 0,8 s | 140 ms | 0,021 |
| Comparador | Móvil | 100 | 100 | 100 | 1,3 s | 40 ms | 0 |
| Reclutamiento | Móvil | 100 | 100 | 100 | 1,3 s | 60 ms | 0 |
| Analizar video | Móvil | 100 | 100 | 100 | 1,0 s | 0 ms | 0 |
| Partidos | Móvil | 100 | 100 | 100 | 1,4 s | 0 ms | 0 |
| Dashboard | Escritorio | 100 | 100 | 100 | 0,8 s | 0 ms | 0,005 |
| Jugadores | Escritorio | 100 | 100 | 100 | 0,2 s | 0 ms | 0,006 |
| Comparador | Escritorio | 100 | 100 | 100 | 0,2 s | 0 ms | 0,001 |
| Reclutamiento | Escritorio | 100 | 100 | 100 | 0,2 s | 0 ms | 0 |
| Analizar video | Escritorio | 100 | 100 | 100 | 0,4 s | 0 ms | 0,001 |
| Partidos | Escritorio | 100 | 100 | 100 | 0,4 s | 0 ms | 0 |

Todas las pantallas cumplen el objetivo (rendimiento ≥ 80 en móvil y ≥ 90 en escritorio).
La más lenta es Dashboard en móvil (92). Su LCP (3,3 s) es el nombre en la tarjeta del
jugador, que aparece cuando llega la lista de jugadores desde Firestore.

### Ajustes hechos durante la medición

- **Dashboard (87 → 92 en móvil, LCP 3,9 s → 3,3 s):** las gráficas de evolución y de
  peloteos se cargan aparte con `lazy()`, así que la librería de gráficas (Recharts, 105 kB
  gzip) ya no retrasa las tarjetas de jugadores. Mientras se descarga, cada gráfica reserva
  su alto para no mover la página.

La primera pasada dio en Partidos móvil rendimiento 90, accesibilidad 96 y CLS 0,204:

- **CLS:** la barra de filtros y el contador de partidos aparecían al terminar la carga y
  empujaban la tabla hacia abajo. Ahora se muestran desde el inicio, mientras carga el
  esqueleto, y el contador reserva su línea.
- **Accesibilidad:** el marcador usaba `aria-label` en un `span` sin rol. Ahora tiene
  `role="img"`, y el lector de pantalla sigue leyendo «Resultado 6-3 6-4».

Después de los ajustes, Partidos queda en 100 en todas las categorías y CLS 0, en móvil y
en escritorio.

## Carga inicial con caché vacía y caliente

Chrome con red 4G simulada (150 ms de latencia, 1,6 Mbps de bajada) y CPU ×4. «Listo» es el
tiempo hasta que la pantalla muestra sus datos sin esqueleto; «KB» es lo transferido.

| Pantalla | Caché vacía | KB | Caché caliente | KB |
|---|---|---|---|---|
| Dashboard | 4,4 s | 572 | 2,4 s | 10 |
| Jugadores | 4,0 s | 469 | 2,5 s | 10 |
| Partidos | 5,1 s | 438 | 3,3 s | 8 |

Con caché caliente casi no se descarga nada: el resto del tiempo es la sesión y la lectura de
Firestore.

## Comparación con las cifras de partida (RR-49)

| Archivo | Partida | Ahora |
|---|---|---|
| `index.esm` (Firestore) | ≈ 581 kB | 472 kB · 140 kB gzip |
| `index` (entrada) | ≈ 397 kB | 111 kB · 35 kB gzip, más `react` 257 kB y `firebase-auth` 97 kB en archivos aparte |
| Chunk compartido (Recharts) | ≈ 324 kB | `recharts` 373 kB, solo en Dashboard y en el reporte del partido |
| CSS | ≈ 93 kB | 96 kB · 18 kB gzip |

## Límites de la medición

- Firestore y Auth corren en los emuladores locales, así que las lecturas no pagan la
  latencia real de Google. En producción, los tiempos de «Listo» serán algo mayores.
- Lighthouse reutiliza la sesión del navegador (`disableStorageReset`) para no perder el
  inicio de sesión, así que los archivos comunes ya están en caché. La carga con caché vacía
  se mide aparte, en la tabla de carga inicial.

## Cómo repetir la medición

1. En `web`: `npm run emulators` y, en otra terminal, `npm run seed`.
2. `npm run build` y `npx vite preview --port 4173`.
3. En una carpeta aparte, con `lighthouse@13.6.0` y `puppeteer-core` instalados, ejecutar
   un script que inicie sesión con `test@test.com` / `test123` en `/login` y luego llame a
   `lighthouse(url, { disableStorageReset: true }, config, page)` para cada pantalla, una vez
   con el perfil móvil y otra con `lighthouse/core/config/desktop-config.js`.
4. Para la carga, aplicar con CDP `Network.emulateNetworkConditions` (4G) y
   `Emulation.setCPUThrottlingRate` (4), vaciar la caché con `Network.clearBrowserCache`,
   cargar cada pantalla y volver a cargarla para la medida con caché caliente.
