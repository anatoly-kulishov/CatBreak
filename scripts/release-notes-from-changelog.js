#!/usr/bin/env node
/**
 * Prints the CHANGELOG section for a release version to stdout.
 * Usage: node scripts/release-notes-from-changelog.js v1.0.6
 */
const fs = require("fs");
const path = require("path");

const raw = process.argv[2];
if (!raw) {
  console.error("Usage: node scripts/release-notes-from-changelog.js <v1.0.6>");
  process.exit(1);
}

const version = raw.trim().replace(/^v/i, "");
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid version: ${raw}`);
  process.exit(1);
}

const changelogPath = path.join(__dirname, "..", "CHANGELOG.md");
const md = fs.readFileSync(changelogPath, "utf8");
const escaped = version.replace(/\./g, "\\.");
const re = new RegExp(`## \\[${escaped}\\][\\s\\S]*?(?=\\n## \\[|$)`);
const match = md.match(re);

if (!match) {
  console.error(`No CHANGELOG section for ${version}`);
  process.exit(1);
}

const body = match[0].trim();
const owner = "anatoly-kulishov";
const repo = "CatBreak";
const tag = `v${version}`;

const prevIdx = md.indexOf(match[0]);
const before = prevIdx > 0 ? md.slice(0, prevIdx) : "";
const prevTags = [...before.matchAll(/## \[(\d+\.\d+\.\d+)\]/g)];
const prevTag = prevTags.length ? prevTags[prevTags.length - 1][1] : null;

let footer = "";
if (prevTag) {
  footer = `\n\n**Full Changelog**: https://github.com/${owner}/${repo}/compare/v${prevTag}...${tag}`;
}

process.stdout.write(`${body}${footer}\n`);
