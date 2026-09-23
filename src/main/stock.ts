// Inventaire : miroir LOCAL du stock Cardmarket.
// Alimenté par le balayage « Inventaire général » de l'onglet Cardmarket :
// parcours complet en LECTURE SEULE, extension par extension (le plafond de
// ~300 résultats ne vaut que pour les vues non filtrées), choix utilisateur
// 2026-08 — jamais d'écriture sur Cardmarket. Clé = l'id d'article Cardmarket,
// donc réimporter met à jour sans doublon.

import { getDb, logActivity } from './db'
import { canonicalRarity } from './pdf-parser'

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

/** « 1,50 EUR » / « 1.234,56 » → centimes (0 si illisible). */
export function prixEnCents(price: string | null): number {
  const m = (price ?? '').replace(/\s/g, '').match(/^([\d.]+),?(\d{0,2})/)
  if (!m) return 0
  return parseInt(m[1].replace(/\./g, ''), 10) * 100 + parseInt((m[2] || '0').padEnd(2, '0'), 10)
}

export interface StockFilters {
  q?: string
  set_code?: string
  language?: string
  foil?: '' | '1' | '0'
  condition?: string
  sort?: 'recent' | 'name' | 'qty' | 'price'
}

export function listStock(
  filters: string | StockFilters
): {
  items: StockItem[]
  totals: { items: number; copies: number; value_cents: number }
  sets: string[]
  languages: string[]
  conditions: string[]
} {
  const db = getDb()
  const f: StockFilters = typeof filters === 'string' ? { q: filters } : (filters ?? {})
  const where: string[] = []
  const args: unknown[] = []
  if (f.q?.trim()) {
    where.push('(name LIKE ? OR comment LIKE ? OR set_code LIKE ?)')
    const like = `%${f.q.trim()}%`
    args.push(like, like, like)
  }
  if (f.set_code) {
    where.push('COALESCE(set_code, color_code, \'\') = ?')
    args.push(f.set_code)
  }
  if (f.language) {
    where.push('language = ?')
    args.push(f.language)
  }
  if (f.foil === '1' || f.foil === '0') {
    where.push('is_foil = ?')
    args.push(parseInt(f.foil, 10))
  }
  if (f.condition) {
    where.push('condition = ?')
    args.push(f.condition)
  }
  const order =
    f.sort === 'name'
      ? 'name, number'
      : f.sort === 'qty'
        ? 'quantity DESC, name'
        : f.sort === 'price'
          ? `(${PRICE_CENTS_SQL}) DESC, name`
          : 'updated_at DESC, name'
  const items = db
    .prepare(
      `SELECT * FROM stock_items ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY ${order} LIMIT 500`
    )
    .all(...args) as StockItem[]

  const all = db.prepare('SELECT price, quantity FROM stock_items').all() as {
    price: string | null
    quantity: number
  }[]
  let value = 0
  let copies = 0
  for (const r of all) {
    copies += r.quantity
    value += prixEnCents(r.price) * r.quantity
  }
  const distinct = (col: string): string[] =>
    (
      db
        .prepare(`SELECT DISTINCT ${col} AS v FROM stock_items WHERE ${col} IS NOT NULL AND ${col} != '' ORDER BY v`)
        .all() as { v: string }[]
    ).map((r) => r.v)
  return {
    items,
    totals: { items: all.length, copies, value_cents: value },
    sets: (
      db
        .prepare(
          `SELECT DISTINCT COALESCE(set_code, color_code, '') AS v FROM stock_items
           WHERE COALESCE(set_code, color_code, '') != ''
           ORDER BY CAST(COALESCE(set_code, color_code, '') AS INTEGER), v`
        )
        .all() as { v: string }[]
    ).map((r) => r.v),
    languages: distinct('language'),
    conditions: distinct('condition')
  }
}

// Prix « 1,50 EUR » → centimes, version SQL (approx : partie entière + décimales)
const PRICE_CENTS_SQL = `CAST(REPLACE(REPLACE(REPLACE(COALESCE(price,'0'), ' ', ''), '.', ''), ',', '') AS INTEGER)`

// --- Instantanés (inventaire à une date) --------------------------------------

export interface StockSnapshot {
  id: number
  taken_at: string
  label: string | null
  kind: string
  items: number
  copies: number
  value_cents: number
}

/** Fige le miroir actuel dans un instantané daté. */
export function takeSnapshot(userId: number, label: string, kind: 'sweep' | 'manual'): number {
  const db = getDb()
  let id = 0
  const tx = db.transaction(() => {
    const rows = db.prepare('SELECT * FROM stock_items').all() as StockItem[]
    let value = 0
    let copies = 0
    for (const r of rows) {
      copies += r.quantity
      value += prixEnCents(r.price) * r.quantity
    }
    const info = db
      .prepare('INSERT INTO stock_snapshots (label, kind, items, copies, value_cents) VALUES (?, ?, ?, ?, ?)')
      .run(label || null, kind, rows.length, copies, value)
    id = Number(info.lastInsertRowid)
    const ins = db.prepare(
      `INSERT INTO stock_snapshot_items (snapshot_id, cm_article_id, name, number, set_code,
         color_code, language, condition, is_foil, comment, price, quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const r of rows) {
      ins.run(id, r.cm_article_id, r.name, r.number, r.set_code, r.color_code, r.language, r.condition, r.is_foil, r.comment, r.price, r.quantity)
    }
  })
  tx()
  logActivity(userId, 'stock.snapshot', { id, label, kind })
  return id
}

export function listSnapshots(): StockSnapshot[] {
  return getDb()
    .prepare('SELECT * FROM stock_snapshots ORDER BY taken_at DESC, id DESC')
    .all() as StockSnapshot[]
}

export function deleteSnapshot(userId: number, id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM stock_snapshot_items WHERE snapshot_id = ?').run(id)
  db.prepare('DELETE FROM stock_snapshots WHERE id = ?').run(id)
  logActivity(userId, 'stock.snapshot_deleted', { id })
}

export interface SnapshotDiffRow {
  name: string
  number: string | null
  set_code: string | null
  color_code: string | null
  language: string | null
  is_foil: number
  price: string | null
  qty_before: number
  qty_after: number
  delta: number
}

/**
 * Comparatif : instantané A → instantané B (ou miroir ACTUEL si toId absent).
 * Agrégé par carte physique (nom + chapitre + numéro + langue + foil), toutes
 * conditions confondues — c'est la maille utile pour « qu'est-ce qui est parti ».
 */
export function compareSnapshots(
  fromId: number,
  toId: number | null
): { rows: SnapshotDiffRow[]; totals: { sortis: number; entres: number } } {
  const db = getDb()
  const KEY = `name || '|' || COALESCE(set_code,'') || '|' || COALESCE(number,'') || '|' || COALESCE(language,'') || '|' || is_foil`
  const agg = (src: string, where: string): Map<string, SnapshotDiffRow & { key: string }> => {
    const rows = db
      .prepare(
        `SELECT ${KEY} AS key, name, number, set_code, color_code, language, is_foil,
                MAX(price) AS price, SUM(quantity) AS qty
         FROM ${src} ${where} GROUP BY key`
      )
      .all(...(where ? [fromId] : [])) as (SnapshotDiffRow & { key: string; qty: number })[]
    const m = new Map<string, SnapshotDiffRow & { key: string }>()
    for (const r of rows) m.set(r.key, { ...r, qty_before: 0, qty_after: 0, delta: 0 })
    return m
  }
  const avant = agg('stock_snapshot_items', 'WHERE snapshot_id = ?')
  let apres: Map<string, SnapshotDiffRow & { key: string }>
  if (toId == null) {
    apres = agg('stock_items', '')
  } else {
    const saved = db
      .prepare(
        `SELECT ${KEY} AS key, name, number, set_code, color_code, language, is_foil,
                MAX(price) AS price, SUM(quantity) AS qty
         FROM stock_snapshot_items WHERE snapshot_id = ? GROUP BY key`
      )
      .all(toId) as (SnapshotDiffRow & { key: string; qty: number })[]
    apres = new Map(saved.map((r) => [r.key, { ...r, qty_before: 0, qty_after: 0, delta: 0 }]))
  }
  const avantQty = new Map<string, number>()
  for (const [k, v] of avant) avantQty.set(k, (v as unknown as { qty: number }).qty)
  const apresQty = new Map<string, number>()
  for (const [k, v] of apres) apresQty.set(k, (v as unknown as { qty: number }).qty)

  const keys = new Set([...avantQty.keys(), ...apresQty.keys()])
  const rows: SnapshotDiffRow[] = []
  let sortis = 0
  let entres = 0
  for (const k of keys) {
    const b = avantQty.get(k) ?? 0
    const a = apresQty.get(k) ?? 0
    if (a === b) continue
    const base = (avant.get(k) ?? apres.get(k))!
    const delta = a - b
    if (delta < 0) sortis += -delta
    else entres += delta
    rows.push({
      name: base.name,
      number: base.number,
      set_code: base.set_code,
      color_code: base.color_code,
      language: base.language,
      is_foil: base.is_foil,
      price: base.price,
      qty_before: b,
      qty_after: a,
      delta
    })
  }
  rows.sort((x, y) => x.delta - y.delta || x.name.localeCompare(y.name))
  return { rows, totals: { sortis, entres } }
}

// --- Ventes & réassort ---------------------------------------------------------

export interface SalesRow {
  name: string
  number: string | null
  set_code: string | null
  color_code: string | null
  language: string | null
  is_foil: number
  rarity: string
  sold: number
  /** ventes de la période PRÉCÉDENTE de même durée (tendance ↗/↘) */
  prev_sold: number
  orders: number
  revenue_cents: number
  last_price: string | null
  in_stock: number
}

// ⚠ Le balayage d'inventaire ne fournit PAS le numéro de collection (la page
// « Mes offres » ne l'affiche pas) : le rapprochement ventes ↔ stock se fait
// donc par NOM + langue + foil — la maille fiable des deux côtés.
const CLE_STOCK = `name || '|' || COALESCE(language,'') || '|' || is_foil`

interface LigneVente {
  name: string
  number: string | null
  set_code: string | null
  color_code: string | null
  language: string | null
  is_foil: number
  rarity: string
  price: string | null
  quantity: number
  order_id: number
}

function lignesVendues(db: ReturnType<typeof getDb>, de: string, a: string): LigneVente[] {
  return db
    .prepare(
      `SELECT l.name, l.number, l.set_code, l.color_code, l.language, l.is_foil,
              COALESCE(l.rarity, l.rarity_code, '') AS rarity, l.price, l.quantity, l.order_id
       FROM order_lines l JOIN orders o ON o.id = l.order_id
       WHERE l.section LIKE '%arte%'
         AND o.imported_at >= datetime('now', 'localtime', ?)
         AND o.imported_at < datetime('now', 'localtime', ?)`
    )
    .all(de, a) as LigneVente[]
}

/**
 * Top des ventes sur une période (jours), depuis les commandes importées —
 * agrégé par carte physique, avec rareté, chiffre d'affaires, stock ACTUEL
 * et ventes de la période précédente (tendance).
 */
export function salesStats(days: number): SalesRow[] {
  const db = getDb()
  const d = Math.max(1, Math.round(days))
  const lignes = lignesVendues(db, `-${d} days`, '+1 day')
  const precedentes = lignesVendues(db, `-${2 * d} days`, `-${d} days`)

  const stock = db
    .prepare(`SELECT ${CLE_STOCK} AS key, SUM(quantity) AS qty FROM stock_items GROUP BY key`)
    .all() as { key: string; qty: number }[]
  const stockByKey = new Map(stock.map((r) => [r.key, r.qty]))

  const cle = (l: { name: string; language: string | null; is_foil: number }): string =>
    `${l.name}|${l.language ?? ''}|${l.is_foil}`

  const prevByKey = new Map<string, number>()
  for (const l of precedentes) {
    prevByKey.set(cle(l), (prevByKey.get(cle(l)) ?? 0) + l.quantity)
  }

  const byKey = new Map<string, SalesRow & { orderIds: Set<number> }>()
  for (const l of lignes) {
    const key = cle(l)
    let row = byKey.get(key)
    if (!row) {
      row = {
        name: l.name,
        number: l.number,
        set_code: l.set_code,
        color_code: l.color_code,
        language: l.language,
        is_foil: l.is_foil,
        rarity: canonicalRarity(l.rarity),
        sold: 0,
        prev_sold: prevByKey.get(key) ?? 0,
        orders: 0,
        revenue_cents: 0,
        last_price: l.price,
        in_stock: stockByKey.get(key) ?? 0,
        orderIds: new Set<number>()
      }
      byKey.set(key, row)
    }
    row.sold += l.quantity
    row.revenue_cents += prixEnCents(l.price) * l.quantity
    row.orderIds.add(l.order_id)
    if (l.price) row.last_price = l.price
    if (!row.rarity && l.rarity) row.rarity = canonicalRarity(l.rarity)
  }
  const rows = [...byKey.values()].map((r) => {
    const { orderIds, ...rest } = r
    return { ...rest, orders: orderIds.size }
  })
  rows.sort((a, b) => b.sold - a.sold || b.revenue_cents - a.revenue_cents)
  return rows
}

export interface DormantRow {
  name: string
  set_code: string | null
  color_code: string | null
  language: string | null
  is_foil: number
  condition: string | null
  price: string | null
  quantity: number
  value_cents: number
  updated_at: string
}

/**
 * Stock DORMANT : les articles en stock dont AUCUN exemplaire ne s'est vendu
 * sur la période — candidats à baisser de prix ou déstocker. Triés par valeur
 * immobilisée décroissante.
 */
export function dormantStock(days: number): { rows: DormantRow[]; total_cents: number } {
  const db = getDb()
  const vendues = new Set(
    lignesVendues(db, `-${Math.max(1, Math.round(days))} days`, '+1 day').map(
      (l) => `${l.name}|${l.language ?? ''}|${l.is_foil}`
    )
  )
  const items = db
    .prepare(
      `SELECT name, set_code, color_code, language, is_foil, MAX(condition) AS condition,
              MAX(price) AS price, SUM(quantity) AS quantity, MAX(updated_at) AS updated_at
       FROM stock_items GROUP BY ${CLE_STOCK}`
    )
    .all() as DormantRow[]
  const rows: DormantRow[] = []
  let total = 0
  for (const it of items) {
    if (vendues.has(`${it.name}|${it.language ?? ''}|${it.is_foil}`)) continue
    const value = prixEnCents(it.price) * it.quantity
    rows.push({ ...it, value_cents: value })
    total += value
  }
  rows.sort((a, b) => b.value_cents - a.value_cents || a.name.localeCompare(b.name))
  return { rows: rows.slice(0, 500), total_cents: total }
}

/** CSV (Excel FR) de la liste d'achat sélectionnée dans « À racheter ». */
export function buyListCsv(
  rows: { name: string; chapitre: string; rarity: string; language: string | null; is_foil: number; sold: number; in_stock: number; qty: number; last_price: string | null }[]
): string {
  const esc = (v: unknown): string => {
    const s = v == null ? '' : String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = ['carte', 'chapitre', 'rarete', 'langue', 'foil', 'vendues', 'en_stock', 'qte_a_racheter', 'dernier_prix']
  const lines = [head.join(';')]
  for (const r of rows) {
    lines.push(
      [r.name, r.chapitre, r.rarity, r.language ?? '', r.is_foil ? 'oui' : '', r.sold, r.in_stock, r.qty, r.last_price ?? '']
        .map(esc)
        .join(';')
    )
  }
  return '﻿' + lines.join('\r\n')
}

/**
 * Recommandations de réassort : cartes vendues sur la période dont le stock
 * actuel est à zéro (rupture) ou inférieur aux ventes de la période (faible).
 */
export function restockSuggestions(days: number, minSold: number): (SalesRow & { statut: 'rupture' | 'faible' })[] {
  return salesStats(days)
    .filter((r) => r.sold >= Math.max(1, minSold) && r.in_stock < r.sold)
    .map((r) => ({ ...r, statut: r.in_stock === 0 ? ('rupture' as const) : ('faible' as const) }))
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

/** Horodatage de référence (horloge de la base) avant un balayage complet. */
export function sweepMark(): string {
  return (getDb().prepare(`SELECT datetime('now', 'localtime') AS t`).get() as { t: string }).t
}

/** Après un balayage COMPLET : retire les articles non revus (vendus/retirés). */
export function purgeOlder(userId: number, mark: string): { removed: number } {
  const r = getDb().prepare('DELETE FROM stock_items WHERE updated_at < ?').run(mark)
  logActivity(userId, 'stock.sweep_purged', { removed: r.changes })
  return { removed: r.changes }
}

/** Export CSV (séparateur ; + BOM, pour Excel FR) de tout le miroir local. */
export function exportCsv(): string {
  const items = getDb()
    .prepare('SELECT * FROM stock_items ORDER BY set_code, name')
    .all() as StockItem[]
  const esc = (v: unknown): string => {
    const s = v == null ? '' : String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = ['cm_article_id', 'name', 'set_code', 'color_code', 'number', 'language', 'condition', 'is_foil', 'comment', 'price', 'quantity', 'updated_at']
  const lines = [head.join(';')]
  for (const it of items) {
    lines.push(head.map((k) => esc((it as unknown as Record<string, unknown>)[k])).join(';'))
  }
  // La chaîne retournée commence par un BOM U+FEFF (invisible) pour Excel
  return '﻿' + lines.join('\r\n')
}
