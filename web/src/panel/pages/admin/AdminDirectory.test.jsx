// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getDocFromServer, getDocsFromServer } from 'firebase/firestore'
import { afterEach, expect, it, vi } from 'vitest'
import { usagePeriod } from '../../lib/usage.js'
import { savePlatformOrganization } from '../../lib/services/platformOrganizations.js'
import AdminDirectory from './AdminDirectory.jsx'

vi.mock('../../lib/firebase.js', () => ({ db: {} }))
vi.mock('../../context/AuthContext.js', () => ({ useAuth: () => ({ user: { uid: 'platform' } }) }))
vi.mock('../../lib/services/platformOrganizations.js', () => ({ savePlatformOrganization: vi.fn() }))
vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => name,
  doc: (_db, ...parts) => parts.join('/'),
  getDocFromServer: vi.fn(),
  getDocsFromServer: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

const record = (id, fields) => ({ id, data: () => fields, exists: () => fields !== undefined })

it('muestra miembros, uso mensual y altas a partir de lecturas de Firestore', async () => {
  getDocsFromServer.mockImplementation(async name => ({ docs: name === 'orgs'
    ? [record('club', { name: 'Club', plan: 'pro' }), record('equipo', { name: 'Equipo', plan: 'ultra' })]
    : [
        record('coach', { email: 'coach@example.test', orgId: 'equipo', role: 'coach', createdAt: { toDate: () => new Date('2026-11-01') } }),
        record('admin', { email: 'admin@example.test', orgId: 'equipo', role: 'admin' }),
      ] }))
  const period = usagePeriod()
  getDocFromServer.mockImplementation(async path => record(period, path.startsWith('orgs/equipo/') ? { analyses: 7 } : undefined))
  render(<AdminDirectory />)
  const organizations = await screen.findByRole('table', { name: 'Organizaciones' })
  const users = screen.getByRole('table', { name: 'Usuarios' })
  const cells = table => within(table).getAllByRole('row').slice(1).map(row => Array.from(row.cells, cell => cell.textContent))

  expect(getDocFromServer.mock.calls).toEqual([[`orgs/club/usage/${period}`], [`orgs/equipo/usage/${period}`]])
  expect(cells(organizations)).toEqual([
    ['Club', 'Pro', '0', '0', 'Activa', 'EditarArchivar'],
    ['Equipo', 'Ultra', '2', '7', 'Activa', 'EditarArchivar'],
  ])
  const date = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date('2026-11-01'))
  expect(cells(users)).toEqual([
    ['admin@example.test', 'Equipo', 'Administrador de equipo', '—'],
    ['coach@example.test', 'Equipo', 'Entrenador', date],
  ])
  expect(screen.getByRole('button', { name: 'Crear organización' })).toBeTruthy()
})

it('permite reintentar una consulta fallida y muestra un directorio vacío', async () => {
  getDocsFromServer.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue({ docs: [] })
  render(<AdminDirectory />)
  expect(await screen.findByText('No pudimos cargar los datos de administración.')).toBeTruthy()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findAllByText('Todavía no hay registros')).toHaveLength(2)
  expect(getDocFromServer).not.toHaveBeenCalled()
})

it('guarda una nueva organización y exige confirmar el archivo', async () => {
  let rows = []
  getDocsFromServer.mockImplementation(async name => ({ docs: name === 'orgs' ? rows : [] }))
  getDocFromServer.mockResolvedValue(record(usagePeriod(), undefined))
  savePlatformOrganization.mockImplementation(async (_db, _uid, changes) => {
    rows = [record('nuevo', { name: 'Club Nuevo', plan: 'pro', ...changes })]
    return 'nuevo'
  })
  const user = userEvent.setup()
  render(<AdminDirectory />)
  await screen.findAllByText('Todavía no hay registros')
  await user.click(screen.getByRole('button', { name: 'Crear organización' }))
  await user.type(screen.getByLabelText('Nombre'), 'Club Nuevo')
  await user.selectOptions(screen.getByLabelText('Plan'), 'pro')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  await user.click(await screen.findByRole('button', { name: 'Archivar Club Nuevo' }))
  expect(savePlatformOrganization).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: 'Archivar', exact: true }))
  expect(savePlatformOrganization).toHaveBeenLastCalledWith({}, 'platform', { id: 'nuevo', archived: true })
  expect(await screen.findByRole('button', { name: 'Reactivar Club Nuevo' })).toBeTruthy()
})
