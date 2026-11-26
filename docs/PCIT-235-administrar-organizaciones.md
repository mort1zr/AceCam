# PCIT-235 · Administrar organizaciones

En `/admin`, un administrador de plataforma puede crear una organización,
editar el nombre y el plan y confirmar el archivo o la reactivación. Las altas
desde este panel quedan sin propietario inicial. La gestión de miembros se
completa en PCIT-205. Cambiar el plan inicia la vigencia del nuevo plan.

Archivar conserva usuarios, partidos, videos y el historial. Firestore impide
crear invitaciones, encolar nuevos partidos o reintentar partidos con error en
organizaciones archivadas. Se mantienen las lecturas según los permisos existentes.

Cada cambio de plataforma guarda la organización y la auditoría de PCIT-203 en
la misma transacción. Las reglas verifican los valores anteriores y nuevos y
rechazan una escritura administrativa sin su registro.

Prueba local con un usuario que tenga un documento en `platformAdmins/{uid}`.
Abre `/admin`, crea una organización, cambia nombre y plan, archívala y vuelve
a activarla. Consulta los cuatro registros en `/admin/auditoria`.
