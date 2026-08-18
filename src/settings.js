const fields = [
  "locale",
  "checkForUpdates",
  "autoDownloadUpdates",
  "autoInstallOnQuit",
  "workMinutes",
  "breakMinutes",
  "idlePauseMinutes",
  "notifyBeforeBreak",
  "soundOnBreakEnd",
  "showExercises",
  "strictBreak",
  "launchAtLogin",
];

let strings = null;
let activeLocale = "en";

function t(key, params = {}) {
  if (!strings) return key;
  const parts = key.split(".");
  let value = strings;
  for (const part of parts) {
    value = value?.[part];
  }
  if (typeof value !== "string") return key;
  return value.replace(/\{\{(\w+)\}\}/g, (_, name) =>
    params[name] != null ? String(params[name]) : "",
  );
}

function savedStatusMessage() {
  const purrs = strings?.settings?.savedPurrs;
  if (Array.isArray(purrs) && purrs.length > 0 && Math.random() < 0.38) {
    return purrs[Math.floor(Math.random() * purrs.length)];
  }
  return t("settings.saved");
}

function applyTranslations(messages, locale) {
  strings = messages;
  activeLocale = locale;
  document.documentElement.lang = locale;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });

  const checkBtn = document.getElementById("check-updates-now");
  if (checkBtn?.dataset.i18n) {
    checkBtn.textContent = t(checkBtn.dataset.i18n);
  }
}

function applyMeta({ appVersion, releasesUrl }) {
  const versionEl = document.getElementById("app-version");
  const linkEl = document.getElementById("releases-link");
  if (versionEl) {
    versionEl.textContent = t("settings.version", { version: appVersion });
  }
  if (linkEl) {
    linkEl.textContent = t("settings.releases");
    linkEl.href = releasesUrl;
  }
}

function applyLaunchAtLoginVisibility(supported) {
  const row = document.getElementById("launchAtLoginRow");
  if (row) {
    row.hidden = !supported;
  }
}

function applyUpdateOptionsVisibility() {
  const enabled = !!document.getElementById("checkForUpdates")?.checked;
  for (const id of ["autoDownloadUpdatesRow", "autoInstallOnQuitRow"]) {
    const row = document.getElementById(id);
    if (row) row.hidden = !enabled;
  }
}

function setStatus(message, variant) {
  const status = document.getElementById("status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("status--error", variant === "error");
}

function showBootError(message) {
  setStatus(message, "error");
}

function fillForm(settings) {
  for (const key of fields) {
    const el = document.getElementById(key);
    if (!el || el.hidden) continue;
    if (el.type === "checkbox") {
      el.checked = !!settings[key];
    } else if (el.tagName === "SELECT") {
      el.value = settings[key] ?? "auto";
    } else {
      el.value = settings[key];
    }
  }
  syncPresetHighlight();
}

let autosaveTimer = null;
let autosaveGeneration = 0;

async function autosaveSettings() {
  const gen = ++autosaveGeneration;
  try {
    await window.catBreak.saveSettings(readForm());
    if (gen !== autosaveGeneration) return;
  } catch (err) {
    console.error(err);
    showBootError(t("settings.saveError"));
  }
}

function scheduleAutosave() {
  window.clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => {
    autosaveSettings();
  }, 400);
}

function syncPresetHighlight() {
  const work = Number.parseInt(document.getElementById("workMinutes")?.value, 10);
  const breakM = Number.parseInt(document.getElementById("breakMinutes")?.value, 10);
  document.querySelectorAll("[data-preset-work][data-preset-break]").forEach((btn) => {
    const match =
      Number(btn.dataset.presetWork) === work &&
      Number(btn.dataset.presetBreak) === breakM;
    btn.classList.toggle("preset-button--active", match);
    btn.setAttribute("aria-pressed", match ? "true" : "false");
  });
}

function bindAutosave() {
  for (const key of fields) {
    const el = document.getElementById(key);
    if (!el) continue;
    el.addEventListener("change", () => {
      if (key === "checkForUpdates") {
        applyUpdateOptionsVisibility();
      }
      syncPresetHighlight();
      scheduleAutosave();
    });
    if (el.type === "number") {
      el.addEventListener("input", () => {
        syncPresetHighlight();
        scheduleAutosave();
      });
    }
  }
}

function getUpdateHintKey(update) {
  if (update.source === "auto") {
    if (update.status === "downloaded") return "settings.updateHintReady";
    if (update.status === "downloading") return "settings.updateHintDownloading";
    return "settings.updateHintAuto";
  }
  return "settings.updateHintManual";
}

function getUpdateActionLabel(update) {
  if (update.source === "auto" && update.status === "downloaded") {
    return t("settings.updateInstall");
  }
  if (update.source === "auto" && update.status === "downloading") {
    return t("settings.updateDownloading");
  }
  if (update.source === "auto") {
    return t("settings.updateDownloadInApp");
  }
  return t("settings.updateDownload");
}

function formatLastChecked(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString(activeLocale === "ru" ? "ru-RU" : "en-US", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return "";
  }
}

function updateChannelLabel(channel) {
  const key =
    channel === "auto"
      ? "settings.updateChannelAuto"
      : channel === "manual"
        ? "settings.updateChannelManual"
        : channel === "off"
          ? "settings.updateChannelOff"
          : null;
  return key ? t(key) : "";
}

function applyUpdateStatusLine(state) {
  const line = document.getElementById("update-status-line");
  if (!line || !state) return;

  const channelLabel = state.phase !== "checking" ? updateChannelLabel(state.channel) : "";

  switch (state.phase) {
    case "checking":
      line.textContent = t("settings.updateStatusChecking");
      break;
    case "available":
      line.textContent = t("settings.updateStatusAvailable", { version: state.version });
      break;
    case "downloading":
      line.textContent = t("settings.updateStatusDownloading", { version: state.version });
      break;
    case "downloaded":
      line.textContent = t("settings.updateStatusReady", { version: state.version });
      break;
    case "up_to_date":
      line.textContent = t("settings.updateStatusUpToDate", {
        version: state.currentVersion,
        when: formatLastChecked(state.lastCheckedAt) || "-",
      });
      break;
    case "error":
      line.textContent = state.error || t("settings.updateStatusError");
      break;
    default:
      line.textContent = t("settings.updateStatusIdle");
  }

  if (channelLabel && line.textContent) {
    line.textContent = `${line.textContent} · ${channelLabel}`;
  }
}

function applyUpdateBanner(state) {
  const banner = document.getElementById("update-banner");
  const title = document.getElementById("update-banner-title");
  const hint = document.getElementById("update-banner-hint");
  const asset = document.getElementById("update-banner-asset");
  const progressWrap = document.getElementById("update-progress-wrap");
  const progressBar = document.getElementById("update-progress-bar");
  const progressLabel = document.getElementById("update-progress-label");
  const actionBtn = document.getElementById("update-download");
  if (!banner || !title) return;

  const showBanner =
    state?.version &&
    !state.dismissed &&
    ["available", "downloading", "downloaded"].includes(state.phase);

  if (!showBanner) {
    banner.hidden = true;
    return;
  }

  banner.hidden = false;
  title.textContent = t("settings.updateBannerTitle", { version: state.version });

  if (hint) {
    hint.textContent = t(getUpdateHintKey(state));
  }

  if (actionBtn) {
    actionBtn.textContent = getUpdateActionLabel(state);
    actionBtn.disabled = state.source === "auto" && state.status === "downloading";
  }

  const showProgress =
    state.source === "auto" &&
    state.status === "downloading" &&
    state.percent != null;
  if (progressWrap) {
    progressWrap.hidden = !showProgress;
  }
  if (showProgress && progressBar && progressLabel) {
    const pct = Math.min(100, Math.max(0, state.percent));
    progressBar.style.width = `${pct}%`;
    progressLabel.textContent = t("settings.updateProgress", { percent: pct });
  }

  if (asset) {
    if (state.source === "manual" && state.downloadName) {
      asset.hidden = false;
      asset.textContent = t("settings.updateAsset", { name: state.downloadName });
    } else {
      asset.hidden = true;
      asset.textContent = "";
    }
  }
}

function hideUpdateModal() {
  const modal = document.getElementById("update-modal");
  if (modal) modal.hidden = true;
}

function showUpdateModal(payload) {
  const modal = document.getElementById("update-modal");
  const title = document.getElementById("update-modal-title");
  const detail = document.getElementById("update-modal-detail");
  const actionsEl = document.getElementById("update-modal-actions");
  if (!modal || !title || !detail || !actionsEl || !payload) return;

  title.textContent = payload.title || "";
  detail.textContent = payload.detail || "";
  actionsEl.replaceChildren();

  for (const action of payload.actions || []) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = action.label;
    btn.className = action.primary
      ? "update-modal__btn update-modal__btn--primary"
      : "update-modal__btn";
    btn.addEventListener("click", async () => {
      hideUpdateModal();
      try {
        await window.catBreak?.updateDialogAction?.(action.id);
      } catch (err) {
        console.error(err);
      }
    });
    actionsEl.appendChild(btn);
  }

  modal.hidden = false;
}

function applyUpdateUi(data) {
  const state =
    data.updateState ||
    (data.update?.version
      ? { phase: "available", ...data.update }
      : data.update === null && data.settings?.updateLastCheckAt
        ? { phase: "up_to_date", currentVersion: data.appVersion, lastCheckedAt: data.settings.updateLastCheckAt }
        : { phase: "idle", currentVersion: data.appVersion });

  applyUpdateStatusLine(state);
  applyUpdateBanner(state);

  const checkBtn = document.getElementById("check-updates-now");
  if (checkBtn) {
    checkBtn.disabled = !!state.checking;
    if (!checkBtn.dataset.i18nBound) {
      checkBtn.dataset.i18n = "settings.updateCheckNow";
      checkBtn.textContent = t("settings.updateCheckNow");
      checkBtn.dataset.i18nBound = "1";
    }
  }
}

function applyPayload(data) {
  applyTranslations(data.strings, data.locale);
  applyMeta(data);
  applyLaunchAtLoginVisibility(data.launchAtLoginSupported);
  fillForm(data.settings);
  applyUpdateOptionsVisibility();
  applyUpdateUi(data);
}

async function load() {
  if (!window.catBreak?.getSettings) {
    showBootError("Failed to load UI. Please restart the app.");
    return;
  }

  try {
    const data = await window.catBreak.getSettings();
    applyPayload(data);
  } catch (err) {
    console.error(err);
    showBootError(t("settings.loadError"));
  }
}

function readForm() {
  const next = {};
  for (const key of fields) {
    const el = document.getElementById(key);
    if (!el || (el.closest("[hidden]") && key === "launchAtLogin")) continue;
    if (el.type === "checkbox") {
      next[key] = el.checked;
    } else if (key === "locale") {
      next[key] = el.value;
    } else {
      next[key] = Number.parseInt(el.value, 10);
    }
  }
  if (document.getElementById("launchAtLoginRow")?.hidden) {
    next.launchAtLogin = false;
  }
  if (!next.checkForUpdates) {
    next.autoDownloadUpdates = false;
    next.autoInstallOnQuit = false;
  }
  return next;
}

document.querySelectorAll("[data-preset-work][data-preset-break]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const workMinutes = document.getElementById("workMinutes");
    const breakMinutes = document.getElementById("breakMinutes");
    if (workMinutes) workMinutes.value = btn.dataset.presetWork;
    if (breakMinutes) breakMinutes.value = btn.dataset.presetBreak;
    syncPresetHighlight();
    scheduleAutosave();
  });
});

bindAutosave();

document.getElementById("demoBreak")?.addEventListener("click", async () => {
  try {
    await window.catBreak.startDemoBreak();
    setStatus(t("settings.demoStarted"), "success");
  } catch (err) {
    console.error(err);
    showBootError(t("settings.saveError"));
  }
});

document.getElementById("update-download")?.addEventListener("click", async () => {
  try {
    await window.catBreak?.openUpdateDownload?.();
  } catch (err) {
    console.error(err);
  }
});

document.getElementById("update-later")?.addEventListener("click", () => {
  window.catBreak?.dismissUpdate?.();
});

document.getElementById("check-updates-now")?.addEventListener("click", async () => {
  const btn = document.getElementById("check-updates-now");
  if (btn) btn.disabled = true;
  applyUpdateStatusLine({ phase: "checking" });
  try {
    await window.catBreak?.checkForUpdates?.();
  } catch (err) {
    console.error(err);
    setStatus(t("settings.updateStatusError"), "error");
  } finally {
    if (btn) btn.disabled = false;
  }
});

window.catBreak.onSettingsUpdated((payload) => {
  applyPayload(payload);
});

window.catBreak.onUpdateDialog?.((payload) => {
  showUpdateModal(payload);
});

document.querySelectorAll("[data-update-modal-dismiss]").forEach((el) => {
  el.addEventListener("click", hideUpdateModal);
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", load);
} else {
  load();
}
