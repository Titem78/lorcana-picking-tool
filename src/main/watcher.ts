// Dossier surveillé : tout fichier « Vente_#xxxx.pdf » qui y apparaît est
// importé automatiquement (les ventes déjà connues sont ignorées).

import { BrowserWindow, dialog } from 'electron'
import { watch, statSync, readdirSync, type FSWatcher } from 'fs'
import { join } from 'path'
import { getDb, logActivity } from './db'
import { importPdfs } from './orders'

const PDF_RE = /^Vente_#?\d+.*\.pdf$/i

let watcher: FSWatcher | null = null
const pending = new Map<string, NodeJS.Timeout>()
const processed = new Set<string>()

function getSetting(key: string): string | null {
  const r = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return r?.value ?? null
}

function setSetting(key: string, value: string): void {
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

export function getWatcherConfig(): { folder: string | null; enabled: boolean } {
  return {
    folder: getSetting('watch_folder'),
    enabled: getSetting('watch_enabled') === '1'
  }
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
}

async function importFile(folder: string, filename: string): Promise<void> {
  const path = join(folder, filename)
  try {
    // attendre que le fichier soit complètement écrit (taille stable)
    const s1 = statSync(path).size
    await new Promise((r) => setTimeout(r, 800))
    if (statSync(path).size !== s1) {
      scheduleImport(folder, filename) // encore en cours d'écriture : on repassera
      return
    }
    const results = await importPdfs(null, [path])
    processed.add(filename)
    const ok = results.filter((r) => r.status === 'ok')
    if (ok.length > 0) {
      logActivity(null, 'order.auto_imported', { file: filename, sale_id: ok[0].sale_id })
      broadcast('orders:auto-imported', results)
    }
  } catch {
    /* fichier illisible/verrouillé : ignoré, l'utilisateur peut l'importer à la main */
  }
}

function scheduleImport(folder: string, filename: string): void {
  const prev = pending.get(filename)
  if (prev) clearTimeout(prev)
  pending.set(
    filename,
    setTimeout(() => {
      pending.delete(filename)
      void importFile(folder, filename)
    }, 1200)
  )
}

export function startWatcher(): void {
  stopWatcher()
  const { folder, enabled } = getWatcherConfig()
  if (!enabled || !folder) return
  try {
    watcher = watch(folder, (_event, filename) => {
      if (!filename || !PDF_RE.test(filename) || processed.has(filename)) return
      scheduleImport(folder, filename)
    })
  } catch {
    /* dossier introuvable : le watcher reste inactif */
  }
}

export function stopWatcher(): void {
  watcher?.close()
  watcher = null
}

/** Choisit le dossier à surveiller (et active la surveillance). */
export async function pickWatchFolder(userId: number, win: BrowserWindow): Promise<string | null> {
  const res = await dialog.showOpenDialog(win, {
    title: 'Dossier à surveiller (téléchargements Cardmarket)',
    properties: ['openDirectory']
  })
  if (res.canceled || !res.filePaths[0]) return null
  setSetting('watch_folder', res.filePaths[0])
  setSetting('watch_enabled', '1')
  logActivity(userId, 'watcher.configured', { folder: res.filePaths[0] })
  startWatcher()
  return res.filePaths[0]
}

export function setWatcherEnabled(userId: number, enabled: boolean): void {
  setSetting('watch_enabled', enabled ? '1' : '0')
  logActivity(userId, 'watcher.toggled', { enabled })
  startWatcher()
}

/** Scanne le dossier maintenant (fichiers Vente_*.pdf déjà présents). */
export async function scanNow(userId: number): Promise<number> {
  const { folder } = getWatcherConfig()
  if (!folder) return 0
  let count = 0
  for (const f of readdirSync(folder)) {
    if (PDF_RE.test(f)) {
      await importFile(folder, f)
      count++
    }
  }
  logActivity(userId, 'watcher.scanned', { folder, count })
  return count
}
