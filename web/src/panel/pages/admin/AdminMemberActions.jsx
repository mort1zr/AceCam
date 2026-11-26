import { useState } from 'react'
import { useTextos } from '../../../compartido/lib/idioma.jsx'
import { ROLES } from '../../lib/schema.js'
import { changePlatformMemberRole, changePlatformMemberSuspension } from '../../lib/services/platformMembers.js'

const copy = {
  es: {
    change: 'Cambiar rol', role: 'Nuevo rol', save: 'Confirmar', cancel: 'Cancelar',
    protected: 'Cuenta protegida', conflict: 'La cuenta cambió. Recarga el directorio antes de volver a intentarlo.',
    suspend: 'Suspender acceso', reactivate: 'Reactivar acceso',
    suspendDetail: 'La cuenta perderá acceso al panel y a los datos del equipo.',
    reactivateDetail: 'La cuenta recuperará los permisos de su rol en el equipo.',
    error: 'No se pudo guardar el cambio. Los propietarios y administradores de plataforma están protegidos.',
  },
  en: {
    change: 'Change role', role: 'New role', save: 'Confirm', cancel: 'Cancel',
    protected: 'Protected account', conflict: 'The account changed. Refresh the directory before trying again.',
    suspend: 'Suspend access', reactivate: 'Restore access',
    suspendDetail: 'The account will lose access to the dashboard and team data.',
    reactivateDetail: 'The account will regain the permissions of its team role.',
    error: 'The change could not be saved. Owners and platform administrators are protected.',
  },
}

export default function AdminMemberActions({ db, uid, member, labels, onSaved }) {
  const t = useTextos(copy)
  const [role, setRole] = useState(null)
  const [confirmAccess, setConfirmAccess] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const control = 'rounded-lg border border-line bg-surface px-3 py-2 text-sm disabled:opacity-50'
  const accessLabel = member.suspended ? t.reactivate : t.suspend

  async function submit(event) {
    event.preventDefault()
    if (saving || (!confirmAccess && role === member.role)) return
    setSaving(true)
    setError('')
    try {
      if (confirmAccess) {
        await changePlatformMemberSuspension(db, uid, {
          id: member.id, expectedSuspended: member.suspended, suspended: !member.suspended,
        })
      } else {
        await changePlatformMemberRole(db, uid, { id: member.id, expectedRole: member.role, role })
      }
      onSaved()
    } catch (err) {
      setError(err?.code === 'member/conflict' ? t.conflict : t.error)
    } finally {
      setSaving(false)
    }
  }

  if (!member.editable || member.id === uid || !ROLES.includes(member.role)) return <span>{t.protected}</span>
  if (role === null && !confirmAccess) return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={control} onClick={() => setRole(member.role)}
        aria-label={`${t.change} ${member.email}`}>{t.change}</button>
      <button type="button" className={control} onClick={() => setConfirmAccess(true)}
        aria-label={`${accessLabel} ${member.email}`}>{accessLabel}</button>
    </div>
  )

  return (
    <form onSubmit={submit} className="grid min-w-40 gap-2">
      {confirmAccess ? <p>{member.suspended ? t.reactivateDetail : t.suspendDetail}</p> : <label className="grid gap-1">{t.role}
        <select value={role} className={control} disabled={saving} onChange={event => setRole(event.target.value)}>
          {ROLES.map(value => <option key={value} value={value}>{labels[value]}</option>)}
        </select>
      </label>}
      {error && <p role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={control} disabled={saving || (!confirmAccess && role === member.role)}>{t.save}</button>
        <button type="button" className={control} disabled={saving} onClick={() => {
          setRole(null)
          setConfirmAccess(false)
          setError('')
        }}>{t.cancel}</button>
      </div>
    </form>
  )
}
