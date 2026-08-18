#!/usr/bin/env node
/**
 * Version source of truth: package.json (MAJOR.MINOR.PATCH only).
 *
 *   node scripts/version.js check
 *   node scripts/version.js check --release
 *   node scripts/version.js bump patch|minor|major
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const pkgPath = path.join(root, "package.json");
const lockPath = path.join(root, "package-lock.json");
const changelogPath = path.join(root, "CHANGELOG.md");
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parse(raw) {
  const value = String(raw || "")
    .trim()
    .replace(/^v/i, "");
  const match = value.match(SEMVER);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw: `${match[1]}.${match[2]}.${match[3]}`,
  };
}

function cmp(a, b) {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

function nextFrom(from) {
  return {
    patch: `${from.major}.${from.minor}.${from.patch + 1}`,
    minor: `${from.major}.${from.minor + 1}.0`,
    major: `${from.major + 1}.0.0`,
  };
}

function readPkgVersion() {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const version = parse(pkg.version);
  if (!version) fail(`package.json version must be MAJOR.MINOR.PATCH, got ${pkg.version}`);
  return version;
}

function readLockVersion() {
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  const rootVersion = parse(lock.version);
  const pkgVersion = parse(lock.packages?.[""]?.version);
  if (!rootVersion || !pkgVersion) fail("package-lock.json is missing a MAJOR.MINOR.PATCH version");
  if (rootVersion.raw !== pkgVersion.raw) {
    fail(`package-lock.json versions differ: ${rootVersion.raw} vs packages[""].${pkgVersion.raw}`);
  }
  return rootVersion;
}

function changelogHas(version) {
  const md = fs.readFileSync(changelogPath, "utf8");
  return new RegExp(`^## \\[${version}\\]`, "m").test(md);
}

function latestGitTag() {
  let out = "";
  try {
    out = execFileSync("git", ["tag", "-l", "v*"], { cwd: root, encoding: "utf8" });
  } catch {
    return null;
  }
  const versions = out
    .split("\n")
    .map((line) => parse(line))
    .filter(Boolean)
    .sort(cmp);
  return versions.length ? versions[versions.length - 1] : null;
}

function check({ release = false, tag = null } = {}) {
  const pkg = readPkgVersion();
  const lock = readLockVersion();
  if (pkg.raw !== lock.raw) {
    fail(`package.json is ${pkg.raw} but package-lock.json is ${lock.raw}`);
  }
  if (!changelogHas(pkg.raw)) {
    fail(`CHANGELOG.md has no "## [${pkg.raw}]" section`);
  }
  if (tag) {
    const tagged = parse(tag);
    if (!tagged) fail(`Tag must be vMAJOR.MINOR.PATCH, got ${tag}`);
    if (tagged.raw !== pkg.raw) {
      fail(`Tag ${tag} does not match package.json ${pkg.raw}`);
    }
  }
  if (release) {
    const latest = latestGitTag();
    if (!latest) fail("No v* git tags found. Fetch tags or create v0.0.0 first.");
    if (pkg.raw === latest.raw) {
      fail(`${pkg.raw} is already tagged. Bump with: npm run bump:patch`);
    }
    const allowed = nextFrom(latest);
    if (!Object.values(allowed).includes(pkg.raw)) {
      fail(
        `${pkg.raw} is not the next version after ${latest.raw}. Allowed: ${allowed.patch} (patch), ${allowed.minor} (minor), ${allowed.major} (major).`,
      );
    }
  }
  console.log(`version ok: ${pkg.raw}`);
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

function writeVersion(next) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.version = next;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  lock.version = next;
  if (lock.packages?.[""]) lock.packages[""].version = next;
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}

function prependChangelog(next) {
  if (changelogHas(next)) return;
  const md = fs.readFileSync(changelogPath, "utf8");
  const block = `## [${next}] - ${isoDate()}\n\n### Changed\n\n- \n`;
  const updated = md.replace(/^# Changelog\s*/, `# Changelog\n\n${block}`);
  fs.writeFileSync(changelogPath, updated);
}

function bump(kind) {
  if (!["patch", "minor", "major"].includes(kind)) {
    fail("Usage: node scripts/version.js bump patch|minor|major");
  }
  const pkg = readPkgVersion();
  const latest = latestGitTag();
  const base = latest && cmp(latest, pkg) >= 0 ? latest : pkg;
  const next = nextFrom(base)[kind];
  writeVersion(next);
  prependChangelog(next);
  console.log(`${pkg.raw} -> ${next}`);
}

const [, , cmd, arg] = process.argv;
const args = process.argv.slice(3);
if (cmd === "check") {
  const release = args.includes("--release");
  const tagFlag = args.find((item) => item.startsWith("--tag="));
  check({ release, tag: tagFlag ? tagFlag.slice(6) : null });
} else if (cmd === "bump") {
  bump(arg);
} else {
  fail("Usage: node scripts/version.js check [--release] [--tag=v1.0.9]\n       node scripts/version.js bump patch|minor|major");
}
