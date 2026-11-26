# PCIT-147 · Requisitos para subir videos

La implementación local se registra en PCIT-239.

Analizar video, el adjunto de postulación en la demo y la importación por enlace en la demo aceptan videos de más de un minuto. El worker usa el procesamiento por tramos de PCIT-146. Su configuración predeterminada tiene `worker.max_duration_seconds: 0`. Si arrancas el worker con un YAML personalizado que todavía especifica 60, ajusta ese valor y reinicia el worker.

Usa MP4 o MOV con al menos 1280×720 y entre 25 y 60 FPS, incluidos ambos extremos. Se recomienda 1080p a 30 FPS, con la cámara fija detrás de la línea de fondo, cancha completa y sin cortes. La carga directa admite hasta 500 MiB. La importación por enlace de la demo admite hasta 24 MiB.

Las pruebas comprueban que videos de 61 segundos y 10 minutos pasan la validación de duración del worker y que la API local admite un adjunto de 10 minutos con metadatos válidos.

En los emuladores, un MP4 sintético de 61 segundos a 1280×720 y 30 FPS
completó el recorrido Storage → worker → Firestore. El partido quedó en
`listo` con estadísticas de 61 segundos y un MP4 procesado en Storage.
La prueba ejecuta el pipeline con dobles de los detectores de jugadores,
pelota y cancha. No mide la precisión del modelo con un partido real.

En una verificación con archivos MP4 y `ffprobe` real, la API de postulación aceptó un clip de 61 segundos a 1280×720 y 25 FPS. Rechazó un clip de 640×360 con el mensaje acordado y otro de 24 FPS. En Storage emulado, el clip válido quedó accesible por la API para su organización y el archivo no obtuvo un token de descarga.

## Verificación en el entorno compartido

La API privada de adjuntos de postulación ya está implementada e integrada en `main` (PR #45, PCIT-251). La web utiliza `VITE_APPLICATION_VIDEO_API_URL` para enviar el archivo al servicio `acecam-application-video`. La demo local conserva su adaptador de Firebase Storage.

Axel debe confirmar el despliegue y la variable de la web en PCIT-251 y verificar el guardado de un video válido de más de 60 segundos, el rechazo por resolución o FPS antes de adjuntarlo y la lectura privada por parte del equipo autorizado. Las bases locales de duración ya aceptan más de un minuto. Los pasos y límites del servicio están en [PCIT-251](PCIT-251-postulaciones-en-azure.md). PCIT-147 conserva pendiente esta verificación compartida.
