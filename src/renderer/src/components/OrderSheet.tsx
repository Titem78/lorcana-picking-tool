import { useEffect, useState } from 'react'
import type { Order, OrderLine, User } from '@shared/types'
import { trackingInfo } from '@shared/tracking'
import { STATUS_LABELS, statusColor } from '@/lib/status'
import CardThumb from '@/components/CardThumb'
import StampPrint from '@/components/StampPrint'

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
  const [odooUrl, setOdooUrl] = useState<string | null>(null)
  const [stampStock, setStampStock] = useState<{ stamp_type: string; free: number }[]>([])
  const [stampType, setStampType] = useState('')
  const [stampMsg, setStampMsg] = useState('')
  const [showStampPrint, setShowStampPrint] = useState(false)
  const [odooMsg, setOdooMsg] = useState('')
  const odooConfigured = odooUrl !== null

  useEffect(() => {
    window.api.odoo.getConfig().then((c: { url: string } | null) => setOdooUrl(c?.url ?? null))
    window.api.stamps.stock().then((s: { stamp_type: string; free: number; used: number }[]) => {
      setStampStock(s.filter((x) => x.free > 0))
    })
  }, [])

  const assignStamp = (): void => {
    window.api.stamps
      .assign(user.id, order.id, stampType)
      .then((r: { number: string }) => {
        setStampMsg(`Timbre ${r.number} affecté ✔`)
        reload()
      })
      .catch((err: Error) => setStampMsg(`❌ ${err.message.replace(/^.*Error: /, '')}`))
  }

  const releaseStamp = (): void => {
    if (
      !window.confirm(
        'Libérer ce timbre ?\n\n⚠ UNIQUEMENT si tu ne l’as PAS imprimé/collé — un timbre physiquement utilisé ne doit jamais être réaffecté.'
      )
    )
      return
    window.api.stamps.release(user.id, order.id).then(() => {
      setStampMsg('Timbre libéré')
      reload()
    })
  }

  const openInOdoo = (): void => {
    if (odooUrl && order.odoo_move_id) {
      window.api.openExternal(
        `${odooUrl}/web#id=${order.odoo_move_id}&model=account.move&view_type=form`
      )
    }
  }

  const sendOdoo = (): void => {
    setOdooMsg('Envoi vers Odoo…')
    window.api.odoo
      .send(user.id, order.id)
      .then((r: { already: boolean }) => {
        setOdooMsg(
          r.already
            ? 'Cette commande est déjà dans Odoo'
            : '✅ Facture brouillon créée dans Odoo — clique « Ouvrir dans Odoo » pour la voir'
        )
        reload()
      })
      .catch((err: Error) => setOdooMsg(`❌ ${err.message.replace(/^.*Error: /, '')}`))
  }

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
  const inControl = order.status === 'picked'
  const controlled = lines.filter((l) => l.prep_checked === 1).length
  const allControlled = lines.length > 0 && controlled === lines.length

  const toggleControl = (l: OrderLine, checked: boolean): void => {
    window.api.prepCheck(user.id, l.id, checked).then(() => {
      window.api.orders.lines(order.id).then(setLines)
    })
  }

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
          {inControl && (
            <>
              {' '}
              — <b style={{ color: allControlled ? 'var(--ok)' : 'var(--accent)' }}>
                contrôle {controlled}/{lines.length}
              </b>{' '}
              : vérifie chaque carte en l&apos;emballant, puis coche-la
            </>
          )}
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
              <CardThumb line={l} size={64} />
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
                  : `à picker (${l.picked_qty}/${l.quantity})`}
              </span>
              {inControl && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.85rem',
                    color: l.prep_checked ? 'var(--ok)' : 'var(--text-dim)',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={l.prep_checked === 1}
                    onChange={(e) => toggleControl(l, e.target.checked)}
                    style={{ width: 20, height: 20, accentColor: 'var(--ok)' }}
                  />
                  Contrôlée
                </label>
              )}
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

        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            marginTop: 14,
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            flexWrap: 'wrap'
          }}
        >
          <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
            🎟 Timbre :{' '}
            {order.stamp_number ? (
              <b style={{ color: 'var(--ok)' }}>n° {order.stamp_number} ✔</b>
            ) : (
              'aucun'
            )}
          </span>
          <span style={{ flex: 1 }} />
          {order.stamp_number ? (
            <>
              <button className="primary" onClick={() => setShowStampPrint(true)}>
                🖨 Imprimer timbre + adresse
              </button>
              <button onClick={releaseStamp}>Libérer</button>
            </>
          ) : stampStock.length > 0 ? (
            <>
              <select value={stampType} onChange={(e) => setStampType(e.target.value)}>
                <option value="">— type de timbre —</option>
                {stampStock.map((s) => (
                  <option key={s.stamp_type} value={s.stamp_type}>
                    {s.stamp_type} ({s.free} dispo)
                  </option>
                ))}
              </select>
              <button className="primary" disabled={!stampType} onClick={assignStamp}>
                Affecter le prochain libre
              </button>
            </>
          ) : (
            <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              Aucun timbre en stock — importe une planche dans les Réglages
            </span>
          )}
          <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{stampMsg}</span>
        </div>

        {odooConfigured && (
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              marginTop: 14,
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              flexWrap: 'wrap'
            }}
          >
            <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
              Odoo :{' '}
              {order.odoo_move_id ? (
                <b style={{ color: 'var(--ok)' }}>
                  facture brouillon créée ✔ (réf. Cardmarket #{order.sale_id} — le n° comptable
                  sera attribué à la validation)
                </b>
              ) : order.odoo_error ? (
                <b style={{ color: 'var(--danger)' }}>erreur — {order.odoo_error}</b>
              ) : (
                'pas encore envoyée'
              )}
            </span>
            <span style={{ flex: 1 }} />
            {order.odoo_move_id ? (
              <button onClick={openInOdoo}>↗ Ouvrir dans Odoo</button>
            ) : (
              <button onClick={sendOdoo}>📤 Envoyer vers Odoo</button>
            )}
            <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{odooMsg}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
          {user.is_admin === 1 && (
            <button
              style={{ borderColor: 'var(--danger)', marginRight: 'auto' }}
              title="Supprimer définitivement cette commande (admin). Un timbre affecté reste consommé."
              onClick={() => {
                const typed = window.prompt(
                  `Suppression DÉFINITIVE de la vente #${order.sale_id} (commande, lignes, traçabilité).\n\nPour confirmer, tape son numéro : ${order.sale_id}`
                )
                if (typed === null) return
                if (typed.trim() !== order.sale_id) {
                  window.alert('Numéro incorrect — suppression annulée.')
                  return
                }
                window.api.orders.remove(user.id, order.id).then(() => {
                  onChanged()
                  onClose()
                })
              }}
            >
              🗑 Supprimer
            </button>
          )}
          {['picked', 'picking', 'imported'].includes(order.status) && (
            <>
              <button
                title="Pour une commande déjà faite physiquement : tout valider d'un coup (picking + contrôle) et la passer en « préparée » — utile pour l'envoyer ensuite vers Odoo."
                onClick={() => {
                  if (
                    window.confirm(
                      `Valider la commande #${order.sale_id} complète sans passer par le picking ?\n\nToutes les cartes seront marquées sorties et contrôlées, la commande passera en « préparée ».`
                    )
                  ) {
                    window.api.validateComplete(user.id, order.id).then(reload)
                  }
                }}
              >
                ⚡ Valider la commande complète
              </button>
              <button
                className="primary"
                disabled={!allPicked || !allControlled}
                title={
                  !allPicked
                    ? 'Toutes les cartes doivent être pickées'
                    : !allControlled
                      ? 'Contrôle chaque carte en l’emballant, puis coche-la'
                      : ''
                }
                onClick={() => advance('prepared')}
              >
                ✅ Marquer préparée
              </button>
            </>
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
      {showStampPrint && <StampPrint order={order} onClose={() => setShowStampPrint(false)} />}
    </div>
  )
}
