import { app, BrowserWindow, net, protocol } from 'electron'
import { appendFileSync } from 'fs'
import { join, normalize } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpc } from './ipc'
import { closeDb } from './db'
import { setupAutoUpdater } from './updater'
import { imagesDir } from './lorcast'
import { stampsDir } from './stamps'
import { syncInvoiceStatuses } from './odoo'

// Fenêtre noire au démarrage sous certains GPU/drivers Windows : bug Electron
// connu, réglé en désactivant l'accélération matérielle (aucun impact pour
// cette app, qui n'a ni vidéo ni animation lourde).
app.disableHardwareAcceleration()

// Une seule instance à la fois : les doubles lancements bloquaient les mises
// à jour (fichiers verrouillés) et ont corrompu l'enregistrement des
// migrations. Un second lancement ramène la fenêtre existante au premier plan.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}
app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

// Journal des pépins du processus principal et du renderer :
// %APPDATA%/lorcana-picking-tool/main.log
function logMain(msg: string): void {
  try {
    appendFileSync(join(app.getPath('userData'), 'main.log'), `${new Date().toISOString()} ${msg}\n`)
  } catch {
    /* jamais bloquant */
  }
}
process.on('uncaughtException', (err) => logMain(`uncaughtException: ${err.stack ?? err}`))
process.on('unhandledRejection', (reason) => logMain(`unhandledRejection: ${String(reason)}`))

// Schéma local « appcache:// » : sert les visuels de cartes mis en cache
// (ex. <img src="appcache://images/12_86_small.avif">).
protocol.registerSchemesAsPrivileged([
  { scheme: 'appcache', privileges: { standard: true, stream: true } }
])

function registerAppcacheProtocol(): void {
  protocol.handle('appcache', (request) => {
    const url = new URL(request.url)
    const file = normalize(decodeURIComponent(url.pathname)).replace(/^[\\/]+/, '')
    const roots: Record<string, string> = { images: imagesDir(), stamps: stampsDir() }
    const root = roots[url.hostname]
    if (!root || file.includes('..')) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(join(root, file)).toString())
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: '#14161c',
    autoHideMenuBar: true,
    title: 'Lorcana Picking Tool',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Si le renderer meurt ou ne charge pas, on le note et on recharge une fois :
  // mieux qu'une fenêtre noire silencieuse.
  win.webContents.on('render-process-gone', (_e, details) => {
    logMain(`renderer parti: ${details.reason} (code ${details.exitCode})`)
    if (details.reason !== 'clean-exit') win.webContents.reload()
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    logMain(`did-fail-load: ${code} ${desc} ${url}`)
  })
  win.webContents.on('preload-error', (_e, path, error) => {
    logMain(`preload-error: ${path} ${error.message}`)
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('fr.titem78.lorcana-picking-tool')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  registerAppcacheProtocol()
  registerIpc()
  createWindow()
  setupAutoUpdater()

  // Synchronisation des statuts de factures Odoo : au lancement puis toutes
  // les 30 minutes (silencieux, ne fait rien si le connecteur n'est pas configuré).
  const syncOdoo = (): void => {
    syncInvoiceStatuses().catch(() => {})
  }
  setTimeout(syncOdoo, 10_000)
  setInterval(syncOdoo, 30 * 60 * 1000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDb()
  app.quit()
})
