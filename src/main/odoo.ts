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
}

export function getOdooConfig(): OdooConfig | null {
  const rows = getDb()
    .prepare("SELECT key, value FROM settings WHERE key LIKE 'odoo_%'")
    .all() as { key: string; value: string }[]
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  if (!map.odoo_url || !map.odoo_db || !map.odoo_user || !map.odoo_api_key) return null
  return {
    url: map.odoo_url,
    db: map.odoo_db,
    user: map.odoo_user,
    apiKey: map.odoo_api_key,
    partnerMode: map.odoo_partner_mode === 'single' ? 'single' : 'per_buyer',
    singlePartner: map.odoo_single_partner || 'Cardmarket'
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
  })
  tx()
  logActivity(userId, 'odoo.config_saved', { url: cfg.url, mode: cfg.partnerMode })
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

    // 1. Client : soit un client unique pour toutes les ventes Cardmarket,
    //    soit un client par pseudo — selon la configuration.
    const partnerName =
      cfg.partnerMode === 'single' ? cfg.singlePartner : `Cardmarket - ${order.buyer_username}`
    const found = (await execute(cfg, uid, 'res.partner', 'search', [
      [['name', '=', partnerName]]
    ])) as number[]
    let partnerId = found[0]
    if (!partnerId) {
      partnerId = (await execute(cfg, uid, 'res.partner', 'create', [
        {
          name: partnerName,
          comment:
            cfg.partnerMode === 'single'
              ? 'Client global des ventes Cardmarket (créé par Lorcana Picking Tool)'
              : `Client Cardmarket (pseudo : ${order.buyer_username})\n${order.buyer_name ?? ''}\n${order.buyer_address ?? ''}`,
          customer_rank: 1
        }
      ])) as number
    }

    // 2. Lignes de facture : une par carte + frais de port
    const lines = getOrderLines(orderId)
    const invoiceLines: unknown[] = lines.map((l) => [
      0,
      0,
      {
        name:
          `${l.name}` +
          (l.number ? ` — ch.${l.set_code} n°${l.number}` : '') +
          (l.language ? ` ${l.language}` : '') +
          (l.condition ? ` ${l.condition}` : '') +
          (l.is_foil === 1 ? ' FOIL' : ''),
        quantity: l.quantity,
        price_unit: eurToFloat(l.price)
      }
    ])
    const shipping = eurToFloat(order.shipping_cost)
    if (shipping > 0) {
      invoiceLines.push([0, 0, { name: 'Frais de port', quantity: 1, price_unit: shipping }])
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
