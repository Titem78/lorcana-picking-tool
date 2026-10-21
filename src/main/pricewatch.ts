// Tracking (« 🎯 Traquer ») : relevés réguliers de la page
// produit Cardmarket d'une carte choisie PAR SA PAGE (version exacte, zéro
// ambiguïté). Garde-fous : 30 cartes max, rafraîchissement automatique
// une fois par jour seulement (app ouverte), 10 s entre deux cartes, bouton
// « Actualiser » pour le ponctuel. Les requêtes passent par cmFetch (canal
// navigateur, accepté par la protection anti-robot de Cardmarket).

import { getDb, logActivity } from './db'
import { cmFetch } from './cmshipping'

export const MAX_WATCHES = 30
const CADENCE_MS = 24 * 3600_000 // 1 lecture de page/jour : les prix viennent de l'export quotidien
const PAUSE_ENTRE_CARTES_MS = 10_000

export interface PriceWatch {
  id: number
  url: string
  label: string
  created_at: string
  active: number
  reserve_qty: number
  buy_price_cents: number | null
  id_product: number | null
  is_foil: number
}

export interface PricePoint {
  taken_at: string
  available: number | null
  from_cents: number | null
  trend_cents: number | null
  avg30_cents: number | null
  avg7_cents: number | null
  avg1_cents: number | null
  our_price_cents: number | null
  our_qty: number | null
}

/** « 10,73 € » / « 1.234,56 € » → centimes, null si illisible. */
export function euroEnCents(txt: string | null | undefined): number | null {
  const m = (txt ?? '').replace(/\s| /g, '').match(/([\d.]+)(?:,(\d{1,2}))?€?$/)
  if (!m) return null
  return parseInt(m[1].replace(/\./g, ''), 10) * 100 + parseInt((m[2] ?? '0').padEnd(2, '0'), 10)
}

/**
 * Lit les chiffres de la PAGE PRODUIT Cardmarket (libellés français) :
 * articles disponibles, prix plancher (« De »), tendance, prix moyens
 * 30/7/1 jours — plus NOTRE annonce (prix + quantité) si notre pseudo
 * apparaît dans les offres.
 */
/** Identifiant produit Cardmarket, présent dans la page (formulaires/JS). */
export function extractIdProduct(html: string): number | null {
  const m =
    html.match(/"idProduct"\s*[:=]\s*(\d{3,})/) ??
    html.match(/name="idProduct"[^>]*value="(\d{3,})"/) ??
    html.match(/idProduct=(\d{3,})/)
  return m ? parseInt(m[1], 10) : null
}

export function parseProductPage(
  html: string,
  ourUsername: string | null
): Omit<PricePoint, 'taken_at'> & { title: string | null } {
  const texte = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
  const prend = (re: RegExp): string | null => texte.match(re)?.[1] ?? null
  const dispo = prend(/Articles disponibles\s*:?\s*([\d.]+)/i)
  const point: Omit<PricePoint, 'taken_at'> & { title: string | null } = {
    available: dispo ? parseInt(dispo.replace(/\./g, ''), 10) : null,
    from_cents: euroEnCents(prend(/\bDe\s*:?\s*([\d.,]+\s*€)/)),
    trend_cents: euroEnCents(prend(/Tendance des prix\s*:?\s*([\d.,]+\s*€)/i)),
    avg30_cents: euroEnCents(prend(/Prix moyen 30 jours\s*:?\s*([\d.,]+\s*€)/i)),
    avg7_cents: euroEnCents(prend(/Prix moyen 7 jours\s*:?\s*([\d.,]+\s*€)/i)),
    avg1_cents: euroEnCents(prend(/Prix moyen 1 jour\s*:?\s*([\d.,]+\s*€)/i)),
    our_price_cents: null,
    our_qty: null,
    title: html.match(/<h1[^>]*>\s*([^<]+)/)?.[1]?.trim() ?? null
  }
  // Notre annonce : premier passage de notre pseudo dans les offres, suivi
  // du prix ; la quantité est le « item-count » voisin. Meilleure estimation,
  // null si structure inattendue — jamais bloquant.
  if (ourUsername) {
    const bloc = html.match(
      new RegExp(
        `/Users/${ourUsername.replace(/[.*+?^${'$'}{}()|[\\]\\\\]/g, '\\$&')}["'][\\s\\S]{0,2500}?([\\d.,]+)\\s*€[\\s\\S]{0,400}?item-count[^>]*>\\s*(\\d+)`,
        'i'
      )
    )
    if (bloc) {
      point.our_price_cents = euroEnCents(`${bloc[1]} €`)
      point.our_qty = parseInt(bloc[2], 10)
    }
  }
  return point
}

const URL_PRODUIT = /^https:\/\/(www\.)?cardmarket\.com\/[a-z]{2}\/Lorcana\/Products\//i

export function addWatch(userId: number, url: string, label: string): { ok: boolean; message: string } {
  const db = getDb()
  if (!URL_PRODUIT.test(url)) {
    return { ok: false, message: "Cette page n'est pas une page produit Cardmarket (Products/…)" }
  }
  const n = (db.prepare('SELECT COUNT(*) AS n FROM price_watch WHERE active = 1').get() as { n: number }).n
  if (n >= MAX_WATCHES) {
    return { ok: false, message: `Plafond atteint (${MAX_WATCHES} cartes suivies) — retire-en une d'abord` }
  }
  // l'ancre (#...) et les paramètres de pagination ne font pas partie de l'identité
  const propre = url.split('#')[0]
  const foil = /[?&]isFoil=(Y|1)/i.test(url) ? 1 : 0
  try {
    db.prepare('INSERT INTO price_watch (url, label, is_foil) VALUES (?, ?, ?)').run(propre, label.trim() || propre, foil)
  } catch {
    db.prepare('UPDATE price_watch SET active = 1, label = ?, is_foil = ? WHERE url = ?').run(label.trim() || propre, foil, propre)
  }
  logActivity(userId, 'pricewatch.added', { url: propre, label })
  return { ok: true, message: `📈 « ${label.trim() || propre} » est suivie — premier relevé en cours…` }
}

export function removeWatch(userId: number, id: number): void {
  getDb().prepare('UPDATE price_watch SET active = 0 WHERE id = ?').run(id)
  logActivity(userId, 'pricewatch.removed', { id })
}

export function listWatches(): (PriceWatch & { dernier: PricePoint | null; points: number })[] {
  const db = getDb()
  const watches = db
    .prepare('SELECT * FROM price_watch WHERE active = 1 ORDER BY created_at DESC')
    .all() as PriceWatch[]
  return watches.map((w) => {
    const dernier = db
      .prepare('SELECT * FROM price_points WHERE watch_id = ? ORDER BY taken_at DESC LIMIT 1')
      .get(w.id) as PricePoint | undefined
    const points = (
      db.prepare('SELECT COUNT(*) AS n FROM price_points WHERE watch_id = ?').get(w.id) as { n: number }
    ).n
    return { ...w, dernier: dernier ?? null, points }
  })
}

/** prix OFFICIELS du produit (export quotidien), colonnes foil si le suivi l'est. */
export interface CataloguePrix {
  name: string
  trend: number | null
  avg1: number | null
  avg7: number | null
  avg30: number | null
  low: number | null
}

/** Watches + prix exacts de l'export quotidien (via id_product, zéro ambiguïté). */
export async function listWatchesEnrichies(): Promise<
  (PriceWatch & { dernier: PricePoint | null; points: number; catalogue: CataloguePrix | null })[]
> {
  const base = listWatches()
  const { getMarketData } = await import('./cmdata')
  const data = await getMarketData().catch(() => null)
  if (!data) return base.map((w) => ({ ...w, catalogue: null }))
  const guideParId = new Map(data.guide.map((g) => [g.idProduct, g]))
  return base.map((w) => {
    const p = w.id_product != null ? data.produits.get(w.id_product) : undefined
    const g = w.id_product != null ? guideParId.get(w.id_product) : undefined
    if (!p && !g) return { ...w, catalogue: null }
    const f = w.is_foil === 1
    return {
      ...w,
      catalogue: {
        name: p?.name ?? w.label,
        trend: (f ? g?.['trend-foil'] : g?.trend) ?? null,
        avg1: (f ? g?.['avg1-foil'] : g?.avg1) ?? null,
        avg7: (f ? g?.['avg7-foil'] : g?.avg7) ?? null,
        avg30: (f ? g?.['avg30-foil'] : g?.avg30) ?? null,
        low: (f ? g?.['low-foil'] : g?.low) ?? null
      }
    }
  })
}

export function watchHistory(id: number): PricePoint[] {
  return getDb()
    .prepare('SELECT * FROM price_points WHERE watch_id = ? ORDER BY taken_at')
    .all(id) as PricePoint[]
}

function ourUsername(): string | null {
  const r = getDb().prepare("SELECT value FROM settings WHERE key = 'cm_username'").get() as
    | { value: string }
    | undefined
  return r?.value ?? null
}

/** Relève UNE carte maintenant (manuel ou planifié). */
export async function fetchWatch(id: number): Promise<{ ok: boolean; message: string }> {
  const db = getDb()
  const w = db.prepare('SELECT * FROM price_watch WHERE id = ?').get(id) as PriceWatch | undefined
  if (!w) return { ok: false, message: 'Carte suivie introuvable' }
  const r = await cmFetch(w.url).catch(() => null)
  if (!r || r.status !== 200) {
    return { ok: false, message: `Page produit inaccessible (HTTP ${r?.status ?? '—'})` }
  }
  const p = parseProductPage(r.text, ourUsername())
  const idp = extractIdProduct(r.text)
  if (idp && !w.id_product) {
    db.prepare('UPDATE price_watch SET id_product = ? WHERE id = ?').run(idp, id)
  }
  if (p.available == null && p.trend_cents == null && p.from_cents == null) {
    return { ok: false, message: 'Chiffres introuvables sur la page — envoie-moi un dump 🐞 de cette page produit' }
  }
  db.prepare(
    `INSERT INTO price_points (watch_id, available, from_cents, trend_cents, avg30_cents,
       avg7_cents, avg1_cents, our_price_cents, our_qty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, p.available, p.from_cents, p.trend_cents, p.avg30_cents, p.avg7_cents, p.avg1_cents, p.our_price_cents, p.our_qty)
  return { ok: true, message: '✔ Relevé enregistré' }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
let enCours = false

/**
 * Rafraîchit les cartes dont le dernier relevé date de plus de 12 h —
 * appelé par le planificateur (toutes les heures) ; étalé, jamais réentrant.
 */
export async function refreshDueWatches(force = false): Promise<number> {
  if (enCours || process.env.VITEST) return 0
  enCours = true
  let done = 0
  try {
    const db = getDb()
    const dus = db
      .prepare(
        `SELECT w.id FROM price_watch w
         WHERE w.active = 1 AND (? OR NOT EXISTS (
           SELECT 1 FROM price_points p WHERE p.watch_id = w.id
             AND p.taken_at >= datetime('now', 'localtime', ?)
         ))`
      )
      .all(force ? 1 : 0, `-${Math.round(CADENCE_MS / 3600_000)} hours`) as { id: number }[]
    for (const d of dus) {
      const r = await fetchWatch(d.id).catch(() => ({ ok: false }))
      if (r.ok) done++
      if (dus.length > 1) await sleep(PAUSE_ENTRE_CARTES_MS)
    }
  } finally {
    enCours = false
  }
  return done
}
