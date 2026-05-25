const { app } = require("electron");
const { autoUpdater } = require("electron-updater");

/** @typedef {'idle'|'checking'|'available'|'downloading'|'downloaded'|'none'|'error'} UpdaterStatus */

/** @type {{ status: UpdaterStatus, info: import('electron-updater').UpdateInfo | null, progress: import('electron-updater').ProgressInfo | null, error: string | null }} */
const state = {
  status: "idle",
  info: null,
  progress: null,
  error: null,
};

/** @type {Set<() => void>} */
const listeners = new Set();

let configured = false;

function emit() {
  for (const fn of listeners) {
    try {
      fn();
    } catch (err) {
      console.error("updater listener failed", err);
    }
  }
}

function setState(patch) {
  Object.assign(state, patch);
  emit();
}

function isAutoUpdaterEnabled() {
  return app.isPackaged && process.env.CATBREAK_DISABLE_AUTO_UPDATER !== "1";
}

function configureAutoUpdater() {
  if (configured || !isAutoUpdaterEnabled()) return;
  configured = true;

  autoUpdater.allowDowngrade = false;

  autoUpdater.on("checking-for-update", () => {
    setState({ status: "checking", error: null });
  });

  autoUpdater.on("update-available", (info) => {
    setState({ status: "available", info, progress: null, error: null });
  });

  autoUpdater.on("update-not-available", () => {
    setState({ status: "none", info: null, progress: null, error: null });
  });

  autoUpdater.on("download-progress", (progress) => {
    setState({ status: "downloading", progress, error: null });
  });

  autoUpdater.on("update-downloaded", (info) => {
    setState({ status: "downloaded", info, progress: null, error: null });
  });

  autoUpdater.on("error", (err) => {
    const message = err?.message || String(err);
    console.error("autoUpdater error", message);
    setState({ status: "error", error: message });
  });
}

function onAutoUpdateStateChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getAutoUpdateState() {
  return {
    status: state.status,
    info: state.info,
    progress: state.progress,
    error: state.error,
  };
}

function hasAutoUpdateReady() {
  return (
    state.status === "available" ||
    state.status === "downloading" ||
    state.status === "downloaded"
  );
}

async function checkAutoUpdate() {
  if (!isAutoUpdaterEnabled()) {
    return { enabled: false, available: false };
  }
  configureAutoUpdater();
  const result = await autoUpdater.checkForUpdates();
  const info = result?.updateInfo;
  const available =
    state.status === "available" ||
    state.status === "downloading" ||
    state.status === "downloaded";
  return { enabled: true, available, info: info || state.info };
}

async function downloadAutoUpdate() {
  if (!isAutoUpdaterEnabled()) {
    throw new Error("auto updater disabled");
  }
  configureAutoUpdater();
  await autoUpdater.downloadUpdate();
}

function quitAndInstallUpdate() {
  autoUpdater.quitAndInstall(false, true);
}

function resetAutoUpdateState() {
  setState({ status: "idle", info: null, progress: null, error: null });
}

/**
 * @param {{ autoDownload?: boolean, autoInstallOnAppQuit?: boolean }} prefs
 */
function applyAutoUpdaterPreferences(prefs = {}) {
  if (!isAutoUpdaterEnabled()) return;
  configureAutoUpdater();
  autoUpdater.autoDownload = !!prefs.autoDownload;
  autoUpdater.autoInstallOnAppQuit = !!prefs.autoInstallOnAppQuit;
}

module.exports = {
  isAutoUpdaterEnabled,
  configureAutoUpdater,
  applyAutoUpdaterPreferences,
  onAutoUpdateStateChange,
  getAutoUpdateState,
  hasAutoUpdateReady,
  checkAutoUpdate,
  downloadAutoUpdate,
  quitAndInstallUpdate,
  resetAutoUpdateState,
};
