"use strict";

const REPO_OWNER = "anatoly-kulishov";
const REPO_NAME = "CatBreak";
const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const RELEASES_HTML = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

/** @typedef {{ name: string; browser_download_url: string }} GHAsset */

/** @type {{ assets: GHAsset[] } | null} */
let lastReleasePayload = null;
/** @type {boolean} */
let releaseFetchAttempted = false;
/** @type {"mac"|"win"|"linux"|null} */
let detectedPlatform = null;

/** @returns {"mac"|"win"|"linux"|null} */
function detectPlatform() {
  const ua = navigator.userAgent || "";
  const plat = navigator.platform || "";

  if (/Win/i.test(plat) || /Windows/i.test(ua)) return "win";

  const isApple =
    /Mac/i.test(plat) ||
    /Macintosh|Mac OS X/i.test(ua) ||
    (plat === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isApple) return "mac";

  if (/Linux/i.test(plat) || /Linux/i.test(ua)) {
    if (/Android/i.test(ua)) return null;
    return "linux";
  }
  if (/CrOS/i.test(ua)) return "linux";

  return null;
}

function applyPlatformUI() {
  detectedPlatform = detectPlatform();

  document.querySelectorAll(".platform-picker").forEach((root) => {
    const platform = root.getAttribute("data-platform");
    const match = platform !== null && platform === detectedPlatform;
    root.classList.toggle("platform-picker--detected", match);

    const toggle = root.querySelector(".platform-picker__toggle");
    if (toggle instanceof HTMLButtonElement) {
      toggle.setAttribute("data-detected", match ? "true" : "false");
      const lang = currentLang();
      if (match) {
        const labels = {
          mac: { en: "macOS (your system)", ru: "macOS (ваша система)" },
          win: { en: "Windows (your system)", ru: "Windows (ваша система)" },
          linux: { en: "Linux (your system)", ru: "Linux (ваша система)" },
        };
        const key = platform && labels[platform];
        if (key) toggle.setAttribute("aria-label", lang === "ru" ? key.ru : key.en);
        else toggle.removeAttribute("aria-label");
      } else {
        toggle.removeAttribute("aria-label");
      }
    }
  });

  const hintKey = detectedPlatform ?? "any";
  const lang = currentLang();
  document.querySelectorAll("[data-os-hint]").forEach((el) => {
    const hint = el.getAttribute("data-os-hint");
    const panelLang = el.getAttribute("data-lang-panel");
    el.hidden = hint !== hintKey || panelLang !== lang;
  });

  const faq = document.getElementById("faq");
  if (faq) faq.hidden = false;
}

function isSkippedFilename(name) {
  return /blockmap|\.ya?ml$/i.test(name);
}

/** @returns {GHAsset[]} */
function filterAssets(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((a) => a?.name && a?.browser_download_url && !isSkippedFilename(a.name));
}

/** @param {string} name */
function labelMac(name) {
  const n = name.toLowerCase();
  const dmg = /\.dmg$/i.test(name);
  const zip = /\.zip$/i.test(name);
  const fmt =
    dmg || zip
      ? dmg
        ? { en: " · DMG", ru: " · DMG" }
        : { en: " · ZIP", ru: " · ZIP" }
      : { en: "", ru: "" };

  if (n.includes("universal"))
    return {
      en: `Universal${fmt.en}`,
      ru: `Universal${fmt.ru}`,
    };
  if (n.includes("arm64") || n.includes("aarch64"))
    return {
      en: `Apple Silicon${fmt.en}`,
      ru: `Apple Silicon${fmt.ru}`,
    };
  if (n.includes("x64") || n.includes("x86_64") || n.includes("intel"))
    return {
      en: `Intel (x64)${fmt.en}`,
      ru: `Intel (x64)${fmt.ru}`,
    };
  const ext = dmg ? ".dmg" : zip ? ".zip" : "";
  return { en: `Disk image ${ext}`, ru: `Образ ${ext}` };
}

/** @param {string} name */
function labelWin(name) {
  const n = name.toLowerCase();
  if (n.includes("portable"))
    return { en: "Portable (x64)", ru: "Portable (x64)" };
  if (n.includes("arm64") || n.includes("aarch64"))
    return { en: "Installer (arm64)", ru: "Установщик (arm64)" };
  if (n.includes("setup"))
    return {
      en: "Installer (NSIS, x64 + arm64)",
      ru: "Установщик (NSIS, x64 + arm64)",
    };
  if (n.includes("x64") || n.includes("x86_64") || n.includes("intel"))
    return { en: "Installer (x64)", ru: "Установщик (x64)" };
  if (/^Cat-Break-\d+\.\d+\.\d+\.exe$/i.test(name))
    return {
      en: "Installer (universal)",
      ru: "Установщик (universal)",
    };
  if (/\.exe$/i.test(name))
    return { en: "Windows build", ru: "Сборка Windows" };
  return { en: name, ru: name };
}

/** @param {string} name */
function labelLinux(name) {
  const n = name.toLowerCase();
  if (/\.appimage$/i.test(name)) {
    if (n.includes("arm64") || n.includes("aarch64"))
      return { en: "AppImage (arm64)", ru: "AppImage (arm64)" };
    return { en: "AppImage (x64)", ru: "AppImage (x64)" };
  }
  if (/\.deb$/i.test(name)) {
    if (n.includes("arm64") || n.includes("aarch64"))
      return { en: "deb (arm64)", ru: "deb (arm64)" };
    if (n.includes("amd64") || n.includes("x64") || n.includes("x86_64"))
      return { en: "deb (x64)", ru: "deb (x64)" };
    return { en: "deb", ru: "deb" };
  }
  return { en: name, ru: name };
}

/**
 * @param {GHAsset[]} assets
 */
function categorize(assets) {
  const mac = assets.filter((a) => {
    const n = a.name;
    if (/\.dmg$/i.test(n)) return true;
    if (!/\.zip$/i.test(n)) return false;
    const low = n.toLowerCase();
    if (/mac|darwin/.test(low)) return true;
    if (/win|linux|nsis|appimage|\.deb/.test(low)) return false;
    return /arm64|aarch64|x64|x86_64|intel|universal/.test(low);
  });
  const win = assets.filter((a) => /\.exe$/i.test(a.name));
  const linux = assets.filter((a) => /\.(AppImage|deb)$/i.test(a.name));
  return { mac, win, linux };
}

/** @param {GHAsset[]} list */
function sortMac(list) {
  const score = (name) => {
    const n = name.toLowerCase();
    let base = 3;
    if (n.includes("universal")) base = 0;
    else if (n.includes("arm64") || n.includes("aarch64")) base = 1;
    else if (n.includes("x64") || n.includes("x86_64") || n.includes("intel")) base = 2;
    const fmtOrder = /\.dmg$/i.test(name) ? 0 : /\.zip$/i.test(name) ? 1 : 2;
    return base * 10 + fmtOrder;
  };
  return [...list].sort((a, b) => score(a.name) - score(b.name) || a.name.localeCompare(b.name));
}

/** @param {GHAsset[]} list */
function sortWin(list) {
  const score = (name) => {
    const n = name.toLowerCase();
    if (n.includes("portable")) return 2;
    if (n.includes("arm64") || n.includes("aarch64")) return 1;
    return 0;
  };
  return [...list].sort((a, b) => score(a.name) - score(b.name) || a.name.localeCompare(b.name));
}

/** @param {GHAsset[]} list */
function sortLinux(list) {
  const score = (name) => {
    const n = name.toLowerCase();
    const deb = /\.deb$/i.test(name);
    const ai = /\.appimage$/i.test(name);
    const arm = n.includes("arm64") || n.includes("aarch64");
    let s = deb ? 0 : ai ? 2 : 10;
    s += arm ? 1 : 0;
    return s;
  };
  return [...list].sort((a, b) => score(a.name) - score(b.name) || a.name.localeCompare(b.name));
}

/** Prefer canonical Cat-Break-* names over Cat.Break.* duplicates from parallel CI uploads. */
function assetNameScore(name) {
  let score = 0;
  if (/^Cat-Break-/i.test(name)) score += 20;
  if (/^cat-break-desktop_/i.test(name)) score += 18;
  if (/Cat\.Break/i.test(name)) score -= 10;
  return score;
}

/** @param {GHAsset} a @param {GHAsset} b */
function preferAsset(a, b) {
  const diff = assetNameScore(a.name) - assetNameScore(b.name);
  if (diff !== 0) return diff > 0 ? a : b;
  return a.name.length <= b.name.length ? a : b;
}

/**
 * @param {GHAsset[]} list
 * @param {(name: string) => string} keyFn
 */
function dedupeAssets(list, keyFn) {
  const map = new Map();
  for (const asset of list) {
    const key = keyFn(asset.name);
    const prev = map.get(key);
    map.set(key, prev ? preferAsset(asset, prev) : asset);
  }
  return [...map.values()];
}

/** @param {string} name */
function macAssetKey(name) {
  const n = name.toLowerCase();
  const fmt = /\.dmg$/i.test(name) ? "dmg" : /\.zip$/i.test(name) ? "zip" : "other";
  if (fmt === "other") return `other:${name}`;
  let arch = "generic";
  if (n.includes("universal")) arch = "universal";
  else if (n.includes("arm64") || n.includes("aarch64")) arch = "arm64";
  else if (n.includes("x64") || n.includes("x86_64") || n.includes("intel")) arch = "x64";
  return `${arch}:${fmt}`;
}

/** @param {string} name */
function winAssetKey(name) {
  const n = name.toLowerCase();
  if (n.includes("portable")) return "portable:x64";
  if (n.includes("setup")) {
    return n.includes("arm64") || n.includes("aarch64") ? "setup:arm64" : "setup:nsis";
  }
  if (n.includes("arm64") || n.includes("aarch64")) return "nsis:arm64";
  if (n.includes("x64") || n.includes("x86_64") || n.includes("intel")) return "nsis:x64";
  if (/^Cat-Break-\d+\.\d+\.\d+\.exe$/i.test(name)) return "nsis:universal";
  return `other:${name}`;
}

/** @param {string} name */
function linuxAssetKey(name) {
  const n = name.toLowerCase();
  const fmt = /\.appimage$/i.test(name) ? "appimage" : /\.deb$/i.test(name) ? "deb" : "other";
  if (fmt === "other") return `other:${name}`;
  let arch = "x64";
  if (n.includes("arm64") || n.includes("aarch64")) arch = "arm64";
  return `${arch}:${fmt}`;
}

function currentLang() {
  return document.documentElement.lang === "ru" ? "ru" : "en";
}

const LOADING_LABELS = {
  en: "Fetching release…",
  ru: "Загрузка релиза…",
};

const COPY_LABELS = {
  en: { copy: "Copy", copied: "Copied", failed: "Copy failed" },
  ru: { copy: "Скопировать", copied: "Скопировано", failed: "Не удалось" },
};

/** @type {Record<"en"|"ru", string[]>} */
const FOOTER_QUIPS = {
  en: [
    "Rest those eyes · meow",
    "The tray cat believes in you",
    "Blink more, zoom less",
    "Paws off the keyboard for a minute",
    "Your eyes called — they want a break",
    "Cat-approved break reminders",
  ],
  ru: [
    "Берегите глазки · мур",
    "Котик из трея верит в вас",
    "Моргайте чаще, зумьте меньше",
    "Лапки с клавиатуры — на минуту",
    "Глаза просят перерыв",
    "Перерывы с одобрения кота",
  ],
};

function pickFooterQuip(lng) {
  const list = FOOTER_QUIPS[lng];
  if (!list?.length) return "";
  return list[Math.floor(Math.random() * list.length)];
}

function applyFooterQuip(lng) {
  document.querySelectorAll("[data-footer-quip]").forEach((el) => {
    const panel = el.closest("[data-lang-panel]");
    if (!(panel instanceof HTMLElement)) return;
    el.textContent = panel.getAttribute("data-lang-panel") === lng ? pickFooterQuip(lng) : "";
  });
}

const MACOS_QUARANTINE_CMD = 'xattr -cr "/Applications/Cat Break.app"';

function copyLabels() {
  return COPY_LABELS[currentLang()] ?? COPY_LABELS.en;
}

function fallbackCopyText(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(area);
  return ok;
}

async function copyCommandText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  if (!fallbackCopyText(text)) {
    throw new Error("copy failed");
  }
}

function setCopyButtonIdle(btn) {
  const labels = copyLabels();
  btn.textContent = labels.copy;
  btn.classList.remove("copy-command__btn--done");
  btn.disabled = false;
}

function initCopyCommands() {
  document.querySelectorAll(".copy-command__btn[data-copy-text]").forEach((btn) => {
    if (!(btn instanceof HTMLButtonElement)) return;
    const text = btn.dataset.copyText || MACOS_QUARANTINE_CMD;
    btn.dataset.copyText = text;

    btn.addEventListener("click", async () => {
      const labels = copyLabels();
      try {
        await copyCommandText(text);
        btn.textContent = labels.copied;
        btn.classList.add("copy-command__btn--done");
        window.setTimeout(() => setCopyButtonIdle(btn), 2000);
      } catch {
        btn.textContent = labels.failed;
        window.setTimeout(() => setCopyButtonIdle(btn), 2200);
      }
    });
  });
}

function syncLoadingLabel() {
  const label = document.getElementById("download-loading-label");
  const wrap = document.getElementById("download-status");
  if (!label || !wrap || wrap.hidden) return;
  label.textContent = LOADING_LABELS[currentLang()] ?? LOADING_LABELS.en;
}

function setVersionPillPending(on) {
  document.getElementById("latest-version")?.classList.toggle("version-pill--pending", on);
}

/**
 * @param {HTMLUListElement} ul
 * @param {GHAsset[]} items
 * @param {(name: string) => { en: string; ru: string }} labeller
 */
function fillMenu(ul, items, labeller) {
  ul.replaceChildren();
  const lang = currentLang();
  if (items.length === 0) {
    const li = document.createElement("li");
    li.setAttribute("role", "none");
    const a = document.createElement("a");
    a.href = RELEASES_HTML;
    a.setAttribute("role", "menuitem");
    a.textContent =
      lang === "ru" ? "Открыть релиз (Assets)" : "Open release (Assets)";
    li.appendChild(a);
    ul.appendChild(li);
    return;
  }
  for (const asset of items) {
    const li = document.createElement("li");
    li.setAttribute("role", "none");
    const a = document.createElement("a");
    a.href = asset.browser_download_url;
    a.setAttribute("role", "menuitem");
    const lbl = labeller(asset.name);
    a.textContent = lang === "ru" ? lbl.ru : lbl.en;
    a.title = asset.name;
    li.appendChild(a);
    ul.appendChild(li);
  }
}

function closeAllPlatformMenus() {
  document.querySelectorAll(".platform-picker").forEach((root) => {
    const menu = root.querySelector(".platform-picker__menu");
    const toggle = root.querySelector(".platform-picker__toggle");
    if (menu) menu.hidden = true;
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    root.classList.remove("platform-picker--open");
  });
}

function renderPlatformMenus() {
  const assets = lastReleasePayload?.assets ?? [];
  const bins = categorize(assets);

  /** @type {Record<string, HTMLUListElement | null>} */
  const menus = {
    mac: document.querySelector('.platform-picker[data-platform="mac"] .platform-picker__menu'),
    win: document.querySelector('.platform-picker[data-platform="win"] .platform-picker__menu'),
    linux: document.querySelector('.platform-picker[data-platform="linux"] .platform-picker__menu'),
  };

  if (menus.mac) fillMenu(menus.mac, sortMac(dedupeAssets(bins.mac, macAssetKey)), labelMac);
  if (menus.win) fillMenu(menus.win, sortWin(dedupeAssets(bins.win, winAssetKey)), labelWin);
  if (menus.linux) {
    fillMenu(menus.linux, sortLinux(dedupeAssets(bins.linux, linuxAssetKey)), labelLinux);
  }

  const empty = bins.mac.length + bins.win.length + bins.linux.length === 0;
  const note = document.getElementById("download-note");
  if (!note) return;
  if (!releaseFetchAttempted) note.hidden = true;
  else if (lastReleasePayload === null) note.hidden = false;
  else note.hidden = !empty;
}

function initPlatformPickers() {
  document.querySelectorAll(".platform-picker").forEach((root) => {
    const toggle = root.querySelector(".platform-picker__toggle");
    const menu = root.querySelector(".platform-picker__menu");
    if (!toggle || !(menu instanceof HTMLUListElement)) return;

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const opening = menu.hidden;
      closeAllPlatformMenus();
      if (opening) {
        menu.hidden = false;
        toggle.setAttribute("aria-expanded", "true");
        root.classList.add("platform-picker--open");
      }
    });
  });

  document.addEventListener("click", () => closeAllPlatformMenus());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllPlatformMenus();
  });

  renderPlatformMenus();
}

function toggleLoading(on) {
  const el = document.getElementById("download-status");
  if (!el) return;
  el.hidden = !on;
  if (on) syncLoadingLabel();
}

async function injectLatestRelease() {
  toggleLoading(true);
  setVersionPillPending(true);
  closeAllPlatformMenus();
  try {
    const res = await fetch(API_URL, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);

    const data = await res.json();
    const tag = typeof data.tag_name === "string" ? data.tag_name : "";
    const versionEl = document.getElementById("latest-version");
    if (versionEl) versionEl.textContent = tag || "—";

    lastReleasePayload = { assets: filterAssets(data.assets) };
  } catch {
    lastReleasePayload = null;
    const versionEl = document.getElementById("latest-version");
    if (versionEl) versionEl.textContent = "?";
  } finally {
    releaseFetchAttempted = true;
    setVersionPillPending(false);
    renderPlatformMenus();
    toggleLoading(false);
  }
}

function initLangSwitch() {
  let stored = null;
  try {
    stored = localStorage.getItem("catbreak-lang");
  } catch {
    // ignore
  }
  const initial = stored === "en" || stored === "ru" ? stored : navigator.language.startsWith("ru") ? "ru" : "en";
  applyLang(initial);

  document.querySelectorAll("[data-lang-set]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lng = btn.getAttribute("data-lang-set");
      if (lng === "en" || lng === "ru") applyLang(lng);
    });
  });
}

/** @param {"en"|"ru"} lng */
function applyLang(lng) {
  document.documentElement.lang = lng;
  document.querySelectorAll("[data-lang-panel]").forEach((panel) => {
    if (panel.hasAttribute("data-os-hint")) return;
    panel.hidden = panel.getAttribute("data-lang-panel") !== lng;
  });
  document.querySelectorAll("[data-lang-set]").forEach((btn) => {
    btn.setAttribute("aria-selected", btn.getAttribute("data-lang-set") === lng ? "true" : "false");
  });
  try {
    localStorage.setItem("catbreak-lang", lng);
  } catch {
    // ignore
  }

  renderPlatformMenus();
  applyPlatformUI();

  /** @type {Record<string, { en: string; ru: string }>} */
  const toggles = {
    mac: { en: "macOS", ru: "macOS" },
    win: { en: "Windows", ru: "Windows" },
    linux: { en: "Linux", ru: "Linux" },
  };
  document.querySelectorAll("[data-i18n-toggle]").forEach((el) => {
    const key = el.getAttribute("data-i18n-toggle");
    const pair = key && toggles[key];
    if (!pair || !(el instanceof HTMLElement)) return;
    if (key === detectedPlatform) {
      el.textContent = lng === "ru" ? `${pair.ru} · ваша система` : `${pair.en} · your system`;
    } else {
      el.textContent = lng === "ru" ? pair.ru : pair.en;
    }
  });

  syncLoadingLabel();
  document.querySelectorAll(".copy-command__btn[data-copy-text]").forEach((btn) => {
    if (btn instanceof HTMLButtonElement && !btn.classList.contains("copy-command__btn--done")) {
      btn.textContent = COPY_LABELS[lng]?.copy ?? COPY_LABELS.en.copy;
    }
  });

  applyFooterQuip(lng);
}

function initFaqAccordion() {
  document.querySelectorAll(".faq-list").forEach((list) => {
    list.querySelectorAll(".faq-item").forEach((item) => {
      item.addEventListener("toggle", () => {
        if (!item.open) return;
        list.querySelectorAll(".faq-item").forEach((other) => {
          if (other !== item) other.open = false;
        });
      });
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initLangSwitch();
  initPlatformPickers();
  initCopyCommands();
  initFaqAccordion();
  injectLatestRelease();

  document.querySelectorAll("[data-releases-link]").forEach((a) => {
    a.href = RELEASES_HTML;
  });
});
