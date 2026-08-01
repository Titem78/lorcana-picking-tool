import { contextBridge, ipcRenderer } from 'electron'

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
