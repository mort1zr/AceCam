# PCIT-237 · Cambiar roles de miembros

En `/admin`, la tabla **Usuarios** permite cambiar a un miembro entre
Entrenador y Administrador de equipo. El operador elige el nuevo rol y confirma
el cambio. La aplicación vuelve a consultar el directorio al guardar.

El permiso de plataforma, la protección del propietario y la protección de
cualquier administrador de plataforma se verifican con las reglas de Firestore.
La misma transacción guarda el cambio en `users/{uid}` y su registro de
auditoría. Conserva la organización y el estado de suspensión.

En el emulador se verifica la promoción y su reversión, el rechazo de escrituras
sin auditoría y la protección de cuentas. La bitácora se consulta en
`/admin/auditoria`.
