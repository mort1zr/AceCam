import { useState } from 'react'
import { useTextos } from '../../compartido/lib/idioma.jsx'
import { useAuth } from '../context/AuthContext.js'
import { authErrorMessage } from '../lib/auth.js'

// Cuenta con sesión y sin ficha en users (PCIT-220). Pasa al registrarse con una
// invitación: hasta verificar el correo, las reglas no dejan leer ni aceptar la
// invitación. Aquí se explica, se reenvía el correo y se termina la unión al club.

const textos = {
  es: {
    titulo: 'Verifica tu correo',
    descripcion: correo => `Te enviamos un enlace a ${correo}. Ábrelo para confirmar que el correo es tuyo y luego vuelve aquí para unirte a tu equipo.`,
    verificado: 'Tu correo ya está verificado. Termina de unirte a tu equipo.',
    continuar: 'Ya verifiqué mi correo',
    uniendo: 'Uniéndote al equipo…',
    reenviar: 'Reenviar el correo',
    reenviado: 'Te enviamos otro correo. Revisa también la carpeta de spam.',
    salir: 'Cerrar sesión',
  },
  en: {
    titulo: 'Verify your email',
    descripcion: correo => `We sent a link to ${correo}. Open it to confirm the email is yours, then come back here to join your team.`,
    verificado: 'Your email is verified. Finish joining your team.',
    continuar: 'I already verified my email',
    uniendo: 'Joining the team…',
    reenviar: 'Resend the email',
    reenviado: 'We sent another email. Check your spam folder too.',
    salir: 'Sign out',
  },
}

const destinoVerificacion = () => (typeof window === 'undefined' ? undefined : `${window.location.origin}/inicio`)

export default function VerificarCorreo() {
  const t = useTextos(textos)
  const { user, completeInvitedSignup, resendVerification, logout } = useAuth()
  const [estado, setEstado] = useState({ ocupado: false, aviso: '', error: '' })

  async function ejecutar(accion, aviso = '') {
    setEstado({ ocupado: true, aviso: '', error: '' })
    try {
      await accion()
      setEstado({ ocupado: false, aviso, error: '' })
    } catch (error) {
      setEstado({ ocupado: false, aviso: '', error: authErrorMessage(error) })
    }
  }

  const continuar = () => ejecutar(() => completeInvitedSignup())
  const reenviar = () => ejecutar(() => resendVerification({ continueUrl: destinoVerificacion() }), t.reenviado)

  return (
    <div className="grid min-h-dvh place-content-center bg-bg px-4">
      <section className="ac-ui ac-feedback max-w-md" aria-labelledby="verificar-correo-titulo">
        <h1 id="verificar-correo-titulo" className="ac-feedback__title">{t.titulo}</h1>
        <p className="ac-feedback__description">
          {user?.emailVerified ? t.verificado : t.descripcion(user?.email ?? '')}
        </p>
        {estado.error ? <p role="alert" className="text-sm text-bad">{estado.error}</p> : null}
        {estado.aviso ? <p role="status" className="text-sm text-muted">{estado.aviso}</p> : null}
        <div className="flex flex-wrap justify-center gap-2">
          <button className="ac-button" type="button" onClick={continuar} disabled={estado.ocupado}>
            {estado.ocupado ? t.uniendo : t.continuar}
          </button>
          {user?.emailVerified ? null : (
            <button className="ac-button" type="button" onClick={reenviar} disabled={estado.ocupado}>{t.reenviar}</button>
          )}
          <button className="ac-button" type="button" onClick={logout} disabled={estado.ocupado}>{t.salir}</button>
        </div>
      </section>
    </div>
  )
}
