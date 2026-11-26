# PCIT-242 · Encolar un video de YouTube desde Analizar video

`VITE_AZURE_YOUTUBE_IMPORT_ENABLED=true` muestra la opción de enlaces de YouTube cuando `VITE_VIDEO_API_URL` apunta a la API configurada. Actívala en el entorno de prueba después de habilitar `POST /api/videos/import-youtube`. El navegador envía el token de Firebase solo a esa API, sin seguir redirecciones. La demo local conserva el importador de su mismo origen.

La pantalla muestra **Importando video…** mientras el servidor descarga y verifica el archivo. Cuando Blob confirma la escritura de `orgs/{orgId}/matches/{matchId}/video.mp4`, la API devuelve la ruta. El panel verifica que corresponda a la organización y al partido y guarda **En cola** junto al incremento del contador mensual en la transacción existente. Un enlace no disponible mantiene los datos del formulario y no crea el partido. El intento se puede repetir con el mismo identificador.

Las pruebas locales emplean Azurite, Firebase y una respuesta de YouTube simulada. Comprueban que el blob sea privado, que el partido no se cree antes de confirmar el archivo, que se descuente una sola vez la cuota y que un enlace no disponible o una cuota agotada no creen un partido. La ejecución con el modelo en Azure corresponde a PCIT-244.
