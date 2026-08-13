import { useEffect, useState } from 'react'
import type { Order, User } from '@shared/types'

interface CmDashboard {
  ok: boolean
  error?: string
  balance: string | null
  paid_count: number | null
  paid_capped: boolean
  to_import: string[]
  list_ok: boolean
  unread: number | null
  fetched_at: string
}

/**
 * Tableau de bord : l'état Cardmarket (2 requêtes, à la demande uniquement)
 * croisé avec l'état local (0 requête). Aucune actualisation automatique en
 * boucle — règle du magasin : on limite les actions vers Cardmarket.
 */
export default function DashboardPage({ user: _user }: { user: User }): React.JSX.Element {
  const [cm, setCm] = useState<CmDashboard | null>(null)
  const [loading, setLoading] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])

  const refresh = (): void => {
    setLoading(true)
    window.api.orders.list().then(setOrders)
    window.api.cm
      .dashboard()
      .then((d: CmDashboard) => setCm(d))
      .finally(() => setLoading(false))
  }
  useEffect(refresh, [])

  const inPicking = orders.filter((o) => ['imported', 'picking'].includes(o.status)).length
  const toPrepare = orders.filter((o) => o.status === 'picked').length
  const toShip = orders.filter((o) => o.status === 'prepared').length

  const goto = (tab: string): void => {
    window.dispatchEvent(new CustomEvent('goto-tab', { detail: tab }))
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 18 }}>
        <h1 style={{ marginBottom: 0 }}>📊 Tableau de bord</h1>
        <button disabled={loading} onClick={refresh}>
          {loading ? 'Lecture…' : '🔄 Actualiser'}
        </button>
        {cm && (
          <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
            lu sur Cardmarket à {cm.fetched_at} — 2 requêtes par actualisation, rien en boucle
          </span>
        )}
      </div>

      {cm && !cm.ok && (
        <div
          style={{
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius)',
            padding: '10px 16px',
            marginBottom: 16,
            color: 'var(--danger)'
          }}
        >
          {cm.error}
        </div>
      )}

      <h2 style={{ fontSize: '1rem', color: 'var(--text-dim)', marginBottom: 8 }}>Sur Cardmarket</h2>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
        <Tile
          icon="🛒"
          label="Ventes payées à traiter"
          value={cm?.ok ? `${cm.paid_count ?? '?'}${cm.paid_capped ? '+' : ''}` : '—'}
          accent={cm?.ok && (cm.paid_count ?? 0) > 0 ? 'var(--accent)' : undefined}
          hint={
            cm?.ok && cm.list_ok && cm.to_import.length > 0
              ? `dont ${cm.to_import.length} pas encore importée(s) : #${cm.to_import.slice(0, 5).join(', #')}${cm.to_import.length > 5 ? '…' : ''}`
              : cm?.ok && !cm.list_ok
                ? 'liste illisible — compteur seul (envoie-moi un dump 🐞 de Mes ventes payées)'
                : undefined
          }
          onClick={() => window.api.cm.openWindow('https://www.cardmarket.com/fr/Lorcana/Orders/Sales/Paid')}
        />
        <Tile
          icon="✉"
          label="Messages non lus"
          value={cm?.ok ? (cm.unread == null ? '?' : String(cm.unread)) : '—'}
          accent={cm?.ok && (cm.unread ?? 0) > 0 ? 'var(--accent)' : undefined}
          hint={cm?.ok && cm.unread == null ? 'structure à calibrer — dump 🐞 de la messagerie avec des non-lus' : undefined}
          onClick={() => window.api.cm.openWindow('https://www.cardmarket.com/fr/Lorcana/Account/Messages')}
        />
        <Tile icon="💰" label="Solde vendeur" value={cm?.ok ? (cm.balance ?? '—') : '—'} />
      </div>

      <h2 style={{ fontSize: '1rem', color: 'var(--text-dim)', marginBottom: 8 }}>Dans l&apos;app</h2>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Tile
          icon="🎯"
          label="En cours de picking"
          value={String(inPicking)}
          accent={inPicking > 0 ? '#58a6d3' : undefined}
          onClick={() => goto('picking')}
        />
        <Tile
          icon="🧾"
          label="À préparer"
          value={String(toPrepare)}
          accent={toPrepare > 0 ? '#58a6d3' : undefined}
          onClick={() => goto('prep')}
        />
        <Tile
          icon="📮"
          label="À expédier"
          value={String(toShip)}
          accent={toShip > 0 ? 'var(--accent)' : undefined}
          onClick={() => goto('prep')}
        />
      </div>

      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: 22, maxWidth: 640 }}>
        Clique une tuile Cardmarket pour ouvrir la page correspondante dans une fenêtre connectée,
        ou une tuile de l&apos;app pour aller à l&apos;onglet. Les ventes « pas encore importées »
        s&apos;importent depuis l&apos;onglet 🌐 Cardmarket (ouvre la vente puis « ⬇ Importer »).
      </p>
    </div>
  )
}

function Tile({
  icon,
  label,
  value,
  hint,
  accent,
  onClick
}: {
  icon: string
  label: string
  value: string
  hint?: string
  accent?: string
  onClick?: () => void
}): React.JSX.Element {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-panel)',
        border: `1px solid ${accent ?? 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        padding: '14px 20px',
        minWidth: 190,
        cursor: onClick ? 'pointer' : 'default'
      }}
    >
      <div style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: '1.9rem', fontWeight: 700, color: accent ?? 'var(--text)', marginTop: 2 }}>
        {value}
      </div>
      {hint && <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: 4, maxWidth: 240 }}>{hint}</div>}
    </div>
  )
}
