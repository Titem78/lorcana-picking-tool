import { useRef, useState } from 'react'
import type { ImportResult, User } from '@shared/types'

// Balise <webview> d'Electron : pas dans les types React, on l'aliase localement.
const WebView = 'webview' as unknown as React.FC<{
  ref?: React.Ref<HTMLElement>
  src: string
  partition?: string
  style?: React.CSSProperties
}>

interface WebviewEl extends HTMLElement {
  getURL: () => string
  goBack: () => void
  goForward: () => void
  reload: () => void
  executeJavaScript: (code: string) => Promise<unknown>
}

/**
 * Navigateur Cardmarket intégré : l'utilisateur se connecte et navigue
 * LUI-MÊME (session normale, aucune automatisation). Sur la page d'une vente,
 * le bouton « Importer » télécharge le PDF d'export de la commande via la
 * session de la page — le même fichier que l'export manuel — puis l'app
 * l'importe avec le parseur habituel.
 */
export default function CardmarketPage({ user }: { user: User }): React.JSX.Element {
  const webviewRef = useRef<WebviewEl>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const importCurrent = async (): Promise<void> => {
    const wv = webviewRef.current
    if (!wv) return
    setBusy(true)
    setMsg('Recherche du PDF de la commande…')
    try {
      // Dans la page affichée : trouver le lien d'export PDF de la commande,
      // le télécharger avec les cookies de la session, renvoyer en base64.
      const result = (await wv.executeJavaScript(`(async () => {
        const links = [...document.querySelectorAll('a')]
        const pdfLink = links.map((a) => a.href).find((h) => /\\.pdf(\\?|$)|[?&]print|Print/i.test(h || ''))
        if (!pdfLink) return { err: 'nolink', url: location.href }
        const r = await fetch(pdfLink, { credentials: 'include' })
        if (!r.ok) return { err: 'http' + r.status }
        const buf = new Uint8Array(await r.arrayBuffer())
        let bin = ''
        const chunk = 0x8000
        for (let i = 0; i < buf.length; i += chunk) {
          bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)))
        }
        return { b64: btoa(bin), from: pdfLink }
      })()`)) as { err?: string; b64?: string; url?: string }

      if (result.err === 'nolink') {
        setMsg(
          "Pas de lien PDF trouvé sur cette page — ouvre la page d'UNE vente précise (avec son bouton d'export PDF) puis réessaie."
        )
        return
      }
      if (result.err) {
        setMsg(`Téléchargement refusé (${result.err}) — utilise l'export manuel pour cette fois.`)
        return
      }
      setMsg('Import de la commande…')
      const results = (await window.api.importPdfBase64(user.id, result.b64!)) as ImportResult[]
      const r = results[0]
      if (r.status === 'ok') {
        setMsg(`✅ Vente #${r.sale_id} (${r.buyer_username}) importée — ${r.cards} ligne(s)${r.message ? ` ${r.message}` : ''}`)
      } else if (r.status === 'duplicate') {
        setMsg(`⏭ Vente #${r.sale_id} déjà importée`)
      } else {
        setMsg(`❌ ${r.message}`)
      }
    } catch (err) {
      setMsg(`❌ ${String((err as Error).message ?? err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', margin: -26 }}>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          padding: '8px 12px',
          background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border)'
        }}
      >
        <button onClick={() => webviewRef.current?.goBack()}>←</button>
        <button onClick={() => webviewRef.current?.goForward()}>→</button>
        <button onClick={() => webviewRef.current?.reload()}>⟳</button>
        <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem', flex: 1 }}>
          Connecte-toi, ouvre une vente, puis :
        </span>
        <button className="primary" disabled={busy} onClick={importCurrent}>
          ⬇ Importer cette commande
        </button>
      </div>
      {msg && (
        <div
          style={{
            padding: '6px 12px',
            background: 'var(--bg-raised)',
            borderBottom: '1px solid var(--border)',
            fontSize: '0.88rem'
          }}
        >
          {msg}
        </div>
      )}
      <WebView
        ref={webviewRef as React.RefObject<HTMLElement>}
        src="https://www.cardmarket.com/fr/Lorcana"
        partition="persist:cardmarket"
        style={{ flex: 1 }}
      />
    </div>
  )
}
