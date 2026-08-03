const https = require("https");

const REPO_OWNER = "anatoly-kulishov";
const REPO_NAME = "CatBreak";
const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const RELEASES_LATEST_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

function isSkippedFilename(name) {
  return /blockmap|\.ya?ml$/i.test(name);
}

function filterAssets(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((a) => a?.name && a?.browser_download_url && !isSkippedFilename(a.name));
}

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

function sortWin(list) {
  const score = (name) => {
    const n = name.toLowerCase();
    if (n.includes("portable")) return 2;
    if (n.includes("arm64") || n.includes("aarch64")) return 1;
    return 0;
  };
  return [...list].sort((a, b) => score(a.name) - score(b.name) || a.name.localeCompare(b.name));
}

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

/** @param {string} tag */
function parseVersion(tag) {
  if (!tag || typeof tag !== "string") return null;
  const m = tag.trim().match(/v?(\d+\.\d+\.\d+)/i);
  return m ? m[1] : null;
}

/** @param {string} a @param {string} b */
function compareVersions(a, b) {
  const pa = parseVersion(a) || a;
  const pb = parseVersion(b) || b;
  const sa = String(pa).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const sb = String(pb).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(sa.length, sb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (sa[i] || 0) - (sb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function getRuntimePlatform() {
  if (process.platform === "darwin") return "mac";
  if (process.platform === "win32") return "win";
  if (process.platform === "linux") return "linux";
  return null;
}

function matchesArch(name, arch) {
  const n = name.toLowerCase();
  if (arch === "arm64") {
    return n.includes("arm64") || n.includes("aarch64") || n.includes("universal");
  }
  if (arch === "x64") {
    return (
      n.includes("x64") ||
      n.includes("x86_64") ||
      n.includes("amd64") ||
      n.includes("intel") ||
      n.includes("universal")
    );
  }
  return true;
}

function assetNameScore(name) {
  let score = 0;
  if (/^Cat-Break-/i.test(name)) score += 20;
  if (/^cat-break-desktop_/i.test(name)) score += 18;
  if (/Cat\.Break/i.test(name)) score -= 10;
  return score;
}

function preferAsset(a, b) {
  const diff = assetNameScore(a.name) - assetNameScore(b.name);
  if (diff !== 0) return diff > 0 ? a : b;
  return a.name.length <= b.name.length ? a : b;
}

function dedupeAssets(list, keyFn) {
  const map = new Map();
  for (const asset of list) {
    const key = keyFn(asset.name);
    const prev = map.get(key);
    map.set(key, prev ? preferAsset(asset, prev) : asset);
  }
  return [...map.values()];
}

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

function linuxAssetKey(name) {
  const n = name.toLowerCase();
  const fmt = /\.appimage$/i.test(name) ? "appimage" : /\.deb$/i.test(name) ? "deb" : "other";
  if (fmt === "other") return `other:${name}`;
  let arch = "x64";
  if (n.includes("arm64") || n.includes("aarch64")) arch = "arm64";
  return `${arch}:${fmt}`;
}

/** @param {{ name: string; browser_download_url: string }[]} assets */
function pickAssetForRuntime(assets) {
  const filtered = filterAssets(assets);
  const bins = categorize(filtered);
  const plat = getRuntimePlatform();
  const arch = process.arch;

  if (plat === "mac") {
    const list = sortMac(dedupeAssets(bins.mac, macAssetKey));
    if (!list.length) return null;
    const dmg = list.filter((a) => /\.dmg$/i.test(a.name));
    const pool = dmg.length ? dmg : list;
    return (
      pool.find((a) => matchesArch(a.name, arch)) ||
      pool[0] ||
      list[0]
    );
  }

  if (plat === "win") {
    const list = sortWin(dedupeAssets(bins.win, winAssetKey));
    if (!list.length) return null;
    const installers = list.filter((a) => /setup/i.test(a.name));
    const pool = installers.length ? installers : list;
    return (
      pool.find((a) => matchesArch(a.name, arch)) ||
      pool[0] ||
      list[0]
    );
  }

  if (plat === "linux") {
    const list = sortLinux(dedupeAssets(bins.linux, linuxAssetKey));
    if (!list.length) return null;
    const appImages = list.filter((a) => /\.appimage$/i.test(a.name));
    const pool = appImages.length ? appImages : list;
    return (
      pool.find((a) => matchesArch(a.name, arch)) ||
      pool[0] ||
      list[0]
    );
  }

  return filtered[0] || null;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "CatBreak-Desktop",
        },
      },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const next = res.headers.location;
          res.resume();
          if (!next) {
            reject(new Error(`Redirect without location (${res.statusCode})`));
            return;
          }
          fetchJson(next).then(resolve, reject);
          return;
        }

        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch (err) {
              reject(err);
            }
            return;
          }
          reject(new Error(`GitHub API ${res.statusCode}`));
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error("GitHub API timeout"));
    });
  });
}

async function fetchLatestRelease() {
  const data = await fetchJson(API_URL);
  const tag = data.tag_name || "";
  const version = parseVersion(tag);
  const assets = filterAssets(data.assets);
  const asset = pickAssetForRuntime(assets);

  return {
    tag,
    version,
    name: data.name || tag,
    body: typeof data.body === "string" ? data.body : "",
    htmlUrl: data.html_url || RELEASES_LATEST_URL,
    assets,
    downloadUrl: asset?.browser_download_url || data.html_url || RELEASES_LATEST_URL,
    downloadName: asset?.name || null,
  };
}

module.exports = {
  REPO_OWNER,
  REPO_NAME,
  API_URL,
  RELEASES_LATEST_URL,
  parseVersion,
  compareVersions,
  filterAssets,
  categorize,
  sortMac,
  sortWin,
  sortLinux,
  matchesArch,
  fetchLatestRelease,
  pickAssetForRuntime,
  getRuntimePlatform,
};
