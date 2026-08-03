const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("catBreak", {
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
  startDemoBreak: () => ipcRenderer.invoke("start-demo-break"),
  openUpdateDownload: () => ipcRenderer.invoke("open-update-download"),
  dismissUpdate: () => ipcRenderer.invoke("dismiss-update"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  updateDialogAction: (action) => ipcRenderer.invoke("update-dialog-action", action),
  onUpdateDialog: (cb) => {
    ipcRenderer.on("update-dialog", (_e, payload) => cb(payload));
  },
  onSettingsUpdated: (cb) => {
    ipcRenderer.on("settings-updated", (_e, payload) => cb(payload));
  },
});
