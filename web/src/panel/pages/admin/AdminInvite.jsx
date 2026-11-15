import { useState } from 'react'
import { useTextos } from '../../../compartido/lib/idioma.jsx'
import { enlaceInvitacion, invitarDesdePlataforma } from '../../lib/invitaciones.js'

const copy = {
  es: {
    title: 'Invitar miembro', organization: 'Organización', choose: 'Elige una organización', email: 'Correo',
    role: 'Rol', coach: 'Entrenador', admin: 'Administrador de equipo', save: 'Crear invitación',
    share: 'Comparte este enlace con la persona invitada.', link: 'Enlace de invitación',
    error: 'No pudimos crear la invitación. Comprueba que el equipo esté activo y el correo no tenga ya una invitación.',
  },
  en: {
    title: 'Invite member', organization: 'Organization', choose: 'Choose an organization', email: 'Email',
    role: 'Role', coach: 'Coach', admin: 'Team administrator', save: 'Create invitation',
    share: 'Share this link with the invited person.', link: 'Invitation link',
    error: 'We could not create the invitation. Check that the team is active and the email does not already have an invitation.',
  },
}

export default function AdminInvite({ db, uid, organizations }) {
  const t = useTextos(copy)
  const [orgId, setOrgId] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('coach')
  const [link, setLink] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const active = organizations.filter(org => !org.archived)
  const selected = active.some(org => org.id === orgId) ? orgId : ''
  const control = 'rounded-lg border border-line bg-surface px-3 py-2 text-sm'

  async function submit(event) {
    event.preventDefault()
    if (!selected || saving) return
    setSaving(true)
    setLink('')
    setError('')
    try {
      const recipient = await invitarDesdePlataforma({ db, uid, orgId: selected, email, role })
      setLink(enlaceInvitacion(window.location.origin, recipient))
      setEmail('')
    } catch {
      setError(t.error)
    } finally {
      setSaving(false)
    }
  }

  if (!active.length) return null
  return (
    <section className="grid gap-3 rounded-xl border border-line bg-surface p-4">
      <h2 className="font-semibold">{t.title}</h2>
      <form onSubmit={submit} className="grid gap-3">
        <fieldset disabled={saving} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1">{t.organization}
            <select required className={control} value={selected} onChange={event => setOrgId(event.target.value)}>
              <option value="">{t.choose}</option>
              {active.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1">{t.email}
            <input required type="email" autoComplete="off" className={control} value={email}
              onChange={event => setEmail(event.target.value)} />
          </label>
          <label className="grid gap-1">{t.role}
            <select className={control} value={role} onChange={event => setRole(event.target.value)}>
              <option value="coach">{t.coach}</option>
              <option value="admin">{t.admin}</option>
            </select>
          </label>
          <button type="submit" className={control}>{t.save}</button>
        </fieldset>
      </form>
      {error && <p role="alert">{error}</p>}
      {link && (
        <label className="grid gap-1">
          <span role="status">{t.share}</span>
          <input readOnly aria-label={t.link} className={control} value={link} onFocus={event => event.target.select()} />
        </label>
      )}
    </section>
  )
}
