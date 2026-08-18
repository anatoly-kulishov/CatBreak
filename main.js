const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  screen,
  powerMonitor,
  ipcMain,
  shell,
  dialog,
} = require("electron");
const path = require("path");
const fs = require("fs");
const pkg = require("./package.json");
const {
  updateTrayStatus,
  createTrayImage,
  getAppIconPath,
  getAppIconImage,
  hideDockIfNeeded,
  stripAppQuarantine,
  setAppUserModelId,
} = require("./lib/platform");
const { createTranslator, clearLocaleCache } = require("./lib/i18n");
const { applyLaunchAtLogin, canUseLoginItemSettings } = require("./lib/autostart");
const { showNotification } = require("./lib/notifications");
const {
  onAutoUpdateStateChange,
} = require("./lib/updater");
const { createSessionTimer, formatClock } = require("./lib/timer");
const { createBreakWindowsController } = require("./lib/break-windows");
const { createUpdateUi } = require("./lib/update-ui");

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
  checkForUpdates: true,
  autoDownloadUpdates: true,
  autoInstallOnQuit: false,
  updateDismissedVersion: null,
  updateLastCheckAt: null,
};

const SETTINGS_LIMITS = {
  workMinutes: { min: 1, max: 480 },
  breakMinutes: { min: 1, max: 60 },
  idlePauseMinutes: { min: 1, max: 30 },
};

const VALID_LOCALES = new Set(["auto", "en", "ru"]);

/** @param {import('electron').MessageBoxOptions} options */
function withAppDialogIcon(options) {
  const icon = getAppIconImage();
  return icon ? { ...options, icon } : options;
}

let tray = null;
let settingsWindow = null;

let settings = { ...DEFAULT_SETTINGS };
const session = createSessionTimer();
const overlays = createBreakWindowsController({
  BrowserWindow,
  screen,
  projectRoot: __dirname,
  isOnBreak: () => session.onBreak,
  onFastClose: () => requestBreakExit({ fast: true }),
  onExitAnimationDone: () => endBreak(),
  getBreakSecondsLeft: () => session.breakSecondsLeft,
});

let updates = null;

function initUpdates() {
  updates = createUpdateUi({
    getAppVersion: () => pkg.version,
    getSettings: () => settings,
    saveSettings,
    isPackaged: () => app.isPackaged,
    BrowserWindow,
    getSettingsWindow: () => settingsWindow,
    openSettings,
    openExternal: (url) => shell.openExternal(url),
    showMessageBox: (...args) => dialog.showMessageBox(...args),
    withAppDialogIcon,
    getAppIconPath,
    getTranslator,
    showNotification,
    notifySettingsUi,
    refreshTray,
    projectRoot: __dirname,
  });
  return updates;
}

let tickTimer = null;
let isFirstRun = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function getTranslator() {
  return createTranslator(settings.locale);
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Coerce/clamp known settings; drop unknown keys from renderer. */
function normalizeSettings(partial = {}) {
  const src = { ...DEFAULT_SETTINGS, ...partial };
  const normalized = {
    workMinutes: clampInt(
      src.workMinutes,
      SETTINGS_LIMITS.workMinutes.min,
      SETTINGS_LIMITS.workMinutes.max,
      DEFAULT_SETTINGS.workMinutes,
    ),
    breakMinutes: clampInt(
      src.breakMinutes,
      SETTINGS_LIMITS.breakMinutes.min,
      SETTINGS_LIMITS.breakMinutes.max,
      DEFAULT_SETTINGS.breakMinutes,
    ),
    idlePauseMinutes: clampInt(
      src.idlePauseMinutes,
      SETTINGS_LIMITS.idlePauseMinutes.min,
      SETTINGS_LIMITS.idlePauseMinutes.max,
      DEFAULT_SETTINGS.idlePauseMinutes,
    ),
    showExercises: !!src.showExercises,
    strictBreak: !!src.strictBreak,
    locale: VALID_LOCALES.has(src.locale) ? src.locale : DEFAULT_SETTINGS.locale,
    notifyBeforeBreak: !!src.notifyBeforeBreak,
    soundOnBreakEnd: !!src.soundOnBreakEnd,
    launchAtLogin: !!src.launchAtLogin,
    checkForUpdates: !!src.checkForUpdates,
    autoDownloadUpdates: !!src.autoDownloadUpdates,
    autoInstallOnQuit: !!src.autoInstallOnQuit,
    updateDismissedVersion:
      src.updateDismissedVersion == null || src.updateDismissedVersion === ""
        ? null
        : String(src.updateDismissedVersion),
    updateLastCheckAt: null,
  };

  const checkedAt = Number(src.updateLastCheckAt);
  if (Number.isFinite(checkedAt) && checkedAt > 0) {
    normalized.updateLastCheckAt = checkedAt;
  }

  if (!normalized.checkForUpdates) {
    normalized.autoDownloadUpdates = false;
    normalized.autoInstallOnQuit = false;
  }

  return normalized;
}

function loadSettings() {
  isFirstRun = !fs.existsSync(SETTINGS_PATH);
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf8");
    settings = normalizeSettings(JSON.parse(raw));
  } catch {
    settings = normalizeSettings();
  }
  session.resetWork(settings.workMinutes);
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error("Failed to save settings:", err);
    throw err;
  }
}

function updateTrayTitle() {
  if (!tray) return;
  const tr = getTranslator();
  updateTrayStatus(tray, {
    onBreak: session.onBreak,
    clockText: formatClock(
      session.onBreak ? session.breakSecondsLeft : session.workSecondsLeft,
    ),
    tr,
  });
}

function postponeBreak(minutes) {
  if (!session.postpone(minutes)) return;
  refreshTray();
}

function buildTrayMenu() {
  const tr = getTranslator();
  const clock = formatClock(
    session.onBreak ? session.breakSecondsLeft : session.workSecondsLeft,
  );

  const statusItem = {
    label: session.onBreak
      ? tr.t("tray.breakStatus", { clock })
      : tr.t("tray.workStatus", { clock }),
    enabled: false,
  };

  if (session.onBreak) {
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
      ...updates.buildTrayItems(tr),
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
    ...updates.buildTrayItems(tr),
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

function refreshTray({ rebuildMenu = true } = {}) {
  if (!tray) return;
  if (rebuildMenu) {
    tray.setContextMenu(buildTrayMenu());
  }
  updateTrayTitle();
}

function resetWorkTimer() {
  session.resetWork(settings.workMinutes);
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

function showPreBreakNotification() {
  const tr = getTranslator();
  showNotification({
    title: tr.t("notify.title"),
    body: tr.t("notify.body"),
    silent: false,
  });
}

function tick() {
  const result = session.tick({
    idleSeconds: powerMonitor.getSystemIdleTime(),
    idlePauseMinutes: settings.idlePauseMinutes,
    notifyBeforeBreak: settings.notifyBeforeBreak,
  });

  if (result.notify) {
    showPreBreakNotification();
  }

  switch (result.kind) {
    case "breakWaitingExit":
      refreshTray({ rebuildMenu: false });
      return;
    case "breakTick":
      overlays.broadcastTick(session.breakSecondsLeft);
      if (result.shouldExit) {
        requestBreakExit();
      }
      refreshTray({ rebuildMenu: false });
      return;
    case "idle":
      refreshTray({ rebuildMenu: false });
      return;
    case "startBreak":
      startBreak({ demo: false });
      return;
    case "workTick":
      refreshTray({ rebuildMenu: false });
      return;
    default: {
      const _exhaustive = result.kind;
      throw new Error(`Unhandled tick kind: ${_exhaustive}`);
    }
  }
}

function buildBreakPayload(extra = {}) {
  const tr = getTranslator();
  return {
    strictBreak: settings.strictBreak,
    showExercises: settings.showExercises,
    strings: tr.messages.break,
    locale: tr.locale,
    demo: session.breakIsDemo,
    ...extra,
  };
}

function broadcastBreakLocaleUpdate() {
  overlays.broadcastLocale(buildBreakPayload());
}

function requestBreakExit({ fast = false } = {}) {
  overlays.requestExit({
    fast,
    playSound: settings.soundOnBreakEnd,
    markExitRequested: () => session.markExitRequested(),
  });
}

async function startBreak({ demo = false, seconds = null } = {}) {
  await overlays.withCreateLock(async () => {
    if (session.onBreak) {
      overlays.closeAll();
    }

    const totalSeconds = session.beginBreak({
      demo,
      seconds,
      breakMinutes: settings.breakMinutes,
    });

    await overlays.createAll(
      {
        totalSeconds,
        demo,
        ...buildBreakPayload(),
      },
      settings.strictBreak,
    );
    refreshTray();
  });
}

function endBreak() {
  overlays.clearExitTimer();
  session.finishBreak(settings.workMinutes);
  overlays.closeAll();
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
    height: 820,
    resizable: false,
    show: false,
    backgroundColor: "#1a1a1a",
    title: tr.t("app.settingsTitle"),
    icon: getAppIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload-settings.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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
      updateState: updates.getUpdateStatePayload(),
      update: updates.getUpdatePayload(),
    });
  }
}

function createTray() {
  const icon = createTrayImage();
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
  initUpdates();
  onAutoUpdateStateChange(updates.onAutoStateChanged);
  updates.syncPreferences();
  applyLaunchAtLogin(settings.launchAtLogin);
  createTray();
  startTick();
  hideDockIfNeeded();
  stripAppQuarantine();
  overlays.bindDisplayHotplug();
  if (isFirstRun) {
    openSettings();
  }

  updates.scheduleChecks();
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});

app.on("before-quit", () => {
  stopTick();
  overlays.closeAll();
  updates?.stopChecks();
});

ipcMain.handle("get-settings", () => {
  const tr = getTranslator();
  return {
    settings,
    workSecondsLeft: session.workSecondsLeft,
    onBreak: session.onBreak,
    locale: tr.locale,
    strings: tr.messages,
    appVersion: pkg.version,
    releasesUrl: RELEASES_URL,
    launchAtLoginSupported: canUseLoginItemSettings(),
    updateState: updates.getUpdateStatePayload(),
    update: updates.getUpdatePayload(),
  };
});

ipcMain.handle("open-update-download", async () => {
  await updates.handleUpdateAction();
  return true;
});

ipcMain.handle("download-update", async () => {
  await updates.handleUpdateAction();
  return updates.getUpdatePayload();
});

ipcMain.handle("install-update", () => {
  return updates.tryInstall();
});

ipcMain.handle("dismiss-update", () => {
  updates.dismiss();
  return true;
});

ipcMain.handle("check-for-updates", async () => {
  return updates.checkForUpdates({ notify: false, force: true, showDialog: true, dialogFromTray: false });
});

ipcMain.handle("update-dialog-action", async (_e, action) => {
  await updates.handleDialogAction(action);
  return true;
});

ipcMain.handle("save-settings", (_e, next) => {
  const prevLocale = settings.locale;
  // Merge over current settings so form payload can't wipe updateDismissedVersion / last check.
  settings = normalizeSettings({ ...settings, ...next });
  saveSettings();
  applyLaunchAtLogin(settings.launchAtLogin);

  if (prevLocale !== settings.locale) {
    clearLocaleCache();
    broadcastBreakLocaleUpdate();
  }

  if (!session.onBreak) resetWorkTimer();

  updates.syncPreferences();

  if (settings.checkForUpdates) {
    updates.checkForUpdates({ notify: false, force: true });
  } else {
    updates.clearInfo();
    refreshTray();
    notifySettingsUi();
  }

  return true;
});

ipcMain.handle("skip-break", () => {
  requestBreakExit({ fast: true });
});

ipcMain.handle("start-demo-break", () => {
  startBreak({ demo: true, seconds: 30 });
  return true;
});
