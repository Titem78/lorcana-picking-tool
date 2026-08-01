// Gestion des timbres La Poste imprimés (planches « Mon Timbre en Ligne »).
//
// Structure constatée d'une planche : A4, grille 3 × 5, chaque timbre porte
// son type (« Lettre verte / Max 20g ») et un numéro unique « SD : 8700… »
// (Suivi de Distribution — traçable sur laposte.fr).
//
// Principes : chaque numéro n'est importé qu'une fois, un timbre affecté à une
// commande passe « utilisé » et ne peut JAMAIS être réaffecté ; le numéro est
// noté sur la commande et sert de numéro de suivi si elle n'en a pas.

import { BrowserWindow, app, dialog } from 'electron'
import { copyFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getDb, logActivity } from './db'

export interface StampStock {
  stamp_type: string
  free: number
  used: number
}

export interface Stamp {
  id: number
  sheet_id: number
  number: string
  stamp_type: string
  page: number
  sd_x: number
  sd_y: number
  status: 'free' | 'used'
  used_order_id: number | null
  used_at: string | null
  used_by: number | null
}

export function stampsDir(): string {
  const dir = join(app.getPath('userData'), 'stamps')
  mkdirSync(dir, { recursive: true })
  return dir
}

interface ParsedStamp {
  number: string
  stamp_type: string
  page: number
  sd_x: number
  sd_y: number
}

/** Analyse une planche PDF : numéros SD + type + position de chaque timbre. */
export async function parseSheet(path: string): Promise<ParsedStamp[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ url: path, useSystemFonts: true })
  const doc = await task.promise
  const stamps: ParsedStamp[] = []

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const items = content.items
      .map((it) => {
        const t = it as { str?: string; transform: number[] }
        return { str: (t.str ?? '').trim(), x: t.transform[4], y: t.transform[5] }
      })
      .filter((t) => t.str)

    for (const it of items) {
      const m = it.str.match(/SD\s*:\s*([0-9A-Z]{8,})/i)
      if (!m) continue
      // Type du timbre : textes situés dans la même cellule (au-dessus du n°,
      // à gauche), ex. « Lettre verte » + « Max 20g ».
      const typeParts = items
        .filter(
          (t) =>
            t.x > it.x - 175 &&
            t.x < it.x &&
            t.y > it.y &&
            t.y < it.y + 40 &&
            !/LA POSTE|FRANCE|laposte\.fr/i.test(t.str)
        )
        .sort((a, b) => b.y - a.y)
        .map((t) => t.str)
      stamps.push({
        number: m[1],
        stamp_type: typeParts.join(' ') || 'Timbre',
        page: p,
        sd_x: it.x,
        sd_y: it.y
      })
    }
  }
  await task.destroy()
  return stamps
}

/** Importe une ou plusieurs planches PDF (copiées dans le dossier de l'app). */
export async function importSheets(
  userId: number,
  win: BrowserWindow
): Promise<{ imported: number; duplicates: number; types: string[] } | null> {
  const res = await dialog.showOpenDialog(win, {
    title: 'Importer des planches de timbres (PDF La Poste)',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['openFile', 'multiSelections']
  })
  if (res.canceled || res.filePaths.length === 0) return null

  const db = getDb()
  let imported = 0
  let duplicates = 0
  const types = new Set<string>()

  for (const path of res.filePaths) {
    const stamps = await parseSheet(path)
    if (stamps.length === 0) continue

    const mainType = stamps[0].stamp_type
    const info = db
      .prepare('INSERT INTO stamp_sheets (file, stamp_type, imported_by) VALUES (?, ?, ?)')
      .run('', mainType, userId)
    const sheetId = Number(info.lastInsertRowid)
    const file = `sheet_${sheetId}.pdf`
    copyFileSync(path, join(stampsDir(), file))
    db.prepare('UPDATE stamp_sheets SET file = ? WHERE id = ?').run(file, sheetId)

    const ins = db.prepare(
      `INSERT OR IGNORE INTO stamps (sheet_id, number, stamp_type, page, sd_x, sd_y)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    for (const s of stamps) {
      const r = ins.run(sheetId, s.number, s.stamp_type, s.page, s.sd_x, s.sd_y)
      if (r.changes === 1) {
        imported++
        types.add(s.stamp_type)
      } else {
        duplicates++
      }
    }
  }
  logActivity(userId, 'stamps.imported', { imported, duplicates, types: [...types] })
  return { imported, duplicates, types: [...types] }
}

/** Stock par type de timbre. */
export function getStock(): StampStock[] {
  return getDb()
    .prepare(
      `SELECT stamp_type,
              SUM(CASE WHEN status = 'free' THEN 1 ELSE 0 END) AS free,
              SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) AS used
       FROM stamps GROUP BY stamp_type ORDER BY stamp_type`
    )
    .all() as StampStock[]
}

/**
 * Affecte le prochain timbre libre du type demandé à la commande :
 * timbre → utilisé (définitif), numéro noté sur la commande, et utilisé comme
 * n° de suivi si la commande n'en a pas.
 */
export function assignStamp(
  userId: number,
  orderId: number,
  stampType: string
): { number: string } {
  const db = getDb()
  const existing = db.prepare('SELECT stamp_number FROM orders WHERE id = ?').get(orderId) as
    | { stamp_number: string | null }
    | undefined
  if (!existing) throw new Error('Commande introuvable')
  if (existing.stamp_number) throw new Error(`Cette commande a déjà le timbre ${existing.stamp_number}`)

  const stamp = db
    .prepare("SELECT * FROM stamps WHERE stamp_type = ? AND status = 'free' ORDER BY id LIMIT 1")
    .get(stampType) as Stamp | undefined
  if (!stamp) throw new Error(`Plus aucun timbre libre du type « ${stampType} » — importe une planche`)

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE stamps SET status = 'used', used_order_id = ?,
         used_at = datetime('now', 'localtime'), used_by = ? WHERE id = ? AND status = 'free'`
    ).run(orderId, userId, stamp.id)
    db.prepare('UPDATE orders SET stamp_number = ? WHERE id = ?').run(stamp.number, orderId)
    db.prepare(
      "UPDATE orders SET tracking_number = ? WHERE id = ? AND (tracking_number IS NULL OR tracking_number = '')"
    ).run(stamp.number, orderId)
  })
  tx()
  logActivity(userId, 'stamp.assigned', { orderId, number: stamp.number, type: stampType })
  return { number: stamp.number }
}

/**
 * Libère le timbre d'une commande (erreur de manipulation UNIQUEMENT — si le
 * timbre a été physiquement imprimé/collé, ne pas le libérer !).
 */
export function releaseStamp(userId: number, orderId: number): void {
  const db = getDb()
  const order = db.prepare('SELECT stamp_number, tracking_number FROM orders WHERE id = ?').get(orderId) as
    | { stamp_number: string | null; tracking_number: string | null }
    | undefined
  if (!order?.stamp_number) return
  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE stamps SET status = 'free', used_order_id = NULL, used_at = NULL, used_by = NULL WHERE number = ?"
    ).run(order.stamp_number)
    db.prepare('UPDATE orders SET stamp_number = NULL WHERE id = ?').run(orderId)
    if (order.tracking_number === order.stamp_number) {
      db.prepare('UPDATE orders SET tracking_number = NULL WHERE id = ?').run(orderId)
    }
  })
  tx()
  logActivity(userId, 'stamp.released', { orderId, number: order.stamp_number })
}

/** Données nécessaires à l'impression du timbre d'une commande. */
export function getStampPrint(orderId: number): {
  sheet_file: string
  page: number
  sd_x: number
  sd_y: number
  number: string
  stamp_type: string
} | null {
  const db = getDb()
  const order = db.prepare('SELECT stamp_number FROM orders WHERE id = ?').get(orderId) as
    | { stamp_number: string | null }
    | undefined
  if (!order?.stamp_number) return null
  const row = db
    .prepare(
      `SELECT s.number, s.stamp_type, s.page, s.sd_x, s.sd_y, sh.file AS sheet_file
       FROM stamps s JOIN stamp_sheets sh ON sh.id = s.sheet_id
       WHERE s.number = ?`
    )
    .get(order.stamp_number) as ReturnType<typeof getStampPrint>
  return row ?? null
}
