// Export OFFICIEL quotidien de Cardmarket (découverte utilisateur, 21/10) :
// price guide complet (prix moyens réels de VENTE : avg1/7/30, tendance EMA,
// plancher — versions foil comprises) + catalogue produits, servis par le CDN
// S3 (PAS de protection Cloudflare, un téléchargement par jour suffit).
// → analyse de TOUT le marché Lorcana sans une seule requête de page.

import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const GUIDE_URL = 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_19.json'
const PRODUCTS_URL =
  'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_19.json'
const NONSINGLES_URL =
  'https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_19.json'
const UA = 'LorcanaPickingTool/2.0 (+local)'
const STALE_MS = 20 * 3600_000 // l'export est régénéré quotidiennement
const MISS_MS = 3600_000

export interface GuideRow {
  idProduct: number
  avg: number | null
  low: number | null
  trend: number | null
  avg1: number | null
  avg7: number | null
  avg30: number | null
  'avg-foil': number | null
  'low-foil': number | null
  'trend-foil': number | null
  'avg1-foil': number | null
  'avg7-foil': number | null
  'avg30-foil': number | null
}

export interface ProduitRow {
  idProduct: number
  name: string
  idExpansion: number
  dateAdded: string
}

export interface MarketData {
  createdAt: string
  guide: GuideRow[]
  produits: Map<number, ProduitRow>
}

let cache: MarketData | null = null
let chargement: Promise<MarketData | null> | null = null
let dernierEchec = 0

function fichier(nom: string): string {
  const dir = join(app.getPath('userData'), 'cache')
  mkdirSync(dir, { recursive: true })
  return join(dir, nom)
}

async function telecharge(url: string, nom: string): Promise<unknown | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) })
    if (!r.ok) return null
    const texte = await r.text()
    writeFileSync(fichier(nom), texte, 'utf-8')
    return JSON.parse(texte)
  } catch {
    return null
  }
}

function lisDisque(nom: string): unknown | null {
  try {
    return JSON.parse(readFileSync(fichier(nom), 'utf-8'))
  } catch {
    return null
  }
}

export async function getMarketData(force = false): Promise<MarketData | null> {
  if (process.env.VITEST) return null
  const frais = cache && Date.now() - Date.parse(cache.createdAt) < STALE_MS
  if (cache && frais && !force) return cache
  if (!chargement) {
    chargement = (async () => {
      chargement = null
      if (!force && Date.now() - dernierEchec < MISS_MS) return cache
      let guide = (await telecharge(GUIDE_URL, 'cm-price-guide.json')) as {
        createdAt?: string
        priceGuides?: GuideRow[]
      } | null
      let prods = (await telecharge(PRODUCTS_URL, 'cm-products.json')) as {
        products?: ProduitRow[]
      } | null
      // le SCELLÉ aussi (boosters, displays…) : l'export de prix le couvre
      let scelles = (await telecharge(NONSINGLES_URL, 'cm-products-ns.json')) as {
        products?: ProduitRow[]
      } | null
      if (!guide?.priceGuides) guide = lisDisque('cm-price-guide.json') as typeof guide
      if (!prods?.products) prods = lisDisque('cm-products.json') as typeof prods
      if (!scelles?.products) scelles = lisDisque('cm-products-ns.json') as typeof scelles
      if (!guide?.priceGuides || !prods?.products) {
        dernierEchec = Date.now()
        return cache
      }
      cache = {
        createdAt: guide.createdAt ?? new Date().toISOString(),
        guide: guide.priceGuides,
        produits: new Map(
          [...prods.products, ...(scelles?.products ?? [])].map((p) => [p.idProduct, p])
        )
      }
      return cache
    })()
  }
  return cache ?? (await chargement)
}

// --- Radar « mes cartes » --------------------------------------------------------
// Croise l'export de prix avec CE QUE TU POSSÈDES : le stock LISTÉ (miroir)
// ET la RÉSERVE (cartes suivies avec une quantité en classeur, en attente du
// bon moment). Chaîne de correspondance : nom FR → pont LorcanaJSON → nom EN
// + set → produit du catalogue (l'export parle anglais).

import { getDb } from './db'
import { normName, getPont } from './lorcanajson'

export interface RadarRow {
  name: string
  /** quantités par origine : annonce en vente / détenu hors vente */
  qty_en_vente: number
  qty_detenu: number
  foil: boolean
  /** correspondance exacte (identifiant produit) ou par nom/version */
  exact: boolean
  trend: number
  avg1: number
  avg7: number | null
  ecart_pct: number
  buy_price_cents: number | null
}

/** index produits par « nom EN normalisé » (toutes versions confondues). */
function produitsParNom(produits: Map<number, ProduitRow>): Map<string, ProduitRow[]> {
  const m = new Map<string, ProduitRow[]>()
  for (const p of produits.values()) {
    const k = normName(p.name)
    const l = m.get(k) ?? []
    l.push(p)
    m.set(k, l)
  }
  for (const l of m.values()) l.sort((a, b) => a.dateAdded.localeCompare(b.dateAdded))
  return m
}

/** nom FR (ou déjà EN) + set → nom EN normalisé du catalogue, via le pont. */
function resoudreNomEn(
  nom: string,
  set: string,
  parNom: Map<string, ProduitRow[]>,
  pont: Awaited<ReturnType<typeof getPont>>
): string | null {
  const frNorm = normName(nom)
  let enNorm: string | null = set ? (pont?.parFrSet[`${frNorm}|${set}`]?.en ?? null) : null
  if (!enNorm && pont) {
    for (const k of Object.keys(pont.parFrSet)) {
      if (k.startsWith(`${frNorm}|`)) {
        enNorm = pont.parFrSet[k].en
        break
      }
    }
  }
  if (!enNorm && parNom.has(frNorm)) enNorm = frNorm // scellé / nom déjà anglais
  return enNorm
}

export interface AnnonceStock {
  qty: number
  /** annonce la moins chère (celle qui part en premier) */
  price_cents: number
  foil: boolean
}

/**
 * NOS annonces (miroir stock de l'inventaire) indexées par produit exact
 * `idProduct|foil` — même chaîne de correspondance que le radar. Sert de
 * source de vérité pour « Mon annonce » : la page produit ne liste que ses
 * premières offres, une annonce chère n'y figure pas du tout.
 */
export async function annoncesStockParProduit(data: MarketData): Promise<Map<string, AnnonceStock>> {
  const pont = await getPont()
  const parNom = produitsParNom(data.produits)
  const { prixEnCents } = await import('./stock')
  const db = getDb()
  const m = new Map<string, AnnonceStock>()
  const stock = db
    .prepare(
      `SELECT name, COALESCE(NULLIF(set_code,''), NULLIF(color_code,''), '') AS s, is_foil,
              quantity, price
       FROM stock_items`
    )
    .all() as { name: string; s: string; is_foil: number; quantity: number; price: string | null }[]
  for (const r of stock) {
    const enNorm = resoudreNomEn(r.name, r.s, parNom, pont)
    if (!enNorm) continue
    const prods = parNom.get(enNorm)
    if (!prods?.length) continue
    const produit = produitPourVersion(prods, r.name)
    if (!produit) continue
    const cents = prixEnCents(r.price)
    if (cents <= 0) continue
    const cle = `${produit.idProduct}|${r.is_foil === 1}`
    const deja = m.get(cle)
    if (deja) {
      deja.qty += r.quantity
      deja.price_cents = Math.min(deja.price_cents, cents)
    } else {
      m.set(cle, { qty: r.quantity, price_cents: cents, foil: r.is_foil === 1 })
    }
  }
  return m
}

/** Version (V.x) d'un nom : l'ordre des produits = l'ordre de création
 *  Cardmarket (vérifié : V.1 = base créée d'abord, V.2 = variante suivante). */
export function produitPourVersion(prods: ProduitRow[], nom: string): ProduitRow | null {
  if (!prods.length) return null
  const m = nom.match(/\(V\.(\d+)\)\s*$/i)
  const index = m ? parseInt(m[1], 10) - 1 : 0
  return prods[index] ?? null
}

/**
 * Cartes POSSÉDÉES dont le prix du jour décolle au-dessus de la tendance :
 * 1) produits TRAQUÉS (identifiant produit = correspondance EXACTE, versions
 *    et foil compris) — détenu hors vente et/ou annonce en vente ;
 * 2) stock listé (miroir) par nom + suffixe (V.x) → version correcte ;
 * dédoublonné par identifiant produit (le traqué prime sur le stock).
 */
export async function marketRadar(data: MarketData, seuilPct = 15): Promise<RadarRow[]> {
  const pont = await getPont()
  const parNom = produitsParNom(data.produits)
  const guideParId = new Map(data.guide.map((g) => [g.idProduct, g]))
  const db = getDb()
  const rows: RadarRow[] = []
  const couverts = new Set<string>() // `${idProduct}|${foil}`

  const evalue = (
    idProduct: number,
    foil: boolean,
    nom: string,
    exact: boolean,
    enVente: number,
    detenu: number,
    buy: number | null
  ): void => {
    const g = guideParId.get(idProduct)
    if (!g) return
    const trend = foil ? g['trend-foil'] : g.trend
    const avg1 = foil ? g['avg1-foil'] : g.avg1
    const avg7 = foil ? g['avg7-foil'] : g.avg7
    if (trend == null || avg1 == null || trend <= 0) return
    const cle = `${idProduct}|${foil}`
    if (couverts.has(cle)) return
    couverts.add(cle)
    const pct = ((avg1 - trend) / trend) * 100
    if (pct < seuilPct) return
    rows.push({
      name: nom,
      qty_en_vente: enVente,
      qty_detenu: detenu,
      foil,
      exact,
      trend,
      avg1,
      avg7,
      ecart_pct: pct,
      buy_price_cents: buy
    })
  }

  // 1) produits TRAQUÉS — exacts
  const traques = db
    .prepare(
      `SELECT w.id, w.label, w.id_product, w.is_foil, w.reserve_qty, w.buy_price_cents,
              (SELECT p.our_qty FROM price_points p WHERE p.watch_id = w.id
               ORDER BY p.taken_at DESC LIMIT 1) AS en_vente
       FROM price_watch w WHERE w.active = 1 AND w.id_product IS NOT NULL`
    )
    .all() as { label: string; id_product: number; is_foil: number; reserve_qty: number; buy_price_cents: number | null; en_vente: number | null }[]
  for (const t of traques) {
    const nom = data.produits.get(t.id_product)?.name ?? t.label
    evalue(t.id_product, t.is_foil === 1, nom, true, t.en_vente ?? 0, t.reserve_qty, t.buy_price_cents)
  }

  // 2) stock listé — par nom + (V.x), via le pont FR→EN
  if (pont) {
    const stock = db
      .prepare(
        `SELECT name, COALESCE(NULLIF(set_code,''), NULLIF(color_code,''), '') AS s, is_foil,
                SUM(quantity) AS q
         FROM stock_items GROUP BY name, s, is_foil`
      )
      .all() as { name: string; s: string; is_foil: number; q: number }[]
    for (const r of stock) {
      const enNorm = resoudreNomEn(r.name, r.s, parNom, pont)
      if (!enNorm) continue
      const prods = parNom.get(enNorm)
      if (!prods?.length) continue
      const produit = produitPourVersion(prods, r.name)
      if (!produit) continue
      evalue(produit.idProduct, r.is_foil === 1, r.name, false, r.q, 0, null)
    }
  }

  rows.sort((a, b) => b.ecart_pct - a.ecart_pct)
  return rows.slice(0, 60)
}

export interface Opportunite {
  idProduct: number
  name: string
  foil: boolean
  trend: number
  avg1: number
  avg7: number | null
  low: number | null
  /** achat : (trend−avg1)/trend ; bulle : (avg1−trend)/trend — en % */
  ecart_pct: number
}

/**
 * Détection d'opportunités sur TOUT le catalogue (logique utilisateur) :
 * - ACHAT : avg1 nettement SOUS la tendance (vendeurs récents sous le marché,
 *   l'EMA n'a pas encore baissé) ;
 * - BULLE : avg1 nettement AU-DESSUS (pic d'achats/hype — à ne pas acheter,
 *   et bon moment pour VENDRE si on l'a en stock).
 * avg7 exigé : garantit des ventes réelles récentes, pas un marché mort.
 */
export function scanOpportunites(
  data: Pick<MarketData, 'guide' | 'produits'>,
  opts?: { minTrendCents?: number; seuilAchatPct?: number; seuilBullePct?: number; topN?: number }
): { achats: Opportunite[]; bulles: Opportunite[] } {
  const minTrend = opts?.minTrendCents ?? 100
  const seuilAchat = opts?.seuilAchatPct ?? 20
  const seuilBulle = opts?.seuilBullePct ?? 30
  const topN = opts?.topN ?? 60
  const achats: Opportunite[] = []
  const bulles: Opportunite[] = []
  const examine = (
    row: GuideRow,
    foil: boolean,
    trend: number | null,
    avg1: number | null,
    avg7: number | null,
    low: number | null
  ): void => {
    if (trend == null || avg1 == null || avg7 == null || trend < minTrend) return
    const nom = data.produits.get(row.idProduct)?.name
    if (!nom) return
    if (avg1 < trend) {
      const pct = ((trend - avg1) / trend) * 100
      if (pct >= seuilAchat) {
        achats.push({ idProduct: row.idProduct, name: nom, foil, trend, avg1, avg7, low, ecart_pct: pct })
      }
    } else {
      const pct = ((avg1 - trend) / trend) * 100
      if (pct >= seuilBulle) {
        bulles.push({ idProduct: row.idProduct, name: nom, foil, trend, avg1, avg7, low, ecart_pct: pct })
      }
    }
  }
  for (const g of data.guide) {
    examine(g, false, g.trend, g.avg1, g.avg7, g.low)
    examine(g, true, g['trend-foil'], g['avg1-foil'], g['avg7-foil'], g['low-foil'])
  }
  achats.sort((a, b) => b.ecart_pct - a.ecart_pct)
  bulles.sort((a, b) => b.ecart_pct - a.ecart_pct)
  return { achats: achats.slice(0, topN), bulles: bulles.slice(0, topN) }
}
