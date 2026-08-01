import { useEffect, useState } from 'react'
import type { ImportResult, Order, User } from '@shared/types'
import { STATUS_LABELS, statusColor } from '@/lib/status'
import OrderSheet from '@/components/OrderSheet'

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
  useEffect(() => {
    refresh()
    // rafraîchir quand une commande arrive par le dossier surveillé / navigateur
    window.addEventListener('orders-updated', refresh)
    return () => window.removeEventListener('orders-updated', refresh)
  }, [])

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
      <h1>① 📦 Commandes</h1>
      <p style={{ color: 'var(--text-dim)', marginBottom: 14, maxWidth: 720 }}>
        <b>Étape 1</b> : importe tes PDF de vente Cardmarket ici. Ensuite : ② Picking pour sortir
        les cartes de toutes les commandes d&apos;un coup, ③ Préparation pour contrôler, emballer
        et expédier chaque commande, ④ Historique pour retrouver tout ce qui est parti.
      </p>

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
                  ✅ Vente #{r.sale_id} — {r.buyer_username} — {r.cards} ligne(s) importée(s)
                  {r.message && (
                    <b style={{ color: 'var(--danger)' }}> {r.message}</b>
                  )}
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
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            {results.some((r) => r.status === 'ok') && (
              <button
                className="primary"
                onClick={() => window.dispatchEvent(new CustomEvent('goto-tab', { detail: 'picking' }))}
              >
                ② Lancer le picking →
              </button>
            )}
            <button onClick={() => setResults(null)}>OK</button>
          </div>
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

      {detail && (
        <OrderSheet
          order={detail}
          user={user}
          onClose={() => setDetail(null)}
          onChanged={refresh}
        />
      )}
    </div>
  )
}
