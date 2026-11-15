import { useState } from 'react'
import { useTextos } from '../../../compartido/lib/idioma.jsx'
import { ROLES } from '../../lib/schema.js'
import { changePlatformMemberRole } from '../../lib/services/platformMembers.js'

const copy = {
  es: {
    change: 'Cambiar rol', role: 'Nuevo rol', save: 'Confirmar', cancel: 'Cancelar',
    protected: 'Rol protegido', conflict: 'El rol cambió. Recarga el directorio antes de volver a intentarlo.',
    error: 'No se pudo cambiar el rol. Los propietarios y administradores de plataforma están protegidos.',
  },
  en: {
    change: 'Change role', role: 'New role', save: 'Confirm', cancel: 'Cancel',
    protected: 'Protected role', conflict: 'The role changed. Refresh the directory before trying again.',
    error: 'The role could not be changed. Owners and platform administrators are protected.',
  },
}

export default function AdminMemberRole({ db, uid, member, labels, onSaved }) {
  const t = useTextos(copy)
  const [role, setRole] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const control = 'rounded-lg border border-line bg-surface px-3 py-2 text-sm disabled:opacity-50'

  async function submit(event) {
    event.preventDefault()
    if (saving || role === member.role) return
    setSaving(true)
    setError('')
    try {
      await changePlatformMemberRole(db, uid, { id: member.id, expectedRole: member.role, role })
      onSaved()
    } catch (err) {
      setError(err?.code === 'member/conflict' ? t.conflict : t.error)
    } finally {
      setSaving(false)
    }
  }

  if (!member.roleEditable || member.id === uid || !ROLES.includes(member.role)) return <span>{t.protected}</span>
  if (role === null) return (
    <button type="button" className={control} onClick={() => setRole(member.role)}
      aria-label={`${t.change} ${member.email}`}>{t.change}</button>
  )

  return (
    <form onSubmit={submit} className="grid min-w-40 gap-2">
      <label className="grid gap-1">{t.role}
        <select value={role} className={control} disabled={saving} onChange={event => setRole(event.target.value)}>
          {ROLES.map(value => <option key={value} value={value}>{labels[value]}</option>)}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={control} disabled={saving || role === member.role}>{t.save}</button>
        <button type="button" className={control} disabled={saving} onClick={() => {
          setRole(null)
          setError('')
        }}>{t.cancel}</button>
      </div>
    </form>
  )
}
