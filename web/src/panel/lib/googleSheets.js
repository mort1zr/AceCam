const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'
const GOOGLE_CLIENT_SCRIPT = 'https://accounts.google.com/gsi/client'
const SHEETS_ENDPOINT = 'https://sheets.googleapis.com/v4/spreadsheets'
let loadingClient

export function loadGoogleSheetsAuthorization() {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2)
  loadingClient ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    function fail() {
      script.remove()
      reject(new Error('No pudimos cargar la autorización de Google. Vuelve a abrir esta sección.'))
    }
    script.src = GOOGLE_CLIENT_SCRIPT
    script.async = true
    script.onload = () => {
      const client = window.google?.accounts?.oauth2
      if (client) resolve(client)
      else fail()
    }
    script.onerror = fail
    document.head.append(script)
  }).catch(error => {
    loadingClient = undefined
    throw error
  })
  return loadingClient
}

export function authorizeGoogleSheets(oauth, clientId) {
  return new Promise((resolve, reject) => {
    const client = oauth.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      include_granted_scopes: false,
      callback(response) {
        if (!response.access_token || !oauth.hasGrantedAllScopes(response, SCOPE)) {
          reject(new Error('Autoriza la lectura de Google Sheets para sincronizar.'))
          return
        }
        resolve(response.access_token)
      },
      error_callback() {
        reject(new Error('La autorización de Google se cerró o fue bloqueada. Inténtalo de nuevo.'))
      },
    })
    client.requestAccessToken({ prompt: 'select_account' })
  })
}

async function sheetsResponse(response) {
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const reasons = body?.error?.details?.map(detail => detail.reason) ?? []
    if (reasons.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
      throw new Error('Google no concedió el permiso necesario. Vuelve a sincronizar y autoriza la lectura de Google Sheets.')
    }
    if (reasons.includes('SERVICE_DISABLED')) {
      throw new Error('Habilita Google Sheets API en el proyecto del cliente de Google y vuelve a sincronizar.')
    }
  }
  if ([401, 403, 404].includes(response.status)) {
    throw new Error('La cuenta de Google debe tener acceso a la hoja. Revisa el enlace y sus permisos.')
  }
  if (!response.ok) throw new Error('No pudimos leer la pestaña de respuestas. Revisa su enlace e inténtalo de nuevo.')
  return response.json()
}

export async function readGoogleSheet({ spreadsheetId, sheetId }, accessToken, signal) {
  const base = `${SHEETS_ENDPOINT}/${encodeURIComponent(spreadsheetId)}`
  const options = { headers: { Authorization: `Bearer ${accessToken}` }, signal, cache: 'no-store', redirect: 'error' }
  // batchGetByDataFilter no admite spreadsheets.readonly. Resolver el gid y leer por
  // nombre permite conservar el permiso de solo lectura (PCIT-253).
  const metadataQuery = new URLSearchParams({ fields: 'sheets(properties(sheetId,title))' })
  const metadata = await sheetsResponse(await fetch(`${base}?${metadataQuery}`, options))
  const title = metadata.sheets?.find(sheet => sheet.properties?.sheetId === sheetId)?.properties?.title
  if (typeof title !== 'string' || !title) {
    throw new Error('La pestaña registrada ya no existe. Revisa el enlace de la pestaña de respuestas.')
  }
  signal?.throwIfAborted()
  const range = `'${title.replaceAll("'", "''")}'`
  const query = new URLSearchParams({ majorDimension: 'ROWS', valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' })
  const data = await sheetsResponse(await fetch(`${base}/values/${encodeURIComponent(range)}?${query}`, options))
  return data.values ?? []
}
