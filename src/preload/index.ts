import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '../shared/ipc-channels'

const api = {
  campaign: {
    list:   ()                                           => ipcRenderer.invoke(IPC.CAMPAIGN.LIST),
    get:    (id: number)                                 => ipcRenderer.invoke(IPC.CAMPAIGN.GET, id),
    create: (data: unknown, deals: unknown, flights: unknown) => ipcRenderer.invoke(IPC.CAMPAIGN.CREATE, data, deals, flights),
    update: (id: number, data: unknown, deals: unknown, flights: unknown) => ipcRenderer.invoke(IPC.CAMPAIGN.UPDATE, id, data, deals, flights),
    delete: (id: number)                                 => ipcRenderer.invoke(IPC.CAMPAIGN.DELETE, id),
  },
  performance: {
    query:  (campaign_id: number, from?: string, to?: string) => ipcRenderer.invoke(IPC.PERFORMANCE.QUERY, campaign_id, from, to),
    import: (opts: unknown, rows: unknown)               => ipcRenderer.invoke(IPC.PERFORMANCE.IMPORT, opts, rows),
  },
  dialog: {
    openFile:  (filters: unknown)                        => ipcRenderer.invoke(IPC.DIALOG.OPEN_FILE, filters),
    saveFile:  (name: string, content: string)           => ipcRenderer.invoke(IPC.DIALOG.SAVE_FILE, name, content),
    parseFile: (filePath: string)                        => ipcRenderer.invoke('dialog:parseFile', filePath),
  },
  db: {
    backup: () => ipcRenderer.invoke(IPC.DB.BACKUP),
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}

export type ElectronAPI = typeof api
