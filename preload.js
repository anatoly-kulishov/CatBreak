const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("catBreak", {
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
  startDemoBreak: () => ipcRenderer.invoke("start-demo-break"),
  skipBreak: () => ipcRenderer.invoke("skip-break"),
  openUpdateDownload: () => ipcRenderer.invoke("open-update-download"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  dismissUpdate: () => ipcRenderer.invoke("dismiss-update"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  updateDialogAction: (action) => ipcRenderer.invoke("update-dialog-action", action),
  onUpdateDialog: (cb) => {
    ipcRenderer.on("update-dialog", (_e, payload) => cb(payload));
  },
  onBreakInit: (cb) => {
    ipcRenderer.on("break-init", (_e, payload) => cb(payload));
  },
  onBreakTick: (cb) => {
    ipcRenderer.on("break-tick", (_e, payload) => cb(payload));
  },
  onBreakExitRequest: (cb) => {
    ipcRenderer.on("break-exit-request", (_e, payload) => cb(payload));
  },
  onSettingsUpdated: (cb) => {
    ipcRenderer.on("settings-updated", (_e, payload) => cb(payload));
  },
  onBreakLocaleUpdate: (cb) => {
    ipcRenderer.on("break-locale-update", (_e, payload) => cb(payload));
  },
});
