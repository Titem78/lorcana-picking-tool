import { ipcMain, app, dialog, shell, BrowserWindow } from 'electron'
import { getDb, getDbPath, logActivity } from './db'
import * as users from './users'
import * as locations from './locations'
import * as orders from './orders'
import * as picking from './picking'
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
  ipcMain.handle('orders:setStatus', (_e, userId: number, orderId: number, status: OrderStatus) =>
    orders.setOrderStatus(userId, orderId, status)
  )
  ipcMain.handle('orders:setTracking', (_e, userId: number, orderId: number, tracking: string) =>
    orders.setTracking(userId, orderId, tracking)
  )
  ipcMain.handle('orders:setNotes', (_e, userId: number, orderId: number, notes: string) =>
    orders.setNotes(userId, orderId, notes)
  )
  ipcMain.handle('orders:delete', (_e, userId: number, orderId: number) =>
    orders.deleteOrder(userId, orderId)
  )

  // --- Picking -----------------------------------------------------------------
  ipcMain.handle('picking:list', () => picking.buildPickingList())
  ipcMain.handle('picking:pick', (_e, userId: number, lineId: number, picked: boolean) =>
    picking.pickLine(userId, lineId, picked)
  )

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
