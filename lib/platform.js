const { app, nativeImage } = require("electron");
const fs = require("fs");
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
    tray.setTitle(clockText);
    tray.setToolTip(`${tooltip}. ${label}`);
  } else {
    tray.setToolTip(`${tooltip}. ${label}`);
  }
}

function getTrayIconPath() {
  const assets = path.join(__dirname, "..", "assets");
  if (isMac) {
    const hiRes = path.join(assets, "trayIcon@2x.png");
    if (fs.existsSync(hiRes)) return hiRes;
    return path.join(assets, "trayIcon.png");
  }
  if (isWin) {
    return path.join(assets, "trayIcon@2x.png");
  }
  return path.join(assets, "trayIcon.png");
}

function createTrayImage() {
  const iconPath = getTrayIconPath();
  if (!fs.existsSync(iconPath)) {
    return nativeImage.createEmpty();
  }

  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    return nativeImage.createEmpty();
  }

  if (isMac || isLinux) {
    return icon;
  }

  return icon.resize({ width: 16, height: 16, quality: "best" });
}

function hideDockIfNeeded() {
  if (isMac && app.isPackaged && app.dock) {
    app.dock.hide();
  }
}

function setAppUserModelId() {
  if (isWin) {
    app.setAppUserModelId("com.catbreak.desktop");
  }
}

function getProjectRoot() {
  return path.join(__dirname, "..");
}

function getAppIconPath() {
  const root = getProjectRoot();
  if (isWin) {
    const ico = path.join(root, "build", "icon.ico");
    if (fs.existsSync(ico)) return ico;
  }
  if (isMac) {
    const icns = path.join(root, "build", "icon.icns");
    if (fs.existsSync(icns)) return icns;
  }
  const png = path.join(root, "build", "icon.png");
  if (fs.existsSync(png)) return png;
  return path.join(root, "assets", "app-icon-1024.png");
}

let cachedAppIconImage = null;

function getAppIconImage() {
  if (cachedAppIconImage && !cachedAppIconImage.isEmpty()) {
    return cachedAppIconImage;
  }

  const filePath = getAppIconPath();
  if (!fs.existsSync(filePath)) return null;

  let img = nativeImage.createFromPath(filePath);
  if (img.isEmpty()) return null;

  const { width } = img.getSize();
  if (width > 256) {
    img = img.resize({ width: 256, height: 256 });
  }

  cachedAppIconImage = img;
  return img;
}

function getBreakWindowOptions(display, strictBreak) {
  const iconPath = getAppIconPath();
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
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload-break.js"),
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
  createTrayImage,
  getAppIconPath,
  getAppIconImage,
  hideDockIfNeeded,
  setAppUserModelId,
  getBreakWindowOptions,
};
