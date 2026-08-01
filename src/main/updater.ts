import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

// Mise à jour automatique via les GitHub Releases du dépôt (electron-builder.yml).
// Cycle : vérification au lancement → téléchargement silencieux → installation
// proposée au redémarrage. Les événements sont relayés au renderer pour affichage.
export function setupAutoUpdater(): void {
  if (!app.isPackaged) return // pas de mise à jour en mode développement

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  const send = (channel: string, payload?: unknown): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, payload)
    }
  }

  autoUpdater.on('update-available', (info) => send('updater:available', info.version))
  autoUpdater.on('update-downloaded', (info) => send('updater:downloaded', info.version))
  autoUpdater.on('error', (err) => send('updater:error', String(err?.message ?? err)))

  autoUpdater.checkForUpdates().catch(() => {
    /* hors-ligne : silencieux */
  })
  // re-vérification toutes les 4 heures si l'app reste ouverte
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 3600 * 1000)
}
