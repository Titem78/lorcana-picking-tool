import { useRef, useState } from 'react'
import type { ImportResult, User } from '@shared/types'

const sleep = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms))

// Balise <webview> d'Electron : pas dans les types React, on l'aliase localement.
const WebView = 'webview' as unknown as React.FC<{
  ref?: React.Ref<HTMLElement>
  src: string
  partition?: string
  allowpopups?: string
  style?: React.CSSProperties
}>

interface WebviewEl extends HTMLElement {
  getURL: () => string
  goBack: () => void
  goForward: () => void
  reload: () => void
  executeJavaScript: (code: string) => Promise<unknown>
  getWebContentsId: () => number
}

/**
 * Navigateur Cardmarket intégré : l'utilisateur se connecte et navigue
 * LUI-MÊME (session normale, aucune automatisation).
 *
 * Import d'une vente (bouton) — deux étages, calibrés sur la vraie structure
 * de la page (cm-page-debug fournie par l'utilisateur) :
 *  1. Le formulaire « Imprimer la commande » (POST Shipment_PrintShipmentPage)
 *     est soumis via la session de la page → si la réponse est un PDF, on
 *     l'importe avec le parseur PDF éprouvé.
 *  2. Sinon, repli : lecture des attributs data-* des lignes du tableau
 *     (data-name, data-number, data-amount, data-language, data-condition,
 *     data-price…) — fournis par Cardmarket lui-même, donc fiables.
 * Dans tous les cas, les visuels EXACTS des lignes (image S3 de l'info-bulle
 * 📷) sont téléchargés via la session et appliqués aux lignes.
 */
export default function CardmarketPage({ user }: { user: User }): React.JSX.Element {
  const webviewRef = useRef<WebviewEl>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const cancelRef = useRef(false)
  const [stockProgress, setStockProgress] = useState<{
    label: string
    page: number
    den: number | null
    items: number
  } | null>(null)

  // Lecture des lignes du tableau via leurs attributs data-* (+ URL d'image)
  const EXTRACT_ROWS = `(() => {
    const LANG = { '1': 'EN', '2': 'FR', '3': 'DE', '4': 'ES', '5': 'IT', '6': 'ZH', '7': 'JA', '8': 'PT', '9': 'RU', '10': 'KO' }
    const COND = { '1': 'MT', '2': 'NM', '3': 'EX', '4': 'GD', '5': 'LP', '6': 'PL', '7': 'PO' }
    const out = []
    for (const tr of document.querySelectorAll('tr[data-article-id]')) {
      let img = ''
      for (const el of tr.querySelectorAll('[data-bs-title],[data-bs-original-title],[data-original-title]')) {
        for (const a of ['data-bs-title', 'data-bs-original-title', 'data-original-title']) {
          const v = el.getAttribute(a)
          const m = v && v.match(/src=["']([^"']+)["']/)
          if (m) { img = m[1]; break }
        }
        if (img) break
      }
      // Segment type « 13ATV » de l'URL S3 : chiffres + LETTRES uniquement
      // (le premier segment numérique, ex. /1629/, est un id technique)
      let setM = null
      for (const seg of img.split('/')) {
        const m = seg.match(/^(\\d{1,2})([A-Z]{2,5})$/)
        if (m) { setM = m; break }
      }
      const section = (tr.closest('.category-subsection')?.querySelector('h3')?.textContent || 'Lorcana Cartes')
        .replace(/\\s*\\(\\d+\\)\\s*$/, '').trim()
      const priceRaw = tr.dataset.price || ''
      out.push({
        article_id: tr.dataset.articleId || '',
        quantity: parseInt(tr.dataset.amount || '1', 10) || 1,
        name: tr.dataset.name || '',
        number: tr.dataset.number || '',
        language: LANG[tr.dataset.language || ''] || '',
        condition: COND[tr.dataset.condition || ''] || '',
        set_code: setM ? setM[1] : '',
        color_code: setM ? setM[2] : '',
        rarity_code: '',
        price: priceRaw ? priceRaw.replace('.', ',') + ' EUR' : '',
        comment: tr.dataset.comment || '',
        is_foil: /fonticon-foil|data-foil="1"|>\\s*Foil\\s*</i.test(tr.innerHTML),
        section,
        image_url: img
      })
    }
    return out
  })()`

  // Lignes de la page Stock → Mes offres : structure différente des commandes
  // (div#stockRowNNN.article-row, pas de data-*) — calibré sur cm-page-debug réel.
  // __extractStock travaille sur un Document (page live ou HTML récupéré en fetch).
  const STOCK_CORE = `
    const LANG = { 'Français': 'FR', 'Anglais': 'EN', 'English': 'EN', 'Allemand': 'DE', 'Espagnol': 'ES', 'Italien': 'IT', 'Chinois-S': 'ZH', 'Chinois': 'ZH', 'Japonais': 'JA', 'Portugais': 'PT', 'Russe': 'RU', 'Coréen': 'KO' }
    function __extractStock(doc) {
    const out = []
    for (const row of doc.querySelectorAll('div.article-row[id^="stockRow"]')) {
      let img = ''
      for (const el of row.querySelectorAll('[data-bs-title],[data-bs-original-title]')) {
        for (const a of ['data-bs-title', 'data-bs-original-title']) {
          const v = el.getAttribute(a)
          const m = v && v.match(/src=["']([^"']+)["']/)
          if (m) { img = m[1]; break }
        }
        if (img) break
      }
      // Code d'extension affiché (« 10WHI ») ; repli : segment type 13ATV de l'URL S3
      let setM = (row.querySelector('.expansion-symbol span')?.textContent || '').trim().match(/^(\\d{1,2})([A-Z]{2,5})$/)
      if (!setM) {
        for (const seg of img.split('/')) {
          const m = seg.match(/^(\\d{1,2})([A-Z]{2,5})$/)
          if (m) { setM = m; break }
        }
      }
      let language = ''
      for (const el of row.querySelectorAll('.product-attributes [aria-label]')) {
        const l = LANG[(el.getAttribute('aria-label') || '').trim()]
        if (l) { language = l; break }
      }
      out.push({
        article_id: row.id.replace('stockRow', ''),
        quantity: parseInt((row.querySelector('.amount-container .item-count')?.textContent || '1').trim(), 10) || 1,
        name: (row.querySelector('.col-seller a')?.textContent || '').trim(),
        number: '',
        language,
        condition: (row.querySelector('.article-condition .badge')?.textContent || '').trim(),
        set_code: setM ? setM[1] : '',
        color_code: setM ? setM[2] : '',
        rarity_code: '',
        price: (row.querySelector('.price-container .color-primary')?.textContent || row.querySelector('.color-primary')?.textContent || '').trim(),
        comment: (row.querySelector('.product-comments .text-truncate')?.textContent || row.querySelector('.product-comments [aria-label]')?.getAttribute('aria-label') || '').trim(),
        is_foil: !!row.querySelector('[aria-label*="Foil" i],[data-bs-original-title*="Foil" i],.fonticon-foil'),
        section: 'Lorcana Cartes',
        image_url: img
      })
    }
    return out
    }
    function __pageMeta(doc) {
      const a = doc.querySelector('.pagination a[data-direction="next"]')
      return {
        next: a && !a.classList.contains('disabled') ? a.getAttribute('href') || '' : '',
        label: (doc.querySelector('.pagination .mx-1')?.textContent || '').trim(),
        total: (doc.querySelector('.pagination .total-count')?.textContent || '').trim()
      }
    }
    function __options(doc, name) {
      return [...doc.querySelectorAll('select[name="' + name + '"] option')]
        .map((o) => ({ v: o.getAttribute('value') || '', t: (o.textContent || '').trim() }))
        .filter((o) => o.v && o.v !== '0')
    }
  `

  // Récupère UNE page de stock via fetch dans la session Cardmarket (aucun
  // rechargement visible) et renvoie lignes + pagination + valeurs de filtres.
  const FETCH_STOCK_PAGE = (url: string): string => `(async () => {
    ${STOCK_CORE}
    const r = await fetch(${JSON.stringify(url)}, { credentials: 'include' })
    if (!r.ok) return { status: r.status }
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html')
    return {
      status: 200,
      rows: __extractStock(doc),
      meta: __pageMeta(doc),
      expansions: __options(doc, 'idExpansion'),
      rarities: __options(doc, 'idRarity'),
      languages: __options(doc, 'idLanguage'),
      conditions: __options(doc, 'condition'),
      foils: __options(doc, 'isFoil')
    }
  })()`

  const showResult = (r: ImportResult): void => {
    if (r.status === 'ok') {
      setMsg(`✅ Vente #${r.sale_id} (${r.buyer_username}) importée — ${r.cards} ligne(s)${r.message ? ` ${r.message}` : ''}`)
    } else if (r.status === 'duplicate') {
      setMsg(`⏭ Vente #${r.sale_id} déjà importée`)
    } else {
      setMsg(`❌ ${r.message}`)
    }
  }

  interface StockFetchPage {
    status: number
    rows?: { article_id: string; quantity: number; [k: string]: unknown }[]
    meta?: { next: string; label: string; total: string }
    expansions?: { v: string; t: string }[]
    rarities?: { v: string; t: string }[]
    languages?: { v: string; t: string }[]
    conditions?: { v: string; t: string }[]
    foils?: { v: string; t: string }[]
  }

  // Une page via fetch, avec pause 10 s et reprise en cas de HTTP 429.
  const fetchStockPage = async (wv: WebviewEl, url: string, attempt = 0): Promise<StockFetchPage> => {
    const res = (await wv.executeJavaScript(FETCH_STOCK_PAGE(url))) as StockFetchPage
    if (res.status === 429 && attempt < 3) {
      await sleep(10000)
      return fetchStockPage(wv, url, attempt + 1)
    }
    return res
  }

  // INVENTAIRE GÉNÉRAL : balayage complet du stock en lecture seule, comme les
  // addons Cardmarket connus — le plafond de ~300 résultats ne s'applique qu'aux
  // vues non filtrées, donc on parcourt extension par extension (tri forcé), et
  // toute tranche encore plafonnée est re-découpée (rareté → foil → langue →
  // état). ~2 requêtes/s maximum, pause sur 429, bouton Stop à tout moment.
  const STOCK_BASE = '/fr/Lorcana/Stock/Offers/Singles'
  const importFullInventory = async (): Promise<void> => {
    const wv = webviewRef.current
    if (!wv) return
    setBusy(true)
    cancelRef.current = false
    const warnings: string[] = []
    let items = 0
    let pages = 0
    try {
      const mark = (await window.api.stock.sweepMark()) as string
      setMsg('')
      setStockProgress({ label: 'Lecture des filtres…', page: 0, den: null, items: 0 })
      const first = await fetchStockPage(wv, STOCK_BASE + '?sortBy=name_asc')
      const expansions = first.expansions ?? []
      if (first.status !== 200 || expansions.length === 0) {
        setMsg(`⚠ Impossible de lire la page de stock (HTTP ${first.status}) — es-tu bien connecté à Cardmarket dans cet onglet ?`)
        return
      }
      const SLICERS = [
        { key: 'idRarity', values: first.rarities ?? [] },
        { key: 'isFoil', values: first.foils ?? [] },
        { key: 'idLanguage', values: first.languages ?? [] },
        { key: 'condition', values: first.conditions ?? [] }
      ]
      let exIdx = 0

      const walkSlice = async (params: string, label: string, depth: number): Promise<void> => {
        if (cancelRef.current) return
        const sliceUrl = (site: number): string =>
          STOCK_BASE + '?sortBy=name_asc' + params + (site > 1 ? '&site=' + site : '')
        let site = 1
        let capped = false
        for (;;) {
          const p = await fetchStockPage(wv, sliceUrl(site))
          if (p.status !== 200) {
            warnings.push(`${label} (HTTP ${p.status})`)
            return
          }
          pages++
          capped = /\+/.test(p.meta?.total ?? '')
          // Tranche plafonnée détectée dès la 1re page : on re-découpe tout de
          // suite au lieu de parcourir 15 pages incomplètes.
          if (capped && site === 1 && depth < SLICERS.length && SLICERS[depth].values.length > 0) break
          const valid = (p.rows ?? []).filter((r) => r.article_id)
          if (valid.length > 0) {
            await window.api.stock.upsert(user.id, valid)
            items += valid.length
          }
          setStockProgress({
            label: `${label} — ${p.meta?.label || 'page ' + site} — ${items} article(s)`,
            page: exIdx,
            den: expansions.length,
            items
          })
          if (cancelRef.current || !p.meta?.next) return
          const m = p.meta.next.match(/[?&]site=(\d+)/)
          if (!m) return
          site = parseInt(m[1], 10)
          await sleep(600 + Math.floor(Math.random() * 400))
        }
        // Re-découpage de la tranche plafonnée avec le filtre suivant
        const slicer = SLICERS[depth]
        if (!slicer || slicer.values.length === 0) {
          warnings.push(`${label} (>300 résultats, non découpable)`)
          return
        }
        for (const v of slicer.values) {
          await walkSlice(`${params}&${slicer.key}=${encodeURIComponent(v.v)}`, `${label} · ${v.t}`, depth + 1)
          if (cancelRef.current) return
        }
      }

      for (exIdx = 0; exIdx < expansions.length && !cancelRef.current; exIdx++) {
        const ex = expansions[exIdx]
        await walkSlice('&idExpansion=' + encodeURIComponent(ex.v), ex.t, 0)
      }

      if (cancelRef.current) {
        setMsg(`✋ Arrêté — ${items} article(s) importés/actualisés (inventaire partiel conservé, rien n'est retiré).`)
      } else {
        const purged = (await window.api.stock.purgeOlder(user.id, mark)) as { removed: number }
        setMsg(
          `✅ Inventaire général terminé : ${items} article(s) sur ${pages} page(s), ` +
            `${purged.removed} article(s) disparu(s) retiré(s) du miroir (onglet 📦 Stock).` +
            (warnings.length ? ` ⚠ Tranches incomplètes : ${warnings.join(' ; ')}` : '')
        )
      }
    } catch (err) {
      setMsg(`❌ ${String((err as Error).message ?? err)}`)
    } finally {
      setBusy(false)
      setStockProgress(null)
    }
  }

  const importCurrent = async (): Promise<void> => {
    const wv = webviewRef.current
    if (!wv) return
    setBusy(true)
    try {
      // --- Étage 1 : le PDF officiel via le formulaire « Imprimer la commande »
      setMsg('Récupération du PDF de la commande…')
      const pdfTry = (await wv.executeJavaScript(`(async () => {
        const form = document.querySelector('form[action*="PrintShipmentPage"]')
        if (!form) return { err: 'noform' }
        const r = await fetch(form.action, { method: 'POST', body: new FormData(form), credentials: 'include' })
        if (!r.ok) return { err: 'http' + r.status }
        const buf = new Uint8Array(await r.arrayBuffer())
        if (!(buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)) {
          return { err: 'notpdf', ct: r.headers.get('content-type') || '' }
        }
        let bin = ''
        for (let i = 0; i < buf.length; i += 0x8000) {
          bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)))
        }
        return { b64: btoa(bin) }
      })()`)) as { err?: string; ct?: string; b64?: string }

      let result: ImportResult | null = null
      if (pdfTry.b64) {
        setMsg('Import du PDF…')
        const results = (await window.api.importPdfBase64(user.id, pdfTry.b64)) as ImportResult[]
        result = results[0]
      }

      // --- Étage 2 (repli) : lecture des attributs data-* du tableau
      const rows = (await wv.executeJavaScript(EXTRACT_ROWS)) as {
        image_url: string
        [k: string]: unknown
      }[]

      if (!result || result.status === 'error') {
        const txt = (await wv.executeJavaScript('document.body.innerText')) as string
        const sale = txt.match(/Vente\s*#(\d{6,})/)
        if (!sale) {
          setMsg("Cette page n'est pas la page d'une vente — ouvre une vente précise puis réessaie.")
          return
        }
        if (rows.length === 0) {
          const dump = (await wv.executeJavaScript(
            `({ html: document.documentElement.outerHTML, text: document.body.innerText })`
          )) as { html: string; text: string }
          const dir = (await window.api.saveCmDebug(dump.html, dump.text)) as string
          setMsg(`⚠ Vente détectée mais lignes illisibles — diagnostic enregistré dans ${dir}, envoie-le-moi.`)
          return
        }
        const num = (label: string): string => {
          const m = txt.match(new RegExp(label + '[^0-9]{0,30}([\\d.,]+)\\s*€'))
          return m ? m[1] + ' EUR' : ''
        }
        const contenu = txt.match(/Contenu[^0-9]{0,20}(\d+)\s*Article/i)
        const envoi = txt.match(/M[ée]thode d'envoi:?\s*\n?\s*([^\n]+)/)
        const suivi = txt.match(/Num[ée]ro de suivi[^A-Z0-9]{0,20}([A-Z0-9]{8,})/i)
        const remb = txt.match(/Rembours[^\d]{0,30}([\d.,]+)\s*€/i)
        const addr = txt.match(/Adresse de livraison\s*\n([\s\S]{0,300}?\n[A-ZÉÈ][a-zé]+)\n/)
        const addrLines = addr ? addr[1].split('\n').map((l) => l.trim()).filter(Boolean) : []
        const userLink = (await wv.executeJavaScript(
          `[...document.querySelectorAll('a')].find((a) => /\\/Users\\//.test(a.getAttribute('href') || ''))?.textContent?.trim() || ''`
        )) as string

        const results = (await window.api.importParsed(user.id, {
          sale_id: sale[1],
          buyer_username: userLink,
          buyer_name: addrLines[0] ?? '',
          buyer_address: addrLines.slice(1).join('\n'),
          article_count: contenu ? parseInt(contenu[1], 10) : null,
          item_value: num("Valeur de l'article"),
          shipping_cost: num('Frais de port'),
          total: num('Total'),
          shipping_method: envoi ? envoi[1].trim() : '',
          tracking_number: suivi ? suivi[1] : '',
          refund_amount: remb ? remb[1] + ' EUR' : '',
          url: wv.getURL(),
          cards: rows
        })) as ImportResult[]
        result = results[0]
      }

      // --- Visuels exacts des lignes : téléchargés côté application
      // (le S3 Cardmarket exige le Referer et bloque le fetch dans la page)
      if (result?.status === 'ok' && result.order_id && rows.length > 0) {
        setMsg('Récupération des visuels des cartes…')
        await window.api.applyCardImageUrls(result.order_id, rows.map((r) => r.image_url || null))
      }
      if (result) showResult(result)
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
        <button
          title="Remplit le formulaire de connexion avec tes identifiants enregistrés (Réglages → Import)"
          onClick={() => {
            const wv = webviewRef.current
            if (!wv) return
            window.api.cm.fillLogin(wv.getWebContentsId()).then((r: string) => setMsg(r))
          }}
        >
          🔑 Connexion
        </button>
        <button
          title="Ouvre la page actuelle dans une fenêtre séparée (même session) — pratique pour garder la messagerie ouverte tout en naviguant ici"
          onClick={() => {
            const wv = webviewRef.current
            window.api.cm.openWindow(wv ? wv.getURL() : undefined)
          }}
        >
          ⧉ 2e fenêtre
        </button>
        <button
          title="Enregistre la structure de la page affichée (cm-page-debug.html/.txt) pour améliorer l'extraction"
          onClick={async () => {
            const wv = webviewRef.current
            if (!wv) return
            const dump = (await wv.executeJavaScript(
              `({ html: document.documentElement.outerHTML, text: document.body.innerText })`
            )) as { html: string; text: string }
            const dir = (await window.api.saveCmDebug(dump.html, dump.text)) as string
            setMsg(`🐞 Diagnostic enregistré dans ${dir} — envoie-moi les fichiers cm-page-debug.`)
          }}
        >
          🐞
        </button>
        <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem', flex: 1 }}>
          Connecte-toi, ouvre une vente, puis :
        </span>
        <button
          disabled={busy}
          onClick={importFullInventory}
          title="Balaye TOUT ton stock Cardmarket (extension par extension, en lecture seule, ~2 requêtes/s) et met à jour le miroir local — onglet 📦 Stock. Bouton Stop à tout moment."
        >
          📦 Inventaire général
        </button>
        <button className="primary" disabled={busy} onClick={importCurrent}>
          ⬇ Importer cette commande
        </button>
      </div>
      {stockProgress && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 12px',
            background: 'var(--bg-raised)',
            borderBottom: '1px solid var(--border)',
            fontSize: '0.88rem'
          }}
        >
          <div style={{ flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                borderRadius: 4,
                background: 'var(--accent, #3b82f6)',
                transition: 'width .4s',
                width: `${stockProgress.den ? Math.min(100, Math.round((stockProgress.page / stockProgress.den) * 100)) : 100}%`
              }}
            />
          </div>
          <span style={{ whiteSpace: 'nowrap' }}>
            {stockProgress.label || `Page ${stockProgress.page}`} — {stockProgress.items} article(s)
          </span>
          <button onClick={() => { cancelRef.current = true }}>✋ Stop</button>
        </div>
      )}
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
        allowpopups="true"
        style={{ flex: 1 }}
      />
    </div>
  )
}
