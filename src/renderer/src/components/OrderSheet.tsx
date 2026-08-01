import { useEffect, useState } from 'react'
import type { Order, OrderLine, User } from '@shared/types'
import { trackingInfo } from '@shared/tracking'
import { STATUS_LABELS, statusColor } from '@/lib/status'
import CardThumb from '@/components/CardThumb'

/**
 * Fiche de commande : toutes les infos Cardmarket reprises, la traçabilité
 * (qui a pické/préparé/expédié, quand), les notes, et les actions de flux :
 * picked → préparée → expédiée, avec numéro de suivi et lien transporteur.
 */
export default function OrderSheet({
  order: initial,
  user,
  onClose,
  onChanged
}: {
  order: Order
  user: User
  onClose: () => void
  onChanged: () => void
}): React.JSX.Element {
  const [order, setOrder] = useState<Order>(initial)
  const [lines, setLines] = useState<OrderLine[]>([])
  const [tracking, setTrackingNum] = useState(initial.tracking_number ?? '')
  const [notes, setNotes] = useState(initial.notes ?? '')

  const reload = (): void => {
    window.api.orders.list().then((all: Order[]) => {
      const fresh = all.find((o) => o.id === initial.id)
      if (fresh) setOrder(fresh)
    })
    window.api.orders.lines(initial.id).then(setLines)
    onChanged()
  }
  useEffect(() => {
    window.api.orders.lines(initial.id).then(setLines)
  }, [initial.id])

  const advance = (status: 'prepared' | 'shipped' | 'archived'): void => {
    window.api.orders.setStatus(user.id, order.id, status).then(reload)
  }

  const saveTracking = (): void => {
    window.api.orders.setTracking(user.id, order.id, tracking.trim()).then(reload)
  }

  const track = trackingInfo(order.shipping_method, order.tracking_number)
  const allPicked = lines.length > 0 && lines.every((l) => l.picked_qty >= l.quantity)

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
          width: 760,
          maxWidth: '94vw',
          maxHeight: '88vh',
          overflow: 'auto'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <h2>Vente #{order.sale_id}</h2>
          <span className="badge" style={{ borderColor: statusColor(order.status) }}>
            {STATUS_LABELS[order.status]}
          </span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose}>Fermer</button>
        </div>

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ minWidth: 220 }}>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: 4 }}>Client</h3>
            <b>{order.buyer_username}</b>
            <div style={{ whiteSpace: 'pre-line', color: 'var(--text-dim)' }}>
              {order.buyer_name}
              {'\n'}
              {order.buyer_address}
            </div>
          </div>
          <div>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: 4 }}>
              Commande
            </h3>
            <div style={{ color: 'var(--text-dim)' }}>
              {order.article_count} article(s)
              <br />
              Valeur {order.item_value} + port {order.shipping_cost}
              <br />
              Total <b style={{ color: 'var(--text)' }}>{order.total}</b>
              <br />
              {order.shipping_method}
            </div>
          </div>
          <div>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: 4 }}>
              Traçabilité
            </h3>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
              Importée le {order.imported_at?.slice(0, 16)}
              {order.imported_by_name && <> par {order.imported_by_name}</>}
              <br />
              {order.prepared_at ? (
                <>
                  Préparée le {order.prepared_at.slice(0, 16)} par {order.prepared_by_name}
                  <br />
                </>
              ) : (
                <>
                  Pas encore préparée
                  <br />
                </>
              )}
              {order.shipped_at && (
                <>
                  Expédiée le {order.shipped_at.slice(0, 16)} par {order.shipped_by_name}
                </>
              )}
            </div>
          </div>
        </div>

        <h3 style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: 6 }}>
          Cartes ({lines.length} ligne(s))
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {lines.map((l) => (
            <div
              key={l.id}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '5px 10px'
              }}
            >
              <CardThumb line={l} size={40} />
              <div style={{ flex: 1 }}>
                <b>
                  {l.quantity}× {l.name}
                </b>{' '}
                {l.is_foil === 1 && '✨'}
                <div style={{ color: 'var(--text-dim)', fontSize: '0.83rem' }}>
                  Ch. {l.set_code} · n° {l.number} · {l.language} · {l.condition}
                  {l.comment && ` · ${l.comment}`} · {l.price}
                </div>
              </div>
              <span style={{ fontSize: '0.83rem', color: 'var(--text-dim)' }}>
                {l.picked_qty >= l.quantity
                  ? `✅ ${l.picked_by_name ?? ''} ${l.picked_at ? 'le ' + l.picked_at.slice(0, 16) : ''}`
                  : 'à picker'}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: 6 }}>
              Numéro de suivi
            </h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={tracking}
                placeholder="Saisir / scanner le n° de suivi"
                onChange={(e) => setTrackingNum(e.target.value)}
                style={{ flex: 1 }}
              />
              <button onClick={saveTracking} disabled={tracking.trim() === (order.tracking_number ?? '')}>
                Enregistrer
              </button>
            </div>
            {track && (
              <button
                style={{ marginTop: 8 }}
                onClick={() => window.api.openExternal(track.url)}
              >
                🔎 Vérifier le suivi sur {track.label}
              </button>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 260 }}>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: 6 }}>Notes</h3>
            <textarea
              rows={2}
              style={{ width: '100%' }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== (order.notes ?? ''))
                  window.api.orders.setNotes(user.id, order.id, notes).then(reload)
              }}
              placeholder="Remarques sur la commande…"
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
          {['picked', 'picking', 'imported'].includes(order.status) && (
            <button
              className="primary"
              disabled={!allPicked}
              title={allPicked ? '' : 'Toutes les cartes doivent être pickées'}
              onClick={() => advance('prepared')}
            >
              ✅ Marquer préparée
            </button>
          )}
          {order.status === 'prepared' && (
            <button className="primary" onClick={() => advance('shipped')}>
              📮 Marquer expédiée
            </button>
          )}
          {order.status === 'shipped' && (
            <button onClick={() => advance('archived')}>🗃 Archiver</button>
          )}
        </div>
      </div>
    </div>
  )
}
