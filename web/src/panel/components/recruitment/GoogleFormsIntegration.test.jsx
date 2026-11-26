// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import * as google from '../../lib/googleSheets.js'
import * as sourceService from '../../lib/services/googleFormsSource.js'
import { importGoogleFormApplications } from '../../lib/services/googleFormsRecruitment.js'
import GoogleFormsIntegration from './GoogleFormsIntegration.jsx'

vi.mock('../../lib/googleSheets.js')
vi.mock('../../lib/services/googleFormsRecruitment.js')
vi.mock('../../lib/services/googleFormsSource.js', async importOriginal => ({
  ...await importOriginal(),
  loadGoogleFormsSource: vi.fn(),
  saveGoogleFormsSource: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

const db = {}
const source = { formUrl: 'https://forms.gle/RespuestaDePrueba', spreadsheetId: 'id-privado', sheetId: 19 }

it('registra la pestaña, autoriza Google e importa las respuestas válidas', async () => {
  vi.stubEnv('VITE_GOOGLE_SHEETS_CLIENT_ID', 'acecam.apps.googleusercontent.com')
  const oauth = {}
  const user = userEvent.setup()
  sourceService.loadGoogleFormsSource.mockResolvedValue(null)
  sourceService.saveGoogleFormsSource.mockResolvedValue(undefined)
  google.loadGoogleSheetsAuthorization.mockResolvedValue(oauth)
  google.authorizeGoogleSheets.mockResolvedValue('token-temporal')
  google.readGoogleSheet.mockResolvedValue([
    ['Timestamp', 'Nombre completo', 'Fecha de nacimiento', 'Ciudad', 'Correo de contacto', 'Año de graduación', 'Autorización'],
    [46336.5, 'Persona Demo', '2000-01-01', 'Lima', 'demo@example.test', 2028, 'Sí, autorizo'],
    [46336.6, 'Otra persona', '2000-01-01', 'Lima', 'otro@example.test', 2028, 'No'],
  ])
  importGoogleFormApplications.mockResolvedValue({ imported: 1, existing: 0, failed: [] })

  render(<GoogleFormsIntegration db={db} orgId="org-a" uid="owner-a" />)
  const formUrl = screen.getByLabelText('Enlace del formulario')
  await waitFor(() => expect(formUrl.disabled).toBe(false))
  await user.type(formUrl, source.formUrl)
  await user.type(screen.getByLabelText('Enlace de la pestaña de respuestas'), 'https://docs.google.com/spreadsheets/d/id-privado/edit#gid=19')
  await user.click(screen.getByRole('button', { name: 'Guardar enlaces' }))
  expect(sourceService.saveGoogleFormsSource).toHaveBeenCalledWith(db, 'org-a', source)
  await user.click(await screen.findByRole('button', { name: 'Sincronizar con Google Sheets' }))
  expect(await screen.findByText('Nuevas: 1. Ya importadas: 0. Filas para revisar: 1.')).toBeTruthy()
  expect(screen.getByText(/Fila 3.*autorización/)).toBeTruthy()
  expect(google.authorizeGoogleSheets).toHaveBeenCalledWith(oauth, 'acecam.apps.googleusercontent.com')
  expect(google.readGoogleSheet).toHaveBeenCalledWith(source, 'token-temporal', expect.any(AbortSignal))
  expect(importGoogleFormApplications).toHaveBeenCalledWith(db, expect.objectContaining({
    orgId: 'org-a', uid: 'owner-a', rows: [expect.objectContaining({ number: 2 })],
  }))
})

it('muestra la falta de acceso a la hoja y conserva el formulario registrado', async () => {
  vi.stubEnv('VITE_GOOGLE_SHEETS_CLIENT_ID', 'acecam.apps.googleusercontent.com')
  sourceService.loadGoogleFormsSource.mockResolvedValue(source)
  google.loadGoogleSheetsAuthorization.mockResolvedValue({})
  google.authorizeGoogleSheets.mockResolvedValue('token-temporal')
  google.readGoogleSheet.mockRejectedValue(new Error('La cuenta de Google debe tener acceso a la hoja.'))
  const user = userEvent.setup()
  render(<GoogleFormsIntegration db={db} orgId="org-a" uid="owner-a" />)
  await user.click(await screen.findByRole('button', { name: 'Sincronizar con Google Sheets' }))
  expect((await screen.findByRole('alert')).textContent).toContain('debe tener acceso')
  expect(screen.getByRole('link', { name: 'Abrir formulario' }).getAttribute('href')).toBe(source.formUrl)
  expect(importGoogleFormApplications).not.toHaveBeenCalled()
})
