# PCIT-238 · Suspender y reactivar miembros

En `/admin → Usuarios`, el administrador de plataforma selecciona **Suspender
acceso** o **Reactivar acceso** y confirma. La ficha conserva su organización,
rol e historial. El cambio se registra en la auditoría de PCIT-203 dentro de
la misma transacción. Las reglas protegen al propietario y las cuentas de plataforma.

La suspensión se aplica al panel del equipo, Firestore, Cloud Storage,
la autorización de importación de la demo y la emisión de nuevas firmas de
la API de Azure. La cuenta puede autenticarse y leer su propia ficha para
ver el estado. La reactivación recupera los permisos del rol existente.

Un enlace SAS de Azure emitido antes de la suspensión conserva su vigencia:
hasta 10 minutos en lectura y 15 minutos en carga. La API comprueba la
suspensión antes de autorizar nuevas firmas. Una copia ya descargada
permanece en el dispositivo que la recibió.

Las pruebas usan Firebase Emulator Suite y Azurite. Para verificar el entorno
compartido, desplegar las reglas y la API actualizadas, suspender una cuenta
de prueba, comprobar el bloqueo y reactivarla. Esta comprobación corresponde
al cierre de PCIT-205.
