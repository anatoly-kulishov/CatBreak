const { app } = require("electron");
const path = require("path");

const isMac = process.platform === "darwin";
const isWin = process.platform === "win32";
const isLinux = process.platform === "linux";

function configureBreakWindow(win) {
  if (isMac) {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setAlwaysOnTop(true, "screen-saver");
    return;
  }

  if (isWin) {
    win.setAlwaysOnTop(true, "screen-saver");
    return;
  }

  if (isLinux) {
    win.setAlwaysOnTop(true);
    if (typeof win.setVisibleOnAllWorkspaces === "function") {
      win.setVisibleOnAllWorkspaces(true);
    }
  }
}

function updateTrayStatus(tray, { onBreak, clockText, tr }) {
  if (!tray || !tr) return;

  const prefixKey = onBreak ? "tray.breakPrefix" : "tray.workPrefix";
  const label = `${tr.t(prefixKey)} ${clockText}`;
  const tooltipKey = onBreak ? "tray.tooltipBreak" : "tray.tooltipWork";
  const tooltip = tr.t(tooltipKey) || tr.t("tray.tooltip");

  if (isMac) {
    tray.setTitle(label);
    tray.setToolTip(tooltip);
  } else {
    tray.setToolTip(`${tooltip} — ${label}`);
  }
}

function getTrayIconPath() {
  const assets = path.join(__dirname, "..", "assets");
  if (isMac) {
    return path.join(assets, "trayIcon.png");
  }
  if (isWin) {
    return path.join(assets, "trayIcon@2x.png");
  }
  return path.join(assets, "trayIcon.png");
}

function hideDockIfNeeded() {
  if (isMac && app.dock) {
    app.dock.hide();
  }
}

function setAppUserModelId() {
  if (isWin) {
    app.setAppUserModelId("com.catbreak.desktop");
  }
}

function getBreakWindowOptions(display, strictBreak) {
  const base = {
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: !strictBreak,
    fullscreen: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    backgroundColor: "#0f1218",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };

  if (isWin) {
    base.thickFrame = false;
    base.autoHideMenuBar = true;
  }

  if (isLinux) {
    base.fullscreenable = true;
  }

  return base;
}

module.exports = {
  isMac,
  isWin,
  isLinux,
  configureBreakWindow,
  updateTrayStatus,
  getTrayIconPath,
  hideDockIfNeeded,
  setAppUserModelId,
  getBreakWindowOptions,
};
