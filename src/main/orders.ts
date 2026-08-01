import { getDb, logActivity } from './db'
import { parseCardmarketPdf, canonicalRarity } from './pdf-parser'
import { getCard } from './lorcast'
import type { ImportResult, Order, OrderLine, OrderStatus } from '@shared/types'

/**
 * Importe des PDF de vente Cardmarket : parse, enrichit chaque ligne via
 * Lorcast (visuel + encre/rareté canoniques ; l'API gagne sur le PDF),
 * insère commande + lignes. Une vente déjà importée est signalée en doublon.
 */
export async function importPdfs(userId: number, paths: string[]): Promise<ImportResult[]> {
  const db = getDb()
  const results: ImportResult[] = []

  for (const path of paths) {
    try {
      const parsed = await parseCardmarketPdf(path)
      if (!parsed.sale_id) {
        results.push({ file: path, status: 'error', message: 'Numéro de vente introuvable — est-ce bien un PDF de vente Cardmarket ?' })
        continue
      }
      const dup = db.prepare('SELECT id FROM orders WHERE sale_id = ?').get(parsed.sale_id)
      if (dup) {
        results.push({ file: path, status: 'duplicate', sale_id: parsed.sale_id })
        continue
      }
      if (parsed.cards.length === 0) {
        results.push({
          file: path,
          status: 'error',
          sale_id: parsed.sale_id,
          message:
            'Aucun produit reconnu dans ce PDF — commande non importée. Envoie-moi ce PDF pour que le format soit pris en charge.'
        })
        continue
      }

      // Enrichissement Lorcast hors transaction (réseau, tolérant au hors-ligne)
      const enriched = [] as {
        line: (typeof parsed.cards)[number]
        ink: string | null
        rarity: string | null
        image_file: string | null
        image_large_file: string | null
        lorcast_name: string | null
      }[]
      for (const line of parsed.cards) {
        // Lorcast ne connaît que les cartes : pas de lookup pour les dés/scellés.
        const isCard = /cartes/i.test(line.section) && line.number
        const card = isCard ? await getCard(line.set_code, line.number) : null
        enriched.push({
          line,
          ink: card?.ink ?? null,
          rarity: card?.rarity ?? null,
          image_file: card?.image_file ?? null,
          image_large_file: card?.image_large_file ?? null,
          lorcast_name: card ? [card.name, card.version].filter(Boolean).join(' - ') : null
        })
      }

      const insertAll = db.transaction(() => {
        const info = db
          .prepare(
            `INSERT INTO orders (sale_id, buyer_username, buyer_name, buyer_address, seller,
               article_count, item_value, shipping_cost, total, shipping_method, tracking_number,
               status, source_pdf, imported_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'imported', ?, ?)`
          )
          .run(
            parsed.sale_id,
            parsed.buyer_username,
            parsed.buyer_name,
            parsed.buyer_address,
            parsed.seller,
            parsed.article_count,
            parsed.item_value,
            parsed.shipping_cost,
            parsed.total,
            parsed.shipping_method,
            parsed.tracking_number || null,
            parsed.source_pdf,
            userId
          )
        const orderId = Number(info.lastInsertRowid)
        const ins = db.prepare(
          `INSERT INTO order_lines (order_id, quantity, name, number, language, condition,
             set_code, color_code, color_label, rarity_code, price, comment, is_foil,
             ink, rarity, image_file, image_large_file, lorcast_name, section)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        for (const e of enriched) {
          ins.run(
            orderId,
            e.line.quantity,
            e.line.name,
            e.line.number,
            e.line.language,
            e.line.condition,
            e.line.set_code,
            e.line.color_code,
            e.line.color_label,
            e.line.rarity_code,
            e.line.price,
            e.line.comment,
            e.line.is_foil ? 1 : 0,
            e.ink,
            e.rarity,
            e.image_file,
            e.image_large_file,
            e.lorcast_name,
            e.line.section
          )
        }
        return orderId
      })
      const orderId = insertAll()
      logActivity(userId, 'order.imported', {
        orderId,
        sale_id: parsed.sale_id,
        buyer: parsed.buyer_username,
        cards: parsed.cards.length
      })
      results.push({
        file: path,
        status: 'ok',
        sale_id: parsed.sale_id,
        buyer_username: parsed.buyer_username,
        cards: parsed.cards.length
      })
    } catch (err) {
      results.push({ file: path, status: 'error', message: String((err as Error).message ?? err) })
    }
  }
  return results
}

const ORDER_SELECT = `
  SELECT o.*,
         ui.name AS imported_by_name,
         up.name AS prepared_by_name,
         us.name AS shipped_by_name
  FROM orders o
  LEFT JOIN users ui ON ui.id = o.imported_by
  LEFT JOIN users up ON up.id = o.prepared_by
  LEFT JOIN users us ON us.id = o.shipped_by`

export function listOrders(statuses?: OrderStatus[]): Order[] {
  const db = getDb()
  if (statuses?.length) {
    const marks = statuses.map(() => '?').join(',')
    return db
      .prepare(`${ORDER_SELECT} WHERE o.status IN (${marks}) ORDER BY o.imported_at DESC, o.id DESC`)
      .all(...statuses) as Order[]
  }
  return db.prepare(`${ORDER_SELECT} ORDER BY o.imported_at DESC, o.id DESC`).all() as Order[]
}

export function getOrderLines(orderId: number): OrderLine[] {
  return getDb()
    .prepare(
      `SELECT l.*, u.name AS picked_by_name
       FROM order_lines l LEFT JOIN users u ON u.id = l.picked_by
       WHERE l.order_id = ? ORDER BY l.id`
    )
    .all(orderId) as OrderLine[]
}

export function setOrderStatus(userId: number, orderId: number, status: OrderStatus): void {
  const db = getDb()
  const fields: Record<OrderStatus, string | null> = {
    imported: null,
    picking: null,
    picked: null,
    prepared: 'prepared',
    shipped: 'shipped',
    archived: null
  }
  const stamp = fields[status]
  if (stamp) {
    db.prepare(
      `UPDATE orders SET status = ?, ${stamp}_at = datetime('now', 'localtime'), ${stamp}_by = ? WHERE id = ?`
    ).run(status, userId, orderId)
  } else {
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, orderId)
  }
  logActivity(userId, 'order.status', { orderId, status })
}

export function setTracking(userId: number, orderId: number, tracking: string): void {
  getDb().prepare('UPDATE orders SET tracking_number = ? WHERE id = ?').run(tracking || null, orderId)
  logActivity(userId, 'order.tracking', { orderId, tracking })
}

export function setNotes(userId: number, orderId: number, notes: string): void {
  getDb().prepare('UPDATE orders SET notes = ? WHERE id = ?').run(notes || null, orderId)
  logActivity(userId, 'order.notes', { orderId })
}

/** Coche de contrôle d'une ligne pendant la préparation de la commande. */
export function setPrepChecked(userId: number, lineId: number, checked: boolean): void {
  const db = getDb()
  db.prepare('UPDATE order_lines SET prep_checked = ? WHERE id = ?').run(checked ? 1 : 0, lineId)
  const line = db.prepare('SELECT order_id, name FROM order_lines WHERE id = ?').get(lineId) as
    | { order_id: number; name: string }
    | undefined
  logActivity(userId, checked ? 'prep.checked' : 'prep.unchecked', {
    lineId,
    orderId: line?.order_id,
    card: line?.name
  })
}

// --- Statistiques (historique) -------------------------------------------------

export interface HistoryStats {
  months: { month: string; orders: number; revenue_cents: number }[]
  top_cards: { name: string; set_code: string | null; number: string | null; qty: number }[]
}

function eurToCents(v: string | null): number {
  if (!v) return 0
  const m = v.replace(/\s/g, '').match(/^([\d.]+),?(\d{0,2})/)
  if (!m) return 0
  return parseInt(m[1].replace(/\./g, ''), 10) * 100 + (m[2] ? parseInt(m[2].padEnd(2, '0'), 10) : 0)
}

export function getStats(): HistoryStats {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT substr(COALESCE(shipped_at, imported_at), 1, 7) AS month, total
       FROM orders WHERE status IN ('shipped', 'archived')`
    )
    .all() as { month: string; total: string | null }[]
  const byMonth = new Map<string, { orders: number; revenue_cents: number }>()
  for (const r of rows) {
    const m = byMonth.get(r.month) ?? { orders: 0, revenue_cents: 0 }
    m.orders += 1
    m.revenue_cents += eurToCents(r.total)
    byMonth.set(r.month, m)
  }
  const months = [...byMonth.entries()]
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => b.month.localeCompare(a.month))

  const top_cards = db
    .prepare(
      `SELECT l.name, l.set_code, l.number, SUM(l.quantity) AS qty
       FROM order_lines l JOIN orders o ON o.id = l.order_id
       WHERE o.status IN ('shipped', 'archived')
       GROUP BY l.set_code, l.number, l.name
       ORDER BY qty DESC LIMIT 15`
    )
    .all() as HistoryStats['top_cards']

  return { months, top_cards }
}

export function deleteOrder(userId: number, orderId: number): void {
  const db = getDb()
  const order = db.prepare('SELECT sale_id FROM orders WHERE id = ?').get(orderId) as
    | { sale_id: string }
    | undefined
  db.prepare('DELETE FROM orders WHERE id = ?').run(orderId)
  logActivity(userId, 'order.deleted', { orderId, sale_id: order?.sale_id })
}
