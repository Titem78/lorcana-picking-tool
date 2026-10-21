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
