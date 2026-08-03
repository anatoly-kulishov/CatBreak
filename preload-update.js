const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("catBreak", {
  updateDialogAction: (action) => ipcRenderer.invoke("update-dialog-action", action),
  onUpdateDialog: (cb) => {
    ipcRenderer.on("update-dialog", (_e, payload) => cb(payload));
  },
});
