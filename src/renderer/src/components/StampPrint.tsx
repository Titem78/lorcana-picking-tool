import { useEffect, useRef, useState } from 'react'
import type { Order } from '@shared/types'

interface PrintData {
  sheet_file: string
  page: number
  sd_x: number
  sd_y: number
  number: string
  stamp_type: string
}

type PrintMode = 'envelope' | 'a4'

/**
 * Impression du timbre + adresse.
 * - Mode « enveloppe 10×15 » (défaut) : impression DIRECTE sur l'enveloppe —
 *   timbre en haut à droite, adresse au centre, zéro papier gâché.
 * - Mode « A4 à découper » : étiquette dans un cadre en pointillés.
 * Le timbre est découpé depuis la planche PDF officielle (rendu pdfjs, la
 * planche est transmise en données binaires).
 */
export default function StampPrint({
  order,
  onClose
}: {
  order: Order
  onClose: () => void
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState('Préparation du timbre…')
  const [mode, setMode] = useState<PrintMode>('a4')

  useEffect(() => {
    let cancelled = false
    const run = async (): Promise<void> => {
      const data = (await window.api.stamps.printData(order.id)) as PrintData | null
      const canvas = canvasRef.current
      if (!data || !canvas || cancelled) {
        setStatus(data ? '' : 'Timbre introuvable')
        return
      }
      const { drawStamp } = await import('@/lib/stampRender')
      await drawStamp(data, canvas)
      if (!cancelled) setStatus('')
    }
    run().catch((err) => setStatus(`Erreur : ${String((err as Error).message ?? err)}`))
    return () => {
      cancelled = true
    }
  }, [order.id])

  const print = (): void => {
    // Taille de page dynamique selon le mode (l'enveloppe passe en 15×10 cm)
    const pageStyle = document.createElement('style')
    pageStyle.textContent =
      mode === 'envelope'
        ? '@page { size: 150mm 100mm; margin: 0; }'
        : '@page { size: A4; margin: 10mm; }'
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
          maxWidth: '94vw'
        }}
      >
        <h2 style={{ marginBottom: 10 }}>🖨 Timbre + adresse — vente #{order.sale_id}</h2>

        <div style={{ display: 'flex', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text-dim)' }}>
            <input type="radio" checked={mode === 'a4'} onChange={() => setMode('a4')} />
            📄 Étiquette à coller (enveloppes à bulles)
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text-dim)' }}>
            <input
              type="radio"
              checked={mode === 'envelope'}
              onChange={() => setMode('envelope')}
            />
            ✉ Direct sur enveloppe fine 10×15 cm
          </label>
        </div>

        <div className="stamp-print-area">
          <div className={mode === 'envelope' ? 'stamp-envelope' : 'stamp-label'}>
            <canvas ref={canvasRef} className="stamp-canvas" />
            <div className="stamp-address">
              <b>{order.buyer_name}</b>
              <br />
              <span style={{ whiteSpace: 'pre-line' }}>{order.buyer_address}</span>
            </div>
          </div>
        </div>

        <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', margin: '10px 0' }}>
          {status ||
            (mode === 'envelope'
              ? `Timbre n° ${order.stamp_number} — glisse l'enveloppe 10×15 dans l'imprimante (face à imprimer selon ton modèle) et lance l'impression.`
              : `Timbre n° ${order.stamp_number} — imprime, découpe le cadre et colle-le sur l'enveloppe.`)}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Fermer</button>
          <button className="primary" disabled={!!status} onClick={print}>
            🖨 Imprimer
          </button>
        </div>
      </div>
    </div>
  )
}
