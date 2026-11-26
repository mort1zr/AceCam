import { doc, getDocFromServer, setDoc } from 'firebase/firestore'
import { COLLECTIONS } from '../schema.js'

const sourceRef = (db, orgId) => doc(db, COLLECTIONS.orgs, orgId, 'recruitmentIntegrations', 'googleForms')

export async function loadGoogleFormsSource(db, orgId) {
  return (await getDocFromServer(sourceRef(db, orgId))).data() ?? null
}

export function saveGoogleFormsSource(db, orgId, source) {
  return setDoc(sourceRef(db, orgId), source)
}

function parseHttpsUrl(value) {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port) return url
  } catch {
    // Un enlace incompleto también se valida al guardar.
  }
  return null
}

export function googleFormsSource({ formUrl, sheetUrl }) {
  const form = parseHttpsUrl(formUrl)
  const isLong = form?.hostname === 'docs.google.com' && /^\/forms\/d\/(?:e\/)?[\w-]{1,128}\/viewform\/?$/.test(form.pathname)
  const isShort = form?.hostname === 'forms.gle' && /^\/[\w-]{1,128}\/?$/.test(form.pathname)
  if (!isLong && !isShort) throw new Error('Pega el enlace para responder al formulario de Google.')
  const sheet = parseHttpsUrl(sheetUrl)
  const spreadsheetId = sheet?.hostname === 'docs.google.com'
    ? /^\/spreadsheets\/d\/([\w-]{1,128})(?:\/edit)?\/?$/.exec(sheet.pathname)?.[1] : null
  const gid = new URLSearchParams(sheet?.hash.slice(1)).get('gid') ?? sheet?.searchParams.get('gid') ?? '0'
  if (!spreadsheetId || !/^\d{1,10}$/.test(gid) || Number(gid) > 2_147_483_647) {
    throw new Error('Pega el enlace de la pestaña de respuestas de Google Sheets.')
  }
  return { formUrl: form.origin + form.pathname.replace(/\/$/, ''), spreadsheetId, sheetId: Number(gid) }
}

export function googleSheetUrl({ spreadsheetId, sheetId }) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`
}
