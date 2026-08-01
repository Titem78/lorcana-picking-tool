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

/**
 * Impression « prêt à coller » : le timbre (découpé depuis la planche PDF
 * officielle) + l'adresse du client, dans un cadre à découper. La planche est
 * rendue via pdfjs puis rognée autour du numéro SD du timbre.
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

  useEffect(() => {
    let cancelled = false
    const run = async (): Promise<void> => {
      const data = (await window.api.stamps.printData(order.id)) as PrintData | null
      if (!data || cancelled) {
        setStatus('Timbre introuvable')
        return
      }
      const pdfjs = await import('pdfjs-dist')
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

      const task = pdfjs.getDocument({ url: `appcache://stamps/${data.sheet_file}` })
      const doc = await task.promise
      const page = await doc.getPage(data.page)
      const scale = 4 // qualité d'impression
      const viewport = page.getViewport({ scale })

      const full = document.createElement('canvas')
      full.width = viewport.width
      full.height = viewport.height
      await page.render({ canvasContext: full.getContext('2d')!, viewport, canvas: full }).promise

      // Cellule du timbre autour du numéro SD (coordonnées PDF, origine en bas)
      const pageH = page.view[3]
      const x0 = data.sd_x - 176
      const yTop = data.sd_y + 92
      const w = 188
      const h = 104
      const canvas = canvasRef.current
      if (!canvas || cancelled) return
      canvas.width = w * scale
      canvas.height = h * scale
      canvas
        .getContext('2d')!
        .drawImage(full, x0 * scale, (pageH - yTop) * scale, w * scale, h * scale, 0, 0, w * scale, h * scale)
      setStatus('')
      await task.destroy()
    }
    run().catch((err) => setStatus(`Erreur : ${String((err as Error).message ?? err)}`))
    return () => {
      cancelled = true
    }
  }, [order.id])

  const print = (): void => {
    document.body.classList.add('printing-stamp')
    window.print()
    document.body.classList.remove('printing-stamp')
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
          maxWidth: '92vw'
        }}
      >
        <h2 style={{ marginBottom: 12 }}>🖨 Timbre + adresse — vente #{order.sale_id}</h2>

        <div className="stamp-print-area">
          <div className="stamp-label">
            <div className="stamp-address">
              <b>{order.buyer_name}</b>
              <br />
              <span style={{ whiteSpace: 'pre-line' }}>{order.buyer_address}</span>
            </div>
            <canvas ref={canvasRef} className="stamp-canvas" />
          </div>
        </div>

        <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', margin: '10px 0' }}>
          {status ||
            `Timbre n° ${order.stamp_number} — imprime, découpe le cadre en pointillés et colle-le sur l'enveloppe.`}
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
