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
    setMsg('Lecture de la page…')
    try {
      // Extraction des données de la commande directement depuis la page de
      // vente affichée (aucun PDF nécessaire).
      const result = (await wv.executeJavaScript(`(() => {
        const txt = document.body.innerText
        const eur = (s) => (s ? s.replace(/\\s/g, ' ').trim().replace('€', 'EUR').replace(/EUR?$/, 'EUR') : '')
        const sale = (document.querySelector('h1')?.textContent || txt).match(/#\\s*(\\d{6,})/)
        if (!sale) return { err: 'nosale' }

        // Pseudo de l'acheteur : premier lien vers un profil utilisateur
        const userLink = [...document.querySelectorAll('a')].find((a) => /\\/Users\\//.test(a.getAttribute('href') || ''))
        const buyer_username = userLink ? userLink.textContent.trim() : ''

        // Sommaire
        const num = (label) => {
          const m = txt.match(new RegExp(label + "[^0-9]{0,30}([\\\\d.,]+)\\\\s*€"))
          return m ? m[1] + ' EUR' : ''
        }
        const contenu = txt.match(/Contenu[^0-9]{0,20}(\\d+)\\s*Article/i)
        const envoi = txt.match(/M[ée]thode d'envoi:?\\s*\\n?\\s*([^\\n]+)/)
        const suivi = txt.match(/Num[ée]ro de suivi[^A-Z0-9]{0,20}([A-Z0-9]{8,})/i)
        const remb = txt.match(/Rembours[^\\d]{0,30}([\\d.,]+)\\s*€/i)

        // Adresse de livraison : lignes entre le titre et « France » (incluse)
        let buyer_name = ''
        let buyer_address = ''
        const addr = txt.match(/Adresse de livraison\\s*\\n([\\s\\S]{0,300}?\\n[A-ZÉÈ][a-zé]+)\\n/)
        if (addr) {
          const lines = addr[1].split('\\n').map((l) => l.trim()).filter(Boolean)
          buyer_name = lines[0] || ''
          buyer_address = lines.slice(1).join('\\n')
        }

        // Tableau des cartes : la table dont l'en-tête contient « Nom »
        const cards = []
        for (const table of document.querySelectorAll('table')) {
          const head = table.querySelector('thead')?.innerText || ''
          if (!/Nom/i.test(head)) continue
          for (const row of table.querySelectorAll('tbody tr')) {
            const rtxt = row.innerText
            const qty = rtxt.match(/(\\d+)\\s*x/)
            const name = row.querySelector('a')?.textContent?.trim() || ''
            const number = rtxt.match(/#(\\d+)/)
            const setc = rtxt.match(/\\b(\\d{1,2})([A-Z]{3})\\b/)
            const cond = rtxt.match(/\\b(NM|MT|M|EX|GD|LP|PL|PO)\\b/)
            const price = rtxt.match(/([\\d.,]+)\\s*€\\s*$/m)
            // Langue et foil : via les info-bulles/attributs des icônes
            const titles = [...row.querySelectorAll('[title],[aria-label],[data-original-title],[data-bs-original-title]')]
              .flatMap((el) => [el.getAttribute('title'), el.getAttribute('aria-label'), el.getAttribute('data-original-title'), el.getAttribute('data-bs-original-title')])
              .filter(Boolean).join(' | ')
            const langMap = { 'Français': 'FR', 'Anglais': 'EN', 'English': 'EN', 'French': 'FR', 'Allemand': 'DE', 'German': 'DE', 'Italien': 'IT', 'Italian': 'IT', 'Espagnol': 'ES', 'Spanish': 'ES' }
            let language = ''
            for (const [k, v] of Object.entries(langMap)) if (titles.includes(k)) { language = v; break }
            const is_foil = /foil/i.test(titles) || /foil/i.test(rtxt)
            // Visuel exact de la version vendue : image de l'info-bulle de la
            // ligne (l'icône 📷) ou toute image de scan présente dans la ligne
            let image_url = ''
            for (const el of row.querySelectorAll('[data-original-title],[data-bs-original-title],[title],[data-echo],img')) {
              for (const attr of ['data-original-title', 'data-bs-original-title', 'title', 'data-echo', 'src']) {
                const v = el.getAttribute && el.getAttribute(attr)
                if (!v) continue
                const m = v.match(/<img[^>]+src=["']([^"']+)["']/) || (/\\.(jpg|jpeg|png|webp)(\\?|$)/i.test(v) && /^https?:/.test(v) ? [null, v] : null)
                if (m && m[1] && !/flag|icon|sprite/i.test(m[1])) { image_url = m[1]; break }
              }
              if (image_url) break
            }
            if (!name || !qty) continue
            cards.push({
              quantity: parseInt(qty[1], 10),
              name,
              number: number ? number[1] : '',
              language,
              condition: cond ? cond[1] : '',
              set_code: setc ? setc[1] : '',
              color_code: setc ? setc[2] : '',
              rarity_code: '',
              price: price ? price[1] + ' EUR' : '',
              comment: '',
              is_foil,
              image_url
            })
          }
          if (cards.length) break
        }

        return {
          sale_id: sale[1],
          buyer_username,
          buyer_name,
          buyer_address,
          article_count: contenu ? parseInt(contenu[1], 10) : null,
          item_value: num("Valeur de l'article"),
          shipping_cost: num('Frais de port'),
          total: num('Total'),
          shipping_method: envoi ? envoi[1].trim() : '',
          tracking_number: suivi ? suivi[1] : '',
          refund_amount: remb ? remb[1] + ' EUR' : '',
          url: location.href,
          cards
        }
      })()`)) as { err?: string; sale_id?: string; cards?: unknown[] }

      if (result.err === 'nosale' || !result.sale_id) {
        setMsg("Cette page n'est pas la page d'une vente — ouvre une vente précise puis réessaie.")
        return
      }
      // Téléchargement des visuels exacts (dans la session de la page)
      if (result.cards && result.cards.length > 0) {
        setMsg('Récupération des visuels des cartes…')
        const withImages = (await wv.executeJavaScript(`(async () => {
          const urls = ${JSON.stringify((result.cards as { image_url?: string }[]).map((c) => c.image_url ?? ''))}
          const out = []
          for (const u of urls) {
            if (!u) { out.push(null); continue }
            try {
              const r = await fetch(u, { credentials: 'include' })
              if (!r.ok) { out.push(null); continue }
              const buf = new Uint8Array(await r.arrayBuffer())
              let bin = ''
              for (let i = 0; i < buf.length; i += 0x8000) {
                bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)))
              }
              const ext = (u.split('?')[0].split('.').pop() || 'jpg').toLowerCase()
              out.push({ b64: btoa(bin), ext })
            } catch { out.push(null) }
          }
          return out
        })()`)) as ({ b64: string; ext: string } | null)[]
        ;(result as Record<string, unknown>).card_images = withImages
      }

      if (!result.cards || result.cards.length === 0) {
        // Page de vente mais tableau non reconnu : capture de diagnostic
        const dump = (await wv.executeJavaScript(
          `({ html: document.documentElement.outerHTML, text: document.body.innerText })`
        )) as { html: string; text: string }
        const dir = (await window.api.saveCmDebug(dump.html, dump.text)) as string
        setMsg(
          `⚠ Vente #${result.sale_id} détectée mais cartes illisibles — fichiers de diagnostic enregistrés dans ${dir} (cm-page-debug.html/.txt) : envoie-les-moi pour que j'affine.`
        )
        return
      }
      setMsg('Import de la commande…')
      const results = (await window.api.importParsed(user.id, result)) as ImportResult[]
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
