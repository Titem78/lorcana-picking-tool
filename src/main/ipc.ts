import { ipcMain, app, dialog, shell, BrowserWindow } from 'electron'
import { getDb, getDbPath, logActivity, resetDatabase } from './db'
import * as users from './users'
import * as locations from './locations'
import * as orders from './orders'
import * as picking from './picking'
import * as exports from './exports'
import * as odoo from './odoo'
import * as backup from './backup'
import * as stamps from './stamps'
import * as watcherMod from './watcher'
import * as cmauth from './cmauth'
import { checkForUpdatesNow } from './updater'
import type { ActivityEntry, AppInfo, OrderStatus, RuleCriteria, StorageLocation } from '@shared/types'

// Toutes les routes IPC de l'application. Le renderer les appelle via window.api.
export function registerIpc(): void {
  ipcMain.handle('app:info', (): AppInfo => {
    return { version: app.getVersion(), dbPath: getDbPath() }
  })

  // Contournement du bug de focus d'Electron après confirm()/alert()
  ipcMain.handle('app:refocus', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) {
      win.blur()
      win.focus()
    }
  })

  ipcMain.handle('app:openExternal', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
  })

  // --- Utilisateurs -----------------------------------------------------------
  ipcMain.handle('users:list', () => users.listUsers())
  ipcMain.handle('users:count', () => users.countUsers())
  ipcMain.handle('users:create', (_e, name: string, pin: string, isAdmin: boolean) =>
    users.createUser(name, pin, isAdmin)
  )
  ipcMain.handle('users:auth', (_e, userId: number, pin: string) =>
    users.authenticate(userId, pin)
  )
  ipcMain.handle('users:changePin', (_e, userId: number, oldPin: string, newPin: string) =>
    users.changePin(userId, oldPin, newPin)
  )
  ipcMain.handle('users:deactivate', (_e, userId: number, byUserId: number) =>
    users.deactivateUser(userId, byUserId)
  )
  ipcMain.handle('users:setAdmin', (_e, byUserId: number, targetId: number, isAdmin: boolean) =>
    users.setAdmin(byUserId, targetId, isAdmin)
  )

  // --- Emplacements -----------------------------------------------------------
  type LocationData = Pick<StorageLocation, 'name' | 'kind' | 'color' | 'label' | 'notes'>
  ipcMain.handle('locations:list', () => locations.listLocations())
  ipcMain.handle('locations:create', (_e, userId: number, data: LocationData) =>
    locations.createLocation(userId, data)
  )
  ipcMain.handle('locations:update', (_e, userId: number, id: number, data: LocationData) =>
    locations.updateLocation(userId, id, data)
  )
  ipcMain.handle('locations:delete', (_e, userId: number, id: number) =>
    locations.deleteLocation(userId, id)
  )
  ipcMain.handle('locations:reorder', (_e, userId: number, orderedIds: number[]) =>
    locations.reorderLocations(userId, orderedIds)
  )
  ipcMain.handle('locations:setRules', (_e, userId: number, locationId: number, rules: RuleCriteria[]) =>
    locations.setRules(userId, locationId, rules)
  )

  // --- Commandes ---------------------------------------------------------------
  ipcMain.handle('orders:pickPdfFiles', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = await dialog.showOpenDialog(win!, {
      title: 'Choisir les PDF de vente Cardmarket',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      properties: ['openFile', 'multiSelections']
    })
    return res.canceled ? [] : res.filePaths
  })
  ipcMain.handle('orders:importPdfs', (_e, userId: number, paths: string[]) =>
    orders.importPdfs(userId, paths)
  )
  ipcMain.handle('orders:list', (_e, statuses?: OrderStatus[]) => orders.listOrders(statuses))
  ipcMain.handle('orders:lines', (_e, orderId: number) => orders.getOrderLines(orderId))
  ipcMain.handle('orders:setStatus', (_e, userId: number, orderId: number, status: OrderStatus) => {
    orders.setOrderStatus(userId, orderId, status)
    // Envoi automatique vers Odoo à l'expédition (si le connecteur est configuré).
    // Asynchrone et non bloquant : une erreur est enregistrée sur la commande.
    if (status === 'shipped' && odoo.getOdooConfig()) {
      odoo.sendOrderToOdoo(userId, orderId).catch(() => {})
    }
  })
  ipcMain.handle('orders:setTracking', (_e, userId: number, orderId: number, tracking: string) =>
    orders.setTracking(userId, orderId, tracking)
  )
  ipcMain.handle('orders:setNotes', (_e, userId: number, orderId: number, notes: string) =>
    orders.setNotes(userId, orderId, notes)
  )
  ipcMain.handle(
    'orders:setRefund',
    (_e, userId: number, orderId: number, amount: string, reason: string) =>
      orders.setRefund(userId, orderId, amount, reason)
  )
  ipcMain.handle('orders:delete', (_e, userId: number, orderId: number) =>
    orders.deleteOrder(userId, orderId)
  )

  ipcMain.handle('orders:stats', () => orders.getStats())

  ipcMain.handle('orders:prepCheck', (_e, userId: number, lineId: number, checked: boolean) =>
    orders.setPrepChecked(userId, lineId, checked)
  )
  ipcMain.handle('orders:validateComplete', (_e, userId: number, orderId: number) =>
    orders.validateComplete(userId, orderId)
  )

  // --- Picking -----------------------------------------------------------------
  ipcMain.handle('picking:list', () => picking.buildPickingList())
  ipcMain.handle('picking:pick', (_e, userId: number, lineId: number, picked: boolean) =>
    picking.pickLine(userId, lineId, picked)
  )
  ipcMain.handle('picking:setQty', (_e, userId: number, lineId: number, qty: number) =>
    picking.setPickedQty(userId, lineId, qty)
  )
  ipcMain.handle('picking:setAccessoryImage', (e, userId: number, lineName: string) =>
    picking.setAccessoryImage(userId, lineName, BrowserWindow.fromWebContents(e.sender)!)
  )
  ipcMain.handle('picking:setAccessoryImageUrl', (_e, userId: number, lineName: string, url: string) =>
    picking.setAccessoryImageFromUrl(userId, lineName, url)
  )

  // --- Exports / imports --------------------------------------------------------
  ipcMain.handle('exports:historyCsv', (e, userId: number) =>
    exports.exportHistoryCsv(userId, BrowserWindow.fromWebContents(e.sender)!)
  )
  ipcMain.handle('exports:locationsJson', (e, userId: number) =>
    exports.exportLocationsJson(userId, BrowserWindow.fromWebContents(e.sender)!)
  )
  ipcMain.handle('exports:importLocations', (e, userId: number) =>
    exports.importLocationsJson(userId, BrowserWindow.fromWebContents(e.sender)!)
  )

  // --- Connecteur Odoo ----------------------------------------------------------
  ipcMain.handle('odoo:getConfig', () => odoo.getOdooConfig())
  ipcMain.handle('odoo:saveConfig', (_e, userId: number, cfg: odoo.OdooConfig) =>
    odoo.saveOdooConfig(userId, cfg)
  )
  ipcMain.handle('odoo:test', (_e, cfg: odoo.OdooConfig) => odoo.testConnection(cfg))
  ipcMain.handle('odoo:searchPartners', (_e, cfg: odoo.OdooConfig, query: string) =>
    odoo.searchPartners(cfg, query)
  )
  ipcMain.handle('odoo:searchProducts', (_e, cfg: odoo.OdooConfig, query: string) =>
    odoo.searchProducts(cfg, query)
  )
  ipcMain.handle('odoo:searchTaxes', (_e, cfg: odoo.OdooConfig, query: string) =>
    odoo.searchTaxes(cfg, query)
  )
  ipcMain.handle('odoo:listAccessoryMap', () => odoo.listAccessoryMap())
  ipcMain.handle('odoo:sync', () => odoo.syncInvoiceStatuses())

  // --- Identifiants Cardmarket (chiffrés) -------------------------------------------
  ipcMain.handle('cm:saveCreds', (_e, userId: number, username: string, password: string) =>
    cmauth.saveCredentials(userId, username, password)
  )
  ipcMain.handle('cm:clearCreds', (_e, userId: number) => cmauth.clearCredentials(userId))
  ipcMain.handle('cm:hasCreds', () => cmauth.hasCredentials())
  ipcMain.handle('cm:fillLogin', (_e, webContentsId: number) => cmauth.fillLogin(webContentsId))

  // --- Dossier surveillé ----------------------------------------------------------
  ipcMain.handle('watcher:config', () => watcherMod.getWatcherConfig())
  ipcMain.handle('watcher:pickFolder', (e, userId: number) =>
    watcherMod.pickWatchFolder(userId, BrowserWindow.fromWebContents(e.sender)!)
  )
  ipcMain.handle('watcher:setEnabled', (_e, userId: number, enabled: boolean) =>
    watcherMod.setWatcherEnabled(userId, enabled)
  )
  ipcMain.handle('watcher:scanNow', (_e, userId: number) => watcherMod.scanNow(userId))

  // --- Import direct d'un PDF téléchargé par le navigateur intégré -----------------
  ipcMain.handle('orders:importPdfBase64', async (_e, userId: number, b64: string) => {
    const { writeFileSync, mkdtempSync } = await import('fs')
    const { tmpdir } = await import('os')
    const { join } = await import('path')
    const dir = mkdtempSync(join(tmpdir(), 'lorcana-cm-'))
    const path = join(dir, 'commande-cardmarket.pdf')
    writeFileSync(path, Buffer.from(b64, 'base64'))
    return orders.importPdfs(userId, [path])
  })

  // --- Import depuis la page web Cardmarket affichée (onglet intégré) --------------
  ipcMain.handle('orders:importParsed', async (_e, userId: number, data: Record<string, unknown>) => {
    const d = data as {
      sale_id?: string
      buyer_username?: string
      buyer_name?: string
      buyer_address?: string
      article_count?: number | null
      item_value?: string
      shipping_cost?: string
      total?: string
      shipping_method?: string
      tracking_number?: string
      refund_amount?: string
      url?: string
      cards?: Partial<{
        quantity: number
        name: string
        number: string
        language: string
        condition: string
        set_code: string
        color_code: string
        rarity_code: string
        price: string
        comment: string
        is_foil: boolean
      }>[]
    }
    if (!d.sale_id) throw new Error('Numéro de vente introuvable sur la page')
    const parsed = {
      sale_id: String(d.sale_id),
      buyer_username: d.buyer_username ?? '',
      buyer_name: d.buyer_name ?? '',
      buyer_address: d.buyer_address ?? '',
      seller: 'Made4Game',
      sent_date: '',
      article_count: d.article_count ?? null,
      item_value: d.item_value ?? '',
      shipping_cost: d.shipping_cost ?? '',
      total: d.total ?? '',
      shipping_method: d.shipping_method ?? '',
      tracking_number: d.tracking_number ?? '',
      refund_amount: d.refund_amount ?? '',
      source_pdf: d.url ?? 'page Cardmarket',
      cards: (d.cards ?? []).map((c) => ({
        quantity: c.quantity ?? 1,
        name: c.name ?? '',
        number: (c.number ?? '').replace(/^0+(?=\d)/, ''),
        language: c.language ?? '',
        condition: c.condition ?? '',
        set_code: c.set_code ?? '',
        color_code: c.color_code ?? '',
        color_label: '',
        rarity_code: c.rarity_code ?? '',
        price: c.price ?? '',
        comment: c.comment ?? '',
        is_foil: c.is_foil ?? false,
        section: 'Lorcana Cartes'
      }))
    }
    const result = await orders.persistParsedOrder(userId, parsed, parsed.source_pdf)
    // Visuels exacts extraits de la page (bonne version/variante garantie)
    const images = (data as { card_images?: ({ b64: string; ext: string } | null)[] }).card_images
    if (result.status === 'ok' && result.order_id && Array.isArray(images)) {
      await orders.applyCardImages(result.order_id, images)
    }
    return [result]
  })

  ipcMain.handle(
    'orders:applyCardImages',
    (_e, orderId: number, images: ({ b64: string; ext: string } | null)[]) =>
      orders.applyCardImages(orderId, images)
  )

  // --- Diagnostic : page Cardmarket non reconnue -----------------------------------
  ipcMain.handle('orders:saveCmDebug', async (_e, html: string, text: string) => {
    const { writeFileSync } = await import('fs')
    const { join } = await import('path')
    const dir = app.getPath('userData')
    writeFileSync(join(dir, 'cm-page-debug.html'), html, 'utf-8')
    writeFileSync(join(dir, 'cm-page-debug.txt'), text, 'utf-8')
    return dir
  })

  // --- Timbres La Poste -----------------------------------------------------------
  ipcMain.handle('stamps:import', (e, userId: number) =>
    stamps.importSheets(userId, BrowserWindow.fromWebContents(e.sender)!)
  )
  ipcMain.handle('stamps:stock', () => stamps.getStock())
  ipcMain.handle('stamps:assign', (_e, userId: number, orderId: number, stampType: string) =>
    stamps.assignStamp(userId, orderId, stampType)
  )
  ipcMain.handle('stamps:release', (_e, userId: number, orderId: number) =>
    stamps.releaseStamp(userId, orderId)
  )
  ipcMain.handle('stamps:printData', (_e, orderId: number) => stamps.getStampPrint(orderId))
  ipcMain.handle('stamps:sheetData', (_e, file: string) => stamps.getSheetData(file))
  ipcMain.handle('stamps:print', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    win?.webContents.print({ silent: false, printBackground: true })
  })

  // --- Sauvegarde complète --------------------------------------------------------
  ipcMain.handle('backup:export', (e, userId: number) =>
    backup.exportBackup(userId, BrowserWindow.fromWebContents(e.sender)!)
  )
  ipcMain.handle('backup:import', (e, userId: number) =>
    backup.importBackup(userId, BrowserWindow.fromWebContents(e.sender)!)
  )
  ipcMain.handle(
    'odoo:setProductMap',
    (_e, userId: number, lineName: string, productId: number | null, productName: string | null) =>
      odoo.setProductMap(userId, lineName, productId, productName)
  )
  ipcMain.handle('odoo:send', (_e, userId: number, orderId: number) =>
    odoo.sendOrderToOdoo(userId, orderId)
  )

  // --- Mises à jour -------------------------------------------------------------
  ipcMain.handle('updater:check', () => checkForUpdatesNow())

  // --- Réinitialisation ----------------------------------------------------------
  ipcMain.handle('app:resetData', (_e, userId: number, confirmation: string) => {
    // Double garde côté main : admin + confirmation exacte, même si l'UI triche.
    const user = getDb().prepare('SELECT is_admin FROM users WHERE id = ?').get(userId) as
      | { is_admin: number }
      | undefined
    if (!user?.is_admin) throw new Error('Réservé aux administrateurs')
    if (confirmation.trim().toUpperCase() !== 'RESET') throw new Error('Confirmation invalide')
    resetDatabase()
    return true
  })

  // --- Journal d'activité -----------------------------------------------------
  ipcMain.handle('activity:list', (_e, limit: number = 200): ActivityEntry[] => {
    return getDb()
      .prepare(
        `SELECT a.id, a.user_id, u.name AS user_name, a.action, a.details, a.created_at
         FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
         ORDER BY a.id DESC LIMIT ?`
      )
      .all(limit) as ActivityEntry[]
  })
  ipcMain.handle('activity:log', (_e, userId: number | null, action: string, details?: unknown) =>
    logActivity(userId, action, details)
  )
}
