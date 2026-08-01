import { ipcMain, app, dialog, shell, BrowserWindow } from 'electron'
import { getDb, getDbPath, logActivity, resetDatabase } from './db'
import * as users from './users'
import * as locations from './locations'
import * as orders from './orders'
import * as picking from './picking'
import * as exports from './exports'
import * as odoo from './odoo'
import * as backup from './backup'
import { checkForUpdatesNow } from './updater'
import type { ActivityEntry, AppInfo, OrderStatus, RuleCriteria, StorageLocation } from '@shared/types'

// Toutes les routes IPC de l'application. Le renderer les appelle via window.api.
export function registerIpc(): void {
  ipcMain.handle('app:info', (): AppInfo => {
    return { version: app.getVersion(), dbPath: getDbPath() }
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
