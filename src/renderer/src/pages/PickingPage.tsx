import { useEffect, useState } from 'react'
import type { PickingItem, PickingList, PickingSubline, User } from '@shared/types'
import { INK_HEX, INK_LABELS_FR, RARITY_LABELS_FR } from '@shared/constants'
import CardThumb from '@/components/CardThumb'

/**
 * Page Picking : liste globale, toutes commandes mélangées, groupée par
 * emplacement physique. Les quantités se valident exemplaire par exemplaire
 * avec un compteur − / + pour ne pas se tromper ; chaque clic est tracé.
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
        <h1>② 🎯 Picking</h1>
        <div className="placeholder">
          Rien à picker. Importe des PDF de commande dans l&apos;onglet « Commandes », la liste se
          construira ici, emplacement par emplacement. Quand tout est sorti, la suite se passe
          dans l&apos;onglet « Préparation ».
        </div>
      </div>
    )
  }

  const pct = list.total_qty ? Math.round((100 * list.picked_qty) / list.total_qty) : 0

  const setQty = (s: PickingSubline, qty: number): void => {
    window.api.picking.setQty(user.id, s.line_id, qty).then(refresh)
  }

  const pickAll = (item: PickingItem, picked: boolean): void => {
    Promise.all(
      item.sublines.map((s) => window.api.picking.pick(user.id, s.line_id, picked))
    ).then(refresh)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 6 }}>
        <h1 style={{ marginBottom: 0 }}>② 🎯 Picking</h1>
        <span style={{ color: 'var(--text-dim)' }}>
          {list.order_count} commande(s) mélangée(s) — {list.picked_qty}/{list.total_qty} cartes
          sorties
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

      {pct === 100 && (
        <div
          style={{
            background: 'var(--accent-soft)',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--radius)',
            padding: '10px 16px',
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
            gap: 14
          }}
        >
          <span>✅ Picking terminé ! Prochaine étape : contrôler et emballer chaque commande.</span>
          <button
            className="primary"
            onClick={() => window.dispatchEvent(new CustomEvent('goto-tab', { detail: 'prep' }))}
          >
            ③ Passer à la préparation →
          </button>
        </div>
      )}

      {list.sections.map((section) => {
        const remaining = section.items.reduce((s, i) => s + (i.total_qty - i.picked_qty), 0)
        const unassigned = section.location_id === null
        return (
          <section key={section.location_id ?? 'none'} style={{ marginBottom: 26 }}>
            <h2
              style={{
                fontSize: '1.05rem',
                padding: '8px 12px',
                background: unassigned ? 'rgba(224, 93, 93, 0.12)' : 'var(--bg-panel)',
                borderLeft: `5px solid ${section.location_color ?? 'var(--danger)'}`,
                borderRadius: 'var(--radius)',
                marginBottom: unassigned ? 4 : 10,
                display: 'flex',
                gap: 10,
                alignItems: 'center'
              }}
            >
              {unassigned ? '❓ Sans emplacement' : section.location_name}
              {section.location_label && <span className="badge">n° {section.location_label}</span>}
              <span style={{ flex: 1 }} />
              <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                {remaining === 0 ? '✅ terminé' : `${remaining} article(s) restants`}
              </span>
            </h2>
            {unassigned && (
              <p
                style={{
                  color: 'var(--text-dim)',
                  fontSize: '0.88rem',
                  margin: '0 2px 10px',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center'
                }}
              >
                Ces articles ne correspondent à aucune règle de rangement — tu peux quand même les
                picker, ou d&apos;abord leur donner un emplacement.
                <button
                  onClick={() =>
                    window.dispatchEvent(new CustomEvent('goto-tab', { detail: 'locations' }))
                  }
                >
                  🗄️ Régler les emplacements
                </button>
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {section.items.map((item) => (
                <PickingRow key={item.key} item={item} onSetQty={setQty} onPickAll={pickAll} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** Compteur d'exemplaires : − 2/3 + (ou simple case si un seul exemplaire). */
function QtyControl({
  subline,
  onSetQty
}: {
  subline: PickingSubline
  onSetQty: (s: PickingSubline, qty: number) => void
}): React.JSX.Element {
  const done = subline.picked_qty >= subline.quantity

  if (subline.quantity === 1) {
    return (
      <input
        type="checkbox"
        checked={done}
        onChange={(e) => onSetQty(subline, e.target.checked ? 1 : 0)}
        style={{ width: 22, height: 22, accentColor: 'var(--accent)' }}
      />
    )
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={() => onSetQty(subline, subline.picked_qty - 1)}
        disabled={subline.picked_qty === 0}
        style={{ width: 34, height: 34, padding: 0, fontSize: '1.1rem' }}
        title="Retirer un exemplaire"
      >
        −
      </button>
      <b
        style={{
          minWidth: 44,
          textAlign: 'center',
          fontSize: '1.05rem',
          color: done ? 'var(--ok)' : 'var(--text)'
        }}
      >
        {subline.picked_qty}/{subline.quantity}
      </b>
      <button
        onClick={() => onSetQty(subline, subline.picked_qty + 1)}
        disabled={done}
        className={done ? '' : 'primary'}
        style={{ width: 34, height: 34, padding: 0, fontSize: '1.1rem' }}
        title="Sortir un exemplaire"
      >
        +
      </button>
    </span>
  )
}

function PickingRow({
  item,
  onSetQty,
  onPickAll
}: {
  item: PickingItem
  onSetQty: (s: PickingSubline, qty: number) => void
  onPickAll: (item: PickingItem, picked: boolean) => void
}): React.JSX.Element {
  const multi = item.sublines.length > 1
  const [open, setOpen] = useState(false)
  const done = item.picked_qty >= item.total_qty
  const hex = INK_HEX[item.ink] ?? '#555'

  return (
    <div
      style={{
        background: 'var(--bg-panel)',
        border: `1px solid ${done ? 'var(--ok)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        padding: '10px 14px',
        opacity: done ? 0.6 : 1
      }}
    >
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <CardThumb line={item} size={96} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: '1.08rem' }}>
              {item.total_qty}× {item.name}
            </b>
            {item.is_foil && <span title="Foil">✨</span>}
            {!/cartes/i.test(item.section) && (
              <span className="badge">🎲 {item.section}</span>
            )}
            {done && <span style={{ color: 'var(--ok)' }}>✅</span>}
          </div>
          <div
            style={{
              color: 'var(--text-dim)',
              fontSize: '0.9rem',
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              marginTop: 4
            }}
          >
            <span>
              Ch. {item.set_code}
              {item.number && (
                <>
                  {' '}
                  · n° <b style={{ color: 'var(--text)', fontSize: '1.05rem' }}>{item.number}</b>
                </>
              )}
            </span>
            {item.ink && <span style={{ color: hex }}>⬤ {INK_LABELS_FR[item.ink] ?? item.ink}</span>}
            {item.rarity && <span>{RARITY_LABELS_FR[item.rarity] ?? item.rarity}</span>}
            <span>{item.language}</span>
          </div>
          {!multi && (
            <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: 4 }}>
              pour {item.sublines[0].buyer_username} (#{item.sublines[0].sale_id}) ·{' '}
              {item.sublines[0].condition}
              {item.sublines[0].comment && ` · ${item.sublines[0].comment}`}
              {item.sublines[0].picked_qty >= item.sublines[0].quantity &&
                item.sublines[0].picked_by_name && (
                  <>
                    {' '}
                    · ✅ {item.sublines[0].picked_by_name} à{' '}
                    {item.sublines[0].picked_at?.slice(11, 16)}
                  </>
                )}
            </div>
          )}
        </div>

        {multi ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <b style={{ color: done ? 'var(--ok)' : 'var(--text)', fontSize: '1.05rem' }}>
              {item.picked_qty}/{item.total_qty}
            </b>
            <button onClick={() => setOpen(!open)}>
              {open ? 'Replier' : `${item.sublines.length} clients ▾`}
            </button>
          </div>
        ) : (
          <QtyControl subline={item.sublines[0]} onSetQty={onSetQty} />
        )}
      </div>

      {multi && open && (
        <div
          style={{
            marginTop: 10,
            marginLeft: 110,
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}
        >
          {item.sublines.map((s) => (
            <div
              key={s.line_id}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                fontSize: '0.92rem',
                color: 'var(--text-dim)'
              }}
            >
              <QtyControl subline={s} onSetQty={onSetQty} />
              <span>
                <b style={{ color: 'var(--text)' }}>{s.quantity}×</b> pour {s.buyer_username} (#
                {s.sale_id}) · {s.condition}
                {s.comment && ` · ${s.comment}`}
              </span>
              {s.picked_qty >= s.quantity && s.picked_by_name && (
                <span style={{ marginLeft: 'auto' }}>
                  ✅ {s.picked_by_name} à {s.picked_at?.slice(11, 16)}
                </span>
              )}
            </div>
          ))}
          <button style={{ alignSelf: 'flex-start' }} onClick={() => onPickAll(item, !done)}>
            {done ? 'Tout décocher' : 'Tout sortir ✓'}
          </button>
        </div>
      )}
    </div>
  )
}
