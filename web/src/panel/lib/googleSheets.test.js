import { afterEach, expect, it, vi } from 'vitest'
import { authorizeGoogleSheets, readGoogleSheet } from './googleSheets.js'

afterEach(() => vi.unstubAllGlobals())

it('lee solo la pestaña elegida y pide a Sheets que entregue fechas como números', async () => {
  const fetchRows = vi.fn(async () => new Response(JSON.stringify({
    valueRanges: [{ valueRange: { values: [['Marca temporal'], [46336.5]] } }],
  })))
  vi.stubGlobal('fetch', fetchRows)
  const source = { spreadsheetId: 'sheet-test', sheetId: 19 }
  await expect(readGoogleSheet(source, 'token')).resolves.toEqual([['Marca temporal'], [46336.5]])
  const [url, request] = fetchRows.mock.calls[0]
  expect(url).toBe('https://sheets.googleapis.com/v4/spreadsheets/sheet-test/values:batchGetByDataFilter')
  expect(request.headers.Authorization).toBe('Bearer token')
  expect(JSON.parse(request.body)).toMatchObject({
    dataFilters: [{ gridRange: { sheetId: 19 } }], valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER',
  })
  fetchRows.mockResolvedValueOnce(new Response(null, { status: 403 }))
  await expect(readGoogleSheet(source, 'token')).rejects.toThrow(/debe tener acceso/)
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
