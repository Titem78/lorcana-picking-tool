import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const userData = mkdtempSync(join(tmpdir(), 'lorcana-stockmod-'))
vi.mock('electron', () => ({
  app: { getPath: () => userData }
}))

import { closeDb, getDb } from '../src/main/db'
import { createUser } from '../src/main/users'
import {
  upsertStock,
  listStock,
  takeSnapshot,
  listSnapshots,
  compareSnapshots,
  salesStats,
  restockSuggestions,
  decrementForSale,
  prixEnCents
} from '../src/main/stock'

let userId = 0

beforeAll(() => {
  userId = createUser('Testeur', '1234', true).id
  upsertStock(userId, [
    { article_id: 'a1', name: 'Elsa - Le cinquième esprit', number: '48', set_code: '5', language: 'FR', condition: 'NM', is_foil: false, price: '2,50 EUR', quantity: 4 },
    { article_id: 'a2', name: 'Mickey Mouse - Champion Ambre', number: '23', set_code: '10', language: 'FR', condition: 'NM', is_foil: true, price: '1,00 EUR', quantity: 2 },
    { article_id: 'a3', name: 'Stitch - Rock Star', number: '3', set_code: '', color_code: 'DIS', language: 'EN', condition: 'EX', is_foil: false, price: '10,00 EUR', quantity: 1 }
  ])
})

afterAll(() => {
  closeDb()
  rmSync(userData, { recursive: true, force: true })
})

describe('module stock — filtres', () => {
  it('filtre par langue, foil et chapitre (promos par code)', () => {
    expect(listStock({ language: 'EN' }).items).toHaveLength(1)
    expect(listStock({ foil: '1' }).items[0].name).toContain('Mickey')
    expect(listStock({ set_code: 'DIS' }).items[0].name).toContain('Stitch')
    expect(listStock({ q: 'elsa' }).items).toHaveLength(1)
  })

  it('totaux et valeurs de filtres', () => {
    const r = listStock({})
    expect(r.totals.copies).toBe(7)
    expect(r.totals.value_cents).toBe(4 * 250 + 2 * 100 + 1000)
    expect(r.sets).toContain('5')
    expect(r.sets).toContain('DIS')
    expect(r.languages).toEqual(['EN', 'FR'])
  })

  it('prixEnCents lit les formats Cardmarket', () => {
    expect(prixEnCents('2,50 EUR')).toBe(250)
    expect(prixEnCents('1.234,56 EUR')).toBe(123456)
    expect(prixEnCents(null)).toBe(0)
  })
})

describe('module stock — instantanés et comparatif', () => {
  it('fige puis compare avec le stock actuel après une vente', () => {
    const snapId = takeSnapshot(userId, 'Avant ventes', 'manual')
    expect(listSnapshots()[0].copies).toBe(7)

    // 3 Elsa vendues → décrément du miroir
    decrementForSale({ name: 'Elsa - Le cinquième esprit', language: 'FR', condition: 'NM', is_foil: 0, quantity: 3 })

    const diff = compareSnapshots(snapId, null)
    expect(diff.totals.sortis).toBe(3)
    expect(diff.totals.entres).toBe(0)
    expect(diff.rows).toHaveLength(1)
    expect(diff.rows[0].name).toContain('Elsa')
    expect(diff.rows[0].qty_before).toBe(4)
    expect(diff.rows[0].qty_after).toBe(1)
    expect(diff.rows[0].delta).toBe(-3)
  })

  it('épuisement complet : la carte disparue du miroir apparaît bien à −N', () => {
    const snapId = takeSnapshot(userId, 'Avant rupture', 'manual')
    decrementForSale({ name: 'Stitch - Rock Star', language: 'EN', condition: 'EX', is_foil: 0, quantity: 1 })
    const diff = compareSnapshots(snapId, null)
    const stitch = diff.rows.find((r) => r.name.includes('Stitch'))
    expect(stitch?.qty_after).toBe(0)
    expect(stitch?.delta).toBe(-1)
  })
})

describe('module stock — ventes et réassort', () => {
  beforeAll(() => {
    const db = getDb()
    const o = db
      .prepare(
        `INSERT INTO orders (sale_id, buyer_username, buyer_name, buyer_address, status, imported_by)
         VALUES ('999001', 'client1', 'Client Un', 'adresse', 'shipped', ?)`
      )
      .run(userId)
    const orderId = Number(o.lastInsertRowid)
    const ins = db.prepare(
      `INSERT INTO order_lines (order_id, quantity, name, number, language, condition, set_code,
         color_code, color_label, rarity_code, price, comment, is_foil, section)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, '', ?, 'Lorcana Cartes')`
    )
    ins.run(orderId, 3, 'Elsa - Le cinquième esprit', '48', 'FR', 'NM', '5', 'SHI', 'SR', '2,50 EUR', 0)
    ins.run(orderId, 1, 'Stitch - Rock Star', '3', 'EN', 'EX', '', 'DIS', 'P', '10,00 EUR', 0)
  })

  it('top des ventes avec rareté canonique, CA et stock actuel', () => {
    const rows = salesStats(30)
    expect(rows[0].name).toContain('Elsa')
    expect(rows[0].sold).toBe(3)
    expect(rows[0].revenue_cents).toBe(750)
    expect(rows[0].rarity).toBe('Super_rare')
    expect(rows[0].in_stock).toBe(1) // 4 − 3 vendues
    const stitch = rows.find((r) => r.name.includes('Stitch'))
    expect(stitch?.rarity).toBe('Promo')
    expect(stitch?.in_stock).toBe(0)
  })

  it('recommandations : rupture et stock faible', () => {
    const reco = restockSuggestions(30, 1)
    const stitch = reco.find((r) => r.name.includes('Stitch'))
    expect(stitch?.statut).toBe('rupture')
    const elsa = reco.find((r) => r.name.includes('Elsa'))
    expect(elsa?.statut).toBe('faible') // 1 en stock < 3 vendues
    // hors période : rien
    expect(salesStats(30).length).toBeGreaterThan(0)
    expect(restockSuggestions(30, 99)).toHaveLength(0)
  })
})
