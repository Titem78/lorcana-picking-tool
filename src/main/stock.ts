// Inventaire : miroir LOCAL du stock Cardmarket.
// Alimenté depuis l'onglet Cardmarket : page affichée (bouton « Stock (page) »)
// ou parcours automatique de toutes les pages en LECTURE SEULE (« Stock (tout) »,
// choix utilisateur 2026-08 — jamais d'écriture sur Cardmarket). Clé = l'id
// d'article Cardmarket, donc réimporter une page met à jour sans doublon.

import { getDb, logActivity } from './db'

export interface StockItem {
  cm_article_id: string
  name: string
  number: string | null
  set_code: string | null
  color_code: string | null
  language: string | null
  condition: string | null
  is_foil: number
  comment: string | null
  price: string | null
  quantity: number
  updated_at: string
}

export interface StockRowInput {
  article_id: string
  name: string
  number?: string
  set_code?: string
  color_code?: string
  language?: string
  condition?: string
  is_foil?: boolean
  comment?: string
  price?: string
  quantity?: number
}

export function upsertStock(userId: number, rows: StockRowInput[]): { imported: number } {
  const db = getDb()
  const up = db.prepare(
    `INSERT INTO stock_items (cm_article_id, name, number, set_code, color_code, language,
       condition, is_foil, comment, price, quantity, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
     ON CONFLICT(cm_article_id) DO UPDATE SET
       name = excluded.name, number = excluded.number, set_code = excluded.set_code,
       color_code = excluded.color_code, language = excluded.language,
       condition = excluded.condition, is_foil = excluded.is_foil,
       comment = excluded.comment, price = excluded.price, quantity = excluded.quantity,
       updated_at = excluded.updated_at`
  )
  const tx = db.transaction(() => {
    for (const r of rows) {
      if (!r.article_id || !r.name) continue
      up.run(
        r.article_id,
        r.name,
        r.number || null,
        r.set_code || null,
        r.color_code || null,
        r.language || null,
        r.condition || null,
        r.is_foil ? 1 : 0,
        r.comment || null,
        r.price || null,
        r.quantity ?? 1
      )
    }
  })
  tx()
  logActivity(userId, 'stock.page_imported', { rows: rows.length })
  return { imported: rows.length }
}

export function listStock(search: string): { items: StockItem[]; totals: { items: number; copies: number; value_cents: number } } {
  const db = getDb()
  const like = `%${search.trim()}%`
  const items = (
    search.trim()
      ? db.prepare(
          `SELECT * FROM stock_items WHERE name LIKE ? OR comment LIKE ? OR set_code LIKE ?
           ORDER BY name LIMIT 500`
        ).all(like, like, like)
      : db.prepare('SELECT * FROM stock_items ORDER BY updated_at DESC, name LIMIT 500').all()
  ) as StockItem[]

  const all = db.prepare('SELECT price, quantity FROM stock_items').all() as {
    price: string | null
    quantity: number
  }[]
  let value = 0
  let copies = 0
  for (const r of all) {
    copies += r.quantity
    const m = (r.price ?? '').replace(/\s/g, '').match(/^([\d.]+),?(\d{0,2})/)
    if (m) value += (parseInt(m[1].replace(/\./g, ''), 10) * 100 + parseInt((m[2] || '0').padEnd(2, '0'), 10)) * r.quantity
  }
  return { items, totals: { items: all.length, copies, value_cents: value } }
}

/** À l'import d'une commande : décrémente le miroir local (meilleure estimation). */
export function decrementForSale(line: {
  name: string
  language: string | null
  condition: string | null
  is_foil: number
  quantity: number
}): void {
  const db = getDb()
  const match = db
    .prepare(
      `SELECT cm_article_id, quantity FROM stock_items
       WHERE name = ? AND (language = ? OR language IS NULL) AND (condition = ? OR condition IS NULL)
         AND is_foil = ? ORDER BY quantity DESC LIMIT 1`
    )
    .get(line.name, line.language, line.condition, line.is_foil) as
    | { cm_article_id: string; quantity: number }
    | undefined
  if (!match) return
  const left = match.quantity - line.quantity
  if (left > 0) {
    db.prepare('UPDATE stock_items SET quantity = ? WHERE cm_article_id = ?').run(left, match.cm_article_id)
  } else {
    db.prepare('DELETE FROM stock_items WHERE cm_article_id = ?').run(match.cm_article_id)
  }
}

export function clearStock(userId: number): void {
  getDb().prepare('DELETE FROM stock_items').run()
  logActivity(userId, 'stock.cleared')
}
