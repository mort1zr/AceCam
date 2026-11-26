import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { PLANES } from '../planes.js'
import { recordPlatformChange } from './platformAudit.js'

export async function savePlatformOrganization(db, actorId, { id, name, plan, archived }) {
  const reference = id ? doc(db, 'orgs', id) : doc(collection(db, 'orgs'))
  return runTransaction(db, async transaction => {
    const current = id ? (await transaction.get(reference)).data() : null
    if (id && !current) throw new Error('Organization unavailable')
    const before = current ? { name: current.name, plan: current.plan, archived: current.archived ?? false } : null
    const after = {
      name: name?.trim() ?? before?.name,
      plan: plan ?? before?.plan,
      archived: archived ?? before?.archived ?? false,
    }
    if (!after.name || after.name.length < 2 || after.name.length > 120 || !Object.hasOwn(PLANES, after.plan)) {
      throw new Error('Invalid organization')
    }
    if (before && Object.keys(after).every(key => before[key] === after[key])) return reference.id
    const platformAuditId = recordPlatformChange(db, transaction, {
      actorId, entity: 'orgs', targetId: reference.id, before, after,
    })
    const fields = { ...after, platformAuditId }
    if (before ? before.plan !== after.plan : after.plan !== 'free') fields.planSince = serverTimestamp()
    if (id) transaction.update(reference, { ...fields, updatedAt: serverTimestamp() })
    else transaction.set(reference, { ...fields, ownerId: null, createdAt: serverTimestamp() })
    return reference.id
  })
}
