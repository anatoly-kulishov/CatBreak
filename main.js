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
const pkg = require("./package.json");
const {
  configureBreakWindow,
  updateTrayStatus,
  getTrayIconPath,
  hideDockIfNeeded,
  setAppUserModelId,
  getBreakWindowOptions,
} = require("./lib/platform");
const { createTranslator, clearLocaleCache } = require("./lib/i18n");
const { applyLaunchAtLogin, canUseLoginItemSettings } = require("./lib/autostart");
const { showNotification } = require("./lib/notifications");

const SETTINGS_PATH = path.join(app.getPath("userData"), "settings.json");
const RELEASES_URL = pkg.repository?.url
  ? pkg.repository.url.replace(/\.git$/, "") + "/releases"
  : "https://github.com/anatoly-kulishov/CatBreak/releases";

const DEFAULT_SETTINGS = {
  workMinutes: 55,
  breakMinutes: 5,
  idlePauseMinutes: 2,
  showExercises: true,
  strictBreak: false,
  locale: "auto",
  notifyBeforeBreak: true,
  soundOnBreakEnd: true,
  launchAtLogin: false,
};

let tray = null;
let settingsWindow = null;
const breakWindows = new Map();

let settings = { ...DEFAULT_SETTINGS };
let workSecondsLeft = 0;
let breakSecondsLeft = 0;
let onBreak = false;
let breakIsDemo = false;
let breakExitRequested = false;
let breakExitTimer = null;
let preBreakNotified = false;
const BREAK_EXIT_ANIM_MS = 1100;
const BREAK_EXIT_FAST_MS = 280;
let tickTimer = null;
let isFirstRun = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function getTranslator() {
  return createTranslator(settings.locale);
}

function loadSettings() {
  isFirstRun = !fs.existsSync(SETTINGS_PATH);
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

function postponeBreak(minutes) {
  if (onBreak) return;
  workSecondsLeft += minutes * 60;
  preBreakNotified = false;
  refreshTray();
}

function maybeNotifyBeforeBreak() {
  if (!settings.notifyBeforeBreak || onBreak) return;
  if (workSecondsLeft !== 60 || preBreakNotified) return;

  const tr = getTranslator();
  showNotification({
    title: tr.t("notify.title"),
    body: tr.t("notify.body"),
    silent: false,
  });
  preBreakNotified = true;
}

function buildTrayMenu() {
  const tr = getTranslator();
  const clock = formatClock(onBreak ? breakSecondsLeft : workSecondsLeft);

  const statusItem = {
    label: onBreak
      ? tr.t("tray.breakStatus", { clock })
      : tr.t("tray.workStatus", { clock }),
    enabled: false,
  };

  if (onBreak) {
    return Menu.buildFromTemplate([
      statusItem,
      { type: "separator" },
      {
        label: tr.t("tray.endBreak"),
        click: () => requestBreakExit({ fast: true }),
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
      {
        label: tr.t("tray.resetWork"),
        enabled: false,
        click: () => {},
      },
      { type: "separator" },
      {
        label: tr.t("tray.settings"),
        click: openSettings,
      },
      { type: "separator" },
      {
        label: tr.t("tray.quit"),
        click: () => app.quit(),
      },
    ]);
  }

  return Menu.buildFromTemplate([
    statusItem,
    { type: "separator" },
    {
      label: tr.t("tray.startNow"),
      click: () => startBreak({ demo: false }),
    },
    {
      label: tr.t("tray.demo"),
      click: () => startBreak({ demo: true, seconds: 30 }),
    },
    { type: "separator" },
    {
      label: tr.t("tray.postpone5"),
      click: () => postponeBreak(5),
    },
    {
      label: tr.t("tray.postpone10"),
      click: () => postponeBreak(10),
    },
    {
      label: tr.t("tray.resetWork"),
      click: () => resetWorkTimer(),
    },
    { type: "separator" },
    {
      label: tr.t("tray.settings"),
      click: openSettings,
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
  preBreakNotified = false;
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

  if (workSecondsLeft > 90) {
    preBreakNotified = false;
  }

  maybeNotifyBeforeBreak();

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

function buildBreakPayload(extra = {}) {
  const tr = getTranslator();
  return {
    strictBreak: settings.strictBreak,
    showExercises: settings.showExercises,
    strings: tr.messages.break,
    locale: tr.locale,
    demo: breakIsDemo,
    ...extra,
  };
}

async function createBreakWindows(payload) {
  const displays = screen.getAllDisplays();

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
      ...buildBreakPayload(),
    };

    await win.loadFile(path.join(__dirname, "src", "break.html"));
    win.webContents.send("break-init", breakPayload);

    breakWindows.set(display.id, win);
  }
}

function broadcastBreakLocaleUpdate() {
  if (!onBreak) return;
  const payload = buildBreakPayload();
  for (const win of breakWindows.values()) {
    if (!win.isDestroyed()) {
      win.webContents.send("break-locale-update", payload);
    }
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
  const playSound = settings.soundOnBreakEnd;

  for (const win of breakWindows.values()) {
    if (!win.isDestroyed()) {
      win.webContents.send("break-exit-request", { fast, playSound });
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
  breakIsDemo = demo;
  breakExitRequested = false;
  preBreakNotified = false;
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
  breakIsDemo = false;
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
    height: 740,
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
      appVersion: pkg.version,
      releasesUrl: RELEASES_URL,
      launchAtLoginSupported: canUseLoginItemSettings(),
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

  if (process.platform === "darwin") {
    tray.on("double-click", () => openSettings());
  }

  refreshTray();
}

app.on("second-instance", () => {
  openSettings();
});

app.whenReady().then(() => {
  setAppUserModelId();
  loadSettings();
  applyLaunchAtLogin(settings.launchAtLogin);
  createTray();
  startTick();
  hideDockIfNeeded();
  if (isFirstRun) {
    openSettings();
  }
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
    appVersion: pkg.version,
    releasesUrl: RELEASES_URL,
    launchAtLoginSupported: canUseLoginItemSettings(),
  };
});

ipcMain.handle("save-settings", (_e, next) => {
  const prevLocale = settings.locale;
  settings = { ...DEFAULT_SETTINGS, ...next };
  saveSettings();
  applyLaunchAtLogin(settings.launchAtLogin);

  if (prevLocale !== settings.locale) {
    clearLocaleCache();
    broadcastBreakLocaleUpdate();
  }

  if (!onBreak) resetWorkTimer();
  refreshTray();
  notifySettingsUi();
  return true;
});

ipcMain.handle("skip-break", () => {
  requestBreakExit({ fast: true });
});

ipcMain.handle("start-demo-break", () => {
  startBreak({ demo: true, seconds: 30 });
  return true;
});
