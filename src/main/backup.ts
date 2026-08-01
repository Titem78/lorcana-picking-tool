// Sauvegarde / restauration COMPLÈTE : base de données (commandes, historique,
// comptes, emplacements, réglages, associations Odoo...) + tous les visuels en
// cache. Un seul fichier .zip, pour changer de PC ou dormir tranquille.
//
// Le zip est créé avec tar.exe (bsdtar), présent sur Windows 10/11.

import { BrowserWindow, app, dialog } from 'electron'
import { execFileSync } from 'child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { closeDb, getDb, getDbPath, logActivity } from './db'
import { imagesDir } from './lorcast'
import { stampsDir } from './stamps'

// Outils système Windows (chemins absolus : indépendants du PATH de l'app)
const TAR = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
const ROBOCOPY = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'Robocopy.exe')

export async function exportBackup(userId: number, win: BrowserWindow): Promise<string | null> {
  const res = await dialog.showSaveDialog(win, {
    title: 'Sauvegarde complète',
    defaultPath: `lorcana-sauvegarde-${new Date().toISOString().slice(0, 10)}.zip`,
    filters: [{ name: 'Sauvegarde (zip)', extensions: ['zip'] }]
  })
  if (res.canceled || !res.filePath) return null

  const staging = mkdtempSync(join(tmpdir(), 'lorcana-backup-'))
  try {
    // Copie cohérente de la base même app ouverte (API backup de SQLite)
    await getDb().backup(join(staging, 'lorcana-picking.db'))
    // Visuels (cartes en cache + images personnalisées des accessoires)
    // + planches de timbres PDF (indispensables pour imprimer les timbres)
    for (const [name, src] of [
      ['images', imagesDir()],
      ['stamps', stampsDir()]
    ] as const) {
      if (existsSync(src)) {
        mkdirSync(join(staging, name), { recursive: true })
        execFileSync(ROBOCOPY, [src, join(staging, name), '/E', '/NFL', '/NDL', '/NJH', '/NJS'], {
          windowsHide: true
        })
      }
    }
  } catch (err) {
    // robocopy renvoie des codes de sortie non nuls même en cas de succès (1 = fichiers copiés)
    const code = (err as { status?: number }).status
    if (code === undefined || code > 7) {
      rmSync(staging, { recursive: true, force: true })
      throw err
    }
  }

  try {
    execFileSync(TAR, ['-a', '-c', '-f', res.filePath, '-C', staging, '.'], { windowsHide: true })
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
  logActivity(userId, 'backup.exported', { file: res.filePath })
  return res.filePath
}

/**
 * Restauration : remplace TOUTES les données actuelles par la sauvegarde,
 * puis redémarre l'application. Irréversible (confirmé côté interface).
 */
export async function importBackup(userId: number, win: BrowserWindow): Promise<void> {
  const res = await dialog.showOpenDialog(win, {
    title: 'Restaurer une sauvegarde complète',
    filters: [{ name: 'Sauvegarde (zip)', extensions: ['zip'] }],
    properties: ['openFile']
  })
  if (res.canceled || !res.filePaths[0]) return

  const staging = mkdtempSync(join(tmpdir(), 'lorcana-restore-'))
  execFileSync(TAR, ['-x', '-f', res.filePaths[0], '-C', staging], { windowsHide: true })

  const dbFile = join(staging, 'lorcana-picking.db')
  if (!existsSync(dbFile)) {
    rmSync(staging, { recursive: true, force: true })
    throw new Error('Fichier de sauvegarde invalide (base de données absente)')
  }

  logActivity(userId, 'backup.import_started', { file: res.filePaths[0] })
  closeDb()
  copyFileSync(dbFile, getDbPath())
  for (const [name, dst] of [
    ['images', imagesDir()],
    ['stamps', stampsDir()]
  ] as const) {
    const src = join(staging, name)
    if (existsSync(src)) {
      try {
        execFileSync(ROBOCOPY, [src, dst, '/E', '/NFL', '/NDL', '/NJH', '/NJS'], {
          windowsHide: true
        })
      } catch (err) {
        const code = (err as { status?: number }).status
        if (code === undefined || code > 7) throw err
      }
    }
  }
  rmSync(staging, { recursive: true, force: true })

  // Redémarrage propre sur les données restaurées
  app.relaunch()
  app.exit(0)
}
