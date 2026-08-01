import { useEffect, useMemo, useState } from 'react'
import type { Order, User } from '@shared/types'
import { STATUS_LABELS, statusColor } from '@/lib/status'
import OrderSheet from '@/components/OrderSheet'
import { confirmDialog } from '@/lib/dialogs'

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
  const [odooConfigured, setOdooConfigured] = useState(false)
  const [sending, setSending] = useState<string | null>(null)

  const refresh = (): void => {
    window.api.orders.list(['shipped', 'archived']).then(setOrders)
    window.api.orders.stats().then(setStats)
    window.api.odoo.getConfig().then((c: unknown) => setOdooConfigured(c !== null))
  }
  useEffect(refresh, [])

  // Pilotage Odoo : validées (n° comptable) / brouillons à valider / manquantes
  const odooPosted = orders.filter((o) => o.odoo_state === 'posted').length
  const odooDraft = orders.filter((o) => o.odoo_move_id && o.odoo_state !== 'posted').length
  const odooErrors = orders.filter((o) => !o.odoo_move_id && o.odoo_error).length
  const odooMissing = orders.filter((o) => !o.odoo_move_id)

  const syncOdoo = (): void => {
    setSending('Synchronisation avec Odoo…')
    window.api.odoo
      .sync()
      .then((r: { checked: number; posted: number; draft: number }) => {
        setSending(`Sync ✔ : ${r.posted} validée(s), ${r.draft} brouillon(s) sur ${r.checked}`)
        refresh()
      })
      .catch((err: Error) => setSending(`⚠ Sync impossible : ${err.message.replace(/^.*Error: /, '')}`))
  }

  const sendMissing = async (): Promise<void> => {
    if (!confirmDialog(`Envoyer ${odooMissing.length} commande(s) vers Odoo (facture brouillon) ?`))
      return
    let ok = 0
    let ko = 0
    for (const o of odooMissing) {
      setSending(`Envoi ${ok + ko + 1}/${odooMissing.length} — #${o.sale_id}…`)
      try {
        await window.api.odoo.send(user.id, o.id)
        ok++
      } catch {
        ko++
      }
    }
    setSending(`Terminé : ${ok} envoyée(s)${ko ? `, ${ko} en erreur (voir les fiches)` : ''}`)
    refresh()
  }

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
      <h1>④ 📚 Historique</h1>

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

      {odooConfigured && orders.length > 0 && (
        <div
          style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '10px 16px',
            marginBottom: 16,
            display: 'flex',
            gap: 14,
            alignItems: 'center',
            flexWrap: 'wrap'
          }}
        >
          <b>Pilotage Odoo :</b>
          <span className="badge" style={{ borderColor: 'var(--ok)' }}>
            ✔ {odooPosted} validée(s)
          </span>
          {odooDraft > 0 && (
            <span className="badge" style={{ borderColor: 'var(--accent)' }}>
              📝 {odooDraft} brouillon(s) à valider
            </span>
          )}
          {odooErrors > 0 && (
            <span className="badge" style={{ borderColor: 'var(--danger)' }}>
              ⚠ {odooErrors} en erreur
            </span>
          )}
          {odooMissing.length > 0 && (
            <span className="badge">− {odooMissing.length} non envoyée(s)</span>
          )}
          <span style={{ flex: 1 }} />
          <button onClick={syncOdoo} title="Récupérer l'état et les numéros de factures depuis Odoo">
            🔄 Sync
          </button>
          {odooMissing.length > 0 && !sending?.startsWith('Envoi') && (
            <button className="primary" onClick={sendMissing}>
              📤 Envoyer les {odooMissing.length} manquante(s)
            </button>
          )}
          <span style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>{sending}</span>
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
              {odooConfigured && <th>Odoo</th>}
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
                {odooConfigured && (
                  <td
                    title={
                      o.odoo_move_id
                        ? o.odoo_state === 'posted'
                          ? `Facture validée ${o.odoo_number ?? ''}`
                          : `Brouillon créé le ${o.odoo_sent_at?.slice(0, 16) ?? ''} — à valider dans Odoo`
                        : (o.odoo_error ?? 'Pas encore envoyée vers Odoo')
                    }
                  >
                    {o.odoo_state === 'posted' ? (
                      <span style={{ color: 'var(--ok)', fontSize: '0.85rem' }}>
                        ✔ {o.odoo_number ?? ''}
                      </span>
                    ) : o.odoo_move_id ? (
                      <span style={{ color: 'var(--accent)' }}>📝 brouillon</span>
                    ) : o.odoo_error ? (
                      <span style={{ color: 'var(--danger)' }}>⚠</span>
                    ) : (
                      <span style={{ color: 'var(--text-dim)' }}>—</span>
                    )}
                  </td>
                )}
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
