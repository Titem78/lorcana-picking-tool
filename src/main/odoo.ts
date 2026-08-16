// Connecteur Odoo (JSON-RPC, compatible Odoo Online et auto-hébergé ≥ 14).
//
// Pour chaque commande Cardmarket expédiée :
//   1. retrouve ou crée le client « Cardmarket - <pseudo> » (res.partner)
//   2. crée une FACTURE CLIENT EN BROUILLON (account.move, out_invoice) :
//      une ligne par carte (qté × prix unitaire Cardmarket) + une ligne de
//      frais de port — le total correspond exactement à Cardmarket.
// La facture reste en brouillon : validation à faire dans Odoo (choix taxes,
// journal... restent sous contrôle de l'utilisateur).
//
// La configuration (URL, base, utilisateur, clé API) est saisie dans les
// Réglages de l'app et stockée dans la table settings, en local uniquement.

import { getDb, logActivity } from './db'
import { getOrderLines } from './orders'
import type { Order } from '@shared/types'

export interface OdooConfig {
  url: string
  db: string
  user: string
  apiKey: string
  /** 'per_buyer' = un client Odoo par pseudo ; 'single' = un client unique */
  partnerMode: 'per_buyer' | 'single'
  /** nom du client unique quand partnerMode = 'single' (ex. « Cardmarket ») */
  singlePartner: string
  /** id res.partner du client unique EXISTANT choisi dans Odoo (prioritaire sur le nom) */
  singlePartnerId: number | null
  /** associations articles Odoo par type de produit (null = ligne en texte libre) */
  productCardsId: number | null
  productCardsName: string
  productDiceId: number | null
  productDiceName: string
  productOtherId: number | null
  productOtherName: string
  /** article Odoo pour la ligne « Frais de port » */
  productShippingId: number | null
  productShippingName: string
  /** taxe de vente appliquée à toutes les lignes (ex. TVA 20 %) */
  taxId: number | null
  taxName: string
  taxRate: number // pourcentage, ex. 20 — sert à convertir le TTC Cardmarket en HT
}

export function getOdooConfig(): OdooConfig | null {
  const rows = getDb()
    .prepare("SELECT key, value FROM settings WHERE key LIKE 'odoo_%'")
    .all() as { key: string; value: string }[]
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  if (!map.odoo_url || !map.odoo_db || !map.odoo_user || !map.odoo_api_key) return null
  const num = (v: string | undefined): number | null => {
    const n = parseInt(v ?? '', 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  return {
    url: map.odoo_url,
    db: map.odoo_db,
    user: map.odoo_user,
    apiKey: map.odoo_api_key,
    partnerMode: map.odoo_partner_mode === 'single' ? 'single' : 'per_buyer',
    singlePartner: map.odoo_single_partner || 'Cardmarket',
    singlePartnerId: num(map.odoo_single_partner_id),
    productCardsId: num(map.odoo_product_cards_id),
    productCardsName: map.odoo_product_cards_name || '',
    productDiceId: num(map.odoo_product_dice_id),
    productDiceName: map.odoo_product_dice_name || '',
    productOtherId: num(map.odoo_product_other_id),
    productOtherName: map.odoo_product_other_name || '',
    productShippingId: num(map.odoo_product_shipping_id),
    productShippingName: map.odoo_product_shipping_name || '',
    taxId: num(map.odoo_tax_id),
    taxName: map.odoo_tax_name || '',
    taxRate: parseFloat(map.odoo_tax_rate ?? '') || 20
  }
}

export function saveOdooConfig(userId: number, cfg: OdooConfig): void {
  const db = getDb()
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  const tx = db.transaction(() => {
    up.run('odoo_url', cfg.url.trim().replace(/\/+$/, ''))
    up.run('odoo_db', cfg.db.trim())
    up.run('odoo_user', cfg.user.trim())
    up.run('odoo_api_key', cfg.apiKey.trim())
    up.run('odoo_partner_mode', cfg.partnerMode === 'single' ? 'single' : 'per_buyer')
    up.run('odoo_single_partner', (cfg.singlePartner || 'Cardmarket').trim())
    up.run('odoo_single_partner_id', String(cfg.singlePartnerId ?? ''))
    up.run('odoo_product_cards_id', String(cfg.productCardsId ?? ''))
    up.run('odoo_product_cards_name', cfg.productCardsName ?? '')
    up.run('odoo_product_dice_id', String(cfg.productDiceId ?? ''))
    up.run('odoo_product_dice_name', cfg.productDiceName ?? '')
    up.run('odoo_product_other_id', String(cfg.productOtherId ?? ''))
    up.run('odoo_product_other_name', cfg.productOtherName ?? '')
    up.run('odoo_product_shipping_id', String(cfg.productShippingId ?? ''))
    up.run('odoo_product_shipping_name', cfg.productShippingName ?? '')
    up.run('odoo_tax_id', String(cfg.taxId ?? ''))
    up.run('odoo_tax_name', cfg.taxName ?? '')
    up.run('odoo_tax_rate', String(cfg.taxRate ?? 20))
  })
  tx()
  logActivity(userId, 'odoo.config_saved', { url: cfg.url, mode: cfg.partnerMode })
}

// --- Recherche dans Odoo (pour les sélecteurs des Réglages) --------------------

export async function searchPartners(
  cfg: OdooConfig,
  query: string
): Promise<{ id: number; name: string }[]> {
  const uid = await authenticate(cfg)
  const rows = (await execute(
    cfg,
    uid,
    'res.partner',
    'search_read',
    [[['name', 'ilike', query]]],
    { fields: ['id', 'name'], limit: 12 }
  )) as { id: number; name: string }[]
  return rows
}

export async function searchProducts(
  cfg: OdooConfig,
  query: string
): Promise<{ id: number; name: string }[]> {
  const uid = await authenticate(cfg)
  const rows = (await execute(
    cfg,
    uid,
    'product.product',
    'search_read',
    [[['name', 'ilike', query]]],
    { fields: ['id', 'name'], limit: 12 }
  )) as { id: number; name: string }[]
  return rows
}

/** Taxes de vente (pour choisir la TVA 20 %). Renvoie aussi le taux. */
export async function searchTaxes(
  cfg: OdooConfig,
  query: string
): Promise<{ id: number; name: string; amount: number }[]> {
  const uid = await authenticate(cfg)
  const rows = (await execute(
    cfg,
    uid,
    'account.tax',
    'search_read',
    [[['type_tax_use', '=', 'sale'], ['name', 'ilike', query]]],
    { fields: ['id', 'name', 'amount'], limit: 12 }
  )) as { id: number; name: string; amount: number }[]
  return rows
}

// --- Rapprochement manuel : lier une commande à une facture Odoo existante -----
// Cas réels du magasin : brouillon supprimé puis facture recréée à la main
// (commande annulée/regroupée), ou facture déjà comptabilisée hors app —
// l'app restait « en erreur » sans moyen de pointer la bonne facture.

export interface OdooInvoiceHit {
  id: number
  name: string
  state: string
  ref: string | null
  partner: string
  total: number
  date: string | null
}

export async function searchInvoices(query: string): Promise<OdooInvoiceHit[]> {
  const cfg = getOdooConfig()
  if (!cfg) throw new Error('Odoo n’est pas configuré')
  const uid = await authenticate(cfg)
  const domain: unknown[] = [['move_type', '=', 'out_invoice']]
  if (query.trim()) {
    domain.push('|', '|', ['name', 'ilike', query.trim()], ['ref', 'ilike', query.trim()], [
      'partner_id.name',
      'ilike',
      query.trim()
    ])
  }
  const rows = (await execute(cfg, uid, 'account.move', 'search_read', [domain], {
    fields: ['id', 'name', 'state', 'ref', 'partner_id', 'amount_total', 'invoice_date'],
    order: 'id desc',
    limit: 15
  })) as {
    id: number
    name: string
    state: string
    ref: string | false
    partner_id: [number, string] | false
    amount_total: number
    invoice_date: string | false
  }[]
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    state: r.state,
    ref: r.ref || null,
    partner: r.partner_id ? r.partner_id[1] : '?',
    total: r.amount_total,
    date: r.invoice_date || null
  }))
}

/** Associe la commande à la facture choisie et efface l'erreur. */
export async function linkInvoice(userId: number, orderId: number, moveId: number): Promise<void> {
  const cfg = getOdooConfig()
  if (!cfg) throw new Error('Odoo n’est pas configuré')
  const uid = await authenticate(cfg)
  const moves = (await execute(cfg, uid, 'account.move', 'search_read', [[['id', '=', moveId]]], {
    fields: ['id', 'name', 'state']
  })) as { id: number; name: string; state: string }[]
  if (moves.length === 0) throw new Error('Facture introuvable dans Odoo')
  const m = moves[0]
  getDb()
    .prepare(
      `UPDATE orders SET odoo_move_id = ?, odoo_state = ?, odoo_number = ?,
         odoo_error = NULL, odoo_sent_at = datetime('now', 'localtime')
       WHERE id = ?`
    )
    .run(m.id, m.state, m.state === 'posted' && m.name && m.name !== '/' ? m.name : null, orderId)
  logActivity(userId, 'odoo.linked_existing', { orderId, moveId, name: m.name, state: m.state })
}

// --- Synchronisation de l'état des factures ------------------------------------

export interface OdooSyncResult {
  checked: number
  posted: number
  draft: number
  cancelled: number
}

/**
 * Interroge Odoo pour toutes les factures créées par l'app et met à jour leur
 * état (brouillon / validée / annulée) et leur numéro comptable (attribué à
 * la validation). Lancé au démarrage, toutes les 30 min, et à la demande.
 */
export async function syncInvoiceStatuses(): Promise<OdooSyncResult> {
  const cfg = getOdooConfig()
  const db = getDb()
  const rows = db
    .prepare("SELECT id, odoo_move_id FROM orders WHERE odoo_move_id IS NOT NULL")
    .all() as { id: number; odoo_move_id: number }[]
  const result: OdooSyncResult = { checked: 0, posted: 0, draft: 0, cancelled: 0 }
  if (!cfg || rows.length === 0) return result

  const uid = await authenticate(cfg)
  // search_read (et non read) : les factures SUPPRIMÉES dans Odoo ne reviennent
  // simplement pas, au lieu de faire échouer tout l'appel.
  const moves = (await execute(
    cfg,
    uid,
    'account.move',
    'search_read',
    [[['id', 'in', rows.map((r) => r.odoo_move_id)]]],
    { fields: ['id', 'name', 'state'] }
  )) as { id: number; name: string; state: string }[]

  const found = new Set(moves.map((m) => m.id))
  const upd = db.prepare('UPDATE orders SET odoo_state = ?, odoo_number = ? WHERE odoo_move_id = ?')
  const clear = db.prepare(
    `UPDATE orders SET odoo_move_id = NULL, odoo_state = NULL, odoo_number = NULL,
       odoo_sent_at = NULL, odoo_error = 'Facture supprimée dans Odoo — à renvoyer si besoin'
     WHERE id = ?`
  )
  const tx = db.transaction(() => {
    for (const m of moves) {
      result.checked++
      const number = m.state === 'posted' && m.name && m.name !== '/' ? m.name : null
      upd.run(m.state, number, m.id)
      if (m.state === 'posted') result.posted++
      else if (m.state === 'cancel') result.cancelled++
      else result.draft++
    }
    // Factures disparues côté Odoo : on libère le lien pour pouvoir renvoyer.
    for (const r of rows) {
      if (!found.has(r.odoo_move_id)) {
        result.checked++
        clear.run(r.id)
      }
    }
  })
  tx()
  return result
}

// --- Association nom de produit accessoire → article Odoo (gestion de stock) ---

export interface AccessoryMapEntry {
  line_name: string
  product_id: number | null
  product_name: string | null
}

/** Tous les accessoires rencontrés dans les commandes, avec leur association. */
export function listAccessoryMap(): AccessoryMapEntry[] {
  return getDb()
    .prepare(
      `SELECT DISTINCT l.name AS line_name, m.product_id, m.product_name
       FROM order_lines l
       LEFT JOIN odoo_product_map m ON m.line_name = l.name
       WHERE l.section NOT LIKE '%carte%'
       ORDER BY l.name`
    )
    .all() as AccessoryMapEntry[]
}

export function setProductMap(
  userId: number,
  lineName: string,
  productId: number | null,
  productName: string | null
): void {
  const db = getDb()
  if (productId) {
    db.prepare(
      `INSERT INTO odoo_product_map (line_name, product_id, product_name) VALUES (?, ?, ?)
       ON CONFLICT(line_name) DO UPDATE SET product_id = excluded.product_id, product_name = excluded.product_name`
    ).run(lineName, productId, productName)
  } else {
    db.prepare('DELETE FROM odoo_product_map WHERE line_name = ?').run(lineName)
  }
  logActivity(userId, 'odoo.product_mapped', { lineName, productId, productName })
}

// --- JSON-RPC -------------------------------------------------------------------

async function rpc(url: string, service: string, method: string, args: unknown[]): Promise<unknown> {
  const res = await fetch(`${url}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: { service, method, args },
      id: Math.floor(Math.random() * 1e9)
    })
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { result?: unknown; error?: { data?: { message?: string }; message?: string } }
  if (data.error) {
    throw new Error(data.error.data?.message ?? data.error.message ?? 'Erreur Odoo inconnue')
  }
  return data.result
}

async function authenticate(cfg: OdooConfig): Promise<number> {
  const uid = (await rpc(cfg.url, 'common', 'authenticate', [cfg.db, cfg.user, cfg.apiKey, {}])) as
    | number
    | false
  if (!uid) throw new Error('Authentification refusée — vérifie la base, l’utilisateur et la clé API')
  return uid
}

async function execute(
  cfg: OdooConfig,
  uid: number,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {}
): Promise<unknown> {
  return rpc(cfg.url, 'object', 'execute_kw', [cfg.db, uid, cfg.apiKey, model, method, args, kwargs])
}

/** Test de connexion : version du serveur + société. */
export async function testConnection(cfg: OdooConfig): Promise<{ version: string; company: string }> {
  const info = (await rpc(cfg.url, 'common', 'version', [])) as { server_version?: string }
  const uid = await authenticate(cfg)
  const users = (await execute(cfg, uid, 'res.users', 'read', [[uid], ['company_id']])) as {
    company_id: [number, string]
  }[]
  return {
    version: info.server_version ?? '?',
    company: users[0]?.company_id?.[1] ?? '?'
  }
}

// --- Envoi d'une commande -------------------------------------------------------

export function eurToFloat(v: string | null): number {
  if (!v) return 0
  const m = v.replace(/\s/g, '').match(/^([\d.]+),?(\d{0,2})/)
  if (!m) return 0
  return parseFloat(`${m[1].replace(/\./g, '')}.${m[2] || '0'}`)
}

/**
 * Envoie une commande vers Odoo (facture brouillon). Idempotent : si la
 * commande a déjà un odoo_move_id, on ne recrée pas de facture.
 */
export async function sendOrderToOdoo(
  userId: number,
  orderId: number
): Promise<{ move_id: number; already: boolean }> {
  const cfg = getOdooConfig()
  if (!cfg) throw new Error('Connecteur Odoo non configuré (voir Réglages)')

  const db = getDb()
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Order | undefined
  if (!order) throw new Error('Commande introuvable')
  if (order.odoo_move_id) return { move_id: order.odoo_move_id, already: true }

  try {
    const uid = await authenticate(cfg)

    // 1. Client : en mode « client unique », on utilise l'ID du client EXISTANT
    //    choisi dans les Réglages (aucune création, aucun doublon possible).
    //    En mode « par acheteur », on retrouve/crée « Cardmarket - pseudo ».
    let partnerId: number
    if (cfg.partnerMode === 'single') {
      if (!cfg.singlePartnerId) {
        throw new Error(
          'Choisis le client Odoo dans les Réglages (recherche puis sélection) avant d’envoyer'
        )
      }
      partnerId = cfg.singlePartnerId
    } else {
      const partnerName = `Cardmarket - ${order.buyer_username}`
      const found = (await execute(cfg, uid, 'res.partner', 'search', [
        [['name', '=', partnerName]]
      ])) as number[]
      partnerId = found[0]
      if (!partnerId) {
        partnerId = (await execute(cfg, uid, 'res.partner', 'create', [
          {
            name: partnerName,
            comment: `Client Cardmarket (pseudo : ${order.buyer_username})\n${order.buyer_name ?? ''}\n${order.buyer_address ?? ''}`,
            customer_rank: 1
          }
        ])) as number
      }
    }

    // 2. Lignes de facture : une par article + frais de port.
    //    Les prix Cardmarket sont TTC : on les convertit en HT (÷ 1 + taux) et
    //    on applique la taxe de vente configurée (ex. TVA 20 %) sur CHAQUE
    //    ligne — Odoo recalcule alors le TTC = prix Cardmarket, et le total HT
    //    est correct pour la comptabilité.
    if (!cfg.taxId) {
      throw new Error(
        'Choisis la taxe de vente (TVA 20 %) dans les Réglages Odoo avant d’envoyer'
      )
    }
    const toHT = (ttc: number): number =>
      Math.round((ttc / (1 + cfg.taxRate / 100)) * 10000) / 10000
    const taxSpec = { tax_ids: [[6, 0, [cfg.taxId]]] }

    // Article : association précise par nom (accessoires gérés en stock),
    // sinon article générique du type, sinon ligne en texte libre.
    const mapRows = db
      .prepare('SELECT line_name, product_id FROM odoo_product_map')
      .all() as { line_name: string; product_id: number }[]
    const nameMap = new Map(mapRows.map((r) => [r.line_name, r.product_id]))
    const productFor = (l: { section: string; name: string }): number | null => {
      if (/carte/i.test(l.section)) return cfg.productCardsId
      const mapped = nameMap.get(l.name)
      if (mapped) return mapped
      if (/dés|des|dice/i.test(l.section)) return cfg.productDiceId
      return cfg.productOtherId
    }

    const lines = getOrderLines(orderId)
    const invoiceLines: unknown[] = lines.map((l) => {
      const productId = productFor(l)
      return [
        0,
        0,
        {
          ...(productId ? { product_id: productId } : {}),
          name:
            `${l.name}` +
            (l.number ? ` — ch.${l.set_code} n°${l.number}` : '') +
            (l.language ? ` ${l.language}` : '') +
            (l.condition ? ` ${l.condition}` : '') +
            (l.is_foil === 1 ? ' FOIL' : ''),
          quantity: l.quantity,
          price_unit: toHT(eurToFloat(l.price)),
          ...taxSpec
        }
      ]
    })
    const shipping = eurToFloat(order.shipping_cost)
    if (shipping > 0) {
      invoiceLines.push([
        0,
        0,
        {
          ...(cfg.productShippingId ? { product_id: cfg.productShippingId } : {}),
          name: 'Frais de port',
          quantity: 1,
          price_unit: toHT(shipping),
          ...taxSpec
        }
      ])
    }
    // Remboursement (ex. frais de port rendus pour une remise en main propre) :
    // ligne négative, même article et même TVA — le total facturé = net payé.
    const refund = eurToFloat(order.refund_amount)
    if (refund > 0) {
      invoiceLines.push([
        0,
        0,
        {
          ...(cfg.productShippingId ? { product_id: cfg.productShippingId } : {}),
          name: `Remboursement${order.refund_reason ? ` — ${order.refund_reason}` : ' frais de port'}`,
          quantity: 1,
          price_unit: -toHT(refund),
          ...taxSpec
        }
      ])
    }

    // 3. Facture brouillon
    const sentDate = (order.shipped_at ?? order.imported_at ?? '').slice(0, 10) || undefined
    const moveId = (await execute(
      cfg,
      uid,
      'account.move',
      'create',
      [
        {
          move_type: 'out_invoice',
          partner_id: partnerId,
          invoice_date: sentDate,
          // Référence client : n° de commande Cardmarket + pseudo de l'acheteur
          ref: `Cardmarket #${order.sale_id} - ${order.buyer_username}`,
          narration: [
            order.buyer_name && `Acheteur : ${order.buyer_name} (${order.buyer_username})`,
            order.tracking_number && `Suivi : ${order.tracking_number}`
          ]
            .filter(Boolean)
            .join('\n') || false,
          invoice_line_ids: invoiceLines
        }
      ]
    )) as number

    db.prepare(
      "UPDATE orders SET odoo_move_id = ?, odoo_sent_at = datetime('now', 'localtime'), odoo_error = NULL WHERE id = ?"
    ).run(moveId, orderId)
    logActivity(userId, 'odoo.sent', { orderId, sale_id: order.sale_id, move_id: moveId })
    return { move_id: moveId, already: false }
  } catch (err) {
    const msg = String((err as Error).message ?? err)
    db.prepare('UPDATE orders SET odoo_error = ? WHERE id = ?').run(msg, orderId)
    logActivity(userId, 'odoo.error', { orderId, error: msg })
    throw err
  }
}
