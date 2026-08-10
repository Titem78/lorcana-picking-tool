// Grammage demandé par Cardmarket : le PDF de vente ne contient que le nom de
// la méthode (« Lettre Verte Suivi ») — le « (max. 100g) » n'apparaît QUE sur
// la page de la vente, et peut varier pour un même nom de méthode. On va donc
// le lire sur la page, en LECTURE SEULE, via la session Cardmarket déjà
// connectée (cookies persist:cardmarket) — aucune écriture, jamais bloquant.

import { session } from 'electron'
import { getDb } from './db'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export interface CmShipping {
  method: string
  max_g: number
}

/** Lit « Méthode d'envoi : <nom> (max. NNg) » sur la page de la vente. */
export async function fetchOrderShipping(saleId: string): Promise<CmShipping | null> {
  const ses = session.fromPartition('persist:cardmarket')
  const res = await ses.fetch(`https://www.cardmarket.com/fr/Lorcana/Orders/${saleId}`, {
    headers: { 'User-Agent': UA, Referer: 'https://www.cardmarket.com/fr/Lorcana' }
  })
  if (!res.ok) return null
  const text = (await res.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const m = text.match(/M[ée]thode d'envoi\s*:?\s*(.{0,120}?)\s*\(\s*max\.?\s*(\d+)\s*g\s*\)/i)
  if (!m) return null
  return { method: m[1].trim(), max_g: parseInt(m[2], 10) }
}

/**
 * Complète orders.shipping_method avec le « (max. NNg) » de la page si absent.
 * Silencieux : hors-ligne, non connecté ou page inaccessible → on réessaiera.
 */
export async function enrichShippingFromCm(orderId: number): Promise<boolean> {
  const db = getDb()
  const row = db
    .prepare('SELECT sale_id, shipping_method FROM orders WHERE id = ?')
    .get(orderId) as { sale_id: string; shipping_method: string | null } | undefined
  if (!row || /max\.?\s*\d+\s*g/i.test(row.shipping_method ?? '')) return false
  const s = await fetchOrderShipping(row.sale_id).catch(() => null)
  if (!s) return false
  const method = s.method || row.shipping_method || ''
  db.prepare('UPDATE orders SET shipping_method = ? WHERE id = ?').run(
    `${method} (max. ${s.max_g}g)`,
    orderId
  )
  return true
}

/** Rattrapage : toutes les commandes ACTIVES sans grammage (au démarrage). */
export async function backfillShipping(): Promise<number> {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT id FROM orders
       WHERE status IN ('imported', 'picking', 'picked', 'prepared')
         AND (shipping_method IS NULL OR shipping_method NOT LIKE '%max.%')`
    )
    .all() as { id: number }[]
  let done = 0
  for (const r of rows) {
    if (await enrichShippingFromCm(r.id).catch(() => false)) done++
    await new Promise((res) => setTimeout(res, 800))
  }
  return done
}
