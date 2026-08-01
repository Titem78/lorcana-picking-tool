import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { appendFileSync } from 'fs'
import { join } from 'path'

export interface UpdateCheckResult {
  status: 'dev' | 'uptodate' | 'available' | 'error'
  current: string
  latest?: string
  message?: string
}

/** Vérification manuelle (bouton dans les Réglages). */
export async function checkForUpdatesNow(): Promise<UpdateCheckResult> {
  const current = app.getVersion()
  if (!app.isPackaged) {
    return { status: 'dev', current, message: 'Pas de mise à jour en mode développement' }
  }
  try {
    const res = await autoUpdater.checkForUpdates()
    const latest = res?.updateInfo?.version
    if (latest && latest !== current) {
      return { status: 'available', current, latest }
    }
    return { status: 'uptodate', current, latest: latest ?? current }
  } catch (err) {
    return { status: 'error', current, message: String((err as Error).message ?? err) }
  }
}

// Mise à jour automatique via les GitHub Releases du dépôt (electron-builder.yml).
// Cycle : vérification au lancement → téléchargement silencieux → installation
// proposée au redémarrage. Les événements sont relayés au renderer pour affichage.
/** Journal des mises à jour : %APPDATA%/lorcana-picking-tool/updater.log */
function logUpdate(msg: string): void {
  try {
    appendFileSync(
      join(app.getPath('userData'), 'updater.log'),
      `${new Date().toISOString()} ${msg}\n`
    )
  } catch {
    /* jamais bloquant */
  }
}

export function setupAutoUpdater(): void {
  if (!app.isPackaged) return // pas de mise à jour en mode développement

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  const send = (channel: string, payload?: unknown): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, payload)
    }
  }

  autoUpdater.on('checking-for-update', () => logUpdate('vérification…'))
  autoUpdater.on('update-not-available', (info) =>
    logUpdate(`à jour (version en ligne : ${info.version})`)
  )
  autoUpdater.on('update-available', (info) => {
    logUpdate(`mise à jour ${info.version} détectée, téléchargement…`)
    send('updater:available', info.version)
  })
  autoUpdater.on('download-progress', (p) =>
    logUpdate(`téléchargement ${Math.round(p.percent)} %`)
  )
  autoUpdater.on('update-downloaded', (info) => {
    logUpdate(`${info.version} téléchargée — installation à la fermeture`)
    send('updater:downloaded', info.version)
  })
  autoUpdater.on('error', (err) => {
    logUpdate(`ERREUR : ${String(err?.message ?? err)}`)
    send('updater:error', String(err?.message ?? err))
  })

  autoUpdater.checkForUpdates().catch((err) => logUpdate(`ERREUR check : ${String(err)}`))
  // re-vérification toutes les 4 heures si l'app reste ouverte
  setInterval(
    () => autoUpdater.checkForUpdates().catch((err) => logUpdate(`ERREUR check : ${String(err)}`)),
    4 * 3600 * 1000
  )
}
