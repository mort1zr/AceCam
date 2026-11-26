# PCIT-246 · Ensayo local con el modelo real

El 24 de noviembre de 2026 se verificó `partido-ensayo-noche` en `demo-acecam`. Se usó un recorte de tenis de 5 segundos a 1280×720 y 25 FPS del [video de ejemplo citado en la guía web](https://github.com/abdullahtarek/tennis_analysis/blob/main/input_videos/input_video.mp4).

El cliente de **Analizar video** subió el MP4 a Storage y guardó el partido **En cola** en Firestore. El worker Python en CPU procesó los 125 fotogramas con los pesos del modelo y terminó en **Listo** en 95,878 segundos. Guardó estadísticas `acecam.match-stats.v1` con un golpe y 9,7 metros recorridos, y un `processed.mp4` de 618 473 bytes. En el navegador se abrió el reporte y se cargó el video de 5 segundos a 1280×720. FFmpeg decodificó la copia local sin errores.

## Mostrar y recuperar el ensayo en el PC de Fabián

1. Entra a `http://127.0.0.1:5176/login` con la cuenta ficticia del ensayo. Abre **Partidos → Rival de ensayo → Ver reporte**. En **Analizar video** aparece el estado del partido.
2. La carpeta `revision-presentacion-acecam`, junto al repositorio, conserva el original, el MP4 anotado, el respaldo JSON de los cinco documentos y el script de recuperación. La exportación estándar del emulador falló con `EPERM` al renombrar su carpeta temporal. Se guardó en su lugar un respaldo del caso y se comprobó el script contra el emulador activo sin sobrescribir los datos existentes.
3. Si se reinician los servicios, enciende Auth, Firestore y Storage y la web con la [guía de Windows](GUIA-ENCENDIDO-WINDOWS.md), usando Firestore en `62810`. Desde `web`, ejecuta `node ../../revision-presentacion-acecam/restaurar-ensayo-2411.mjs restaurar`. El script verifica las sumas de los MP4 antes de guardar los objetos y datos que falten. El reporte guardado se puede mostrar con la web y los emuladores activos.

Este ensayo cubre una carga local y la ejecución del modelo real con un clip corto. La prueba de un partido continuo de más de 60 segundos y el adjunto compartido corresponden a PCIT-147. La importación de YouTube en el entorno compartido corresponde a PCIT-244.
