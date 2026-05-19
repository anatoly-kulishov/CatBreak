const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  screen,
  powerMonitor,
  ipcMain,
} = require("electron");
const path = require("path");
const fs = require("fs");
const {
  configureBreakWindow,
  updateTrayStatus,
  getTrayIconPath,
  hideDockIfNeeded,
  setAppUserModelId,
  getBreakWindowOptions,
} = require("./lib/platform");
const { createTranslator, clearLocaleCache } = require("./lib/i18n");

const SETTINGS_PATH = path.join(app.getPath("userData"), "settings.json");

const DEFAULT_SETTINGS = {
  workMinutes: 55,
  breakMinutes: 5,
  idlePauseMinutes: 2,
  showExercises: true,
  strictBreak: false,
  locale: "auto",
};

let tray = null;
let settingsWindow = null;
const breakWindows = new Map();

let settings = { ...DEFAULT_SETTINGS };
let workSecondsLeft = 0;
let breakSecondsLeft = 0;
let onBreak = false;
let breakExitRequested = false;
let breakExitTimer = null;
const BREAK_EXIT_ANIM_MS = 1100;
const BREAK_EXIT_FAST_MS = 280;
let tickTimer = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function getTranslator() {
  return createTranslator(settings.locale);
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf8");
    settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
  workSecondsLeft = settings.workMinutes * 60;
}

function saveSettings() {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function updateTrayTitle() {
  if (!tray) return;
  const tr = getTranslator();
  updateTrayStatus(tray, {
    onBreak,
    clockText: formatClock(onBreak ? breakSecondsLeft : workSecondsLeft),
    tr,
  });
}

function buildTrayMenu() {
  const tr = getTranslator();
  const clock = formatClock(onBreak ? breakSecondsLeft : workSecondsLeft);

  return Menu.buildFromTemplate([
    {
      label: onBreak
        ? tr.t("tray.breakStatus", { clock })
        : tr.t("tray.workStatus", { clock }),
      enabled: false,
    },
    { type: "separator" },
    {
      label: tr.t("tray.startNow"),
      click: () => startBreak({ demo: false }),
    },
    {
      label: tr.t("tray.demo"),
      click: () => startBreak({ demo: true, seconds: 30 }),
    },
    ...(onBreak
      ? [
          {
            label: tr.t("tray.endBreak"),
            click: () => requestBreakExit({ fast: true }),
          },
          { type: "separator" },
        ]
      : []),
    {
      label: tr.t("tray.settings"),
      click: openSettings,
    },
    {
      label: tr.t("tray.resetWork"),
      click: () => {
        if (!onBreak) resetWorkTimer();
      },
    },
    { type: "separator" },
    {
      label: tr.t("tray.quit"),
      click: () => app.quit(),
    },
  ]);
}

function refreshTray() {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());
  updateTrayTitle();
}

function resetWorkTimer() {
  workSecondsLeft = settings.workMinutes * 60;
  refreshTray();
}

function stopTick() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function startTick() {
  stopTick();
  tickTimer = setInterval(tick, 1000);
}

function tick() {
  const idleSec = powerMonitor.getSystemIdleTime();
  const idleLimit = settings.idlePauseMinutes * 60;
  const isIdle = idleSec >= idleLimit;

  if (onBreak) {
    if (breakSecondsLeft <= 0) {
      refreshTray();
      return;
    }
    breakSecondsLeft -= 1;
    broadcastBreakTick();
    if (breakSecondsLeft <= 0 && !breakExitRequested) {
      requestBreakExit();
    }
    refreshTray();
    return;
  }

  if (isIdle) {
    refreshTray();
    return;
  }

  if (workSecondsLeft <= 0) {
    startBreak({ demo: false });
    return;
  }

  workSecondsLeft -= 1;
  if (workSecondsLeft <= 0) {
    startBreak({ demo: false });
  }
  refreshTray();
}

async function createBreakWindows(payload) {
  const displays = screen.getAllDisplays();
  const tr = getTranslator();

  for (const display of displays) {
    const win = new BrowserWindow(
      getBreakWindowOptions(display, settings.strictBreak),
    );

    configureBreakWindow(win);

    win.on("close", (e) => {
      if (!onBreak) return;
      e.preventDefault();
      requestBreakExit({ fast: true });
    });

    const breakPayload = {
      ...payload,
      strictBreak: settings.strictBreak,
      showExercises: settings.showExercises,
      strings: tr.messages.break,
    };

    await win.loadFile(path.join(__dirname, "src", "break.html"));
    win.webContents.send("break-init", breakPayload);

    breakWindows.set(display.id, win);
  }
}

function broadcastBreakTick() {
  for (const win of breakWindows.values()) {
    if (!win.isDestroyed()) {
      win.webContents.send("break-tick", { secondsLeft: breakSecondsLeft });
    }
  }
}

function closeBreakWindows() {
  for (const win of breakWindows.values()) {
    if (!win.isDestroyed()) {
      win.removeAllListeners("close");
      win.destroy();
    }
  }
  breakWindows.clear();
}

function requestBreakExit({ fast = false } = {}) {
  if (!onBreak || breakExitRequested) return;
  breakExitRequested = true;

  const delayMs = fast ? BREAK_EXIT_FAST_MS : BREAK_EXIT_ANIM_MS;

  for (const win of breakWindows.values()) {
    if (!win.isDestroyed()) {
      win.webContents.send("break-exit-request", { fast });
    }
  }

  clearTimeout(breakExitTimer);
  breakExitTimer = setTimeout(() => {
    breakExitTimer = null;
    if (onBreak) endBreak();
  }, delayMs);
}

async function startBreak({ demo = false, seconds = null } = {}) {
  if (onBreak) {
    closeBreakWindows();
  }

  onBreak = true;
  breakExitRequested = false;
  breakSecondsLeft =
    demo && seconds != null ? seconds : settings.breakMinutes * 60;

  const payload = {
    totalSeconds: breakSecondsLeft,
    demo,
  };

  await createBreakWindows(payload);
  refreshTray();
}

function endBreak() {
  clearTimeout(breakExitTimer);
  breakExitTimer = null;
  onBreak = false;
  breakExitRequested = false;
  closeBreakWindows();
  resetWorkTimer();
  refreshTray();
}

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  const tr = getTranslator();

  settingsWindow = new BrowserWindow({
    width: 400,
    height: 520,
    resizable: false,
    show: false,
    backgroundColor: "#1a1a1a",
    title: tr.t("app.settingsTitle"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  settingsWindow.once("ready-to-show", () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.show();
    }
  });

  settingsWindow.loadFile(path.join(__dirname, "src", "settings.html"));
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function notifySettingsUi() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    const tr = getTranslator();
    settingsWindow.setTitle(tr.t("app.settingsTitle"));
    settingsWindow.webContents.send("settings-updated", {
      settings,
      locale: tr.locale,
      strings: tr.messages,
    });
  }
}

function createTray() {
  const iconPath = getTrayIconPath();
  let icon;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
    const size = process.platform === "win32" ? 16 : 22;
    icon = icon.resize({ width: size, height: size });
  } else {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  refreshTray();
}

app.on("second-instance", () => {
  openSettings();
});

app.whenReady().then(() => {
  setAppUserModelId();
  loadSettings();
  createTray();
  startTick();
  hideDockIfNeeded();
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});

app.on("before-quit", () => {
  stopTick();
  closeBreakWindows();
});

ipcMain.handle("get-settings", () => {
  const tr = getTranslator();
  return {
    settings,
    workSecondsLeft,
    onBreak,
    locale: tr.locale,
    strings: tr.messages,
  };
});

ipcMain.handle("save-settings", (_e, next) => {
  const prevLocale = settings.locale;
  settings = { ...DEFAULT_SETTINGS, ...next };
  saveSettings();
  if (prevLocale !== settings.locale) {
    clearLocaleCache();
  }
  if (!onBreak) resetWorkTimer();
  refreshTray();
  notifySettingsUi();
  return true;
});

ipcMain.handle("skip-break", () => {
  requestBreakExit({ fast: true });
});
