# PCIT-197 · Importar respuestas de Google Forms

AceCam valida las respuestas de la pestaña registrada con los mismos requisitos de contacto, fecha y apoderado del formulario propio. Solo se importan filas con autorización afirmativa. Las filas con problemas se indican por número para que puedan corregirse y volver a sincronizarse.

La organización, el ID de la hoja, la pestaña, la marca temporal y el correo identifican una respuesta. La importación usa una transacción de Firestore. Si la postulación existe, conserva sus datos y estado. Los documentos importados se muestran en la bandeja como postulaciones nuevas y registran quién hizo la importación.

PCIT-254 incorpora la columna opcional **Enlace de YouTube** (también **Enlaces de video**): valida los enlaces con las mismas reglas del formulario propio y guarda `videoLinks`. Los enlaces aparecen en **Videos adjuntos** de la ficha y se abren por decisión del entrenador. La sincronización no descarga archivos, crea partidos ni modifica la cuota de análisis.

Para respuestas ya importadas antes de este cambio, vuelve a sincronizar: se completan únicamente los enlaces faltantes. Se conserva el estado, las notas, el contacto y los enlaces existentes. Se cuentan como **Ya importadas**, no como nuevas. Esta actualización exige las nuevas reglas de Firestore: solo puede hacerla el dueño o administrador de esa organización, sobre documentos importados de Google sin enlaces previos. El despliegue debe publicar tanto la web como las reglas antes de probarlo.

Las reglas permiten al dueño o administrador registrar la hoja e importar respuestas de su organización. Las postulaciones son visibles para el equipo de esa organización. La configuración de la hoja es privada.

Desde `web`, ejecuta `npm test -- src/panel/lib/googleFormsApplications.test.js` y `npm run test:rules` para verificar validación, permisos y sincronizaciones repetidas.
