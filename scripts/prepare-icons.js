#!/usr/bin/env node
/**
 * Из build/icon-source.png:
 * - маска squircle (прозрачные углы, как у иконок macOS)
 * - build/icon.png, build/icon.iconset/*, build/icon.icns (macOS)
 * - build/icon.ico (Windows)
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const buildDir = path.join(root, "build");
const sourcePath = path.join(buildDir, "icon-source.png");
const pngPath = path.join(buildDir, "icon.png");
const icoPath = path.join(buildDir, "icon.ico");
const icnsPath = path.join(buildDir, "icon.icns");
const iconsetDir = path.join(buildDir, "icon.iconset");
const appIconAsset = path.join(root, "assets", "app-icon-1024.png");

const MASTER = 1024;
/** ~22.3% — визуально близко к squircle macOS Big Sur+ */
const CORNER_RADIUS = Math.round(MASTER * 0.223);

const ICONSET = [
  [16, "icon_16x16.png"],
  [32, "icon_16x16@2x.png"],
  [32, "icon_32x32.png"],
  [64, "icon_32x32@2x.png"],
  [128, "icon_128x128.png"],
  [256, "icon_128x128@2x.png"],
  [256, "icon_256x256.png"],
  [512, "icon_256x256@2x.png"],
  [512, "icon_512x512.png"],
  [1024, "icon_512x512@2x.png"],
];

function squircleMaskSvg(size, radius) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#ffffff"/>
</svg>`;
}

async function applySquircleMask(sharp, inputPath) {
  const mask = Buffer.from(squircleMaskSvg(MASTER, CORNER_RADIUS));

  return sharp(inputPath)
    .resize(MASTER, MASTER, { fit: "cover" })
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png();
}

async function writeIconset(sharp, masterBuffer) {
  if (!fs.existsSync(iconsetDir)) {
    fs.mkdirSync(iconsetDir, { recursive: true });
  }

  for (const [size, name] of ICONSET) {
    const out = path.join(iconsetDir, name);
    await sharp(masterBuffer)
      .resize(size, size, { fit: "cover" })
      .png()
      .toFile(out);
  }
}

function writeIcns() {
  if (process.platform !== "darwin") {
    console.warn("Skip icon.icns (iconutil only on macOS)");
    return;
  }

  execFileSync("iconutil", ["-c", "icns", iconsetDir, "-o", icnsPath], {
    stdio: "inherit",
  });
  console.log("Wrote", icnsPath);
}

async function main() {
  if (!fs.existsSync(sourcePath)) {
    console.error("Missing build/icon-source.png");
    process.exit(1);
  }

  const sharp = require("sharp");
  const pipeline = await applySquircleMask(sharp, sourcePath);
  const masterBuffer = await pipeline.toBuffer();

  await sharp(masterBuffer).png().toFile(pngPath);
  console.log("Wrote", pngPath);

  await writeIconset(sharp, masterBuffer);
  console.log("Wrote", iconsetDir);

  writeIcns();

  await sharp(masterBuffer).png().toFile(appIconAsset);
  console.log("Wrote", appIconAsset);

  const pngToIco = require("png-to-ico");
  const buf = await pngToIco(pngPath);
  fs.writeFileSync(icoPath, buf);
  console.log("Wrote", icoPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
