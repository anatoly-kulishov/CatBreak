const path = require("path");
const {
  isAutoUpdaterEnabled,
  getAutoUpdateState,
  hasAutoUpdateReady,
  checkAutoUpdate,
  downloadAutoUpdate,
  quitAndInstallUpdate,
  applyAutoUpdaterPreferences,
} = require("./updater");
const {
  compareVersions,
  fetchLatestRelease,
  RELEASES_LATEST_URL,
} = require("./releases");

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UPDATE_STARTUP_DELAY_MS = 8 * 1000;

/**
 * Update check/download/dialog orchestration (auto + GitHub fallback).
 */
function createUpdateUi(deps) {
  const {
    getAppVersion,
    getSettings,
    saveSettings,
    isPackaged,
    BrowserWindow,
    getSettingsWindow,
    openSettings,
    openExternal,
    showMessageBox,
    withAppDialogIcon,
    getAppIconPath,
    getTranslator,
    showNotification,
    notifySettingsUi,
    refreshTray,
    projectRoot,
    platform = process.platform,
  } = deps;

  let updateInfo = null;
  let updateCheckTimer = null;
  let updateCheckInFlight = false;
  let updateLastError = null;
  let updateInstallPromptedVersion = null;
  let updateLastCheckChannel = "manual";
  let updatePromptWindow = null;

function formatUpdateError(err, tr) {
  const raw = (err?.message || String(err || "")).trim();
  if (!raw) return tr.t("settings.updateStatusError");

  if (/404|not found/i.test(raw) && /latest-.*\.yml/i.test(raw)) {
    return tr.t("settings.updateErrorMissingYml");
  }
  if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|network|fetch failed/i.test(raw)) {
    return tr.t("settings.updateErrorNetwork");
  }

  const first = raw.split("\n")[0].replace(/^HttpError:\s*/i, "").trim();
  if (first.length > 100) {
    return `${first.slice(0, 97)}...`;
  }
  return first;
}

function captureUpdateError(err) {
  updateLastError = formatUpdateError(err, getTranslator());
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
    getSettings().updateDismissedVersion !== updateInfo.version
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
  if (!latest || compareVersions(getAppVersion(), latest) >= 0) {
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
  if (!notify || getSettings().updateDismissedVersion === version) return;
  const focused = BrowserWindow.getFocusedWindow();
  if (focused === getSettingsWindow()) return;

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
  openExternal(url).catch((err) => {
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
    dismissed: getSettings().updateDismissedVersion === updateInfo.version,
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
  if (!getSettings().checkForUpdates) return "off";
  if (!isPackaged()) return "manual";
  if (updateInfo?.source === "auto") return "auto";
  if (updateInfo?.source === "manual") return "manual";
  return updateLastCheckChannel;
}

function getUpdateStatePayload() {
  const base = {
    currentVersion: getAppVersion(),
    lastCheckedAt: getSettings().updateLastCheckAt || null,
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

  if (getSettings().updateLastCheckAt) {
    return { ...base, phase: "up_to_date" };
  }

  return { ...base, phase: "idle" };
}

function buildUpdateDialogDetail(tr) {
  const parts = [
    tr.t("settings.updateDialogCurrent", { version: getAppVersion() }),
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
  return platform === "darwin";
}

function ensureSettingsVisible() {
  return new Promise((resolve) => {
    if (getSettingsWindow() && !getSettingsWindow().isDestroyed()) {
      getSettingsWindow().show();
      getSettingsWindow().focus();
      resolve();
      return;
    }
    openSettings();
    const win = getSettingsWindow();
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
    updateInfo?.version && getSettings().updateDismissedVersion !== updateInfo.version;

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
    detail: tr.t("settings.updateUpToDateDetail", { version: getAppVersion() }),
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
      preload: path.join(projectRoot, "preload-update.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  updatePromptWindow.on("closed", () => {
    updatePromptWindow = null;
  });

  await updatePromptWindow.loadFile(path.join(projectRoot, "src", "update-dialog.html"));
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

  if (getSettingsWindow() && !getSettingsWindow().isDestroyed()) {
    getSettingsWindow().show();
    getSettingsWindow().focus();
    getSettingsWindow().webContents.send("update-dialog", payload);
    return;
  }

  await ensureSettingsVisible();
  if (getSettingsWindow() && !getSettingsWindow().isDestroyed()) {
    getSettingsWindow().webContents.send("update-dialog", payload);
  }
}

async function runNativeUpdateDialog(payload) {
  const tr = getTranslator();
  const parent =
    getSettingsWindow() && !getSettingsWindow().isDestroyed() ? getSettingsWindow() : undefined;

  if (payload.kind === "downloading") {
    openSettings();
    return;
  }

  const dialogType = payload.kind === "error" ? "error" : "info";
  const { response } = await showMessageBox(
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
    openExternal(updateInfo?.htmlUrl || RELEASES_LATEST_URL).catch((err) => {
      console.error("open releases failed", err);
    });
    return;
  }
  if (action === "later" && updateInfo?.version) {
    closeUpdatePromptWindow();
    getSettings().updateDismissedVersion = updateInfo.version;
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
  if (!getSettings().checkForUpdates && !force) return getUpdateStatePayload();
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
    getSettings().updateLastCheckAt &&
    now - getSettings().updateLastCheckAt < UPDATE_CHECK_INTERVAL_MS;

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
        captureUpdateError(err);
      }
    }

    if (!found) {
      try {
        found = await checkManualUpdates({ notify });
        if (found) {
          updateLastError = null;
        }
      } catch (err) {
        console.error("manual update check failed", err);
        if (!updateLastError) {
          captureUpdateError(err);
        }
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

    getSettings().updateLastCheckAt = now;
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
    captureUpdateError(err);
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
      !!getSettings().checkForUpdates && getSettings().autoDownloadUpdates !== false,
    autoInstallOnAppQuit: !!getSettings().autoInstallOnQuit,
  });
}

async function promptInstallReadyUpdate() {
  if (!updateInfo?.version || updateInfo.source !== "auto") return;
  if (updateInfo.status !== "downloaded") return;
  if (getSettings().updateDismissedVersion === updateInfo.version) return;
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

  return {
    buildTrayItems: buildUpdateTrayItems,
    buildDialogPayload: buildUpdateDialogPayload,
    checkForUpdates,
    handleUpdateAction,
    getUpdatePayload,
    getUpdateStatePayload,
    handleDialogAction: handleUpdateDialogAction,
    scheduleChecks: scheduleUpdateChecks,
    stopChecks() {
      if (updateCheckTimer) {
        clearInterval(updateCheckTimer);
        updateCheckTimer = null;
      }
    },
    syncPreferences: syncAutoUpdaterPreferences,
    onAutoStateChanged: onAutoUpdaterStateChanged,
    dismiss() {
      if (!updateInfo?.version) return false;
      getSettings().updateDismissedVersion = updateInfo.version;
      try {
        saveSettings();
      } catch {
        /* already logged */
      }
      notifySettingsUi();
      refreshTray();
      return true;
    },
    clearInfo() {
      updateInfo = null;
    },
    get updateInfo() {
      return updateInfo;
    },
    tryInstall() {
      if (updateInfo?.source === "auto" && updateInfo.status === "downloaded") {
        quitAndInstallUpdate();
        return true;
      }
      return false;
    },
  };
}

module.exports = {
  createUpdateUi,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_STARTUP_DELAY_MS,
};
