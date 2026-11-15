# PCIT-236 · Invitar miembros desde administración

El administrador de plataforma elige una organización activa, el correo del
destinatario y el rol de entrenador o administrador de equipo. AceCam guarda la
invitación y su auditoría en una sola operación y muestra el enlace para compartir.
La creación de la invitación no envía correo automáticamente.

La persona invitada abre el enlace y crea una cuenta con el correo invitado.
Firebase envía un enlace para verificar ese correo. Al iniciar sesión después de
verificarlo, se crean su ficha de equipo y la aceptación de la invitación
en el mismo lote. Una cuenta existente con ficha conserva su organización.

Las invitaciones para una organización archivada se rechazan tanto al crearlas
como al aceptar una invitación de plataforma ya emitida. El rol de administrador
de equipo permite gestionar el equipo según sus reglas, sin conceder acceso a
`/admin`. El campo de propietario de la organización se conserva.

La prueba de integración usa usuarios ficticios, Auth Emulator para el enlace
de verificación y Firestore Emulator para la invitación, la membresía y la auditoría.
