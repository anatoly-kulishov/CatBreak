const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("catBreak", {
  skipBreak: () => ipcRenderer.invoke("skip-break"),
  onBreakInit: (cb) => {
    ipcRenderer.on("break-init", (_e, payload) => cb(payload));
  },
  onBreakTick: (cb) => {
    ipcRenderer.on("break-tick", (_e, payload) => cb(payload));
  },
  onBreakExitRequest: (cb) => {
    ipcRenderer.on("break-exit-request", (_e, payload) => cb(payload));
  },
  onBreakLocaleUpdate: (cb) => {
    ipcRenderer.on("break-locale-update", (_e, payload) => cb(payload));
  },
});
