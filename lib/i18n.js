const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const LOCALES_DIR = path.join(__dirname, "..", "locales");
const cache = new Map();

function resolveLocale(localeSetting) {
  if (localeSetting === "en" || localeSetting === "ru") {
    return localeSetting;
  }
  const sys = app.getLocale?.() || "en";
  return sys.toLowerCase().startsWith("ru") ? "ru" : "en";
}

function loadMessages(locale) {
  if (!cache.has(locale)) {
    const filePath = path.join(LOCALES_DIR, `${locale}.json`);
    cache.set(locale, JSON.parse(fs.readFileSync(filePath, "utf8")));
  }
  return cache.get(locale);
}

function t(messages, key, params = {}) {
  const parts = key.split(".");
  let value = messages;
  for (const part of parts) {
    value = value?.[part];
  }
  if (typeof value !== "string") {
    return key;
  }
  return value.replace(/\{\{(\w+)\}\}/g, (_, name) =>
    params[name] != null ? String(params[name]) : "",
  );
}

function createTranslator(localeSetting) {
  const locale = resolveLocale(localeSetting);
  const messages = loadMessages(locale);

  return {
    locale,
    messages,
    t(key, params) {
      return t(messages, key, params);
    },
  };
}

function clearLocaleCache() {
  cache.clear();
}

module.exports = {
  resolveLocale,
  createTranslator,
  clearLocaleCache,
};
