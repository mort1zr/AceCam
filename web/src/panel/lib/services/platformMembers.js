import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { COLLECTIONS, ROLES } from '../schema.js'
import { recordPlatformChange } from './platformAudit.js'

export function changePlatformMemberRole(db, actorId, { id, expectedRole, role }) {
  if (!ROLES.includes(role)) throw new Error('Invalid member role')
  return updateMember(db, actorId, id, 'role', expectedRole, role)
}

export function changePlatformMemberSuspension(db, actorId, { id, expectedSuspended, suspended }) {
  if (typeof suspended !== 'boolean') throw new Error('Invalid suspension state')
  return updateMember(db, actorId, id, 'suspended', expectedSuspended, suspended)
}

function updateMember(db, actorId, id, field, expected, value) {
  const reference = doc(db, COLLECTIONS.users, id)
  return runTransaction(db, async transaction => {
    const member = (await transaction.get(reference)).data()
    if (!member) throw Object.assign(new Error('Member unavailable'), { code: 'member/conflict' })
    const before = { role: member.role, suspended: member.suspended ?? false }
    if (before[field] !== expected) throw Object.assign(new Error('Member changed'), { code: 'member/conflict' })
    if (before[field] === value) return
    const platformAuditId = recordPlatformChange(db, transaction, {
      actorId, entity: 'users', targetId: id, before, after: { ...before, [field]: value },
    })
    transaction.update(reference, { [field]: value, platformAuditId, updatedAt: serverTimestamp() })
  })
}
