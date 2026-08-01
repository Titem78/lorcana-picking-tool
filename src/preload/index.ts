import { contextBridge, ipcRenderer, webUtils } from 'electron'

// Pont sécurisé entre l'interface et le processus principal.
// Chaque méthode correspond à une route déclarée dans src/main/ipc.ts.
const api = {
  appInfo: () => ipcRenderer.invoke('app:info'),
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),

  users: {
    list: () => ipcRenderer.invoke('users:list'),
    count: () => ipcRenderer.invoke('users:count'),
    create: (name: string, pin: string, isAdmin: boolean) =>
      ipcRenderer.invoke('users:create', name, pin, isAdmin),
    auth: (userId: number, pin: string) => ipcRenderer.invoke('users:auth', userId, pin),
    changePin: (userId: number, oldPin: string, newPin: string) =>
      ipcRenderer.invoke('users:changePin', userId, oldPin, newPin),
    deactivate: (userId: number, byUserId: number) =>
      ipcRenderer.invoke('users:deactivate', userId, byUserId)
  },

  locations: {
    list: () => ipcRenderer.invoke('locations:list'),
    create: (userId: number, data: unknown) => ipcRenderer.invoke('locations:create', userId, data),
    update: (userId: number, id: number, data: unknown) =>
      ipcRenderer.invoke('locations:update', userId, id, data),
    remove: (userId: number, id: number) => ipcRenderer.invoke('locations:delete', userId, id),
    reorder: (userId: number, orderedIds: number[]) =>
      ipcRenderer.invoke('locations:reorder', userId, orderedIds),
    setRules: (userId: number, locationId: number, rules: unknown[]) =>
      ipcRenderer.invoke('locations:setRules', userId, locationId, rules)
  },

  orders: {
    pickPdfFiles: () => ipcRenderer.invoke('orders:pickPdfFiles'),
    importPdfs: (userId: number, paths: string[]) =>
      ipcRenderer.invoke('orders:importPdfs', userId, paths),
    list: (statuses?: string[]) => ipcRenderer.invoke('orders:list', statuses),
    lines: (orderId: number) => ipcRenderer.invoke('orders:lines', orderId),
    setStatus: (userId: number, orderId: number, status: string) =>
      ipcRenderer.invoke('orders:setStatus', userId, orderId, status),
    setTracking: (userId: number, orderId: number, tracking: string) =>
      ipcRenderer.invoke('orders:setTracking', userId, orderId, tracking),
    setNotes: (userId: number, orderId: number, notes: string) =>
      ipcRenderer.invoke('orders:setNotes', userId, orderId, notes),
    remove: (userId: number, orderId: number) => ipcRenderer.invoke('orders:delete', userId, orderId)
  },

  picking: {
    list: () => ipcRenderer.invoke('picking:list'),
    pick: (userId: number, lineId: number, picked: boolean) =>
      ipcRenderer.invoke('picking:pick', userId, lineId, picked)
  },

  /** Chemin réel d'un fichier glissé-déposé (l'API File.path n'existe plus). */
  pathForFile: (file: File) => webUtils.getPathForFile(file),

  activity: {
    list: (limit?: number) => ipcRenderer.invoke('activity:list', limit),
    log: (userId: number | null, action: string, details?: unknown) =>
      ipcRenderer.invoke('activity:log', userId, action, details)
  },

  onUpdaterEvent: (cb: (event: string, payload: unknown) => void) => {
    for (const ch of ['updater:available', 'updater:downloaded', 'updater:error']) {
      ipcRenderer.on(ch, (_e, payload) => cb(ch, payload))
    }
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
