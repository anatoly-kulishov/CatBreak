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
  configureBreakWindow,
  updateTrayStatus,
  getTrayIconPath,
  getAppIconPath,
  getAppIconImage,
  hideDockIfNeeded,
  setAppUserModelId,
  getBreakWindowOptions,
} = require("./lib/platform");
const { createTranslator, clearLocaleCache } = require("./lib/i18n");
const { applyLaunchAtLogin, canUseLoginItemSettings } = require("./lib/autostart");
const { showNotification } = require("./lib/notifications");
const {
  compareVersions,
  fetchLatestRelease,
  RELEASES_LATEST_URL,
} = require("./lib/releases");
const {
  isAutoUpdaterEnabled,
  configureAutoUpdater,
  onAutoUpdateStateChange,
  getAutoUpdateState,
  hasAutoUpdateReady,
  checkAutoUpdate,
  downloadAutoUpdate,
  quitAndInstallUpdate,
  applyAutoUpdaterPreferences,
} = require("./lib/updater");

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
};

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UPDATE_STARTUP_DELAY_MS = 8 * 1000;

/** @type {null | { version: string; tag?: string; name?: string; source: 'auto' | 'manual'; status?: 'available' | 'downloading' | 'downloaded'; percent?: number; downloadUrl?: string; downloadName?: string | null; htmlUrl?: string }} */
let updateInfo = null;
let updateCheckTimer = null;
let updateCheckInFlight = false;
let updateLastError = null;
let updateInstallPromptedVersion = null;
let updateLastCheckChannel = "manual";
let updatePromptWindow = null;

/** @param {import('electron').MessageBoxOptions} options */
function withAppDialogIcon(options) {
  const icon = getAppIconImage();
  return icon ? { ...options, icon } : options;
}

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

function buildUpdateTrayItems(tr) {
  const items = [
    {
      label: tr.t("tray.checkForUpdates"),
      click: () => {
        checkForUpdates({ notify: true, force: true, showDialog: true, dialogFromTray: true });
      },
    },
  ];

  if (
    updateInfo?.version &&
    settings.updateDismissedVersion !== updateInfo.version
  ) {
    const isReady = updateInfo.status === "downloaded";
    items.push({
      label: isReady
        ? tr.t("tray.updateInstall", { version: updateInfo.version })
        : tr.t("tray.updateAvailable", { version: updateInfo.version }),
      click: () => handleUpdateAction(),
    });
  }

  return items;
}

function syncUpdateFromAutoState() {
  const auto = getAutoUpdateState();
  if (!hasAutoUpdateReady() || !auto.info?.version) {
    return false;
  }

  updateInfo = {
    version: auto.info.version,
    name: auto.info.releaseName || auto.info.version,
    releaseNotes: formatReleaseNotes(auto.info.releaseNotes || auto.info.releaseNote),
    source: "auto",
    status:
      auto.status === "downloading"
        ? "downloading"
        : auto.status === "downloaded"
          ? "downloaded"
          : "available",
    percent:
      auto.progress?.percent != null
        ? Math.round(auto.progress.percent)
        : undefined,
    htmlUrl: RELEASES_LATEST_URL,
  };
  return true;
}

function applyManualUpdateInfo(release) {
  const latest = release.version;
  if (!latest || compareVersions(pkg.version, latest) >= 0) {
    updateInfo = null;
    return false;
  }

  updateInfo = {
    version: latest,
    tag: release.tag,
    name: release.name,
    releaseNotes: formatReleaseNotes(release.body),
    source: "manual",
    status: "available",
    downloadUrl: release.downloadUrl,
    downloadName: release.downloadName,
    htmlUrl: release.htmlUrl,
  };
  return true;
}

function maybeNotifyUpdateAvailable(version, notify) {
  if (!notify || settings.updateDismissedVersion === version) return;
  const focused = BrowserWindow.getFocusedWindow();
  if (focused === settingsWindow) return;

  const tr = getTranslator();
  showNotification({
    title: tr.t("settings.updateNotifyTitle"),
    body: tr.t("settings.updateNotifyBody", { version }),
    silent: false,
  });
}

async function checkManualUpdates({ notify = false } = {}) {
  const release = await fetchLatestRelease();
  const found = applyManualUpdateInfo(release);
  if (found && updateInfo?.version) {
    maybeNotifyUpdateAvailable(updateInfo.version, notify);
  }
  return found;
}

async function checkAutoUpdates({ notify = false } = {}) {
  if (!isAutoUpdaterEnabled()) return false;

  const result = await checkAutoUpdate();
  if (result.available && syncUpdateFromAutoState() && updateInfo?.version) {
    maybeNotifyUpdateAvailable(updateInfo.version, notify);
    return true;
  }
  return false;
}

function openManualUpdateDownload() {
  const url = updateInfo?.downloadUrl || RELEASES_LATEST_URL;
  shell.openExternal(url).catch((err) => {
    console.error("open update url failed", err);
  });
}

async function handleUpdateAction() {
  if (!updateInfo?.version) return;

  if (updateInfo.source === "auto") {
    if (updateInfo.status === "downloaded") {
      quitAndInstallUpdate();
      return;
    }
    if (updateInfo.status === "available") {
      try {
        await downloadAutoUpdate();
      } catch (err) {
        console.error("download update failed", err);
        openManualUpdateDownload();
      }
      return;
    }
    return;
  }

  openManualUpdateDownload();
}

function getUpdatePayload() {
  if (!updateInfo?.version) return null;
  return {
    version: updateInfo.version,
    tag: updateInfo.tag,
    name: updateInfo.name,
    source: updateInfo.source,
    status: updateInfo.status,
    percent: updateInfo.percent,
    downloadUrl: updateInfo.downloadUrl,
    downloadName: updateInfo.downloadName,
    htmlUrl: updateInfo.htmlUrl,
    releaseNotes: updateInfo.releaseNotes || null,
    autoUpdaterEnabled: isAutoUpdaterEnabled(),
    dismissed: settings.updateDismissedVersion === updateInfo.version,
  };
}

function formatReleaseNotes(raw) {
  if (!raw || typeof raw !== "string") return "";
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return "";
  const max = 380;
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

function getUpdateChannel() {
  if (!settings.checkForUpdates) return "off";
  if (!app.isPackaged) return "manual";
  if (updateInfo?.source === "auto") return "auto";
  if (updateInfo?.source === "manual") return "manual";
  return updateLastCheckChannel;
}

function getUpdateStatePayload() {
  const base = {
    currentVersion: pkg.version,
    lastCheckedAt: settings.updateLastCheckAt || null,
    checking: updateCheckInFlight,
    autoUpdaterEnabled: isAutoUpdaterEnabled(),
    channel: getUpdateChannel(),
  };

  if (updateCheckInFlight) {
    return { ...base, phase: "checking" };
  }

  const available = getUpdatePayload();
  if (available && !available.dismissed) {
    const phase =
      available.status === "downloading"
        ? "downloading"
        : available.status === "downloaded"
          ? "downloaded"
          : "available";
    return { ...base, phase, ...available };
  }

  if (updateLastError) {
    return { ...base, phase: "error", error: updateLastError };
  }

  if (settings.updateLastCheckAt) {
    return { ...base, phase: "up_to_date" };
  }

  return { ...base, phase: "idle" };
}

function buildUpdateDialogDetail(tr) {
  const parts = [
    tr.t("settings.updateDialogCurrent", { version: pkg.version }),
    tr.t("settings.updateDialogLatest", { version: updateInfo.version }),
  ];
  if (updateInfo.downloadName) {
    parts.push(tr.t("settings.updateAsset", { name: updateInfo.downloadName }));
  }
  if (updateInfo.source === "auto" && isAutoUpdaterEnabled()) {
    if (updateInfo.status === "downloaded") {
      parts.push(tr.t("settings.updateHintReady"));
    } else {
      parts.push(tr.t("settings.updateHintAuto"));
    }
  } else {
    parts.push(tr.t("settings.updateHintManual"));
  }
  if (updateInfo.releaseNotes) {
    parts.push(updateInfo.releaseNotes);
  }
  return parts.join("\n\n");
}

function useInAppUpdateDialog() {
  return process.platform === "darwin";
}

function ensureSettingsVisible() {
  return new Promise((resolve) => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.show();
      settingsWindow.focus();
      resolve();
      return;
    }
    openSettings();
    const win = settingsWindow;
    if (!win) {
      resolve();
      return;
    }
    if (win.isVisible()) {
      resolve();
      return;
    }
    win.once("ready-to-show", () => resolve());
    window.setTimeout(resolve, 4000);
  });
}

function buildUpdateDialogPayload() {
  const tr = getTranslator();
  const hasUpdate =
    updateInfo?.version && settings.updateDismissedVersion !== updateInfo.version;

  if (hasUpdate) {
    if (updateInfo.status === "downloading") {
      return { kind: "downloading" };
    }

    const isReady = updateInfo.status === "downloaded";
    const isAuto = updateInfo.source === "auto" && isAutoUpdaterEnabled();
    /** @type {{ id: string, label: string, primary?: boolean }[]} */
    const actions = [];

    if (isReady) {
      actions.push({
        id: "install",
        label: tr.t("settings.updateInstall"),
        primary: true,
      });
    } else if (isAuto) {
      actions.push({
        id: "download",
        label: tr.t("settings.updateDownloadInApp"),
        primary: true,
      });
      actions.push({ id: "releases", label: tr.t("settings.updateOpenReleases") });
    } else {
      actions.push({
        id: "download",
        label: tr.t("settings.updateDownload"),
        primary: true,
      });
      actions.push({ id: "releases", label: tr.t("settings.updateViewRelease") });
    }
    actions.push({ id: "later", label: tr.t("settings.updateLater") });

    return {
      kind: isReady ? "ready" : "available",
      title: isReady
        ? tr.t("settings.updateReadyTitle", { version: updateInfo.version })
        : tr.t("settings.updateAvailableTitle", { version: updateInfo.version }),
      detail: isReady ? tr.t("settings.updateReadyDetail") : buildUpdateDialogDetail(tr),
      actions,
    };
  }

  if (updateLastError) {
    return {
      kind: "error",
      title: tr.t("settings.updateErrorTitle"),
      detail: updateLastError,
      actions: [
        { id: "retry", label: tr.t("settings.updateRetry"), primary: true },
        { id: "ok", label: tr.t("settings.updateDialogOk") },
      ],
    };
  }

  return {
    kind: "up_to_date",
    title: tr.t("settings.updateUpToDateTitle"),
    detail: tr.t("settings.updateUpToDateDetail", { version: pkg.version }),
    actions: [{ id: "ok", label: tr.t("settings.updateDialogOk"), primary: true }],
  };
}

function closeUpdatePromptWindow() {
  if (updatePromptWindow && !updatePromptWindow.isDestroyed()) {
    updatePromptWindow.close();
  }
  updatePromptWindow = null;
}

function isCompactUpdateDialog(payload) {
  return (
    payload.actions?.length === 1 && ["ok", "retry"].includes(payload.actions[0].id)
  );
}

async function openUpdatePromptWindow(payload) {
  closeUpdatePromptWindow();
  const tr = getTranslator();
  const height = payload.detail && payload.detail.length > 160 ? 360 : 300;

  updatePromptWindow = new BrowserWindow({
    width: 400,
    height,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: "#1a1a1a",
    title: tr.t("settings.updateDialogTitle"),
    icon: getAppIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  updatePromptWindow.on("closed", () => {
    updatePromptWindow = null;
  });

  await updatePromptWindow.loadFile(path.join(__dirname, "src", "update-dialog.html"));
  updatePromptWindow.webContents.send("update-dialog", payload);
  updatePromptWindow.once("ready-to-show", () => {
    if (updatePromptWindow && !updatePromptWindow.isDestroyed()) {
      updatePromptWindow.show();
    }
  });
}

async function presentUpdateDialog(payload, { compact = false } = {}) {
  if (payload.kind === "downloading") {
    openSettings();
    return;
  }

  const useCompact =
    compact || (useInAppUpdateDialog() && isCompactUpdateDialog(payload));

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    settingsWindow.webContents.send("update-dialog", payload);
    return;
  }

  if (useInAppUpdateDialog() && useCompact) {
    await openUpdatePromptWindow(payload);
    return;
  }

  await ensureSettingsVisible();
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send("update-dialog", payload);
  }
}

async function runNativeUpdateDialog(payload) {
  const tr = getTranslator();
  const parent =
    settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : undefined;

  if (payload.kind === "downloading") {
    openSettings();
    return;
  }

  const dialogType = payload.kind === "error" ? "error" : "info";
  const { response } = await dialog.showMessageBox(
    parent ?? null,
    withAppDialogIcon({
      type: dialogType,
      title: tr.t("settings.updateDialogTitle"),
      message: payload.title,
      detail: payload.detail,
      buttons: payload.actions.map((a) => a.label),
      defaultId: 0,
      cancelId: payload.actions.length - 1,
      noLink: true,
    }),
  );

  const picked = payload.actions[response]?.id;
  await handleUpdateDialogAction(picked);
}

async function handleUpdateDialogAction(action) {
  if (action === "retry") {
    closeUpdatePromptWindow();
    await checkForUpdates({ notify: false, force: true, showDialog: true });
    return;
  }
  if (action === "ok") {
    closeUpdatePromptWindow();
    return;
  }
  if (action === "install" || action === "download") {
    closeUpdatePromptWindow();
    await handleUpdateAction();
    return;
  }
  if (action === "releases") {
    shell.openExternal(updateInfo?.htmlUrl || RELEASES_LATEST_URL).catch((err) => {
      console.error("open releases failed", err);
    });
    return;
  }
  if (action === "later" && updateInfo?.version) {
    closeUpdatePromptWindow();
    settings.updateDismissedVersion = updateInfo.version;
    saveSettings();
    notifySettingsUi();
    refreshTray();
  }
}

async function showUpdateResultDialog({ compact = false } = {}) {
  const payload = buildUpdateDialogPayload();
  if (useInAppUpdateDialog()) {
    await presentUpdateDialog(payload, { compact });
    return;
  }
  await runNativeUpdateDialog(payload);
}

async function checkForUpdates({
  notify = false,
  force = false,
  showDialog = false,
  dialogFromTray = false,
} = {}) {
  if (!settings.checkForUpdates && !force) return getUpdateStatePayload();
  if (updateCheckInFlight) {
    if (showDialog) {
      const tr = getTranslator();
      const payload = {
        kind: "checking",
        title: tr.t("settings.updateCheckingTitle"),
        detail: tr.t("settings.updateCheckingDetail"),
        actions: [{ id: "ok", label: tr.t("settings.updateDialogOk"), primary: true }],
      };
      if (useInAppUpdateDialog()) {
        await presentUpdateDialog(payload, { compact: dialogFromTray });
      } else {
        await runNativeUpdateDialog(payload);
      }
    }
    return getUpdateStatePayload();
  }

  const now = Date.now();
  const skipNetwork =
    !force &&
    settings.updateLastCheckAt &&
    now - settings.updateLastCheckAt < UPDATE_CHECK_INTERVAL_MS;

  if (skipNetwork) {
    notifySettingsUi();
    refreshTray();
    if (showDialog) {
      await showUpdateResultDialog({ compact: dialogFromTray });
    }
    return getUpdateStatePayload();
  }

  updateCheckInFlight = true;
  updateLastError = null;
  notifySettingsUi();

  try {
    let found = false;
    if (isAutoUpdaterEnabled()) {
      try {
        found = await checkAutoUpdates({ notify });
      } catch (err) {
        console.error("auto update check failed", err);
        updateLastError = err?.message || String(err);
      }
    }

    if (!found && !updateLastError) {
      try {
        found = await checkManualUpdates({ notify });
      } catch (err) {
        console.error("manual update check failed", err);
        updateLastError = err?.message || String(err);
      }
    }

    if (found && updateInfo?.source === "auto") {
      updateLastCheckChannel = "auto";
      updateLastError = null;
    } else if (found && updateInfo?.source === "manual") {
      updateLastCheckChannel = "manual";
      updateLastError = null;
    } else if (!updateLastError) {
      updateInfo = null;
      updateLastCheckChannel = isAutoUpdaterEnabled() ? "auto" : "manual";
    }

    settings.updateLastCheckAt = now;
    saveSettings();
    notifySettingsUi();
    refreshTray();

    if (showDialog) {
      await showUpdateResultDialog({ compact: dialogFromTray });
    }
  } catch (err) {
    console.error("update check failed", err);
    updateLastError = err?.message || String(err);
    notifySettingsUi();
    if (showDialog) {
      await showUpdateResultDialog();
    }
  } finally {
    updateCheckInFlight = false;
    notifySettingsUi();
    refreshTray();
  }

  return getUpdateStatePayload();
}

function syncAutoUpdaterPreferences() {
  applyAutoUpdaterPreferences({
    autoDownload:
      !!settings.checkForUpdates && settings.autoDownloadUpdates !== false,
    autoInstallOnAppQuit: !!settings.autoInstallOnQuit,
  });
}

async function promptInstallReadyUpdate() {
  if (!updateInfo?.version || updateInfo.source !== "auto") return;
  if (updateInfo.status !== "downloaded") return;
  if (settings.updateDismissedVersion === updateInfo.version) return;
  if (updateInstallPromptedVersion === updateInfo.version) return;

  updateInstallPromptedVersion = updateInfo.version;
  const tr = getTranslator();

  showNotification({
    title: tr.t("settings.updateReadyNotifyTitle"),
    body: tr.t("settings.updateReadyNotifyBody", { version: updateInfo.version }),
    silent: false,
  });

  const payload = {
    kind: "ready",
    title: tr.t("settings.updateReadyTitle", { version: updateInfo.version }),
    detail: tr.t("settings.updateReadyDetail"),
    actions: [
      { id: "install", label: tr.t("settings.updateInstall"), primary: true },
      { id: "later", label: tr.t("settings.updateLater") },
    ],
  };

  if (useInAppUpdateDialog()) {
    await presentUpdateDialog(payload);
    return;
  }

  await runNativeUpdateDialog(payload);
}

function onAutoUpdaterStateChanged() {
  const prevStatus = updateInfo?.status;
  if (syncUpdateFromAutoState()) {
    notifySettingsUi();
    refreshTray();
    if (updateInfo?.status === "downloaded" && prevStatus !== "downloaded") {
      promptInstallReadyUpdate();
    }
  }
}

function scheduleUpdateChecks() {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }

  setTimeout(() => {
    checkForUpdates({ notify: true });
  }, UPDATE_STARTUP_DELAY_MS);

  updateCheckTimer = setInterval(() => {
    checkForUpdates({ notify: true });
  }, UPDATE_CHECK_INTERVAL_MS);
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
      ...buildUpdateTrayItems(tr),
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
    ...buildUpdateTrayItems(tr),
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
    height: 820,
    resizable: false,
    show: false,
    backgroundColor: "#1a1a1a",
    title: tr.t("app.settingsTitle"),
    icon: getAppIconPath(),
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
      updateState: getUpdateStatePayload(),
      update: getUpdatePayload(),
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
  onAutoUpdateStateChange(onAutoUpdaterStateChanged);
  syncAutoUpdaterPreferences();
  applyLaunchAtLogin(settings.launchAtLogin);
  createTray();
  startTick();
  hideDockIfNeeded();
  if (isFirstRun) {
    openSettings();
  }

  scheduleUpdateChecks();
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});

app.on("before-quit", () => {
  stopTick();
  closeBreakWindows();
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
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
    updateState: getUpdateStatePayload(),
    update: getUpdatePayload(),
  };
});

ipcMain.handle("open-update-download", async () => {
  await handleUpdateAction();
  return true;
});

ipcMain.handle("download-update", async () => {
  await handleUpdateAction();
  return getUpdatePayload();
});

ipcMain.handle("install-update", () => {
  if (updateInfo?.source === "auto" && updateInfo.status === "downloaded") {
    quitAndInstallUpdate();
    return true;
  }
  return false;
});

ipcMain.handle("dismiss-update", () => {
  if (updateInfo?.version) {
    settings.updateDismissedVersion = updateInfo.version;
    saveSettings();
    notifySettingsUi();
    refreshTray();
  }
  return true;
});

ipcMain.handle("check-for-updates", async () => {
  return checkForUpdates({ notify: false, force: true, showDialog: true, dialogFromTray: false });
});

ipcMain.handle("update-dialog-action", async (_e, action) => {
  await handleUpdateDialogAction(action);
  return true;
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

  syncAutoUpdaterPreferences();

  if (settings.checkForUpdates) {
    checkForUpdates({ notify: false, force: true });
  } else {
    updateInfo = null;
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
