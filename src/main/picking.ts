import { getDb, logActivity } from './db'
import { listLocations, resolveLocation } from './locations'
import { canonicalRarity } from './pdf-parser'
import type {
  CardFacts,
  OrderLine,
  PickingItem,
  PickingList,
  PickingSection,
  StorageLocation
} from '@shared/types'

// Liste de picking globale : toutes les lignes restantes des commandes
// actives, groupées par emplacement (ordre = priorité des emplacements),
// puis par carte physique identique (chapitre + numéro + foil + langue).
// Une carte demandée par plusieurs clients apparaît UNE fois, avec la
// répartition par commande à cocher ligne par ligne.

interface LineRow extends OrderLine {
  sale_id: string
  buyer_username: string
  picked_by_name: string | null
}

export function lineFacts(line: OrderLine): CardFacts {
  return {
    color: line.ink ?? line.color_label ?? '',
    rarity: line.rarity ?? canonicalRarity(line.rarity_code ?? ''),
    chapter: parseInt(line.set_code ?? '0', 10) || 0,
    is_foil: line.is_foil === 1,
    language: line.language ?? ''
  }
}

export function buildPickingList(): PickingList {
  const db = getDb()
  const lines = db
    .prepare(
      `SELECT l.*, o.sale_id, o.buyer_username, u.name AS picked_by_name
       FROM order_lines l
       JOIN orders o ON o.id = l.order_id
       LEFT JOIN users u ON u.id = l.picked_by
       WHERE o.status IN ('imported', 'picking')
       ORDER BY l.id`
    )
    .all() as LineRow[]

  const locations = listLocations()
  const sectionMap = new Map<number | null, PickingSection>()
  const orderIds = new Set<number>()

  for (const line of lines) {
    orderIds.add(line.order_id)
    const loc: StorageLocation | null = resolveLocation(lineFacts(line), locations)
    const locId = loc?.id ?? null
    let section = sectionMap.get(locId)
    if (!section) {
      section = {
        location_id: locId,
        location_name: loc?.name ?? 'Non assigné',
        location_color: loc?.color ?? null,
        location_label: loc?.label ?? null,
        items: []
      }
      sectionMap.set(locId, section)
    }

    const key = [line.set_code, line.number, line.is_foil, line.language].join('|')
    let item = section.items.find((i) => i.key === key)
    if (!item) {
      item = {
        key,
        name: line.name,
        lorcast_name: line.lorcast_name,
        number: line.number,
        set_code: line.set_code,
        ink: line.ink ?? line.color_label ?? '',
        rarity: line.rarity ?? canonicalRarity(line.rarity_code ?? ''),
        is_foil: line.is_foil === 1,
        language: line.language ?? '',
        image_file: line.image_file,
        image_large_file: line.image_large_file,
        total_qty: 0,
        picked_qty: 0,
        sublines: []
      }
      section.items.push(item)
    }
    if (!item.image_file && line.image_file) item.image_file = line.image_file
    if (!item.image_large_file && line.image_large_file) item.image_large_file = line.image_large_file
    item.total_qty += line.quantity
    item.picked_qty += Math.min(line.picked_qty, line.quantity)
    item.sublines.push({
      line_id: line.id,
      order_id: line.order_id,
      sale_id: line.sale_id,
      buyer_username: line.buyer_username,
      quantity: line.quantity,
      condition: line.condition,
      comment: line.comment,
      price: line.price,
      picked_qty: line.picked_qty,
      picked_by_name: line.picked_by_name,
      picked_at: line.picked_at
    })
  }

  // Ordre des sections = ordre des emplacements ; « Non assigné » en dernier.
  const sections: PickingSection[] = []
  for (const loc of locations) {
    const s = sectionMap.get(loc.id)
    if (s && s.items.length) sections.push(s)
  }
  const unassigned = sectionMap.get(null)
  if (unassigned && unassigned.items.length) sections.push(unassigned)

  // Tri des cartes dans chaque section : chapitre, puis numéro.
  for (const s of sections) {
    s.items.sort(
      (a, b) =>
        (parseInt(a.set_code ?? '0', 10) || 0) - (parseInt(b.set_code ?? '0', 10) || 0) ||
        (parseInt(a.number ?? '0', 10) || 0) - (parseInt(b.number ?? '0', 10) || 0)
    )
  }

  const total_qty = lines.reduce((s, l) => s + l.quantity, 0)
  const picked_qty = lines.reduce((s, l) => s + Math.min(l.picked_qty, l.quantity), 0)
  return { sections, total_qty, picked_qty, order_count: orderIds.size }
}

/**
 * Fixe la quantité sortie d'une ligne, exemplaire par exemplaire (compteur).
 * Traçabilité : qui, quand. Met à jour le statut de la commande :
 * picking en cours, picked quand tout est sorti.
 */
export function setPickedQty(userId: number, lineId: number, qty: number): void {
  const db = getDb()
  const line = db.prepare('SELECT * FROM order_lines WHERE id = ?').get(lineId) as
    | OrderLine
    | undefined
  if (!line) return
  const clamped = Math.max(0, Math.min(line.quantity, Math.round(qty)))

  if (clamped > 0) {
    db.prepare(
      `UPDATE order_lines SET picked_qty = ?,
         picked_at = datetime('now', 'localtime'), picked_by = ? WHERE id = ?`
    ).run(clamped, userId, lineId)
  } else {
    db.prepare(
      'UPDATE order_lines SET picked_qty = 0, picked_at = NULL, picked_by = NULL WHERE id = ?'
    ).run(lineId)
  }
  logActivity(userId, 'pick.qty', {
    lineId,
    orderId: line.order_id,
    card: `${line.set_code}/${line.number} ${line.name}`,
    qty: clamped,
    of: line.quantity
  })

  const remaining = getDb()
    .prepare('SELECT COUNT(*) AS n FROM order_lines WHERE order_id = ? AND picked_qty < quantity')
    .get(line.order_id) as { n: number }
  const newStatus = remaining.n === 0 ? 'picked' : 'picking'
  const current = getDb().prepare('SELECT status FROM orders WHERE id = ?').get(line.order_id) as {
    status: string
  }
  if (current.status !== newStatus && ['imported', 'picking', 'picked'].includes(current.status)) {
    getDb().prepare('UPDATE orders SET status = ? WHERE id = ?').run(newStatus, line.order_id)
    if (newStatus === 'picked') {
      logActivity(userId, 'order.picked_complete', { orderId: line.order_id })
    }
  }
}

/** Coche/décoche une ligne entière (compat : équivaut au compteur à fond ou à zéro). */
export function pickLine(userId: number, lineId: number, picked: boolean): void {
  setPickedQty(userId, lineId, picked ? Number.MAX_SAFE_INTEGER : 0)
}
