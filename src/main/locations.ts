import { getDb, logActivity } from './db'
import type { CardFacts, LocationRule, RuleCriteria, StorageLocation } from '@shared/types'

// Moteur de rangement (hérité de la V1) :
// les emplacements sont parcourus dans l'ordre choisi par l'utilisateur
// (sort_order), chaque règle est un ET logique de critères, et la PREMIÈRE
// règle qui matche gagne. Une carte vit donc à un seul endroit.

interface LocationRow {
  id: number
  name: string
  kind: string
  color: string | null
  label: string | null
  sort_order: number
  notes: string | null
  active: number
  created_at: string
}

interface RuleRow {
  id: number
  location_id: number
  priority: number
  criteria: string
}

function toLocation(row: LocationRow, rules: RuleRow[]): StorageLocation {
  return {
    ...(row as Omit<StorageLocation, 'kind' | 'rules'>),
    kind: row.kind as StorageLocation['kind'],
    rules: rules.map((r) => ({
      id: r.id,
      location_id: r.location_id,
      priority: r.priority,
      criteria: JSON.parse(r.criteria) as RuleCriteria
    }))
  }
}

export function listLocations(): StorageLocation[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM locations WHERE active = 1 ORDER BY sort_order, id')
    .all() as LocationRow[]
  const rules = db
    .prepare('SELECT * FROM location_rules ORDER BY priority, id')
    .all() as RuleRow[]
  const byLoc = new Map<number, RuleRow[]>()
  for (const r of rules) {
    const list = byLoc.get(r.location_id) ?? []
    list.push(r)
    byLoc.set(r.location_id, list)
  }
  return rows.map((row) => toLocation(row, byLoc.get(row.id) ?? []))
}

export function createLocation(
  userId: number,
  data: Pick<StorageLocation, 'name' | 'kind' | 'color' | 'label' | 'notes'>
): number {
  const db = getDb()
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM locations').get() as {
    m: number
  }
  const info = db
    .prepare(
      'INSERT INTO locations (name, kind, color, label, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(data.name.trim(), data.kind, data.color, data.label, data.notes, max.m + 1)
  logActivity(userId, 'location.created', { name: data.name, id: info.lastInsertRowid })
  return Number(info.lastInsertRowid)
}

export function updateLocation(
  userId: number,
  id: number,
  data: Pick<StorageLocation, 'name' | 'kind' | 'color' | 'label' | 'notes'>
): void {
  getDb()
    .prepare('UPDATE locations SET name = ?, kind = ?, color = ?, label = ?, notes = ? WHERE id = ?')
    .run(data.name.trim(), data.kind, data.color, data.label, data.notes, id)
  logActivity(userId, 'location.updated', { id, name: data.name })
}

export function deleteLocation(userId: number, id: number): void {
  // Suppression douce : l'emplacement disparaît de l'app mais reste en base
  // pour que l'historique de picking garde ses références.
  getDb().prepare('UPDATE locations SET active = 0 WHERE id = ?').run(id)
  logActivity(userId, 'location.deleted', { id })
}

/** Réordonne les emplacements selon la liste d'ids fournie (ordre = priorité). */
export function reorderLocations(userId: number, orderedIds: number[]): void {
  const db = getDb()
  const stmt = db.prepare('UPDATE locations SET sort_order = ? WHERE id = ?')
  const tx = db.transaction(() => {
    orderedIds.forEach((id, i) => stmt.run(i + 1, id))
  })
  tx()
  logActivity(userId, 'location.reordered', { order: orderedIds })
}

export function setRules(userId: number, locationId: number, criteriaList: RuleCriteria[]): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM location_rules WHERE location_id = ?').run(locationId)
    const ins = db.prepare(
      'INSERT INTO location_rules (location_id, priority, criteria) VALUES (?, ?, ?)'
    )
    criteriaList.forEach((c, i) => ins.run(locationId, i + 1, JSON.stringify(c)))
  })
  tx()
  logActivity(userId, 'location.rules_updated', { locationId, count: criteriaList.length })
}

// --- Moteur d'affectation -----------------------------------------------------

export function ruleMatches(criteria: RuleCriteria, card: CardFacts): boolean {
  if (criteria.colors?.length && !criteria.colors.includes(card.color)) return false
  if (criteria.rarities?.length && !criteria.rarities.includes(card.rarity)) return false
  if (criteria.chapters?.length && !criteria.chapters.includes(card.chapter)) return false
  if (criteria.foil != null && card.is_foil !== criteria.foil) return false
  if (criteria.languages?.length && !criteria.languages.includes(card.language)) return false
  return true
}

/** Renvoie le premier emplacement dont une règle matche, sinon null (= « Non assigné »). */
export function resolveLocation(
  card: CardFacts,
  locations?: StorageLocation[]
): StorageLocation | null {
  for (const loc of locations ?? listLocations()) {
    for (const rule of loc.rules) {
      if (ruleMatches(rule.criteria, card)) return loc
    }
  }
  return null
}
