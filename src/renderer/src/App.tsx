import { useEffect, useState } from 'react'
import type { User } from '@shared/types'
import UserGate from './components/UserGate'
import PickingPage from './pages/PickingPage'
import OrdersPage from './pages/OrdersPage'
import LocationsPage from './pages/LocationsPage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'

const TABS = [
  { id: 'picking', label: '🎯 Picking' },
  { id: 'orders', label: '📦 Commandes' },
  { id: 'locations', label: '🗄️ Emplacements' },
  { id: 'history', label: '📚 Historique' },
  { id: 'settings', label: '⚙️ Réglages' }
] as const

type TabId = (typeof TABS)[number]['id']

export default function App(): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null)
  const [tab, setTab] = useState<TabId>('picking')
  const [updateMsg, setUpdateMsg] = useState<string | null>(null)

  useEffect(() => {
    window.api.onUpdaterEvent((event, payload) => {
      if (event === 'updater:downloaded') {
        setUpdateMsg(`Mise à jour ${payload} téléchargée — elle s'installera à la fermeture.`)
      }
    })
  }, [])

  if (!user) {
    return <UserGate onLogin={setUser} />
  }

  const logout = (): void => {
    window.api.activity.log(user.id, 'user.logout')
    setUser(null)
  }

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="brand">Lorcana Picking</div>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`nav-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <div className="spacer" />
        <div className="userchip">
          <span className="dot" />
          {user.name}
          <button onClick={logout}>Quitter</button>
        </div>
      </nav>
      <main className="content">
        {tab === 'picking' && <PickingPage user={user} />}
        {tab === 'orders' && <OrdersPage user={user} />}
        {tab === 'locations' && <LocationsPage user={user} />}
        {tab === 'history' && <HistoryPage user={user} />}
        {tab === 'settings' && <SettingsPage user={user} />}
      </main>
      {updateMsg && (
        <div className="toast" onClick={() => setUpdateMsg(null)}>
          {updateMsg}
        </div>
      )}
    </div>
  )
}
