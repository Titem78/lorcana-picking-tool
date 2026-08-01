import { app, BrowserWindow, net, protocol } from 'electron'
import { join, normalize } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpc } from './ipc'
import { closeDb } from './db'
import { setupAutoUpdater } from './updater'
import { imagesDir } from './lorcast'

// Schéma local « appcache:// » : sert les visuels de cartes mis en cache
// (ex. <img src="appcache://images/12_86_small.avif">).
protocol.registerSchemesAsPrivileged([
  { scheme: 'appcache', privileges: { standard: true, stream: true } }
])

function registerAppcacheProtocol(): void {
  protocol.handle('appcache', (request) => {
    const url = new URL(request.url)
    const file = normalize(decodeURIComponent(url.pathname)).replace(/^[\\/]+/, '')
    if (url.hostname !== 'images' || file.includes('..')) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(join(imagesDir(), file)).toString())
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    show: false,
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDb()
  app.quit()
})
