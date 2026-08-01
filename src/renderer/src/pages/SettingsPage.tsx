import { useEffect, useState } from 'react'
import type { ActivityEntry, AppInfo, User } from '@shared/types'

export default function SettingsPage({ user }: { user: User }): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [log, setLog] = useState<ActivityEntry[]>([])
  const [newName, setNewName] = useState('')
  const [newPin, setNewPin] = useState('')
  const [msg, setMsg] = useState('')

  const refresh = (): void => {
    window.api.appInfo().then(setInfo)
    window.api.users.list().then(setUsers)
    window.api.activity.list(100).then(setLog)
  }
  useEffect(refresh, [])

  const addUser = (e: React.FormEvent): void => {
    e.preventDefault()
    window.api.users
      .create(newName, newPin, false)
      .then(() => {
        setNewName('')
        setNewPin('')
        setMsg('Préparateur ajouté ✔')
        refresh()
      })
      .catch((err: Error) => setMsg(err.message.replace(/^.*Error: /, '')))
  }

  const removeUser = (target: User): void => {
    if (!window.confirm(`Désactiver le compte de ${target.name} ?`)) return
    window.api.users.deactivate(target.id, user.id).then(refresh)
  }

  return (
    <div>
      <h1>⚙️ Réglages</h1>

      <section style={{ marginBottom: 30 }}>
        <h2 style={{ fontSize: '1.05rem', marginBottom: 10 }}>Application</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
          Version {info?.version ?? '…'} — les mises à jour s&apos;installent automatiquement
          depuis GitHub.
          <br />
          Base de données : {info?.dbPath ?? '…'}
        </p>
      </section>

      <section style={{ marginBottom: 30 }}>
        <h2 style={{ fontSize: '1.05rem', marginBottom: 10 }}>Préparateurs</h2>
        <table className="data" style={{ maxWidth: 560 }}>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Rôle</th>
              <th>Créé le</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.is_admin ? <span className="badge">admin</span> : ''}</td>
                <td>{u.created_at.slice(0, 10)}</td>
                <td>
                  {u.id !== user.id && user.is_admin === 1 && (
                    <button onClick={() => removeUser(u)}>Désactiver</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {user.is_admin === 1 && (
          <form onSubmit={addUser} style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <input
              placeholder="Prénom / pseudo"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              placeholder="PIN (4 chiffres)"
              value={newPin}
              maxLength={4}
              style={{ width: 130 }}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
            />
            <button className="primary" disabled={!newName.trim() || newPin.length !== 4}>
              Ajouter
            </button>
            <span style={{ alignSelf: 'center', color: 'var(--text-dim)' }}>{msg}</span>
          </form>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: '1.05rem', marginBottom: 10 }}>Journal d&apos;activité</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Quand</th>
              <th>Qui</th>
              <th>Action</th>
              <th>Détails</th>
            </tr>
          </thead>
          <tbody>
            {log.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.created_at}</td>
                <td>{entry.user_name ?? '—'}</td>
                <td>{entry.action}</td>
                <td style={{ color: 'var(--text-dim)' }}>{entry.details ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
