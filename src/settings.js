const fields = [
  "locale",
  "workMinutes",
  "breakMinutes",
  "idlePauseMinutes",
  "showExercises",
  "strictBreak",
];

let strings = null;
let activeLocale = "ru";

function t(key) {
  if (!strings) return key;
  const parts = key.split(".");
  let value = strings;
  for (const part of parts) {
    value = value?.[part];
  }
  return typeof value === "string" ? value : key;
}

function applyTranslations(messages, locale) {
  strings = messages;
  activeLocale = locale;
  document.documentElement.lang = locale;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    const text = t(key);
    if (el.tagName === "OPTION") {
      el.textContent = text;
    } else {
      el.textContent = text;
    }
  });
}

function showBootError(message) {
  const status = document.getElementById("status");
  if (status) {
    status.style.color = "#f5a097";
    status.textContent = message;
  }
}

function fillForm(settings) {
  for (const key of fields) {
    const el = document.getElementById(key);
    if (!el) continue;
    if (el.type === "checkbox") {
      el.checked = !!settings[key];
    } else if (el.tagName === "SELECT") {
      el.value = settings[key] ?? "auto";
    } else {
      el.value = settings[key];
    }
  }
}

async function load() {
  if (!window.catBreak?.getSettings) {
    showBootError("Failed to load UI. Please restart the app.");
    return;
  }

  try {
    const data = await window.catBreak.getSettings();
    applyTranslations(data.strings, data.locale);
    fillForm(data.settings);
  } catch (err) {
    console.error(err);
    showBootError(t("settings.loadError"));
  }
}

function readForm() {
  const next = {};
  for (const key of fields) {
    const el = document.getElementById(key);
    if (!el) continue;
    if (el.type === "checkbox") {
      next[key] = el.checked;
    } else if (key === "locale") {
      next[key] = el.value;
    } else {
      next[key] = Number.parseInt(el.value, 10);
    }
  }
  return next;
}

document.getElementById("save")?.addEventListener("click", async () => {
  try {
    await window.catBreak.saveSettings(readForm());
    const status = document.getElementById("status");
    status.style.color = "#8bc48a";
    status.textContent = t("settings.saved");
    setTimeout(() => {
      status.textContent = "";
    }, 2000);
  } catch (err) {
    console.error(err);
    showBootError(t("settings.saveError"));
  }
});

window.catBreak.onSettingsUpdated((payload) => {
  applyTranslations(payload.strings, payload.locale);
  fillForm(payload.settings);
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", load);
} else {
  load();
}
