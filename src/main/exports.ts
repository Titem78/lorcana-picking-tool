// Exports / imports : historique en CSV (Excel FR), configuration des
// emplacements en JSON (sauvegarde ou transfert sur un autre PC).

import { BrowserWindow, dialog } from 'electron'
import { writeFileSync, readFileSync } from 'fs'
import { getDb, logActivity } from './db'
import { createLocation, listLocations, setRules } from './locations'
import type { RuleCriteria, StorageLocation } from '@shared/types'

function csvCell(v: unknown): string {
  const s = String(v ?? '')
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Historique complet (commandes expédiées/archivées), une ligne par carte. */
export async function exportHistoryCsv(userId: number, win: BrowserWindow): Promise<string | null> {
  const res = await dialog.showSaveDialog(win, {
    title: "Exporter l'historique",
    defaultPath: `historique-lorcana-${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  })
  if (res.canceled || !res.filePath) return null

  const rows = getDb()
    .prepare(
      `SELECT o.sale_id, o.buyer_username, o.buyer_name, o.total, o.shipping_method,
              o.tracking_number, o.shipped_at, us.name AS shipped_by_name,
              o.prepared_at, up.name AS prepared_by_name,
              l.quantity, l.name, l.set_code, l.number, l.language, l.condition,
              l.rarity_code, l.is_foil, l.price, upk.name AS picked_by_name, l.picked_at
       FROM orders o
       JOIN order_lines l ON l.order_id = o.id
       LEFT JOIN users us ON us.id = o.shipped_by
       LEFT JOIN users up ON up.id = o.prepared_by
       LEFT JOIN users upk ON upk.id = l.picked_by
       WHERE o.status IN ('shipped', 'archived')
       ORDER BY o.shipped_at DESC, o.id, l.id`
    )
    .all() as Record<string, unknown>[]

  const header = [
    'Vente', 'Client', 'Nom', 'Total', 'Envoi', 'Suivi', 'Expédiée le', 'Expédiée par',
    'Préparée le', 'Préparée par', 'Qté', 'Carte', 'Chapitre', 'Numéro', 'Langue',
    'État', 'Rareté', 'Foil', 'Prix', 'Pickée par', 'Pickée le'
  ]
  const lines = rows.map((r) =>
    [
      r.sale_id, r.buyer_username, r.buyer_name, r.total, r.shipping_method,
      r.tracking_number, r.shipped_at, r.shipped_by_name, r.prepared_at, r.prepared_by_name,
      r.quantity, r.name, r.set_code, r.number, r.language, r.condition, r.rarity_code,
      r.is_foil ? 'oui' : 'non', r.price, r.picked_by_name, r.picked_at
    ]
      .map(csvCell)
      .join(';')
  )
  // BOM pour qu'Excel ouvre le fichier en UTF-8
  writeFileSync(res.filePath, '﻿' + [header.join(';'), ...lines].join('\r\n'), 'utf-8')
  logActivity(userId, 'export.history', { file: res.filePath, rows: rows.length })
  return res.filePath
}

/** Configuration des emplacements (avec règles) → fichier JSON. */
export async function exportLocationsJson(
  userId: number,
  win: BrowserWindow
): Promise<string | null> {
  const res = await dialog.showSaveDialog(win, {
    title: 'Exporter la configuration des emplacements',
    defaultPath: `emplacements-lorcana-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (res.canceled || !res.filePath) return null

  const locations = listLocations().map((l) => ({
    name: l.name,
    kind: l.kind,
    color: l.color,
    label: l.label,
    notes: l.notes,
    rules: l.rules.map((r) => r.criteria)
  }))
  writeFileSync(res.filePath, JSON.stringify({ version: 1, locations }, null, 2), 'utf-8')
  logActivity(userId, 'export.locations', { file: res.filePath, count: locations.length })
  return res.filePath
}

/** Import d'un fichier d'emplacements : ajoute à la suite des existants. */
export async function importLocationsJson(
  userId: number,
  win: BrowserWindow
): Promise<{ imported: number } | { error: string } | null> {
  const res = await dialog.showOpenDialog(win, {
    title: 'Importer une configuration des emplacements',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  })
  if (res.canceled || !res.filePaths[0]) return null

  try {
    const data = JSON.parse(readFileSync(res.filePaths[0], 'utf-8')) as {
      locations?: {
        name?: string
        kind?: StorageLocation['kind']
        color?: string | null
        label?: string | null
        notes?: string | null
        rules?: RuleCriteria[]
      }[]
    }
    if (!Array.isArray(data.locations)) throw new Error('format inattendu')
    let imported = 0
    for (const loc of data.locations) {
      if (!loc.name) continue
      const id = createLocation(userId, {
        name: loc.name,
        kind: loc.kind ?? 'other',
        color: loc.color ?? null,
        label: loc.label ?? null,
        notes: loc.notes ?? null
      })
      setRules(userId, id, Array.isArray(loc.rules) ? loc.rules : [])
      imported++
    }
    logActivity(userId, 'import.locations', { file: res.filePaths[0], imported })
    return { imported }
  } catch (err) {
    return { error: `Fichier illisible : ${String((err as Error).message ?? err)}` }
  }
}
