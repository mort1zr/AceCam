import { collection, getDocFromServer, getDocsFromServer } from 'firebase/firestore'
import { COLLECTIONS } from '../schema.js'
import { usagePeriod, usageRef } from '../usage.js'

export async function loadAdminDirectory(db, period = usagePeriod()) {
  const [organizations, users] = await Promise.all([
    getDocsFromServer(collection(db, COLLECTIONS.orgs)),
    getDocsFromServer(collection(db, COLLECTIONS.users)),
  ])
  const teams = new Map(organizations.docs.map(doc => [doc.id, doc.data()]))
  const members = new Map()
  const userRows = users.docs.map(doc => {
    const { email, orgId, role, createdAt } = doc.data()
    members.set(orgId, (members.get(orgId) ?? 0) + 1)
    const team = teams.get(orgId)
    return { id: doc.id, email, organization: team?.name || orgId, role, createdAt,
      roleEditable: Boolean(team) && team.ownerId !== doc.id }
  })
  const organizationRows = await Promise.all(organizations.docs.map(async doc => {
    const { name, plan, archived } = doc.data()
    const usage = await getDocFromServer(usageRef(db, doc.id, period))
    const analyses = usage.data()?.analyses
    return {
      id: doc.id, name: name || doc.id, plan, archived: archived === true, members: members.get(doc.id) ?? 0,
      analyses: usage.exists() ? (Number.isSafeInteger(analyses) && analyses >= 0 ? analyses : null) : 0,
    }
  }))
  const compare = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'es')
  organizationRows.sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id))
  userRows.sort((a, b) => compare(a.email, b.email) || compare(a.id, b.id))
  return { organizations: organizationRows, users: userRows, period }
}
