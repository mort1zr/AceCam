import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../context/AuthContext.js'
import VerificarCorreo from './VerificarCorreo.jsx'

// Rutas privadas (PCIT-21): sin sesión, al login; al volver, a la página que pedía.
export default function RequireAuth() {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <div aria-busy="true" className="min-h-dvh bg-bg" />

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />

  // Cuenta sin ficha en users: falta verificar el correo de la invitación (PCIT-220)
  // o el registro no terminó. Desde ahí se verifica, se une al club o se cierra sesión.
  if (!profile) return <VerificarCorreo />

  return <Outlet />
}
