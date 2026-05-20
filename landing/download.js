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

  const installHint = document.getElementById("install-hint");
  if (installHint) installHint.hidden = false;
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
  if (n.includes("universal"))
    return { en: "macOS · Universal", ru: "macOS · Universal" };
  if (n.includes("arm64") || n.includes("aarch64"))
    return { en: "macOS · Apple Silicon", ru: "macOS · Apple Silicon" };
  if (n.includes("x64") || n.includes("x86_64") || n.includes("intel"))
    return { en: "macOS · Intel (x64)", ru: "macOS · Intel (x64)" };
  const ext = /\.dmg$/i.test(name) ? ".dmg" : /\.zip$/i.test(name) ? ".zip" : "";
  return { en: `macOS · Disk image ${ext}`, ru: `macOS · Образ ${ext}` };
}

/** @param {string} name */
function labelWin(name) {
  const n = name.toLowerCase();
  if (n.includes("portable"))
    return { en: "Windows · Portable (x64)", ru: "Windows · Portable (x64)" };
  if (n.includes("arm64") || n.includes("aarch64"))
    return { en: "Windows · Installer (arm64)", ru: "Windows · Установщик (arm64)" };
  if (n.includes("setup"))
    return {
      en: "Windows · Installer (NSIS, x64 + arm64)",
      ru: "Windows · Установщик (NSIS, x64 + arm64)",
    };
  if (n.includes("x64") || n.includes("x86_64"))
    return { en: "Windows · Installer (x64)", ru: "Windows · Установщик (x64)" };
  if (/\.exe$/i.test(name))
    return {
      en: "Windows · Portable (x64, no install)",
      ru: "Windows · Portable (x64, без установки)",
    };
  return { en: `Windows · ${name}`, ru: `Windows · ${name}` };
}

/** @param {string} name */
function labelLinux(name) {
  const n = name.toLowerCase();
  if (/\.appimage$/i.test(name)) {
    if (n.includes("arm64") || n.includes("aarch64"))
      return { en: "Linux · AppImage (arm64)", ru: "Linux · AppImage (arm64)" };
    return { en: "Linux · AppImage (x86_64)", ru: "Linux · AppImage (x86_64)" };
  }
  if (/\.deb$/i.test(name)) {
    if (n.includes("arm64") || n.includes("aarch64"))
      return { en: "Linux · deb (arm64)", ru: "Linux · deb (arm64)" };
    if (n.includes("amd64") || n.includes("x64") || n.includes("x86_64"))
      return { en: "Linux · deb (amd64)", ru: "Linux · deb (amd64)" };
    return { en: "Linux · deb", ru: "Linux · deb" };
  }
  return { en: `Linux · ${name}`, ru: `Linux · ${name}` };
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
    if (n.includes("universal")) return 0;
    if (n.includes("arm64") || n.includes("aarch64")) return 1;
    if (n.includes("x64") || n.includes("x86_64") || n.includes("intel")) return 2;
    return 3;
  };
  return [...list].sort((a, b) => score(a.name) - score(b.name));
}

/** @param {GHAsset[]} list */
function sortWin(list) {
  const score = (name) => {
    const n = name.toLowerCase();
    const portableLike =
      n.includes("portable") || (!n.includes("setup") && /\.exe$/i.test(name));
    if (portableLike) return 2;
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

function currentLang() {
  return document.documentElement.lang === "ru" ? "ru" : "en";
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

  if (menus.mac) fillMenu(menus.mac, sortMac(bins.mac), labelMac);
  if (menus.win) fillMenu(menus.win, sortWin(bins.win), labelWin);
  if (menus.linux) fillMenu(menus.linux, sortLinux(bins.linux), labelLinux);

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
  if (el) el.hidden = !on;
}

async function injectLatestRelease() {
  toggleLoading(true);
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
}

document.addEventListener("DOMContentLoaded", () => {
  initLangSwitch();
  initPlatformPickers();
  injectLatestRelease();

  document.querySelectorAll("[data-releases-link]").forEach((a) => {
    a.href = RELEASES_HTML;
  });
});
