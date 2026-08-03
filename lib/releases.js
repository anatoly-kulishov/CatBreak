const https = require("https");
const {
  filterAssets,
  parseVersion,
  compareVersions,
  matchesArch,
  groupPlatformAssets,
} = require("./release-assets");

const REPO_OWNER = "anatoly-kulishov";
const REPO_NAME = "CatBreak";
const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const RELEASES_LATEST_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

function getRuntimePlatform() {
  if (process.platform === "darwin") return "mac";
  if (process.platform === "win32") return "win";
  if (process.platform === "linux") return "linux";
  return null;
}

/** @param {{ name: string; browser_download_url: string }[]} assets */
function pickAssetForRuntime(assets) {
  const { filtered, mac, win, linux } = groupPlatformAssets(assets);
  const plat = getRuntimePlatform();
  const arch = process.arch;

  if (plat === "mac") {
    if (!mac.length) return null;
    const dmg = mac.filter((a) => /\.dmg$/i.test(a.name));
    const pool = dmg.length ? dmg : mac;
    return pool.find((a) => matchesArch(a.name, arch)) || pool[0] || mac[0];
  }

  if (plat === "win") {
    if (!win.length) return null;
    const installers = win.filter((a) => /setup/i.test(a.name));
    const pool = installers.length ? installers : win;
    return pool.find((a) => matchesArch(a.name, arch)) || pool[0] || win[0];
  }

  if (plat === "linux") {
    if (!linux.length) return null;
    const appImages = linux.filter((a) => /\.appimage$/i.test(a.name));
    const pool = appImages.length ? appImages : linux;
    return pool.find((a) => matchesArch(a.name, arch)) || pool[0] || linux[0];
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
  categorize: require("./release-assets").categorize,
  sortMac: require("./release-assets").sortMac,
  sortWin: require("./release-assets").sortWin,
  sortLinux: require("./release-assets").sortLinux,
  matchesArch,
  groupPlatformAssets,
  fetchLatestRelease,
  pickAssetForRuntime,
  getRuntimePlatform,
};
