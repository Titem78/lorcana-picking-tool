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
      if (!guide?.priceGuides) guide = lisDisque('cm-price-guide.json') as typeof guide
      if (!prods?.products) prods = lisDisque('cm-products.json') as typeof prods
      if (!guide?.priceGuides || !prods?.products) {
        dernierEchec = Date.now()
        return cache
      }
      cache = {
        createdAt: guide.createdAt ?? new Date().toISOString(),
        guide: guide.priceGuides,
        produits: new Map(prods.products.map((p) => [p.idProduct, p]))
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
  source: 'stock' | 'réserve'
  qty: number
  foil: boolean
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

/**
 * Cartes POSSÉDÉES dont le prix du jour décolle au-dessus de la tendance
 * (seuil %) — triées par écart décroissant. Les versions d'un même nom ne
 * sont pas différenciables côté export (pas de numéro) : on prend la carte
 * de BASE (premier produit), le nom affiché permet de vérifier.
 */
export async function marketRadar(
  data: MarketData,
  seuilPct = 15
): Promise<RadarRow[]> {
  const pont = await getPont()
  if (!pont) return []
  const parNom = produitsParNom(data.produits)
  const guideParId = new Map(data.guide.map((g) => [g.idProduct, g]))
  const db = getDb()

  const sources: { name: string; set: string; foil: boolean; qty: number; source: 'stock' | 'réserve'; buy: number | null }[] = []
  for (const r of db
    .prepare(
      `SELECT name, COALESCE(NULLIF(set_code,''), NULLIF(color_code,''), '') AS s, is_foil,
              SUM(quantity) AS q
       FROM stock_items GROUP BY name, s, is_foil`
    )
    .all() as { name: string; s: string; is_foil: number; q: number }[]) {
    sources.push({ name: r.name, set: r.s, foil: r.is_foil === 1, qty: r.q, source: 'stock', buy: null })
  }
  for (const w of db
    .prepare('SELECT label, reserve_qty, buy_price_cents FROM price_watch WHERE active = 1 AND reserve_qty > 0')
    .all() as { label: string; reserve_qty: number; buy_price_cents: number | null }[]) {
    // la réserve n'a pas de set déclaré : résolu par le nom seul (FR ou EN)
    sources.push({ name: w.label, set: '', foil: /foil/i.test(w.label), qty: w.reserve_qty, source: 'réserve', buy: w.buy_price_cents })
  }

  const rows: RadarRow[] = []
  const vus = new Set<string>()
  for (const s of sources) {
    const frNorm = normName(s.name)
    // FR → EN via le pont (set connu, sinon tout set où le nom existe)
    let enNorm: string | null = null
    if (s.set) enNorm = pont.parFrSet[`${frNorm}|${s.set}`]?.en ?? null
    if (!enNorm) {
      for (const k of Object.keys(pont.parFrSet)) {
        if (k.startsWith(`${frNorm}|`)) {
          enNorm = pont.parFrSet[k].en
          break
        }
      }
    }
    // le libellé est peut-être déjà le nom anglais (catalogue, page EN…)
    if (!enNorm && parNom.has(frNorm)) enNorm = frNorm
    if (!enNorm) continue
    const prods = parNom.get(enNorm)
    if (!prods?.length) continue
    const g = guideParId.get(prods[0].idProduct)
    if (!g) continue
    const trend = s.foil ? g['trend-foil'] : g.trend
    const avg1 = s.foil ? g['avg1-foil'] : g.avg1
    const avg7 = s.foil ? g['avg7-foil'] : g.avg7
    if (trend == null || avg1 == null || trend <= 0) continue
    const pct = ((avg1 - trend) / trend) * 100
    if (pct < seuilPct) continue
    const cle = `${enNorm}|${s.foil}|${s.source}`
    if (vus.has(cle)) continue
    vus.add(cle)
    rows.push({
      name: s.name,
      source: s.source,
      qty: s.qty,
      foil: s.foil,
      trend,
      avg1,
      avg7,
      ecart_pct: pct,
      buy_price_cents: s.buy
    })
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
