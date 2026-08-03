const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
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
  getTrayIconPath,
  getAppIconPath,
  getAppIconImage,
  hideDockIfNeeded,
  setAppUserModelId,
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
const { createSessionTimer, formatClock } = require("./lib/timer");
const { createBreakWindowsController } = require("./lib/break-windows");

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

let settings = { ...DEFAULT_SETTINGS };
const session = createSessionTimer();
const overlays = createBreakWindowsController({
  projectRoot: __dirname,
  isOnBreak: () => session.onBreak,
  onFastClose: () => requestBreakExit({ fast: true }),
  onExitAnimationDone: () => endBreak(),
});
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
    const fallback = setTimeout(resolve, 4000);
    win.once("ready-to-show", () => {
      clearTimeout(fallback);
      resolve();
    });
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
    width: 360,
    height,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: "#0f1524",
    title: payload.title || tr.t("settings.updateDialogTitle"),
    icon: getAppIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload-update.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  updatePromptWindow.on("closed", () => {
    updatePromptWindow = null;
  });

  await updatePromptWindow.loadFile(path.join(__dirname, "src", "update-dialog.html"));
  updatePromptWindow.once("ready-to-show", () => {
    if (updatePromptWindow && !updatePromptWindow.isDestroyed()) {
      updatePromptWindow.webContents.send("update-dialog", payload);
      updatePromptWindow.show();
    }
  });
}

async function presentUpdateDialog(payload, { compact = false } = {}) {
  if (payload.kind === "downloading") {
    openSettings();
    return;
  }

  const preferCompact =
    compact || (useInAppUpdateDialog() && isCompactUpdateDialog(payload));

  if (useInAppUpdateDialog() && preferCompact) {
    await openUpdatePromptWindow(payload);
    return;
  }

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    settingsWindow.webContents.send("update-dialog", payload);
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
    closeUpdatePromptWindow();
    shell.openExternal(updateInfo?.htmlUrl || RELEASES_LATEST_URL).catch((err) => {
      console.error("open releases failed", err);
    });
    return;
  }
  if (action === "later" && updateInfo?.version) {
    closeUpdatePromptWindow();
    settings.updateDismissedVersion = updateInfo.version;
    try {
      saveSettings();
    } catch {
      /* already logged */
    }
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
    try {
      saveSettings();
    } catch {
      /* already logged */
    }
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
  overlays.closeAll();
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
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
    try {
      saveSettings();
    } catch {
      /* already logged */
    }
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
  // Merge over current settings so form payload can't wipe updateDismissedVersion / last check.
  settings = normalizeSettings({ ...settings, ...next });
  saveSettings();
  applyLaunchAtLogin(settings.launchAtLogin);

  if (prevLocale !== settings.locale) {
    clearLocaleCache();
    broadcastBreakLocaleUpdate();
  }

  if (!session.onBreak) resetWorkTimer();

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
