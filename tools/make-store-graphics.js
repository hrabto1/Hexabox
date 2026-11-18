// Generates Google Play Store listing graphics (hi-res icon, feature graphic)
// from the existing app icon source. Run with `node tools/make-store-graphics.js`;
// output lands in store-assets/ (gitignored — these are upload assets for the
// Play Console, not app source).
"use strict";
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "store-assets");
fs.mkdirSync(OUT, { recursive: true });

async function makeIcon() {
  await sharp(path.join(ROOT, "resources", "icon.png"))
    .resize(512, 512)
    .png()
    .toFile(path.join(OUT, "play-icon-512.png"));
  console.log("wrote play-icon-512.png");
}

// The source icon is a flat opaque square (its own navy background baked
// in), which left a visible seam when composited onto the feature graphic's
// gradient. This keys out that background color to transparent so only the
// glowing hex shape composites in.
async function cutoutIcon(size) {
  const { data, info } = await sharp(path.join(ROOT, "resources", "icon.png"))
    .resize(size, size)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bg = [11, 16, 24]; // #0B1018
  const threshold = 26;
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - bg[0], dg = data[i + 1] - bg[1], db = data[i + 2] - bg[2];
    if (Math.sqrt(dr * dr + dg * dg + db * db) < threshold) data[i + 3] = 0;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function makeFeatureGraphic() {
  const iconBuf = await cutoutIcon(420);
  const iconB64 = iconBuf.toString("base64");
  const svg = `
<svg width="1024" height="500" viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0B1018"/>
      <stop offset="55%" stop-color="#0d1420"/>
      <stop offset="100%" stop-color="#121a2c"/>
    </linearGradient>
    <radialGradient id="glow" cx="78%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#1c2740" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#1c2740" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#bg)"/>
  <rect width="1024" height="500" fill="url(#glow)"/>
  <image x="640" y="40" width="420" height="420" href="data:image/png;base64,${iconB64}"/>
  <text x="80" y="235" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="104" letter-spacing="2" fill="#EAF2FF">HEXABOX</text>
  <text x="80" y="295" font-family="Segoe UI, Arial, sans-serif" font-weight="500" font-size="34" fill="#8CA0BE">Hexagonální hádanky s drahokamy</text>
  <rect x="80" y="335" width="54" height="10" rx="5" fill="#3FE1C3"/>
  <rect x="146" y="335" width="54" height="10" rx="5" fill="#FFC857"/>
  <rect x="212" y="335" width="54" height="10" rx="5" fill="#B47CFF"/>
</svg>`.trim();
  await sharp(Buffer.from(svg)).png().toFile(path.join(OUT, "feature-graphic-1024x500.png"));
  console.log("wrote feature-graphic-1024x500.png");
}

(async () => {
  await makeIcon();
  await makeFeatureGraphic();
})().catch((e) => { console.error(e); process.exit(1); });
