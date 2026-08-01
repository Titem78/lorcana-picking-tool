import { useEffect, useState } from 'react'
import type { User } from '@shared/types'

interface Props {
  onLogin: (user: User) => void
}

/**
 * Écran d'entrée : choix du préparateur puis saisie du PIN.
 * Au premier lancement (aucun utilisateur), formulaire de création du
 * premier compte (administrateur).
 */
export default function UserGate({ onLogin }: Props): React.JSX.Element {
  const [users, setUsers] = useState<User[] | null>(null)
  const [selected, setSelected] = useState<User | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')

  const refresh = (): void => {
    window.api.users
      .list()
      .then(setUsers)
      .catch((err: Error) => setLoadError(err.message))
  }
  useEffect(refresh, [])

  if (loadError) {
    return (
      <div className="gate">
        <h1>Lorcana Picking Tool</h1>
        <p className="sub" style={{ color: 'var(--danger)' }}>
          Impossible de charger les données : {loadError}
        </p>
        <button className="primary" onClick={() => window.location.reload()}>
          Réessayer
        </button>
      </div>
    )
  }

  useEffect(() => {
    if (!selected || pin.length < 4) return
    window.api.users.auth(selected.id, pin).then((u: User | null) => {
      if (u) {
        onLogin(u)
      } else {
        setError('PIN incorrect')
        setPin('')
      }
    })
  }, [pin, selected])

  if (users === null) {
    return (
      <div className="gate">
        <p className="sub">Chargement…</p>
      </div>
    )
  }

  if (users.length === 0) {
    return <FirstUserForm onCreated={refresh} />
  }

  if (!selected) {
    return (
      <div className="gate">
        <h1>Lorcana Picking Tool</h1>
        <p className="sub">Qui prépare aujourd&apos;hui ?</p>
        <div className="users">
          {users.map((u) => (
            <button key={u.id} className="user-card" onClick={() => setSelected(u)}>
              {u.name}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const press = (d: string): void => {
    setError('')
    if (pin.length < 4) setPin(pin + d)
  }

  return (
    <div className="gate">
      <h1>{selected.name}</h1>
      <p className="sub">Saisis ton code PIN</p>
      <div className="pinpad">
        <div className="pin-dots">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={i < pin.length ? 'full' : ''} />
          ))}
        </div>
        <div className="pad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} onClick={() => press(d)}>
              {d}
            </button>
          ))}
          <button
            onClick={() => {
              setSelected(null)
              setPin('')
              setError('')
            }}
          >
            ←
          </button>
          <button onClick={() => press('0')}>0</button>
          <button onClick={() => setPin('')}>C</button>
        </div>
        <div className="error">{error}</div>
      </div>
    </div>
  )
}

function FirstUserForm({ onCreated }: { onCreated: () => void }): React.JSX.Element {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    window.api.users
      .create(name, pin, true)
      .then(() => onCreated())
      .catch((err: Error) => setError(err.message.replace(/^.*Error: /, '')))
  }

  return (
    <div className="gate">
      <h1>Bienvenue !</h1>
      <p className="sub">Crée le premier compte préparateur (administrateur)</p>
      <form onSubmit={submit}>
        <input
          placeholder="Prénom / pseudo"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <input
          placeholder="Code PIN (4 chiffres)"
          value={pin}
          inputMode="numeric"
          maxLength={4}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        />
        <button className="primary" type="submit" disabled={!name.trim() || pin.length !== 4}>
          Créer mon compte
        </button>
        <div className="error">{error}</div>
      </form>
    </div>
  )
}
