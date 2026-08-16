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
import { getDb, logActivity } from './db'

export const UA =
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

/**
 * Acheteur professionnel ? Le badge « Professionnel »
 * (fonticon-users-professional) figure dans le bloc acheteur SellerBuyerInfo
 * de la page de la vente — pas celui de la barre du haut (notre compte).
 */
export function parseBuyerPro(html: string): boolean | null {
  const i = html.indexOf('SellerBuyerInfo')
  if (i < 0) return null
  const bloc = html.slice(i, i + 4000)
  return /fonticon-users-professional/.test(bloc)
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
    .prepare('SELECT sale_id, shipping_method, cm_tracked, buyer_pro FROM orders WHERE id = ?')
    .get(orderId) as
    | { sale_id: string; shipping_method: string | null; cm_tracked: number | null; buyer_pro: number | null }
    | undefined
  if (!row) return false
  const complete =
    /max\.?\s*\d+\s*g/i.test(row.shipping_method ?? '') &&
    !isPolluted(row.shipping_method) &&
    row.cm_tracked != null &&
    row.buyer_pro != null
  if (complete) return false
  const html = await fetchOrderPage(row.sale_id).catch(() => null)
  if (!html) return false
  const s = parseShippingFromHtml(html)
  const pro = parseBuyerPro(html)
  if (!s && pro == null) return false
  db.prepare(
    `UPDATE orders SET
       shipping_method = COALESCE(?, shipping_method),
       cm_tracked = COALESCE(?, cm_tracked),
       buyer_pro = COALESCE(?, buyer_pro)
     WHERE id = ?`
  ).run(
    s ? `${s.method} (max. ${s.max_g}g)` : null,
    s?.tracked == null ? null : s.tracked ? 1 : 0,
    pro == null ? null : pro ? 1 : 0,
    orderId
  )
  return true
}

// --- Validation d'envoi sur Cardmarket (SEULE écriture de l'app, opt-in) ----------
// Demande explicite de l'utilisateur (2026-08-12) : au clic « Marquer
// expédiée », déposer le n° de suivi (formulaire Shipment_SetTrackingNumber)
// puis confirmer l'envoi (Shipment_ConfirmShipment) — calibré sur le dump réel
// d'une page de vente. Action 1-pour-1 avec un clic humain, jamais en masse.

/** Jeton anti-CSRF de la page (« __cmtkn »). Exporté pour les tests. */
export function parseCmToken(html: string): string | null {
  return html.match(/name="__cmtkn"\s+value="([0-9a-f]+)"/i)?.[1] ?? null
}

/** Le formulaire « Confirmer l'envoi » est-il encore présent (= pas envoyée) ? */
export function hasConfirmForm(html: string): boolean {
  return /Shipment_ConfirmShipment/.test(html)
}

export interface ConfirmShipResult {
  ok: boolean
  message: string
}

async function fetchOrderPage(saleId: string): Promise<string | null> {
  const ses = session.fromPartition('persist:cardmarket')
  const r = await ses.fetch(`https://www.cardmarket.com/fr/Lorcana/Orders/${saleId}`, {
    headers: { 'User-Agent': UA, Referer: 'https://www.cardmarket.com/fr/Lorcana' }
  })
  return r.ok ? r.text() : null
}

/** Vérifie à la demande si la vente est marquée « envoyée » côté Cardmarket. */
export async function checkShipmentStatus(
  orderId: number
): Promise<{ status: 'sent' | 'pending' | 'error'; message: string }> {
  const row = getDb()
    .prepare('SELECT sale_id FROM orders WHERE id = ?')
    .get(orderId) as { sale_id: string } | undefined
  if (!row) return { status: 'error', message: 'Commande introuvable' }
  const html = await fetchOrderPage(row.sale_id).catch(() => null)
  if (!html) {
    return { status: 'error', message: '❌ Page de la vente inaccessible — es-tu connecté à Cardmarket ?' }
  }
  return hasConfirmForm(html)
    ? { status: 'pending', message: '⚠ Sur Cardmarket, cette vente n’est PAS encore marquée envoyée' }
    : { status: 'sent', message: '✔ Sur Cardmarket, cette vente est bien marquée envoyée' }
}

export async function confirmShipmentOnCm(
  userId: number,
  orderId: number
): Promise<ConfirmShipResult> {
  const db = getDb()
  const row = db
    .prepare('SELECT sale_id, tracking_number FROM orders WHERE id = ?')
    .get(orderId) as { sale_id: string; tracking_number: string | null } | undefined
  if (!row) return { ok: false, message: 'Commande introuvable' }

  const ses = session.fromPartition('persist:cardmarket')
  const pageUrl = `https://www.cardmarket.com/fr/Lorcana/Orders/${row.sale_id}`
  const getPage = (): Promise<string | null> => fetchOrderPage(row.sale_id)

  let html = await getPage()
  if (!html) return { ok: false, message: '❌ Page de la vente inaccessible — es-tu connecté à Cardmarket ?' }
  if (!hasConfirmForm(html)) {
    return { ok: true, message: '✔ Envoi déjà confirmé sur Cardmarket' }
  }
  const token = parseCmToken(html)
  if (!token) return { ok: false, message: '❌ Jeton de formulaire introuvable — envoie-moi un dump 🐞 de la page' }

  const post = async (action: string, fields: Record<string, string>): Promise<boolean> => {
    const body = new URLSearchParams({ __cmtkn: token, idShipment: row.sale_id, ...fields })
    const r = await ses.fetch(`https://www.cardmarket.com/fr/Lorcana/PostGetAction/${action}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'User-Agent': UA,
        Referer: pageUrl,
        Origin: 'https://www.cardmarket.com',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    })
    return r.ok
  }

  const tracking = (row.tracking_number ?? '').trim()
  if (tracking) {
    const ok = await post('Shipment_SetTrackingNumber', { trackingNumber: tracking }).catch(() => false)
    if (!ok) return { ok: false, message: '❌ Échec du dépôt du n° de suivi sur Cardmarket' }
  }

  // Le dépôt du n° peut suffire à valider l'envoi : on relit la page,
  // et on ne confirme explicitement que si ce n'est pas déjà fait.
  html = await getPage()
  if (html == null || hasConfirmForm(html)) {
    const ok = await post('Shipment_ConfirmShipment', {}).catch(() => false)
    if (!ok) return { ok: false, message: '❌ Échec de la confirmation d’envoi sur Cardmarket' }
    html = await getPage()
  }

  const verified = html != null && !hasConfirmForm(html)
  logActivity(userId, 'cm.shipment_confirmed', {
    orderId,
    sale_id: row.sale_id,
    tracking: tracking || null,
    verified
  })
  return verified
    ? {
        ok: true,
        message: tracking
          ? `✔ Envoi confirmé sur Cardmarket, n° de suivi ${tracking} déposé`
          : '✔ Envoi confirmé sur Cardmarket'
      }
    : { ok: false, message: '⚠ Confirmation non vérifiée — contrôle la vente sur Cardmarket' }
}

/** Sommes-nous connectés à Cardmarket ? (bulle verte/rouge de la barre latérale) */
export async function isLoggedIn(): Promise<boolean> {
  try {
    const ses = session.fromPartition('persist:cardmarket')
    // Anti-cache indispensable : une copie « déconnectée » de la page pouvait
    // resservir et faire passer la bulle au rouge à tort
    const r = await ses.fetch(`https://www.cardmarket.com/fr/Lorcana?nc=${Date.now()}`, {
      headers: { 'User-Agent': UA, 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
    })
    if (!r.ok) return false
    const html = await r.text()
    return /D[ÉE]CONNEXION|\/Logout/i.test(html)
  } catch {
    return false
  }
}

/** L'option « valider les envois sur Cardmarket » est-elle activée ? (opt-in) */
export function isAutoConfirmEnabled(): boolean {
  const r = getDb()
    .prepare("SELECT value FROM settings WHERE key = 'cm_confirm_on_ship'")
    .get() as { value: string } | undefined
  return r?.value === '1'
}

/**
 * Rattrapage au démarrage : commandes ACTIVES incomplètes (moins de 30 jours),
 * ET commandes polluées par l'ancienne extraction. GARDE-FOUS pour ne jamais
 * accumuler de requêtes avec le temps :
 *  - 15 commandes maximum par démarrage ;
 *  - une commande qui a échoué 3 fois n'est plus JAMAIS retentée en auto ;
 *  - 3 échecs consécutifs (session sûrement déconnectée) = arrêt de la série.
 * À jour = zéro requête, quel que soit l'historique.
 */
export async function backfillShipping(): Promise<number> {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT id FROM orders
       WHERE cm_fetch_attempts < 3
         AND ((status IN ('imported', 'picking', 'picked', 'prepared')
               AND imported_at >= datetime('now', 'localtime', '-30 days')
               AND (shipping_method IS NULL OR shipping_method NOT LIKE '%max.%'
                    OR cm_tracked IS NULL OR buyer_pro IS NULL))
              OR shipping_method LIKE '%Méthode%' OR shipping_method LIKE '%Numéro%')
       LIMIT 15`
    )
    .all() as { id: number }[]
  let done = 0
  let consecutiveFailures = 0
  for (const r of rows) {
    const ok = await enrichShippingFromCm(r.id).catch(() => false)
    if (ok) {
      done++
      consecutiveFailures = 0
    } else {
      db.prepare('UPDATE orders SET cm_fetch_attempts = cm_fetch_attempts + 1 WHERE id = ?').run(r.id)
      consecutiveFailures++
      if (consecutiveFailures >= 3) break
    }
    await new Promise((res) => setTimeout(res, 800))
  }
  return done
}
