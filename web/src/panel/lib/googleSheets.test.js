import { afterEach, expect, it, vi } from 'vitest'
import { authorizeGoogleSheets, readGoogleSheet } from './googleSheets.js'

afterEach(() => vi.unstubAllGlobals())

const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
const metadata = title => ({ sheets: [
  { properties: { sheetId: 0, title: 'Otra pestaña' } },
  { properties: { sheetId: 19, title } },
] })

it('lee la pestaña elegida con operaciones GET compatibles con solo lectura', async () => {
  const fetchRows = vi.fn()
    .mockResolvedValueOnce(json(metadata("Respuestas d'Academia / #1")))
    .mockResolvedValueOnce(json({ values: [['Marca temporal'], [46336.5]] }))
  vi.stubGlobal('fetch', fetchRows)
  const source = { spreadsheetId: 'sheet-test', sheetId: 19 }
  await expect(readGoogleSheet(source, 'token')).resolves.toEqual([['Marca temporal'], [46336.5]])
  const [metadataUrl] = fetchRows.mock.calls[0]
  expect(new URL(metadataUrl).searchParams.get('fields')).toBe('sheets(properties(sheetId,title))')
  const [valuesUrl] = fetchRows.mock.calls[1]
  const url = new URL(valuesUrl)
  expect(decodeURIComponent(url.pathname)).toBe("/v4/spreadsheets/sheet-test/values/'Respuestas d''Academia / #1'")
  expect(Object.fromEntries(url.searchParams)).toMatchObject({
    majorDimension: 'ROWS', valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER',
  })
  for (const [requestUrl, request] of fetchRows.mock.calls) {
    expect(requestUrl).not.toContain('batchGetByDataFilter')
    expect(request.method ?? 'GET').toBe('GET')
    expect(request.body).toBeUndefined()
    expect(request.headers.Authorization).toBe('Bearer token')
    expect(request.redirect).toBe('error')
  }
})

it('no sustituye una pestaña eliminada por la primera y permite una pestaña vacía', async () => {
  const fetchRows = vi.fn().mockResolvedValueOnce(json({ sheets: [{ properties: { sheetId: 0, title: 'Otra' } }] }))
  vi.stubGlobal('fetch', fetchRows)
  await expect(readGoogleSheet({ spreadsheetId: 'id', sheetId: 19 }, 'token')).rejects.toThrow(/pestaña registrada ya no existe/)
  expect(fetchRows).toHaveBeenCalledTimes(1)
  fetchRows.mockResolvedValueOnce(json(metadata('Vacía'))).mockResolvedValueOnce(json({}))
  await expect(readGoogleSheet({ spreadsheetId: 'id', sheetId: 19 }, 'token')).resolves.toEqual([])
})

it.each([
  [403, 'ACCESS_TOKEN_SCOPE_INSUFFICIENT', /Google no concedió el permiso/],
  [403, 'SERVICE_DISABLED', /Habilita Google Sheets API/],
  [403, 'PERMISSION_DENIED', /debe tener acceso/],
  [404, 'NOT_FOUND', /debe tener acceso/],
  [401, 'UNAUTHENTICATED', /debe tener acceso/],
  [503, 'UNAVAILABLE', /No pudimos leer/],
])('distingue el error %s/%s sin mostrar mensajes ni credenciales de Google', async (status, reason, message) => {
  const fetchRows = vi.fn(async () => json({ error: { message: 'secret-token', details: [{ reason }] } }, status))
  vi.stubGlobal('fetch', fetchRows)
  await expect(readGoogleSheet({ spreadsheetId: 'id', sheetId: 19 }, 'token')).rejects.toThrow(message)
  expect(fetchRows).toHaveBeenCalledTimes(1)
})

it('atiende el rechazo de acceso al leer los valores después de resolver la pestaña', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(metadata('Respuestas')))
    .mockResolvedValueOnce(new Response(null, { status: 403 })))
  await expect(readGoogleSheet({ spreadsheetId: 'id', sheetId: 19 }, 'token')).rejects.toThrow(/debe tener acceso/)
})

it('cancela entre la consulta de pestañas y la lectura de respuestas', async () => {
  const controller = new AbortController()
  const fetchRows = vi.fn(async (_url, options) => {
    expect(options.signal).toBe(controller.signal)
    controller.abort()
    return json(metadata('Respuestas'))
  })
  vi.stubGlobal('fetch', fetchRows)
  await expect(readGoogleSheet({ spreadsheetId: 'id', sheetId: 19 }, 'token', controller.signal)).rejects.toHaveProperty('name', 'AbortError')
  expect(fetchRows).toHaveBeenCalledTimes(1)
})

it('requiere que el usuario conceda el permiso de lectura antes de usar el token', async () => {
  const oauth = {
    hasGrantedAllScopes: vi.fn(() => false),
    initTokenClient: vi.fn(({ callback }) => ({ requestAccessToken: () => callback({ access_token: 'token' }) })),
  }
  await expect(authorizeGoogleSheets(oauth, 'cliente')).rejects.toThrow(/autoriza la lectura/i)
  expect(oauth.initTokenClient).toHaveBeenCalledWith(expect.objectContaining({
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', include_granted_scopes: false,
  }))
  oauth.hasGrantedAllScopes.mockReturnValue(true)
  await expect(authorizeGoogleSheets(oauth, 'cliente')).resolves.toBe('token')
})
