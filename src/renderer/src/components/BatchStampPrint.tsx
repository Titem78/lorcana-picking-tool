import { useEffect, useRef, useState } from 'react'
import type { Order } from '@shared/types'
import { drawStamp, clearSheetCache, type StampPrintData } from '@/lib/stampRender'

/**
 * Impression groupée des étiquettes (enveloppes à bulles : on colle).
 * Jusqu'à 8 étiquettes 105×74 mm par feuille A4 (compatible planches
 * autocollantes 2×4 du commerce, sinon découpe aux pointillés).
 */
export default function BatchStampPrint({
  orders,
  onClose
}: {
  orders: Order[] // commandes avec timbre affecté
  onClose: () => void
}): React.JSX.Element {
  const [selected, setSelected] = useState<Set<number>>(new Set(orders.map((o) => o.id)))
  const [status, setStatus] = useState('Préparation des timbres…')
  const canvasRefs = useRef(new Map<number, HTMLCanvasElement>())

  const picked = orders.filter((o) => selected.has(o.id))

  useEffect(() => {
    let cancelled = false
    const run = async (): Promise<void> => {
      for (const o of picked) {
        const canvas = canvasRefs.current.get(o.id)
        if (!canvas || canvas.dataset.done) continue
        const data = (await window.api.stamps.printData(o.id)) as StampPrintData | null
        if (!data || cancelled) continue
        await drawStamp(data, canvas)
        canvas.dataset.done = '1'
      }
      if (!cancelled) setStatus('')
    }
    run().catch((err) => setStatus(`Erreur : ${String((err as Error).message ?? err)}`))
    return () => {
      cancelled = true
    }
  }, [picked.map((o) => o.id).join(',')])

  useEffect(() => () => clearSheetCache(), [])

  const toggle = (id: number): void => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const print = (): void => {
    const pageStyle = document.createElement('style')
    pageStyle.textContent = '@page { size: A4; margin: 0; }'
    document.head.appendChild(pageStyle)
    document.body.classList.add('printing-stamp')
    window.print()
    document.body.classList.remove('printing-stamp')
    pageStyle.remove()
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
        zIndex: 55
      }}
    >
      <div
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 22,
          maxWidth: '94vw',
          maxHeight: '92vh',
          overflow: 'auto'
        }}
      >
        <h2 style={{ marginBottom: 8 }}>🖨 Étiquettes groupées — {picked.length} commande(s)</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          {orders.map((o) => (
            <label
              key={o.id}
              style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text-dim)', fontSize: '0.88rem' }}
            >
              <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
              #{o.sale_id} — {o.buyer_username}
            </label>
          ))}
        </div>

        <div className="stamp-print-area">
          <div className="stamp-sheet">
            {picked.slice(0, 8).map((o) => (
              <div key={o.id} className="stamp-cell">
                <canvas
                  ref={(el) => {
                    if (el) canvasRefs.current.set(o.id, el)
                  }}
                  className="stamp-cell-canvas"
                />
                <div className="stamp-cell-address">
                  <b>{o.buyer_name}</b>
                  <br />
                  <span style={{ whiteSpace: 'pre-line' }}>{o.buyer_address}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', margin: '10px 0' }}>
          {status ||
            `8 étiquettes max par feuille (105×74 mm — planches autocollantes 2×4, sinon découpe).${picked.length > 8 ? ` ${picked.length - 8} commande(s) au-delà : relance une impression après celle-ci.` : ''}`}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Fermer</button>
          <button className="primary" disabled={!!status || picked.length === 0} onClick={print}>
            🖨 Imprimer la feuille
          </button>
        </div>
      </div>
    </div>
  )
}
