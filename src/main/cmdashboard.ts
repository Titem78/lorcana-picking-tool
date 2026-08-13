// Tableau de bord : lecture à la demande (2 requêtes max) de l'état Cardmarket
// — ventes payées à traiter, messages non lus, solde — croisé avec la base
// locale. AUCUNE actualisation en boucle : uniquement à l'ouverture de
// l'onglet 📊 ou sur clic « Actualiser ».

import { session } from 'electron'
import { getDb } from './db'
import { UA } from './cmshipping'

export interface CmDashboard {
  ok: boolean
  error?: string
  balance: string | null
  /** Ventes payées côté Cardmarket (à préparer/envoyer) */
  paid_count: number | null
  paid_capped: boolean
  /** Ventes payées visibles non encore importées dans l'app */
  to_import: string[]
  /** Liste des ventes illisible (structure inattendue) — compteur seul */
  list_ok: boolean
  /** Messages non lus (null = structure non calibrée, envoyer un dump) */
  unread: number | null
  fetched_at: string
}

async function get(url: string): Promise<string | null> {
  const ses = session.fromPartition('persist:cardmarket')
  const r = await ses.fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://www.cardmarket.com/fr/Lorcana' }
  })
  return r.ok ? r.text() : null
}

/** Parseurs purs (testables) --------------------------------------------------- */

export function parsePaidSales(html: string): {
  ids: string[]
  count: number | null
  capped: boolean
} {
  const ids = [...new Set([...html.matchAll(/\/fr\/Lorcana\/Orders\/(\d{6,})/g)].map((m) => m[1]))]
  const totalM = html.match(/class="total-count"[^>]*>\s*([\d.]+)\s*(\+?)/)
  return {
    ids,
    count: totalM ? parseInt(totalM[1].replace(/\./g, ''), 10) : ids.length || null,
    capped: totalM ? totalM[2] === '+' : false
  }
}

export function parseBalance(html: string): string | null {
  const m = html.match(/text-success[^>]*>\s*\(?\s*([\d.,]+)\s*€/)
  return m ? `${m[1]} €` : null
}

/** Nb de conversations non lues ; null si la structure n'est pas reconnaissable. */
export function parseUnread(html: string): number | null {
  const explicit = html.match(/(\d+)\s*message[s]?\s+non\s+lus?/i)
  if (explicit) return parseInt(explicit[1], 10)
  const marked = [...html.matchAll(/class="[^"]*unread[^"]*"/gi)].length
  if (marked > 0) return marked
  // Aucun marqueur : soit zéro non-lu, soit structure inconnue — on ne sait
  // pas trancher tant qu'un dump avec non-lus n'a pas servi à calibrer.
  return /Account\/Messages\//.test(html) ? 0 : null
}

export async function fetchCmDashboard(): Promise<CmDashboard> {
  const now = new Date().toTimeString().slice(0, 5)
  const empty: CmDashboard = {
    ok: false,
    balance: null,
    paid_count: null,
    paid_capped: false,
    to_import: [],
    list_ok: false,
    unread: null,
    fetched_at: now
  }
  const sales = await get('https://www.cardmarket.com/fr/Lorcana/Orders/Sales/Paid').catch(() => null)
  if (!sales) {
    return { ...empty, error: 'Page « Mes ventes payées » inaccessible — es-tu connecté à Cardmarket dans l’onglet 🌐 ?' }
  }
  const paid = parsePaidSales(sales)
  const known = new Set(
    (getDb().prepare('SELECT sale_id FROM orders').all() as { sale_id: string }[]).map((r) => r.sale_id)
  )
  const msgs = await get('https://www.cardmarket.com/fr/Lorcana/Account/Messages').catch(() => null)
  return {
    ok: true,
    balance: parseBalance(sales),
    paid_count: paid.count,
    paid_capped: paid.capped,
    to_import: paid.ids.filter((id) => !known.has(id)),
    list_ok: paid.ids.length > 0 || paid.count === 0,
    unread: msgs ? parseUnread(msgs) : null,
    fetched_at: now
  }
}
