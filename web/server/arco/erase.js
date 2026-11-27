// Borrado de datos personales para las solicitudes ARCO y el cierre de organizaciones (PCIT-221).
//
// Lo usa un operador del proyecto con el Admin SDK (scripts/borrarDatos.mjs), nunca la web.
// Primero arma un plan (qué documentos, videos y cuentas se borran) y después lo ejecuta.
// El plan solo lleva rutas e IDs, sin nombres ni correos, para que el registro de lo borrado
// no vuelva a guardar los datos personales que se están eliminando.
//
// Orden al ejecutar: videos → documentos → cuentas. Si algo se corta a medias, volver a
// lanzar el mismo comando termina el trabajo: lo ya borrado simplemente no aparece.

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/

function checkId(kind, id) {
  if (typeof id !== 'string' || !SAFE_ID.test(id)) throw new TypeError(`${kind} no válido: ${JSON.stringify(id)}`)
  return id
}

function emptyPlan(target) {
  return { target, documents: [], recursive: [], prefixes: [], authUids: [], kept: [] }
}

/**
 * @param {object} deps
 * @param {import('firebase-admin/firestore').Firestore} deps.db
 * @param {import('firebase-admin/auth').Auth} deps.auth
 * @param {{ getFiles: Function, file: Function } | null} deps.bucket       Firebase Storage (o null)
 * @param {import('@azure/storage-blob').ContainerClient | null} deps.container  Azure Blob (o null)
 */
export function createEraser({ db, auth, bucket = null, container = null }) {
  const docsWhere = async (collection, field, value) =>
    (await db.collection(collection).where(field, '==', value).get()).docs

  /** Toda una organización: equipo, jugadores, partidos, postulaciones, invitaciones y videos. */
  async function planOrg(orgId) {
    checkId('orgId', orgId)
    const plan = emptyPlan({ type: 'org', id: orgId })
    const org = await db.doc(`orgs/${orgId}`).get()
    if (!org.exists) plan.kept.push(`orgs/${orgId} no existe: se borra lo que quede con ese orgId`)

    for (const user of await docsWhere('users', 'orgId', orgId)) {
      plan.documents.push(user.ref.path)
      plan.authUids.push(user.id)
    }
    for (const collection of ['invites', 'applications']) {
      for (const doc of await docsWhere(collection, 'orgId', orgId)) plan.documents.push(doc.ref.path)
    }
    // Los jugadores tienen su foto de perfil en la subcolección media: se borran con ella.
    for (const player of await docsWhere('players', 'orgId', orgId)) plan.recursive.push(player.ref.path)
    // Los partidos tienen subcolecciones (coachNotes): se borran con todo lo que cuelga de ellos.
    for (const match of await docsWhere('matches', 'orgId', orgId)) plan.recursive.push(match.ref.path)
    // La organización con usage, applicationForms y recruitmentIntegrations.
    plan.recursive.push(`orgs/${orgId}`)
    plan.prefixes.push(`orgs/${orgId}/`)
    return plan
  }

  /** Un jugador (dato del titular): su ficha y su foto, sus partidos con videos y notas, y sus postulaciones. */
  async function planPlayer(playerId) {
    checkId('playerId', playerId)
    const plan = emptyPlan({ type: 'player', id: playerId })
    const player = await db.doc(`players/${playerId}`).get()
    // Con su foto de perfil (players/{playerId}/media).
    if (player.exists) plan.recursive.push(player.ref.path)

    for (const match of await docsWhere('matches', 'playerId', playerId)) {
      plan.recursive.push(match.ref.path)
      const orgId = match.get('orgId')
      if (SAFE_ID.test(orgId ?? '')) plan.prefixes.push(`orgs/${orgId}/matches/${match.id}/`)
    }
    for (const application of await docsWhere('applications', 'playerId', playerId)) {
      plan.documents.push(application.ref.path)
      const orgId = application.get('orgId')
      if (SAFE_ID.test(orgId ?? '')) plan.prefixes.push(`orgs/${orgId}/applications/${application.id}/`)
    }
    return plan
  }

  /** Una postulación (la persona que postuló no tiene cuenta): el documento y su video. */
  async function planApplication(applicationId) {
    checkId('applicationId', applicationId)
    const plan = emptyPlan({ type: 'application', id: applicationId })
    const application = await db.doc(`applications/${applicationId}`).get()
    if (!application.exists) return plan
    plan.documents.push(application.ref.path)
    const orgId = application.get('orgId')
    if (SAFE_ID.test(orgId ?? '')) plan.prefixes.push(`orgs/${orgId}/applications/${applicationId}/`)
    return plan
  }

  /**
   * Un miembro del equipo: su cuenta, su ficha, sus notas privadas y su invitación.
   * Los jugadores y partidos que creó son de la organización y se quedan.
   * El dueño de una organización no se borra así: hay que borrar la organización.
   */
  async function planUser(uid) {
    checkId('uid', uid)
    const plan = emptyPlan({ type: 'user', id: uid })
    const owned = await docsWhere('orgs', 'ownerId', uid)
    if (owned.length) {
      throw Object.assign(new Error(`La cuenta es dueña de ${owned.map(doc => doc.ref.path).join(', ')}: borra la organización (--org).`), { code: 'arco/owner' })
    }
    const user = await db.doc(`users/${uid}`).get()
    if (user.exists) plan.documents.push(user.ref.path)
    plan.authUids.push(uid)

    // Las notas privadas tienen como ID el UID de su autor (matches/{id}/coachNotes/{uid}).
    for (const note of (await db.collectionGroup('coachNotes').get()).docs) {
      if (note.id === uid) plan.documents.push(note.ref.path)
    }
    const email = user.exists ? user.get('email') : (await auth.getUser(uid).catch(() => null))?.email
    if (email) {
      const invite = await db.doc(`invites/${String(email).trim().toLowerCase()}`).get()
      if (invite.exists) plan.documents.push(invite.ref.path)
    }
    plan.kept.push('Jugadores y partidos creados por esta cuenta: son de la organización y se conservan')
    return plan
  }

  /** Bitácora de plataforma (PCIT-203): entradas anteriores a `before` (plazo de conservación). */
  async function planAudit(before) {
    if (!(before instanceof Date) || Number.isNaN(before.getTime())) throw new TypeError('Fecha no válida')
    const plan = emptyPlan({ type: 'audit', before: before.toISOString() })
    const old = await db.collection('platformAudit').where('createdAt', '<', before).get()
    for (const entry of old.docs) plan.documents.push(entry.ref.path)
    return plan
  }

  async function listFirebaseFiles(prefix) {
    if (!bucket) return []
    const [files] = await bucket.getFiles({ prefix })
    return files.map(file => file.name)
  }

  async function listAzureBlobs(prefix) {
    if (!container) return []
    const names = []
    for await (const blob of container.listBlobsFlat({ prefix })) names.push(blob.name)
    return names
  }

  /** Lista los archivos concretos de cada prefijo, en los dos almacenamientos. */
  async function resolveFiles(plan) {
    const firebase = []
    const azure = []
    for (const prefix of plan.prefixes) {
      firebase.push(...await listFirebaseFiles(prefix))
      azure.push(...await listAzureBlobs(prefix))
    }
    return { firebase, azure }
  }

  /**
   * Ejecuta el plan. Con dryRun solo devuelve lo que borraría.
   * Devuelve un informe con rutas e IDs (sin datos personales) para guardar como constancia.
   */
  async function execute(plan, { dryRun = true } = {}) {
    const files = await resolveFiles(plan)
    const report = {
      target: plan.target,
      dryRun,
      at: new Date().toISOString(),
      firebaseFiles: files.firebase,
      azureBlobs: files.azure,
      documents: [...plan.documents],
      recursive: [...plan.recursive],
      authUids: [],
      kept: [...plan.kept],
    }
    if (dryRun) {
      report.authUids = [...plan.authUids]
      return report
    }

    for (const name of files.firebase) await bucket.file(name).delete({ ignoreNotFound: true })
    // deleteSnapshots: 'include' borra también las instantáneas; el soft delete de 7 días las conserva
    // como copia de seguridad ante un borrado por error y después desaparecen.
    for (const name of files.azure) await container.getBlobClient(name).deleteIfExists({ deleteSnapshots: 'include' })
    for (const path of plan.recursive) await db.recursiveDelete(db.doc(path))
    for (const path of plan.documents) await db.doc(path).delete()
    for (const uid of plan.authUids) {
      try {
        await auth.deleteUser(uid)
        report.authUids.push(uid)
      } catch (error) {
        if (error?.code !== 'auth/user-not-found') throw error
      }
    }
    return report
  }

  return { planOrg, planPlayer, planApplication, planUser, planAudit, execute }
}
