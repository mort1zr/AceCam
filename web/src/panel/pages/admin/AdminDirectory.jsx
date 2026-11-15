import { useEffect, useState } from 'react'
import { useTextos } from '../../../compartido/lib/idioma.jsx'
import { DataTable } from '../../components/ui'
import { useAuth } from '../../context/AuthContext.js'
import { db } from '../../lib/firebase.js'
import { loadAdminDirectory } from '../../lib/services/firestoreAdminDirectory.js'
import { savePlatformOrganization } from '../../lib/services/platformOrganizations.js'
import AdminInvite from './AdminInvite.jsx'
import AdminMemberActions from './AdminMemberActions.jsx'

const copy = {
  es: {
    locale: 'es-PE', organizations: 'Organizaciones', users: 'Usuarios', name: 'Nombre', plan: 'Plan',
    members: 'Miembros', used: 'Análisis usados', email: 'Correo', org: 'Organización', role: 'Rol',
    created: 'Fecha de alta', error: 'No pudimos cargar los datos de administración.',
    add: 'Crear organización', edit: 'Editar', archive: 'Archivar', restore: 'Reactivar', status: 'Estado',
    archived: 'Archivada', active: 'Activa', actions: 'Acciones', save: 'Guardar', cancel: 'Cancelar',
    suspended: 'Suspendido', memberActive: 'Activo',
    confirmArchive: 'Se conservará el historial y se bloquearán las nuevas invitaciones y análisis.',
    confirmRestore: 'La organización podrá volver a invitar y analizar según su plan.',
    saveError: 'No pudimos guardar los cambios. Vuelve a intentarlo.',
    plans: { free: 'Sin plan', prueba: 'Prueba de Básico', basico: 'Básico', pro: 'Pro', ultra: 'Ultra' },
    roles: { coach: 'Entrenador', admin: 'Administrador de equipo' },
  },
  en: {
    locale: 'en', organizations: 'Organizations', users: 'Users', name: 'Name', plan: 'Plan',
    members: 'Members', used: 'Analyses used', email: 'Email', org: 'Organization', role: 'Role',
    created: 'Joined on', error: 'We could not load the administration data.',
    add: 'Create organization', edit: 'Edit', archive: 'Archive', restore: 'Reactivate', status: 'Status',
    archived: 'Archived', active: 'Active', actions: 'Actions', save: 'Save', cancel: 'Cancel',
    suspended: 'Suspended', memberActive: 'Active',
    confirmArchive: 'History is retained and new invitations and analyses are blocked.',
    confirmRestore: 'The organization can invite members and analyze videos again within its plan.',
    saveError: 'We could not save the changes. Try again.',
    plans: { free: 'No plan', prueba: 'Basic trial', basico: 'Basic', pro: 'Pro', ultra: 'Ultra' },
    roles: { coach: 'Coach', admin: 'Team administrator' },
  },
}

export default function AdminDirectory() {
  const t = useTextos(copy)
  const { user } = useAuth()
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [editor, setEditor] = useState(null)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState(false)
  useEffect(() => {
    let active = true
    loadAdminDirectory(db).then(
      data => { if (active) setResult(data) },
      () => { if (active) setResult({ failed: true }) },
    )
    return () => { active = false }
  }, [attempt])

  function retry() {
    setResult(null)
    setAttempt(current => current + 1)
  }

  function openEditor(row) {
    setSaveError(false)
    setEditor(row)
  }

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setSaveError(false)
    try {
      await savePlatformOrganization(db, user.uid, editor.confirm
        ? { id: editor.id, archived: !editor.archived }
        : { id: editor.id, name: editor.name, plan: editor.plan })
      setEditor(null)
      retry()
    } catch {
      setSaveError(true)
    } finally {
      setBusy(false)
    }
  }

  const control = 'rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50'
  const archiveLabel = row => row.archived ? t.restore : t.archive

  const date = new Intl.DateTimeFormat(t.locale, { dateStyle: 'medium', timeZone: 'UTC' })
  const month = result?.period
    ? new Intl.DateTimeFormat(t.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(result.period + '-01T00:00:00Z'))
    : ''
  const organizations = [
    { key: 'name', label: t.name },
    { key: 'plan', label: t.plan, render: plan => Object.hasOwn(t.plans, plan) ? t.plans[plan] : (plan || '—') },
    { key: 'members', label: t.members, align: 'right' },
    { key: 'analyses', label: month ? `${t.used} · ${month}` : t.used, align: 'right' },
    { key: 'archived', label: t.status, render: archived => archived ? t.archived : t.active },
    { key: 'actions', label: t.actions, render: (_, row) => (
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={Boolean(editor)} className={control} onClick={() => openEditor(row)}
          aria-label={`${t.edit} ${row.name}`}>{t.edit}</button>
        <button type="button" disabled={Boolean(editor)} className={control} onClick={() => openEditor({ ...row, confirm: true })}
          aria-label={`${archiveLabel(row)} ${row.name}`}>{archiveLabel(row)}</button>
      </div>
    ) },
  ]
  const users = [
    { key: 'email', label: t.email },
    { key: 'organization', label: t.org },
    { key: 'role', label: t.role, render: role => Object.hasOwn(t.roles, role) ? t.roles[role] : (role || '—') },
    { key: 'createdAt', label: t.created, render: value => {
      const created = value?.toDate?.()
      return Number.isFinite(created?.getTime()) ? date.format(created) : '—'
    } },
    { key: 'suspended', label: t.status, render: value => value ? t.suspended : t.memberActive },
    { key: 'actions', label: t.actions, render: (_, member) => (
      <AdminMemberActions db={db} uid={user.uid} member={member} labels={t.roles} onSaved={retry} />
    ) },
  ]

  if (result?.failed) return <DataTable caption={t.organizations} columns={organizations} error={t.error} onRetry={retry} />
  return (
    <div className="grid min-w-0 gap-5">
      {!editor && <button type="button" disabled={!result} className={`${control} justify-self-start`}
        onClick={() => openEditor({ name: '', plan: 'free' })}>{t.add}</button>}
      {editor && (
        <form onSubmit={save} className="grid max-w-lg gap-3 rounded-xl border border-line bg-surface p-4">
          <h2 className="font-semibold">{editor.confirm ? `${archiveLabel(editor)} ${editor.name}` : editor.id ? `${t.edit} ${editor.name}` : t.add}</h2>
          {editor.confirm ? <p>{editor.archived ? t.confirmRestore : t.confirmArchive}</p> : (
            <>
              <label className="grid gap-1">{t.name}
                <input className={control} disabled={busy} required minLength={2} maxLength={120} value={editor.name}
                  onChange={event => setEditor({ ...editor, name: event.target.value })} />
              </label>
              <label className="grid gap-1">{t.plan}
                <select className={`${control} bg-surface`} disabled={busy} value={editor.plan}
                  onChange={event => setEditor({ ...editor, plan: event.target.value })}>
                  {Object.entries(t.plans).map(([plan, label]) => <option key={plan} value={plan}>{label}</option>)}
                </select>
              </label>
            </>
          )}
          {saveError && <p role="alert">{t.saveError}</p>}
          <div className="flex gap-2">
            <button type="submit" className={control} disabled={busy}>{editor.confirm ? archiveLabel(editor) : t.save}</button>
            <button type="button" className={control} disabled={busy} onClick={() => setEditor(null)}>{t.cancel}</button>
          </div>
        </form>
      )}
      <DataTable caption={t.organizations} columns={organizations} rows={result?.organizations} loading={!result} />
      {result && <AdminInvite db={db} uid={user.uid} organizations={result.organizations} />}
      <DataTable caption={t.users} columns={users} rows={result?.users} loading={!result} />
    </div>
  )
}
