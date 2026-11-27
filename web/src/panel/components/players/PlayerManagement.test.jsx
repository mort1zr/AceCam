// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import PlayerProfile from './PlayerProfile.jsx'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:foto-test'), revokeObjectURL: vi.fn() }))
})
const player = { id: 'p1', orgId: 'org-a', createdBy: 'coach', fullName: 'Jugador de prueba', birthDate: '2010-01-01', utr: 10,
  guardian: { name: 'Apoderado de prueba', phone: '999999999', email: 'guardian@example.test' } }
const service = () => ({ mode: 'live', canViewProfile: () => true, subscribeAnalyzedMatches: (_p, receive) => { receive([]); return () => {} }, update: vi.fn(), remove: vi.fn() })
const photo = (name = 'foto.jpg', type = 'image/jpeg') => new File(['contenido'], name, { type })

it('valida la edición y conserva el borrador cuando falla el guardado', async () => {
  const api = service()
  api.update.mockRejectedValueOnce({ code: 'unavailable' }).mockResolvedValueOnce(player)
  const user = userEvent.setup()
  render(<PlayerProfile player={player} service={api} onBack={() => {}} />)
  await user.click(screen.getByRole('button', { name: 'Editar jugador' }))
  const name = screen.getByLabelText('Nombre completo *')
  await user.clear(name)
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  expect(api.update).not.toHaveBeenCalled()
  await user.type(name, 'Nombre nuevo')
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(name.value).toBe('Nombre nuevo')
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  expect(await screen.findByRole('button', { name: 'Editar jugador' })).toBeTruthy()
  expect(api.update).toHaveBeenCalledTimes(2)
  expect(api.update.mock.calls[1][0]).toBe(player)
  expect(api.update.mock.calls[1][1]).toMatchObject({ fullName: 'Nombre nuevo', guardianEmail: 'guardian@example.test' })
})

it('pide confirmación antes de retirar al jugador, permite cancelar y reintentar un fallo', async () => {
  const api = service()
  api.remove.mockRejectedValueOnce({ code: 'unavailable' }).mockResolvedValueOnce()
  const back = vi.fn()
  const user = userEvent.setup()
  render(<PlayerProfile player={player} service={api} onBack={back} />)
  const open = () => user.click(screen.getByRole('button', { name: 'Eliminar de la lista' }))
  await open()
  const dialog = () => within(screen.getByRole('alertdialog'))
  expect(api.remove).not.toHaveBeenCalled()
  expect(dialog().getByText(/Sus partidos, videos, datos y notas se conservarán/)).toBeTruthy()
  expect(document.activeElement).toBe(dialog().getByRole('button', { name: 'Cancelar' }))
  await user.click(dialog().getByRole('button', { name: 'Cancelar' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Eliminar de la lista' }))
  await open()
  await user.click(dialog().getByRole('button', { name: 'Confirmar eliminación' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  await user.click(dialog().getByRole('button', { name: 'Confirmar eliminación' }))
  expect(back).toHaveBeenCalledTimes(1)
  expect(api.remove).toHaveBeenCalledTimes(2)
})

it('sube la foto de perfil, la guarda en la ficha y refleja el cambio cuando llega de la suscripción', async () => {
  const api = service()
  api.updatePhoto = vi.fn().mockResolvedValue({ ...player, photoPath: 'players/p1/media/photo-abc12345' })
  const photoUploadService = { uploadPlayerPhoto: vi.fn().mockResolvedValue('players/p1/media/photo-abc12345'), removePlayerPhoto: vi.fn() }
  const photoService = { load: vi.fn().mockResolvedValue(new Blob(['foto'])) }
  const user = userEvent.setup()
  const props = { service: api, actorId: 'coach', photoService, photoUploadService, onBack: () => {} }
  const { rerender } = render(<PlayerProfile player={player} {...props} />)
  await user.upload(screen.getByLabelText('Subir foto'), photo())
  expect(photoUploadService.uploadPlayerPhoto).toHaveBeenCalledWith(expect.objectContaining({ file: expect.any(File), orgId: 'org-a', actorId: 'coach', playerId: 'p1' }))
  expect(api.updatePhoto).toHaveBeenCalledWith(player, 'players/p1/media/photo-abc12345')
  expect(photoUploadService.removePlayerPhoto).not.toHaveBeenCalled()
  // La suscripción en vivo trae el photoPath nuevo; el perfil se vuelve a renderizar con el jugador actualizado.
  rerender(<PlayerProfile player={{ ...player, photoPath: 'players/p1/media/photo-abc12345' }} {...props} />)
  expect(await screen.findByRole('button', { name: 'Quitar foto' })).toBeTruthy()
})

it('muestra un error si la subida de la foto falla', async () => {
  const api = service()
  api.updatePhoto = vi.fn()
  const photoUploadService = { uploadPlayerPhoto: vi.fn().mockRejectedValue({ code: 'permission-denied' }), removePlayerPhoto: vi.fn() }
  const photoService = { load: vi.fn() }
  const user = userEvent.setup()
  render(<PlayerProfile player={player} service={api} actorId="coach" photoService={photoService} photoUploadService={photoUploadService} onBack={() => {}} />)
  await user.upload(screen.getByLabelText('Subir foto'), photo())
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('No tienes permiso para cambiar la foto de este jugador.')
  expect(api.updatePhoto).not.toHaveBeenCalled()
})

it('rechaza un formato no permitido sin llamar al servicio', async () => {
  const api = service()
  api.updatePhoto = vi.fn()
  const photoUploadService = { uploadPlayerPhoto: vi.fn(), removePlayerPhoto: vi.fn() }
  const photoService = { load: vi.fn() }
  render(<PlayerProfile player={player} service={api} actorId="coach" photoService={photoService} photoUploadService={photoUploadService} onBack={() => {}} />)
  const input = screen.getByLabelText('Subir foto')
  // fireEvent (no userEvent.upload) para evitar que el filtro "accept" del navegador
  // descarte el archivo antes de que el componente llegue a validarlo.
  fireEvent.change(input, { target: { files: [photo('foto.gif', 'image/gif')] } })
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('.jpg, .png o .webp')
  expect(photoUploadService.uploadPlayerPhoto).not.toHaveBeenCalled()
})

it('quita una foto existente, borra el archivo anterior y refleja el cambio cuando llega de la suscripción', async () => {
  const withPhoto = { ...player, photoPath: 'players/p1/media/photo-abc12345' }
  const api = service()
  api.updatePhoto = vi.fn().mockResolvedValue({ ...withPhoto, photoPath: undefined })
  const photoUploadService = { uploadPlayerPhoto: vi.fn(), removePlayerPhoto: vi.fn().mockResolvedValue() }
  const photoService = { load: vi.fn().mockResolvedValue(new Blob(['foto'])) }
  const user = userEvent.setup()
  const props = { service: api, actorId: 'coach', photoService, photoUploadService, onBack: () => {} }
  const { rerender } = render(<PlayerProfile player={withPhoto} {...props} />)
  await screen.findByRole('button', { name: 'Quitar foto' })
  await user.click(screen.getByRole('button', { name: 'Quitar foto' }))
  expect(api.updatePhoto).toHaveBeenCalledWith(withPhoto, null)
  expect(photoUploadService.removePlayerPhoto).toHaveBeenCalledWith('players/p1/media/photo-abc12345')
  rerender(<PlayerProfile player={{ ...withPhoto, photoPath: undefined }} {...props} />)
  expect(await screen.findByLabelText('Subir foto')).toBeTruthy()
})

it('no muestra controles de foto sin permiso para editar al jugador', () => {
  const api = service()
  api.updatePhoto = vi.fn()
  api.canViewProfile = () => false
  const photoUploadService = { uploadPlayerPhoto: vi.fn(), removePlayerPhoto: vi.fn() }
  render(<PlayerProfile player={player} service={api} actorId="coach" photoService={{ load: vi.fn() }} photoUploadService={photoUploadService} onBack={() => {}} />)
  expect(screen.queryByLabelText('Subir foto')).toBeNull()
})
