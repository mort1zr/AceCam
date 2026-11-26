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

export async function readGoogleSheet({ spreadsheetId, sheetId }, accessToken, signal) {
  const response = await fetch(`${SHEETS_ENDPOINT}/${encodeURIComponent(spreadsheetId)}/values:batchGetByDataFilter`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dataFilters: [{ gridRange: { sheetId } }],
      majorDimension: 'ROWS',
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'SERIAL_NUMBER',
    }),
    signal,
  })
  if ([401, 403, 404].includes(response.status)) {
    throw new Error('La cuenta de Google debe tener acceso a la hoja. Revisa el enlace y sus permisos.')
  }
  if (!response.ok) throw new Error('No pudimos leer la pestaña de respuestas. Revisa su enlace e inténtalo de nuevo.')
  const { valueRanges } = await response.json()
  return valueRanges?.[0]?.valueRange?.values ?? []
}
