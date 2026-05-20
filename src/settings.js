const fields = [
  "locale",
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

function applyPayload(data) {
  applyTranslations(data.strings, data.locale);
  applyMeta(data);
  applyLaunchAtLoginVisibility(data.launchAtLoginSupported);
  fillForm(data.settings);
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

document.getElementById("save")?.addEventListener("click", async () => {
  try {
    await window.catBreak.saveSettings(readForm());
    setStatus(t("settings.saved"), "success");
    const status = document.getElementById("status");
    window.setTimeout(() => {
      if (status?.textContent === t("settings.saved")) {
        status.textContent = "";
        status.classList.remove("status--error");
      }
    }, 2200);
  } catch (err) {
    console.error(err);
    showBootError(t("settings.saveError"));
  }
});

window.catBreak.onSettingsUpdated((payload) => {
  applyPayload(payload);
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", load);
} else {
  load();
}
