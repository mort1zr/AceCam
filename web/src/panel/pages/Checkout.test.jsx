// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAuth } from '../context/AuthContext.js'
import { usePruebaDisponible } from '../hooks/usePruebaDisponible.js'
import Checkout from './Checkout.jsx'
import enlaces from '../lib/stripeEnlaces.json'

vi.mock('../context/AuthContext.js', () => ({ useAuth: vi.fn() }))
vi.mock('../hooks/usePruebaDisponible.js', () => ({ usePruebaDisponible: vi.fn() }))
vi.mock('../../compartido/components/ControlsPill.jsx', () => ({ default: () => null }))
vi.mock('../../compartido/hooks/useAterrizaje.js', () => ({ useAterrizaje: () => ({}) }))
vi.mock('../../compartido/lib/idioma.jsx', () => ({ useIdioma: () => ({ idioma: 'es' }), useTextos: t => t.es }))

beforeEach(() => {
  useAuth.mockReturnValue({ user: { uid: 'u1' }, profile: { orgId: 'org-1' }, loading: false })
  usePruebaDisponible.mockReturnValue(true)
  window.scrollTo = vi.fn()
})
afterEach(cleanup)

function volverDeStripe(contratar, url = '/checkout?pago=ok&plan=pro&ciclo=anual&sesion=cs_test_1') {
  render(<MemoryRouter initialEntries={[url]}><Checkout contratar={contratar} session={{ orgId: 'org-1' }} /></MemoryRouter>)
}

it('lleva a Stripe con el enlace del plan y periodo, y la organización como referencia', () => {
  const irA = vi.fn()
  render(<MemoryRouter initialEntries={['/checkout?plan=pro&ciclo=anual']}><Checkout session={{ orgId: 'org-1' }} irA={irA} /></MemoryRouter>)
  fireEvent.submit(document.getElementById('checkout-pago'))
  const destino = new URL(irA.mock.calls[0][0])
  expect(destino.origin + destino.pathname).toBe(enlaces.pro.anual.url)
  expect(destino.searchParams.get('client_reference_id')).toBe('org-1')
})

it('Básico usa el enlace con prueba solo si la organización aún no la usó', () => {
  const irA = vi.fn()
  render(<MemoryRouter initialEntries={['/checkout?plan=basico']}><Checkout session={{ orgId: 'org-1' }} irA={irA} /></MemoryRouter>)
  fireEvent.submit(document.getElementById('checkout-pago'))
  expect(irA.mock.calls[0][0].startsWith(enlaces.basico.mensual.urlPrueba)).toBe(true)
  cleanup()
  usePruebaDisponible.mockReturnValue(false)
  render(<MemoryRouter initialEntries={['/checkout?plan=basico']}><Checkout session={{ orgId: 'org-1' }} irA={irA} /></MemoryRouter>)
  fireEvent.submit(document.getElementById('checkout-pago'))
  expect(irA.mock.calls[1][0].startsWith(enlaces.basico.mensual.url)).toBe(true)
})

it('al volver de Stripe guarda el plan y periodo pagados y muestra la confirmación', async () => {
  const contratar = vi.fn().mockResolvedValue('pro')
  volverDeStripe(contratar)
  expect(await screen.findByText('Tu plan Pro está activo')).toBeTruthy()
  expect(screen.getByText('Stripe · modo prueba')).toBeTruthy()
  expect(contratar).toHaveBeenCalledExactlyOnceWith({ plan: 'pro', periodo: 'anual' })
})

it('Básico muestra el mes de prueba solo si se guardó como prueba', async () => {
  volverDeStripe(vi.fn().mockResolvedValue('basico'), '/checkout?pago=ok&plan=basico')
  expect(await screen.findByText('Ya puedes entrar al panel y empezar a analizar partidos.')).toBeTruthy()
  cleanup()
  volverDeStripe(vi.fn().mockResolvedValue('prueba'), '/checkout?pago=ok&plan=basico')
  expect(await screen.findByText('Tu mes de prueba ya empezó.')).toBeTruthy()
})

it('espera a tener la organización de la sesión antes de activar el plan', async () => {
  const contratar = vi.fn().mockResolvedValue('pro')
  const url = '/checkout?pago=ok&plan=pro&ciclo=mensual'
  const { rerender } = render(<MemoryRouter initialEntries={[url]}><Checkout contratar={contratar} /></MemoryRouter>)
  expect(contratar).not.toHaveBeenCalled()
  rerender(<MemoryRouter initialEntries={[url]}><Checkout contratar={contratar} session={{ orgId: 'org-1' }} /></MemoryRouter>)
  expect(await screen.findByText('Tu plan Pro está activo')).toBeTruthy()
  expect(contratar).toHaveBeenCalledOnce()
})

it('si no se puede guardar el plan al volver, avisa', async () => {
  volverDeStripe(vi.fn().mockRejectedValue(new Error('permission-denied')))
  expect((await screen.findByRole('alert')).textContent).toContain('No pudimos activar el plan')
  expect(screen.queryByText(/está activo/)).toBeNull()
})

it('Básico ofrece la prueba gratis a una organización que todavía no la usó (PCIT-172)', () => {
  render(<MemoryRouter initialEntries={['/checkout?plan=basico']}><Checkout session={{ orgId: 'org-1' }} /></MemoryRouter>)
  expect(usePruebaDisponible).toHaveBeenCalledWith(undefined, 'org-1')
  expect(screen.getAllByText('1 mes de prueba gratis').length).toBeGreaterThan(0)
  expect(screen.getByRole('button', { name: /Empezar prueba gratis/ })).toBeTruthy()
})

it('Básico se cobra sin prueba si la organización ya contrató antes (PCIT-172)', () => {
  usePruebaDisponible.mockReturnValue(false)
  render(<MemoryRouter initialEntries={['/checkout?plan=basico']}><Checkout session={{ orgId: 'org-1' }} /></MemoryRouter>)
  expect(screen.queryByText('1 mes de prueba gratis')).toBeNull()
  expect(screen.queryByRole('button', { name: /Empezar prueba gratis/ })).toBeNull()
  expect(screen.getByRole('button', { name: /Pagar con Stripe/ })).toBeTruthy()
})
