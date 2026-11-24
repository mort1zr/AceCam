# PCIT-159 · Indicador de procesamiento en Analizar video

La cola muestra una barra indeterminada en cada partido que Firestore reporta como
`procesando`. El worker escribe `analysisStage` al preparar el video, iniciar el
análisis y guardar el resultado. Los partidos sin ese campo muestran el mensaje
general de análisis. La fila calcula el tiempo transcurrido desde `startedAt`,
registrado por Firestore al reclamar el partido.

Durante la detección y la generación del video anotado, el worker publica
`analysisFrames` con los fotogramas recorridos y el total de esa etapa, como
máximo cada cinco segundos y al finalizar el conteo. Cada etapa ocupa un tramo fijo de la barra y los fotogramas avanzan dentro del
tramo de su etapa, de modo que la fila muestra un porcentaje total y, pasados 15 s,
un tiempo restante aproximado (tiempo transcurrido ÷ avance). Es una estimación:
los tramos son fijos y no miden la duración real de cada etapa.
La barra de transferencia del formulario muestra el avance de la carga y es
independiente del estado del análisis.

Cuando Firestore reporta `listo` o `error`, la fila conserva la etiqueta del
estado recibido y retira la barra. Cada barra identifica el partido para
lectores de pantalla. Si el dispositivo pide reducir el movimiento, se muestra
el indicador estático.

## Verificación

La prueba de la pantalla emite cambios en la suscripción de Firestore para dos
partidos. Comprueba que las barras aparecen al pasar de En cola a Procesando y
desaparecen al recibir Listo o Error. También verifica que cada barra se identifica
por partido y que muestran el porcentaje total y el tiempo restante estimado.
