import { useEffect, useState } from 'react'
import type { PickingItem, PickingList, PickingSubline, User } from '@shared/types'
import { INK_HEX, INK_LABELS_FR, RARITY_LABELS_FR } from '@shared/constants'
import CardThumb from '@/components/CardThumb'

/**
 * Page Picking : liste globale groupée par emplacement physique.
 * Une carte demandée par plusieurs clients apparaît une seule fois avec la
 * répartition ; chaque coche est tracée (qui / quand) et fait avancer le
 * statut des commandes concernées.
 */
export default function PickingPage({ user }: { user: User }): React.JSX.Element {
  const [list, setList] = useState<PickingList | null>(null)

  const refresh = (): void => {
    window.api.picking.list().then(setList)
  }
  useEffect(refresh, [])

  if (!list) return <div />

  if (list.sections.length === 0) {
    return (
      <div>
        <h1>🎯 Picking</h1>
        <div className="placeholder">
          Rien à picker. Importe des PDF de commande dans l&apos;onglet « Commandes », la liste se
          construira ici, emplacement par emplacement.
        </div>
      </div>
    )
  }

  const pct = list.total_qty ? Math.round((100 * list.picked_qty) / list.total_qty) : 0

  const pickItem = (item: PickingItem, picked: boolean): void => {
    Promise.all(
      item.sublines.map((s) => window.api.picking.pick(user.id, s.line_id, picked))
    ).then(refresh)
  }

  const pickSub = (s: PickingSubline, picked: boolean): void => {
    window.api.picking.pick(user.id, s.line_id, picked).then(refresh)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 6 }}>
        <h1 style={{ marginBottom: 0 }}>🎯 Picking</h1>
        <span style={{ color: 'var(--text-dim)' }}>
          {list.order_count} commande(s) — {list.picked_qty}/{list.total_qty} cartes sorties
        </span>
      </div>
      <div
        style={{
          height: 8,
          background: 'var(--bg-raised)',
          borderRadius: 6,
          overflow: 'hidden',
          marginBottom: 22
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: pct === 100 ? 'var(--ok)' : 'var(--accent)',
            transition: 'width .25s'
          }}
        />
      </div>

      {list.sections.map((section) => {
        const remaining = section.items.reduce(
          (s, i) => s + (i.total_qty - i.picked_qty),
          0
        )
        return (
          <section key={section.location_id ?? 'none'} style={{ marginBottom: 26 }}>
            <h2
              style={{
                fontSize: '1.05rem',
                padding: '8px 12px',
                background: 'var(--bg-panel)',
                borderLeft: `5px solid ${section.location_color ?? 'var(--danger)'}`,
                borderRadius: 'var(--radius)',
                marginBottom: 10,
                display: 'flex',
                gap: 10,
                alignItems: 'center'
              }}
            >
              {section.location_name}
              {section.location_label && <span className="badge">n° {section.location_label}</span>}
              <span style={{ flex: 1 }} />
              <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                {remaining === 0 ? '✅ terminé' : `${remaining} carte(s) restantes`}
              </span>
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {section.items.map((item) => (
                <PickingRow
                  key={item.key}
                  item={item}
                  onPickItem={pickItem}
                  onPickSub={pickSub}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function PickingRow({
  item,
  onPickItem,
  onPickSub
}: {
  item: PickingItem
  onPickItem: (item: PickingItem, picked: boolean) => void
  onPickSub: (s: PickingSubline, picked: boolean) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const done = item.picked_qty >= item.total_qty
  const multi = item.sublines.length > 1
  const hex = INK_HEX[item.ink] ?? '#555'

  return (
    <div
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '8px 12px',
        opacity: done ? 0.55 : 1
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => onPickItem(item, e.target.checked)}
          style={{ width: 20, height: 20, accentColor: 'var(--accent)' }}
        />
        <CardThumb line={item} size={96} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: '1.02rem' }}>
              {item.total_qty}× {item.name}
            </b>
            {item.is_foil && <span title="Foil">✨</span>}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.87rem', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span>
              Ch. {item.set_code} · n° <b style={{ color: 'var(--text)' }}>{item.number}</b>
            </span>
            <span style={{ color: hex }}>⬤ {INK_LABELS_FR[item.ink] ?? item.ink}</span>
            <span>{RARITY_LABELS_FR[item.rarity] ?? item.rarity}</span>
            <span>{item.language}</span>
          </div>
        </div>
        {multi ? (
          <button onClick={() => setOpen(!open)}>
            {open ? 'Replier' : `${item.sublines.length} clients`}
          </button>
        ) : (
          <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
            {item.sublines[0].buyer_username}
          </span>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 8, marginLeft: 44, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {item.sublines.map((s) => (
            <label
              key={s.line_id}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                fontSize: '0.9rem',
                color: 'var(--text-dim)'
              }}
            >
              <input
                type="checkbox"
                checked={s.picked_qty >= s.quantity}
                onChange={(e) => onPickSub(s, e.target.checked)}
                style={{ accentColor: 'var(--accent)' }}
              />
              <b style={{ color: 'var(--text)' }}>{s.quantity}×</b> pour {s.buyer_username} (#
              {s.sale_id}) · {s.condition}
              {s.comment && ` · ${s.comment}`}
              {s.picked_qty >= s.quantity && s.picked_by_name && (
                <span style={{ marginLeft: 'auto' }}>
                  ✅ {s.picked_by_name} à {s.picked_at?.slice(11, 16)}
                </span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
