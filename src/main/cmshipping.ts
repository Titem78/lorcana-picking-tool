// Grammage demandé par Cardmarket : le PDF de vente ne contient que le nom de
// la méthode (« Lettre Verte Suivi ») — le « (max. 100g) » n'apparaît QUE sur
// la page de la vente, et peut varier pour un même nom de méthode. On va donc
// le lire sur la page, en LECTURE SEULE, via la session Cardmarket déjà
// connectée (cookies persist:cardmarket) — aucune écriture, jamais bloquant.
//
// ⚠ Leçon du 2026-08-12 : la page contient AUSSI le libellé « Méthode d'envoi
// & Numéro de suivi » (panneau « Créer un modèle ») — une extraction naïve
// avait pollué la dénomination ET fait afficher « AVEC suivi » sur des envois
// non suivis (4 commandes sur-affranchies). D'où : capture qui ne peut pas
// traverser un autre libellé, et suivi lu EXPLICITEMENT sur la page.

import { session } from 'electron'
import { getDb } from './db'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export interface CmShipping {
  method: string
  max_g: number
  /** true = suivi, false = non suivi, null = indéterminé */
  tracked: boolean | null
}

/**
 * Extraction PURE (testée) depuis le HTML de la page d'une vente.
 * - La dénomination est capturée après « Méthode d'envoi » sans pouvoir
 *   traverser un autre libellé (Méthode/Numéro) ni des parenthèses.
 * - Le suivi vient des mentions explicites « Envoi non suivi » /
 *   « Suivi | Trustee Service », jamais du nom de la méthode.
 */
export function parseShippingFromHtml(html: string): CmShipping | null {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const m = text.match(
    /M[ée]thode d'envoi\s*:?\s*((?:(?!M[ée]thode|Num[ée]ro|Suivi\s*\||Envoi non suivi)[^():]){1,80}?)\s*\(\s*max\.?\s*(\d+)\s*g\s*\)/i
  )
  if (!m) return null
  const method = m[1].replace(/^[&\s]+/, '').trim()
  if (!method) return null
  const tracked = /Envoi non suivi/i.test(text)
    ? false
    : /Suivi\s*\|\s*Trustee/i.test(text)
      ? true
      : null
  return { method, max_g: parseInt(m[2], 10), tracked }
}

/** Lit la page de la vente dans la session Cardmarket connectée. */
export async function fetchOrderShipping(saleId: string): Promise<CmShipping | null> {
  const ses = session.fromPartition('persist:cardmarket')
  const res = await ses.fetch(`https://www.cardmarket.com/fr/Lorcana/Orders/${saleId}`, {
    headers: { 'User-Agent': UA, Referer: 'https://www.cardmarket.com/fr/Lorcana' }
  })
  if (!res.ok) return null
  return parseShippingFromHtml(await res.text())
}

/** La méthode stockée a-t-elle été polluée par l'ancienne extraction ? */
function isPolluted(method: string | null): boolean {
  return /M[ée]thode|Num[ée]ro/i.test(method ?? '')
}

/**
 * Complète orders.shipping_method (« <méthode> (max. NNg) ») et cm_tracked.
 * Silencieux : hors-ligne, non connecté ou page inaccessible → on réessaiera.
 */
export async function enrichShippingFromCm(orderId: number): Promise<boolean> {
  const db = getDb()
  const row = db
    .prepare('SELECT sale_id, shipping_method, cm_tracked FROM orders WHERE id = ?')
    .get(orderId) as
    | { sale_id: string; shipping_method: string | null; cm_tracked: number | null }
    | undefined
  if (!row) return false
  const complete =
    /max\.?\s*\d+\s*g/i.test(row.shipping_method ?? '') &&
    !isPolluted(row.shipping_method) &&
    row.cm_tracked != null
  if (complete) return false
  const s = await fetchOrderShipping(row.sale_id).catch(() => null)
  if (!s) return false
  db.prepare('UPDATE orders SET shipping_method = ?, cm_tracked = ? WHERE id = ?').run(
    `${s.method} (max. ${s.max_g}g)`,
    s.tracked == null ? null : s.tracked ? 1 : 0,
    orderId
  )
  return true
}

/**
 * Rattrapage au démarrage : commandes ACTIVES incomplètes, ET toutes les
 * commandes (même expédiées) polluées par l'ancienne extraction.
 */
export async function backfillShipping(): Promise<number> {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT id FROM orders
       WHERE (status IN ('imported', 'picking', 'picked', 'prepared')
              AND (shipping_method IS NULL OR shipping_method NOT LIKE '%max.%' OR cm_tracked IS NULL))
          OR shipping_method LIKE '%Méthode%' OR shipping_method LIKE '%Numéro%'`
    )
    .all() as { id: number }[]
  let done = 0
  for (const r of rows) {
    if (await enrichShippingFromCm(r.id).catch(() => false)) done++
    await new Promise((res) => setTimeout(res, 800))
  }
  return done
}
