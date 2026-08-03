#!/usr/bin/env node
/** Copy lib/release-assets.js → landing/ for GitHub Pages. */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "lib", "release-assets.js");
const dest = path.join(root, "landing", "release-assets.js");

fs.copyFileSync(src, dest);
console.log("Synced", path.relative(root, dest));
