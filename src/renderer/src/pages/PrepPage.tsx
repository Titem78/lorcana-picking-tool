import { useEffect, useState } from 'react'
import type { Order, User } from '@shared/types'
import { trackingInfo } from '@shared/tracking'
import OrderSheet from '@/components/OrderSheet'

/**
 * Onglet Préparation : la suite logique du picking.
 * Colonne 1 : commandes entièrement pickées, à préparer (contrôle + validation).
 * Colonne 2 : commandes préparées, à expédier (n° de suivi + envoi).
 */
export default function PrepPage({ user }: { user: User }): React.JSX.Element {
  const [orders, setOrders] = useState<Order[]>([])
  const [detail, setDetail] = useState<Order | null>(null)

  const refresh = (): void => {
    window.api.orders.list(['picked', 'prepared']).then(setOrders)
  }
  useEffect(refresh, [])

  const toPrepare = orders.filter((o) => o.status === 'picked')
  const toShip = orders.filter((o) => o.status === 'prepared')

  if (orders.length === 0) {
    return (
      <div>
        <h1>🧾 Préparation</h1>
        <div className="placeholder">
          Rien à préparer pour l&apos;instant. Quand toutes les cartes d&apos;une commande sont
          cochées au picking, la commande arrive ici pour être contrôlée, validée puis expédiée.
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1>🧾 Préparation</h1>
      <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <PrepColumn
          title={`À préparer (${toPrepare.length})`}
          hint="Cartes sorties — contrôle puis « Marquer préparée » dans la fiche"
          orders={toPrepare}
          user={user}
          accent="#58a6d3"
          onOpen={setDetail}
          onChanged={refresh}
        />
        <PrepColumn
          title={`À expédier (${toShip.length})`}
          hint="Saisis le n° de suivi puis « Marquer expédiée »"
          orders={toShip}
          user={user}
          accent="var(--ok)"
          onOpen={setDetail}
          onChanged={refresh}
        />
      </div>

      {detail && (
        <OrderSheet order={detail} user={user} onClose={() => setDetail(null)} onChanged={refresh} />
      )}
    </div>
  )
}

function PrepColumn({
  title,
  hint,
  orders,
  user,
  accent,
  onOpen,
  onChanged
}: {
  title: string
  hint: string
  orders: Order[]
  user: User
  accent: string
  onOpen: (o: Order) => void
  onChanged: () => void
}): React.JSX.Element {
  return (
    <div style={{ flex: 1, minWidth: 340 }}>
      <h2
        style={{
          fontSize: '1.02rem',
          padding: '8px 12px',
          background: 'var(--bg-panel)',
          borderLeft: `5px solid ${accent}`,
          borderRadius: 'var(--radius)',
          marginBottom: 4
        }}
      >
        {title}
      </h2>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', margin: '6px 2px 12px' }}>{hint}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {orders.length === 0 && (
          <div className="placeholder" style={{ padding: 20, marginTop: 0 }}>
            Rien ici.
          </div>
        )}
        {orders.map((o) => {
          const track = trackingInfo(o.shipping_method, o.tracking_number)
          return (
            <div
              key={o.id}
              style={{
                background: 'var(--bg-panel)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '12px 16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <b style={{ fontSize: '1.05rem' }}>{o.buyer_username}</b>
                  <span style={{ color: 'var(--text-dim)' }}> — vente #{o.sale_id}</span>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.87rem', marginTop: 3 }}>
                    {o.article_count} article(s) · {o.total} · {o.shipping_method ?? '—'}
                    {o.status === 'prepared' && o.prepared_by_name && (
                      <> · préparée par {o.prepared_by_name}</>
                    )}
                  </div>
                </div>
                <button className="primary" onClick={() => onOpen(o)}>
                  Ouvrir la fiche
                </button>
              </div>
              {o.status === 'prepared' && (
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    marginTop: 8,
                    alignItems: 'center',
                    color: 'var(--text-dim)',
                    fontSize: '0.87rem'
                  }}
                >
                  {o.tracking_number ? (
                    <>
                      Suivi : <b style={{ color: 'var(--text)' }}>{o.tracking_number}</b>
                      {track && (
                        <button onClick={() => window.api.openExternal(track.url)}>
                          🔎 {track.label}
                        </button>
                      )}
                    </>
                  ) : (
                    <>Pas encore de n° de suivi — ajoute-le dans la fiche.</>
                  )}
                  <span style={{ flex: 1 }} />
                  <button
                    onClick={() => window.api.orders.setStatus(user.id, o.id, 'shipped').then(onChanged)}
                  >
                    📮 Marquer expédiée
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
