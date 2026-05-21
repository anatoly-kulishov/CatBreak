const fields = [
  "locale",
  "checkForUpdates",
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

function applyUpdateBanner(update) {
  const banner = document.getElementById("update-banner");
  const title = document.getElementById("update-banner-title");
  const hint = document.getElementById("update-banner-hint");
  const asset = document.getElementById("update-banner-asset");
  const progressWrap = document.getElementById("update-progress-wrap");
  const progressBar = document.getElementById("update-progress-bar");
  const progressLabel = document.getElementById("update-progress-label");
  const actionBtn = document.getElementById("update-download");
  if (!banner || !title) return;

  if (!update?.version || update.dismissed) {
    banner.hidden = true;
    return;
  }

  banner.hidden = false;
  title.textContent = t("settings.updateBannerTitle", { version: update.version });

  if (hint) {
    hint.textContent = t(getUpdateHintKey(update));
  }

  if (actionBtn) {
    actionBtn.textContent = getUpdateActionLabel(update);
    actionBtn.disabled = update.source === "auto" && update.status === "downloading";
  }

  const showProgress =
    update.source === "auto" &&
    update.status === "downloading" &&
    update.percent != null;
  if (progressWrap) {
    progressWrap.hidden = !showProgress;
  }
  if (showProgress && progressBar && progressLabel) {
    const pct = Math.min(100, Math.max(0, update.percent));
    progressBar.style.width = `${pct}%`;
    progressLabel.textContent = t("settings.updateProgress", { percent: pct });
  }

  if (asset) {
    if (update.source === "manual" && update.downloadName) {
      asset.hidden = false;
      asset.textContent = t("settings.updateAsset", { name: update.downloadName });
    } else {
      asset.hidden = true;
      asset.textContent = "";
    }
  }
}

function applyPayload(data) {
  applyTranslations(data.strings, data.locale);
  applyMeta(data);
  applyLaunchAtLoginVisibility(data.launchAtLoginSupported);
  fillForm(data.settings);
  applyUpdateBanner(data.update);
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
  return next;
}

document.querySelectorAll("[data-preset-work][data-preset-break]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const workMinutes = document.getElementById("workMinutes");
    const breakMinutes = document.getElementById("breakMinutes");
    if (workMinutes) workMinutes.value = btn.dataset.presetWork;
    if (breakMinutes) breakMinutes.value = btn.dataset.presetBreak;
  });
});

document.getElementById("save")?.addEventListener("click", async () => {
  try {
    await window.catBreak.saveSettings(readForm());
    const savedMsg = savedStatusMessage();
    setStatus(savedMsg, "success");
    const status = document.getElementById("status");
    window.setTimeout(() => {
      if (status?.textContent === savedMsg) {
        status.textContent = "";
        status.classList.remove("status--error");
      }
    }, 2200);
  } catch (err) {
    console.error(err);
    showBootError(t("settings.saveError"));
  }
});

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

window.catBreak.onSettingsUpdated((payload) => {
  applyPayload(payload);
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", load);
} else {
  load();
}
