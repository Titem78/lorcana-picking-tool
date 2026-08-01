import { useEffect, useState } from 'react'
import type { ImportResult, Order, OrderLine, User } from '@shared/types'
import { STATUS_LABELS, statusColor } from '@/lib/status'
import CardThumb from '@/components/CardThumb'

/**
 * Page Commandes : import des PDF de vente Cardmarket (bouton ou
 * glisser-déposer), liste des commandes en cours avec statut, détail.
 */
export default function OrdersPage({ user }: { user: User }): React.JSX.Element {
  const [orders, setOrders] = useState<Order[]>([])
  const [results, setResults] = useState<ImportResult[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [detail, setDetail] = useState<Order | null>(null)

  const refresh = (): void => {
    window.api.orders
      .list(['imported', 'picking', 'picked', 'prepared'])
      .then(setOrders)
  }
  useEffect(refresh, [])

  const doImport = (paths: string[]): void => {
    if (!paths.length) return
    setImporting(true)
    window.api.orders.importPdfs(user.id, paths).then((res: ImportResult[]) => {
      setResults(res)
      setImporting(false)
      refresh()
    })
  }

  const pickFiles = (): void => {
    window.api.orders.pickPdfFiles().then(doImport)
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragOver(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.api.pathForFile(f))
      .filter((p) => p.toLowerCase().endsWith('.pdf'))
    doImport(paths)
  }

  return (
    <div>
      <h1>📦 Commandes</h1>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
          background: dragOver ? 'var(--accent-soft)' : 'var(--bg-panel)',
          borderRadius: 'var(--radius)',
          padding: 26,
          textAlign: 'center',
          marginBottom: 22
        }}
      >
        {importing ? (
          <p>Analyse des PDF et téléchargement des visuels…</p>
        ) : (
          <>
            <p style={{ marginBottom: 12 }}>
              Glisse ici tes <b>PDF de vente Cardmarket</b> (plusieurs à la fois possible)
            </p>
            <button className="primary" onClick={pickFiles}>
              Choisir des fichiers…
            </button>
          </>
        )}
      </div>

      {results && (
        <div
          style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 14,
            marginBottom: 22
          }}
        >
          {results.map((r, i) => (
            <div key={i} style={{ padding: '3px 0', fontSize: '0.92rem' }}>
              {r.status === 'ok' && (
                <>
                  ✅ Vente #{r.sale_id} — {r.buyer_username} — {r.cards} carte(s) importée(s)
                </>
              )}
              {r.status === 'duplicate' && <>⏭ Vente #{r.sale_id} déjà importée — ignorée</>}
              {r.status === 'error' && (
                <span style={{ color: 'var(--danger)' }}>
                  ❌ {r.file.split(/[\\/]/).pop()} : {r.message}
                </span>
              )}
            </div>
          ))}
          <button style={{ marginTop: 8 }} onClick={() => setResults(null)}>
            OK
          </button>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="placeholder">Aucune commande en cours.</div>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Vente</th>
              <th>Client</th>
              <th>Articles</th>
              <th>Total</th>
              <th>Envoi</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>#{o.sale_id}</td>
                <td>
                  {o.buyer_username}
                  <span style={{ color: 'var(--text-dim)' }}> — {o.buyer_name}</span>
                </td>
                <td>{o.article_count ?? '—'}</td>
                <td>{o.total ?? '—'}</td>
                <td>{o.shipping_method ?? '—'}</td>
                <td>
                  <span className="badge" style={{ borderColor: statusColor(o.status) }}>
                    {STATUS_LABELS[o.status]}
                  </span>
                </td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setDetail(o)}>Détail</button>
                  {o.status === 'imported' && (
                    <button
                      title="Supprimer cette commande"
                      onClick={() => {
                        if (window.confirm(`Supprimer la vente #${o.sale_id} ?`))
                          window.api.orders.remove(user.id, o.id).then(refresh)
                      }}
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {detail && <OrderDetail order={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

function OrderDetail({ order, onClose }: { order: Order; onClose: () => void }): React.JSX.Element {
  const [lines, setLines] = useState<OrderLine[]>([])
  useEffect(() => {
    window.api.orders.lines(order.id).then(setLines)
  }, [order.id])

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 40
      }}
    >
      <div
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 22,
          width: 720,
          maxWidth: '92vw',
          maxHeight: '85vh',
          overflow: 'auto'
        }}
      >
        <h2 style={{ marginBottom: 6 }}>
          Vente #{order.sale_id} — {order.buyer_username}
        </h2>
        <p style={{ color: 'var(--text-dim)', whiteSpace: 'pre-line', marginBottom: 12 }}>
          {order.buyer_name}
          {'\n'}
          {order.buyer_address}
        </p>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: 14 }}>
          {order.article_count} article(s) — valeur {order.item_value} + port {order.shipping_cost} ={' '}
          <b>{order.total}</b>
          <br />
          Mode d&apos;envoi : {order.shipping_method ?? '—'}
          {order.tracking_number && (
            <>
              {' '}
              — suivi <b>{order.tracking_number}</b>
            </>
          )}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lines.map((l) => (
            <div
              key={l.id}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '6px 10px',
                opacity: l.picked_qty >= l.quantity ? 0.65 : 1
              }}
            >
              <CardThumb line={l} size={46} />
              <div style={{ flex: 1 }}>
                <b>
                  {l.quantity}× {l.name}
                </b>{' '}
                {l.is_foil === 1 && '✨'}
                <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                  Ch. {l.set_code} · n° {l.number} · {l.language} · {l.condition}
                  {l.comment && ` · ${l.comment}`} · {l.price}
                </div>
              </div>
              {l.picked_qty >= l.quantity ? '✅' : ''}
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'right', marginTop: 14 }}>
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}
