#!/usr/bin/env node
/**
 * Из build/icon-source.png:
 * - squircle-маска, кот по центру, фон без «вложенного» квадрата
 * - build/icon.png, build/icon.iconset/*, build/icon.icns (macOS)
 * - build/icon.ico (Windows), landing/app-icon.png
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
const landingIconAsset = path.join(root, "landing", "app-icon.png");

const MASTER = 1024;
/** ~22.3% — визуально близко к squircle macOS Big Sur+ */
const CORNER_RADIUS = Math.round(MASTER * 0.223);
/** Фон приложения (из исходника) */
const APP_BG = { r: 26, g: 34, b: 48, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

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

/**
 * @param {typeof import("sharp")} sharp
 * @param {string} inputPath
 * @param {{ r: number; g: number; b: number; alpha: number }} bg
 */
async function buildMasterIcon(sharp, inputPath, bg) {
  const mask = Buffer.from(squircleMaskSvg(MASTER, CORNER_RADIUS));

  const trimmed = await sharp(inputPath).trim({ threshold: 14 }).png().toBuffer();
  const artMax = Math.round(MASTER * 0.88);
  const art = await sharp(trimmed).resize(artMax, artMax, { fit: "inside" }).toBuffer();
  const artMeta = await sharp(art).metadata();
  const left = Math.round((MASTER - artMeta.width) / 2);
  const top = Math.round((MASTER - artMeta.height) / 2);

  const base = await sharp({
    create: { width: MASTER, height: MASTER, channels: 4, background: bg },
  })
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();

  return sharp(base)
    .composite([
      { input: art, left, top },
      { input: mask, blend: "dest-in" },
    ])
    .png()
    .toBuffer();
}

/**
 * Убирает однотонный фон иллюстрации (для лендинга без «плитки»).
 * @param {Buffer} pngBuffer
 */
async function knockOutBackground(sharp, pngBuffer) {
  const { data, info } = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;

  function sample(x, y) {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  }

  const points = [
    sample(0, 0),
    sample(w - 1, 0),
    sample(0, h - 1),
    sample(w - 1, h - 1),
    sample(Math.floor(w / 2), 0),
    sample(0, Math.floor(h / 2)),
  ];
  const bg = points.reduce((acc, rgb) => [acc[0] + rgb[0], acc[1] + rgb[1], acc[2] + rgb[2]], [0, 0, 0]);
  bg[0] = Math.round(bg[0] / points.length);
  bg[1] = Math.round(bg[1] / points.length);
  bg[2] = Math.round(bg[2] / points.length);

  const tolerance = 32;
  const tolSq = tolerance * tolerance * 3;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dr = data[i] - bg[0];
      const dg = data[i + 1] - bg[1];
      const db = data[i + 2] - bg[2];
      if (dr * dr + dg * dg + db * db <= tolSq) {
        data[i + 3] = 0;
      }
    }
  }

  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

/**
 * Лендинг: только кот на прозрачном фоне (без squircle-плитки).
 * @param {typeof import("sharp")} sharp
 * @param {string} inputPath
 */
async function buildLandingIcon(sharp, inputPath) {
  const trimmed = await sharp(inputPath).trim({ threshold: 14 }).png().toBuffer();
  const artMax = Math.round(MASTER * 0.92);
  const scaled = await sharp(trimmed).resize(artMax, artMax, { fit: "inside" }).png().toBuffer();
  const art = await knockOutBackground(sharp, scaled);
  const artMeta = await sharp(art).metadata();
  const left = Math.round((MASTER - artMeta.width) / 2);
  const top = Math.round((MASTER - artMeta.height) / 2);

  return sharp({
    create: { width: MASTER, height: MASTER, channels: 4, background: TRANSPARENT },
  })
    .composite([{ input: art, left, top }])
    .png()
    .toBuffer();
}

async function writeIconset(sharp, masterBuffer) {
  if (!fs.existsSync(iconsetDir)) {
    fs.mkdirSync(iconsetDir, { recursive: true });
  }

  for (const [size, name] of ICONSET) {
    const out = path.join(iconsetDir, name);
    await sharp(masterBuffer).resize(size, size, { fit: "cover" }).png().toFile(out);
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

  const appMaster = await buildMasterIcon(sharp, sourcePath, APP_BG);
  const landingMaster = await buildLandingIcon(sharp, sourcePath);

  await sharp(appMaster).png().toFile(pngPath);
  console.log("Wrote", pngPath);

  await writeIconset(sharp, appMaster);
  console.log("Wrote", iconsetDir);

  writeIcns();

  await sharp(appMaster).png().toFile(appIconAsset);
  console.log("Wrote", appIconAsset);

  await sharp(landingMaster).resize(256, 256).png().toFile(landingIconAsset);
  console.log("Wrote", landingIconAsset);

  const pngToIco = require("png-to-ico");
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoPngs = await Promise.all(
    icoSizes.map((size) => sharp(appMaster).resize(size, size, { fit: "cover" }).png().toBuffer()),
  );
  const buf = await pngToIco(icoPngs);
  fs.writeFileSync(icoPath, buf);
  console.log("Wrote", icoPath, `(${icoSizes.join(", ")}px)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
