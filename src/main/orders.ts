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

      // Enrichissement Lorcast hors transaction (réseau, tolérant au hors-ligne)
      const enriched = [] as {
        line: (typeof parsed.cards)[number]
        ink: string | null
        rarity: string | null
        image_file: string | null
        lorcast_name: string | null
      }[]
      for (const line of parsed.cards) {
        const card = await getCard(line.set_code, line.number)
        enriched.push({
          line,
          ink: card?.ink ?? null,
          rarity: card?.rarity ?? null,
          image_file: card?.image_file ?? null,
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
             ink, rarity, image_file, lorcast_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
            e.lorcast_name
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

export function listOrders(statuses?: OrderStatus[]): Order[] {
  const db = getDb()
  if (statuses?.length) {
    const marks = statuses.map(() => '?').join(',')
    return db
      .prepare(`SELECT * FROM orders WHERE status IN (${marks}) ORDER BY imported_at DESC, id DESC`)
      .all(...statuses) as Order[]
  }
  return db.prepare('SELECT * FROM orders ORDER BY imported_at DESC, id DESC').all() as Order[]
}

export function getOrderLines(orderId: number): OrderLine[] {
  return getDb()
    .prepare('SELECT * FROM order_lines WHERE order_id = ? ORDER BY id')
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

export function deleteOrder(userId: number, orderId: number): void {
  const db = getDb()
  const order = db.prepare('SELECT sale_id FROM orders WHERE id = ?').get(orderId) as
    | { sale_id: string }
    | undefined
  db.prepare('DELETE FROM orders WHERE id = ?').run(orderId)
  logActivity(userId, 'order.deleted', { orderId, sale_id: order?.sale_id })
}
