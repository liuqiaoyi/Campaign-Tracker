"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const IPC = {
  CAMPAIGN: {
    LIST: "campaign:list",
    GET: "campaign:get",
    CREATE: "campaign:create",
    UPDATE: "campaign:update",
    DELETE: "campaign:delete"
  },
  PERFORMANCE: {
    QUERY: "performance:query",
    IMPORT: "performance:import"
  },
  DIALOG: {
    OPEN_FILE: "dialog:open-file",
    SAVE_FILE: "dialog:save-file"
  },
  DB: {
    BACKUP: "db:backup"
  }
};
const api = {
  campaign: {
    list: () => electron.ipcRenderer.invoke(IPC.CAMPAIGN.LIST),
    get: (id) => electron.ipcRenderer.invoke(IPC.CAMPAIGN.GET, id),
    create: (data, deals) => electron.ipcRenderer.invoke(IPC.CAMPAIGN.CREATE, data, deals),
    update: (id, data, deals) => electron.ipcRenderer.invoke(IPC.CAMPAIGN.UPDATE, id, data, deals),
    delete: (id) => electron.ipcRenderer.invoke(IPC.CAMPAIGN.DELETE, id)
  },
  performance: {
    query: (campaign_id, from, to) => electron.ipcRenderer.invoke(IPC.PERFORMANCE.QUERY, campaign_id, from, to),
    import: (opts) => electron.ipcRenderer.invoke(IPC.PERFORMANCE.IMPORT, opts)
  },
  dialog: {
    openFile: (filters) => electron.ipcRenderer.invoke(IPC.DIALOG.OPEN_FILE, filters),
    saveFile: (name, content) => electron.ipcRenderer.invoke(IPC.DIALOG.SAVE_FILE, name, content),
    parseFile: (filePath) => electron.ipcRenderer.invoke("dialog:parseFile", filePath)
  },
  db: {
    backup: () => electron.ipcRenderer.invoke(IPC.DB.BACKUP)
  }
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", preload.electronAPI);
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = preload.electronAPI;
  window.api = api;
}
