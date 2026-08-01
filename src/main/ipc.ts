import { ipcMain, app, shell } from 'electron'
import { getDb, getDbPath, logActivity } from './db'
import * as users from './users'
import type { ActivityEntry, AppInfo } from '@shared/types'

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
