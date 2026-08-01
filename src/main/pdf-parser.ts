// Parseur des PDF « Vente » Cardmarket (héritier du parser.py de la V1).
//
// Mise en page constatée (A4, 595 pt de large) :
//   x≈17  « Lorcana Cartes: »            (en-tête de section, un par jeu)
//   x≈18  quantité   x≈31 nom   x≈220 numéro   x≈241 « FR NM 12WIL »
//   x≈316 rareté     x≈337 commentaire (optionnel)   x≈537 prix « 0,70 EUR »
// L'en-tête a deux colonnes : vendeur à x≈31, acheteur à x≈300.
// Le bloc récap (Contenu / Valeur / Frais de port / Total / Mode d'envoi /
// Numéro de suivi) est en paires étiquette (x≈31) → valeur (x≈145).
//
// Certaines polices rendent « À » et « é » comme « ? » : les regex tolèrent.

import { CM_COLOR_CODE_TO_INK, CM_RARITY_CODE_TO_RARITY } from '@shared/constants'

export interface ParsedCardLine {
  quantity: number
  name: string
  number: string // normalisé sans zéros de tête ("023" → "23")
  language: string
  condition: string
  set_code: string // numéro de chapitre, ex. "12"
  color_code: string // code Cardmarket, ex. "WIL"
  color_label: string // encre canonique, ex. "Amber" (repli si Lorcast indisponible)
  rarity_code: string
  price: string
  comment: string
  is_foil: boolean
}

export interface ParsedOrder {
  sale_id: string
  buyer_username: string
  buyer_name: string
  buyer_address: string // adresse complète, lignes séparées par \n
  seller: string
  sent_date: string
  article_count: number | null
  item_value: string
  shipping_cost: string
  total: string
  shipping_method: string
  tracking_number: string
  cards: ParsedCardLine[]
  source_pdf: string
}

interface Tok {
  x: number
  y: number
  str: string
}

const FOIL_RE = /\b(foil|holo|cold\s*foil)\b/i
const SET_COLOR_RE = /^(\d+)([A-Z]{3})$/
const PRICE_RE = /^[\d.,]+\s*EUR$/

export async function parseCardmarketPdf(path: string): Promise<ParsedOrder> {
  // pdfjs-dist est ESM-only : import dynamique depuis le bundle CJS du main.
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ url: path, useSystemFonts: true })
  const doc = await task.promise

  const pages: Tok[][] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const toks: Tok[] = []
    for (const item of content.items) {
      if (typeof (item as { str?: string }).str !== 'string') continue
      const it = item as { str: string; transform: number[] }
      if (!it.str.trim()) continue
      toks.push({ x: it.transform[4], y: it.transform[5], str: it.str.trim() })
    }
    pages.push(toks)
  }
  await task.destroy()

  const rowsPerPage = pages.map(groupRows)
  const allText = rowsPerPage
    .flat()
    .map((r) => r.map((t) => t.str).join(' '))
    .join('\n')

  const header = parseHeader(rowsPerPage[0] ?? [], allText)
  const cards = parseCards(rowsPerPage)

  return { ...header, cards, source_pdf: path }
}

/** Regroupe les tokens d'une page en lignes par ordonnée (tolérance 3 pt), triées haut→bas puis gauche→droite. */
function groupRows(toks: Tok[]): Tok[][] {
  const rows: { y: number; toks: Tok[] }[] = []
  for (const t of [...toks].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r.y - t.y) <= 3)
    if (row) {
      row.toks.push(t)
    } else {
      rows.push({ y: t.y, toks: [t] })
    }
  }
  return rows.map((r) => r.toks.sort((a, b) => a.x - b.x))
}

// --- En-tête -------------------------------------------------------------------

function parseHeader(rows: Tok[][], allText: string): Omit<ParsedOrder, 'cards' | 'source_pdf'> {
  const sale = allText.match(/Vente\s*#(\d+)/)
  const buyer = allText.match(/Acheteur\s*-\s*(\S+)/)
  const seller = allText.match(/Vendeur\s*-\s*(\S+)/)
  // Date d'envoi : ligne de statut « Envoyée: 03.07.2026 18:14 » (é parfois rendu « ? »)
  const sent = allText.match(/Envoy.{1,2}e:?\s*([\d.]{8,10}\s+[\d:]{4,5})/)

  // Colonne acheteur : tokens à x ≥ 280, entre la ligne « Acheteur - … » et la ligne de statut.
  let buyerName = ''
  const addressLines: string[] = []
  const headerRowIdx = rows.findIndex((r) => r.some((t) => t.str.startsWith('Acheteur')))
  if (headerRowIdx >= 0) {
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i]
      if (row.some((t) => /payer:|Pay.e:|Envoy.e:/.test(t.str))) break
      const right = row.filter((t) => t.x >= 280)
      if (right.length === 0) continue
      const text = right.map((t) => t.str).join(' ')
      if (!buyerName) {
        buyerName = text
      } else {
        addressLines.push(text)
      }
    }
  }

  // Bloc récap : paires étiquette (x<140) → valeur (x≥140) sur la même ligne.
  const recap = new Map<string, string>()
  for (const row of rows) {
    const label = row.filter((t) => t.x < 140).map((t) => t.str).join(' ')
    const value = row.filter((t) => t.x >= 140 && t.x < 280).map((t) => t.str).join(' ')
    if (label && value) recap.set(label.toLowerCase(), value)
  }
  const recapGet = (needle: string): string => {
    for (const [k, v] of recap) if (k.includes(needle)) return v
    return ''
  }

  const contenu = recapGet('contenu').match(/(\d+)/)

  return {
    sale_id: sale?.[1] ?? '',
    buyer_username: buyer?.[1] ?? '',
    buyer_name: buyerName,
    buyer_address: addressLines.join('\n'),
    seller: seller?.[1] ?? '',
    sent_date: sent?.[1]?.trim() ?? '',
    article_count: contenu ? parseInt(contenu[1], 10) : null,
    item_value: recapGet("valeur de l'article"),
    shipping_cost: recapGet('frais de port'),
    total: recapGet('total'),
    shipping_method: recapGet("mode d'envoi"),
    tracking_number: recapGet('suivi')
  }
}

// --- Lignes de cartes ----------------------------------------------------------

function parseCards(rowsPerPage: Tok[][][]): ParsedCardLine[] {
  const cards: ParsedCardLine[] = []
  let inLorcana = false

  for (const rows of rowsPerPage) {
    for (const row of rows) {
      const joined = row.map((t) => t.str).join(' ')

      // En-têtes de section : « Lorcana Cartes: », « Magic Cartes: »…
      const section = joined.match(/^(\S[\w\s!:]*?)\s+Cartes\s*:/i)
      if (section && row[0].x < 25) {
        inLorcana = /lorcana/i.test(section[1])
        continue
      }
      if (!inLorcana) continue

      const card = parseCardRow(row) ?? parseCardText(joined)
      if (card) {
        cards.push(card)
      } else if (cards.length > 0 && row.length === 1 && row[0].x >= 28 && row[0].x < 213) {
        // Nom trop long qui déborde sur une seconde ligne dans la colonne nom.
        cards[cards.length - 1].name += ' ' + row[0].str
      }
    }
  }
  return cards
}

/** Analyse principale : classification des tokens par colonne (coordonnées x). */
function parseCardRow(row: Tok[]): ParsedCardLine | null {
  const qtyTok = row.find((t) => t.x < 28 && /^\d+$/.test(t.str))
  const priceTok = row.find((t) => t.x >= 500 && PRICE_RE.test(t.str))
  if (!qtyTok || !priceTok) return null

  const name = row.filter((t) => t !== qtyTok && t.x >= 28 && t.x < 213).map((t) => t.str).join(' ')
  const number = row.filter((t) => t.x >= 213 && t.x < 238).map((t) => t.str).join('')
  const middle = row
    .filter((t) => t.x >= 238 && t.x < 310)
    .map((t) => t.str)
    .join(' ')
    .split(/\s+/)
  const rarity = row.filter((t) => t.x >= 310 && t.x < 333).map((t) => t.str).join('')
  const comment = row
    .filter((t) => t.x >= 333 && t.x < 500)
    .map((t) => t.str)
    .join(' ')

  if (middle.length < 3) return null
  const setColor = middle[middle.length - 1].match(SET_COLOR_RE)
  if (!setColor) return null

  return buildCard({
    quantity: parseInt(qtyTok.str, 10),
    name,
    number,
    language: middle[0],
    condition: middle.slice(1, -1).join(' '),
    set_code: setColor[1],
    color_code: setColor[2],
    rarity_code: rarity,
    comment,
    price: priceTok.str
  })
}

/**
 * Analyse de repli sur le texte reconstitué, si la mise en page bouge :
 *   « 3 La Reine - Déguisement sournois 90 FR NM 12WIL L Booster to sleeve 1,50 EUR »
 */
function parseCardText(joined: string): ParsedCardLine | null {
  const m = joined.match(
    /^(\d+)\s+(.+?)\s+(\d+)\s+([A-Z]{2})\s+(NM|MT|M|EX|GD|LP|PL|PO)\s+(\d+)([A-Z]{3})\s+(\S+)\s*(.*?)\s*([\d.,]+\s*EUR)$/
  )
  if (!m) return null
  return buildCard({
    quantity: parseInt(m[1], 10),
    name: m[2],
    number: m[3],
    language: m[4],
    condition: m[5],
    set_code: m[6],
    color_code: m[7],
    rarity_code: m[8],
    comment: m[9],
    price: m[10]
  })
}

function buildCard(
  raw: Omit<ParsedCardLine, 'is_foil' | 'color_label' | 'number'> & { number: string }
): ParsedCardLine {
  return {
    ...raw,
    name: raw.name.trim(),
    number: raw.number.replace(/^0+(?=\d)/, ''),
    comment: raw.comment.trim(),
    color_label: CM_COLOR_CODE_TO_INK[raw.color_code] ?? raw.color_code,
    is_foil: FOIL_RE.test(raw.comment)
  }
}

/** Rareté canonique d'une ligne (pour le moteur de règles). */
export function canonicalRarity(rarityCode: string): string {
  return CM_RARITY_CODE_TO_RARITY[rarityCode] ?? rarityCode
}
