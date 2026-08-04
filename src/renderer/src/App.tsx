import { useEffect, useState } from 'react'
import type { User } from '@shared/types'
import UserGate from './components/UserGate'
import PickingPage from './pages/PickingPage'
import PrepPage from './pages/PrepPage'
import OrdersPage from './pages/OrdersPage'
import CardmarketPage from './pages/CardmarketPage'
import StockPage from './pages/StockPage'
import { CHANGELOG } from '@shared/changelog'
import LocationsPage from './pages/LocationsPage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'

// L'ordre des onglets suit le flux de travail réel :
// importer → picker → préparer/expédier → historique.
const TABS = [
  { id: 'cardmarket', label: '🌐 Cardmarket' },
  { id: 'orders', label: '① 📦 Commandes' },
  { id: 'picking', label: '② 🎯 Picking' },
  { id: 'prep', label: '③ 🧾 Préparation' },
  { id: 'history', label: '④ 📚 Historique' },
  { id: 'stock', label: '📦 Stock' },
  { id: 'locations', label: '🗄️ Emplacements' },
  { id: 'settings', label: '⚙️ Réglages' }
] as const

type TabId = (typeof TABS)[number]['id']

export default function App(): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null)
  const [tab, setTab] = useState<TabId>('orders')
  const [updateMsg, setUpdateMsg] = useState<string | null>(null)
  const [whatsNew, setWhatsNew] = useState<string | null>(null)

  // Récap « Quoi de neuf » à la première ouverture après une mise à jour
  useEffect(() => {
    window.api.appInfo().then((info: { version: string }) => {
      const seen = localStorage.getItem('lastSeenVersion')
      if (seen && seen !== info.version) setWhatsNew(info.version)
      localStorage.setItem('lastSeenVersion', info.version)
    })
  }, [])

  // Navigation entre pages (ex. bouton « Lancer le picking → » après un import)
  useEffect(() => {
    const goto = (e: Event): void => {
      const target = (e as CustomEvent).detail as TabId
      if (TABS.some((t) => t.id === target)) setTab(target)
    }
    window.addEventListener('goto-tab', goto)
    return () => window.removeEventListener('goto-tab', goto)
  }, [])

  useEffect(() => {
    window.api.onAutoImported((raw: unknown[]) => {
      const results = raw as { status: string; sale_id?: string }[]
      const ok = results.filter((r) => r.status === 'ok')
      if (ok.length > 0) {
        setUpdateMsg(`📥 ${ok.length} commande(s) importée(s) automatiquement (#${ok.map((r) => r.sale_id).join(', #')})`)
        window.dispatchEvent(new CustomEvent('orders-updated'))
      }
    })
    window.api.onUpdaterEvent((event, payload) => {
      if (event === 'updater:available') {
        setUpdateMsg(`⬇ Mise à jour ${payload} détectée — téléchargement en cours…`)
      } else if (event === 'updater:downloaded') {
        setUpdateMsg(`✅ Mise à jour ${payload} téléchargée — elle s'installera à la fermeture.`)
      } else if (event === 'updater:error') {
        setUpdateMsg(`⚠ Mise à jour impossible : ${payload}`)
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
        {tab === 'cardmarket' && <CardmarketPage user={user} />}
        {tab === 'picking' && <PickingPage user={user} />}
        {tab === 'prep' && <PrepPage user={user} />}
        {tab === 'orders' && <OrdersPage user={user} />}
        {tab === 'locations' && <LocationsPage user={user} />}
        {tab === 'history' && <HistoryPage user={user} />}
        {tab === 'stock' && <StockPage user={user} />}
        {tab === 'settings' && <SettingsPage user={user} />}
      </main>
      {updateMsg && (
        <div className="toast" onClick={() => setUpdateMsg(null)}>
          {updateMsg}
        </div>
      )}
      {whatsNew && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setWhatsNew(null)
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 70
          }}
        >
          <div
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius)',
              padding: 24,
              width: 560,
              maxWidth: '92vw',
              maxHeight: '80vh',
              overflow: 'auto'
            }}
          >
            <h2 style={{ color: 'var(--accent)', marginBottom: 4 }}>
              🎉 Mise à jour installée — v{whatsNew}
            </h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: 12 }}>
              {CHANGELOG[0]?.title}
            </p>
            <ul style={{ margin: '0 0 14px 18px', lineHeight: 1.7 }}>
              {CHANGELOG[0]?.items.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 12 }}>
              Historique complet : ⚙️ Réglages → 📋 Nouveautés
            </p>
            <div style={{ textAlign: 'right' }}>
              <button className="primary" onClick={() => setWhatsNew(null)}>
                C&apos;est noté !
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
