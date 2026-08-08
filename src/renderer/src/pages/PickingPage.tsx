import { useEffect, useRef, useState } from 'react'
import type { PickingItem, PickingList, PickingSubline, User } from '@shared/types'
import { INK_HEX, INK_LABELS_FR, RARITY_LABELS_FR } from '@shared/constants'
import CardThumb from '@/components/CardThumb'

/** Restant à picker par commande (pour détecter celles qui se terminent). */
function remainingByOrder(l: PickingList): Map<string, { remaining: number; buyer: string }> {
  const m = new Map<string, { remaining: number; buyer: string }>()
  for (const sec of l.sections)
    for (const it of sec.items)
      for (const s of it.sublines) {
        const e = m.get(s.sale_id) ?? { remaining: 0, buyer: s.buyer_username }
        e.remaining += Math.max(0, s.quantity - s.picked_qty)
        m.set(s.sale_id, e)
      }
  return m
}

/**
 * Page Picking : liste globale, toutes commandes mélangées, groupée par
 * emplacement physique. Les quantités se valident exemplaire par exemplaire
 * avec un compteur − / + pour ne pas se tromper ; chaque clic est tracé.
 */
export default function PickingPage({ user }: { user: User }): React.JSX.Element {
  const [list, setList] = useState<PickingList | null>(null)
  const [imageFor, setImageFor] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [imageMsg, setImageMsg] = useState('')
  const [hideDone, setHideDone] = useState(localStorage.getItem('picking_hide_done') === '1')
  const [doneMsg, setDoneMsg] = useState<string | null>(null)
  const prevRemaining = useRef<Map<string, { remaining: number; buyer: string }> | null>(null)

  const refresh = (): void => {
    window.api.picking.list().then((l: PickingList) => {
      // Une commande vient-elle de se terminer ? On l'annonce clairement au
      // lieu de la laisser disparaître sans explication.
      const now = remainingByOrder(l)
      const prev = prevRemaining.current
      if (prev) {
        const finished = [...prev.entries()].filter(
          ([id, e]) => e.remaining > 0 && (now.get(id)?.remaining ?? 0) === 0
        )
        if (finished.length > 0) {
          setDoneMsg(
            finished
              .map(([id, e]) => `✅ Commande #${id} (${e.buyer}) entièrement pickée`)
              .join(' · ') + ' — elle t’attend en ③ Préparation'
          )
          window.setTimeout(() => setDoneMsg(null), 10000)
        }
      }
      prevRemaining.current = now
      setList(l)
    })
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
        <span style={{ flex: 1 }} />
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--text-dim)',
            fontSize: '0.88rem',
            cursor: 'pointer'
          }}
        >
          <input
            type="checkbox"
            checked={hideDone}
            onChange={(e) => {
              setHideDone(e.target.checked)
              localStorage.setItem('picking_hide_done', e.target.checked ? '1' : '0')
            }}
          />
          Masquer les cartes déjà sorties
        </label>
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

      {imageFor && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setImageFor(null)
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50
          }}
        >
          <div
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 22,
              width: 520,
              maxWidth: '92vw'
            }}
          >
            <h2 style={{ fontSize: '1.05rem', marginBottom: 10 }}>📷 Visuel — {imageFor}</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginBottom: 12 }}>
              Sur la page produit Cardmarket : clic droit sur la photo → « Copier l&apos;adresse de
              l&apos;image » → colle ici. Ou choisis un fichier sur ton PC.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                placeholder="https://…"
                value={imageUrl}
                style={{ flex: 1 }}
                autoFocus
                onChange={(e) => setImageUrl(e.target.value)}
              />
              <button
                className="primary"
                disabled={!imageUrl.trim()}
                onClick={() => {
                  setImageMsg('Téléchargement…')
                  window.api.picking
                    .setAccessoryImageUrl(user.id, imageFor, imageUrl.trim())
                    .then(() => {
                      setImageFor(null)
                      refresh()
                    })
                    .catch((err: Error) => setImageMsg(`❌ ${err.message.replace(/^.*Error: /, '')}`))
                }}
              >
                Télécharger
              </button>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                onClick={() =>
                  window.api.picking.setAccessoryImage(user.id, imageFor).then(() => {
                    setImageFor(null)
                    refresh()
                  })
                }
              >
                📁 Choisir un fichier…
              </button>
              <span style={{ flex: 1, color: 'var(--text-dim)', fontSize: '0.85rem' }}>{imageMsg}</span>
              <button onClick={() => setImageFor(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {doneMsg && (
        <div
          style={{
            background: 'var(--accent-soft)',
            border: '1px solid var(--ok)',
            borderRadius: 'var(--radius)',
            padding: '10px 16px',
            marginBottom: 14,
            fontSize: '0.95rem'
          }}
        >
          {doneMsg}
        </div>
      )}

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
        const visibleItems = hideDone
          ? section.items.filter((i) => i.picked_qty < i.total_qty)
          : section.items
        if (hideDone && visibleItems.length === 0) return null
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
              {visibleItems.map((item) => (
                <PickingRow
                  key={item.key}
                  item={item}
                  onSetQty={setQty}
                  onPickAll={pickAll}
                  onSetAccessoryImage={(name) => {
                    setImageFor(name)
                    setImageUrl('')
                    setImageMsg('')
                  }}
                />
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
  onPickAll,
  onSetAccessoryImage
}: {
  item: PickingItem
  onSetQty: (s: PickingSubline, qty: number) => void
  onPickAll: (item: PickingItem, picked: boolean) => void
  onSetAccessoryImage: (name: string) => void
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
        <CardThumb
          line={item}
          size={96}
          onMissingClick={() => onSetAccessoryImage(item.name)}
          onCustomize={() => onSetAccessoryImage(item.name)}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: '1.08rem' }}>
              {item.total_qty}× {item.name}
            </b>
            {item.is_foil && (
              <span
                className="badge"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 700 }}
              >
                ✨ FOIL
              </span>
            )}
            {item.language && (
              <span
                className="badge"
                style={
                  item.language !== 'FR'
                    ? { borderColor: '#58a6d3', color: '#58a6d3', fontWeight: 700 }
                    : {}
                }
              >
                {item.language}
              </span>
            )}
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
