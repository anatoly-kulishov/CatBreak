#!/usr/bin/env node
/**
 * Генерирует build/icon.ico из build/icon.png (Windows).
 * macOS: icon.icns, Linux: icon.png — уже в build/.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pngPath = path.join(root, "build", "icon.png");
const icoPath = path.join(root, "build", "icon.ico");

async function main() {
  if (!fs.existsSync(pngPath)) {
    console.error("Missing build/icon.png");
    process.exit(1);
  }

  const pngToIco = require("png-to-ico");
  const buf = await pngToIco(pngPath);
  fs.writeFileSync(icoPath, buf);
  console.log("Wrote", icoPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
