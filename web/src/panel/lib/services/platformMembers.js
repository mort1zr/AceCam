import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { COLLECTIONS, ROLES } from '../schema.js'
import { recordPlatformChange } from './platformAudit.js'

export function changePlatformMemberRole(db, actorId, { id, expectedRole, role }) {
  if (!ROLES.includes(role)) throw new Error('Invalid member role')
  const reference = doc(db, COLLECTIONS.users, id)
  return runTransaction(db, async transaction => {
    const member = (await transaction.get(reference)).data()
    if (!member || member.role !== expectedRole) {
      throw Object.assign(new Error('Member role changed'), { code: 'member/conflict' })
    }
    if (member.role === role) return
    const before = { role: member.role, suspended: member.suspended ?? false }
    const platformAuditId = recordPlatformChange(db, transaction, {
      actorId, entity: 'users', targetId: id, before, after: { ...before, role },
    })
    transaction.update(reference, { role, platformAuditId, updatedAt: serverTimestamp() })
  })
}
