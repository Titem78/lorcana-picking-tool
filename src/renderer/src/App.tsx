import { useEffect, useState } from 'react'
import type { User } from '@shared/types'
import UserGate from './components/UserGate'
import ComptaPage from './pages/ComptaPage'
import DashboardPage from './pages/DashboardPage'
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
  { id: 'dashboard', label: '📊 Tableau de bord' },
  { id: 'cardmarket', label: '🌐 Cardmarket' },
  { id: 'orders', label: '① 📦 Commandes' },
  { id: 'picking', label: '② 🎯 Picking' },
  { id: 'prep', label: '③ 🧾 Préparation' },
  { id: 'history', label: '④ 📚 Historique' },
  { id: 'stock', label: '📦 Stock' },
  { id: 'locations', label: '🗄️ Emplacements' },
  { id: 'compta', label: '🔄 Sync gestion co.' },
  { id: 'settings', label: '⚙️ Réglages' }
] as const

type TabId = (typeof TABS)[number]['id']

/**
 * Bulle verte/rouge : session Cardmarket connectée ou non. Se met à jour
 * TOUTE SEULE : lancement, toutes les 5 min, retour du focus sur la fenêtre,
 * sortie de l'onglet Cardmarket (après une connexion), et clic sur la bulle.
 */
function CmStatusDot(): React.JSX.Element {
  const [logged, setLogged] = useState<boolean | null>(null)

  const check = (): void => {
    setLogged(null)
    window.api.cm.loggedIn().then(setLogged)
  }
  useEffect(() => {
    check()
    const t = setInterval(check, 5 * 60 * 1000)
    const onFocus = (): void => check()
    window.addEventListener('focus', onFocus)
    window.addEventListener('cm-recheck', onFocus)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('cm-recheck', onFocus)
    }
  }, [])

  return (
    <span
      onClick={check}
      title={
        logged === null
          ? 'Vérification de la connexion Cardmarket…'
          : logged
            ? 'Connecté à Cardmarket ✔ (clic pour re-vérifier)'
            : 'NON connecté à Cardmarket — ouvre l’onglet 🌐 et connecte-toi (clic pour re-vérifier)'
      }
      style={{
        width: 11,
        height: 11,
        borderRadius: '50%',
        display: 'inline-block',
        cursor: 'pointer',
        background: logged === null ? 'var(--text-dim)' : logged ? '#3fb950' : '#e05d5d',
        boxShadow: logged ? '0 0 6px #3fb95088' : undefined
      }}
    />
  )
}

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
    // Visuels/encres arrivés en arrière-plan après un import : on rafraîchit
    window.api.onOrdersEnriched(() => {
      window.dispatchEvent(new CustomEvent('orders-updated'))
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
        <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Lorcana Picking
          <CmStatusDot />
        </div>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`nav-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => {
              // On quitte l'onglet Cardmarket (peut-être après s'être
              // connecté) : la bulle de connexion se re-vérifie seule
              if (tab === 'cardmarket' && t.id !== 'cardmarket') {
                window.dispatchEvent(new CustomEvent('cm-recheck'))
              }
              setTab(t.id)
            }}
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
        {tab === 'dashboard' && <DashboardPage user={user} />}
        {tab === 'cardmarket' && <CardmarketPage user={user} />}
        {tab === 'picking' && <PickingPage user={user} />}
        {tab === 'prep' && <PrepPage user={user} />}
        {tab === 'orders' && <OrdersPage user={user} />}
        {tab === 'locations' && <LocationsPage user={user} />}
        {tab === 'history' && <HistoryPage user={user} />}
        {tab === 'stock' && <StockPage user={user} />}
        {tab === 'compta' && <ComptaPage user={user} />}
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
