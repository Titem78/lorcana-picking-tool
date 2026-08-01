import { useEffect, useMemo, useState } from 'react'
import type { Order, User } from '@shared/types'
import { STATUS_LABELS, statusColor } from '@/lib/status'
import OrderSheet from '@/components/OrderSheet'

interface HistoryStats {
  months: { month: string; orders: number; revenue_cents: number }[]
  top_cards: { name: string; set_code: string | null; number: string | null; qty: number }[]
}

/** Historique des commandes expédiées/archivées + statistiques. */
export default function HistoryPage({ user }: { user: User }): React.JSX.Element {
  const [orders, setOrders] = useState<Order[]>([])
  const [stats, setStats] = useState<HistoryStats | null>(null)
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<Order | null>(null)

  const refresh = (): void => {
    window.api.orders.list(['shipped', 'archived']).then(setOrders)
    window.api.orders.stats().then(setStats)
  }
  useEffect(refresh, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return orders
    return orders.filter(
      (o) =>
        o.sale_id.includes(q) ||
        (o.buyer_username ?? '').toLowerCase().includes(q) ||
        (o.buyer_name ?? '').toLowerCase().includes(q) ||
        (o.tracking_number ?? '').toLowerCase().includes(q)
    )
  }, [orders, search])

  const euros = (cents: number): string =>
    (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })

  return (
    <div>
      <h1>📚 Historique</h1>

      {stats && stats.months.length > 0 && (
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: 24 }}>
          <div
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 16,
              minWidth: 260
            }}
          >
            <h3 style={{ fontSize: '0.95rem', marginBottom: 10 }}>CA par mois (expédié)</h3>
            <table className="data">
              <tbody>
                {stats.months.slice(0, 6).map((m) => (
                  <tr key={m.month}>
                    <td>{m.month}</td>
                    <td>{m.orders} cmd</td>
                    <td style={{ textAlign: 'right' }}>{euros(m.revenue_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 16,
              minWidth: 300,
              flex: 1
            }}
          >
            <h3 style={{ fontSize: '0.95rem', marginBottom: 10 }}>Top cartes vendues</h3>
            <table className="data">
              <tbody>
                {stats.top_cards.slice(0, 6).map((c, i) => (
                  <tr key={i}>
                    <td>{c.qty}×</td>
                    <td>
                      {c.name}
                      <span style={{ color: 'var(--text-dim)' }}>
                        {' '}
                        (ch. {c.set_code} n° {c.number})
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <input
        placeholder="Rechercher : n° de vente, client, n° de suivi…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: 340, marginBottom: 14 }}
      />

      {filtered.length === 0 ? (
        <div className="placeholder">Aucune commande expédiée pour l&apos;instant.</div>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Vente</th>
              <th>Client</th>
              <th>Total</th>
              <th>Expédiée le</th>
              <th>Par</th>
              <th>Suivi</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id}>
                <td>#{o.sale_id}</td>
                <td>
                  {o.buyer_username}
                  <span style={{ color: 'var(--text-dim)' }}> — {o.buyer_name}</span>
                </td>
                <td>{o.total}</td>
                <td>{o.shipped_at?.slice(0, 16) ?? '—'}</td>
                <td>{o.shipped_by_name ?? '—'}</td>
                <td>{o.tracking_number ?? '—'}</td>
                <td>
                  <span className="badge" style={{ borderColor: statusColor(o.status) }}>
                    {STATUS_LABELS[o.status]}
                  </span>
                </td>
                <td>
                  <button onClick={() => setDetail(o)}>Fiche</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {detail && (
        <OrderSheet order={detail} user={user} onClose={() => setDetail(null)} onChanged={refresh} />
      )}
    </div>
  )
}
