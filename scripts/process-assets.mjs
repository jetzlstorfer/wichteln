// Builds all web assets from the illustrated originals in design/source.
// Usage: npm run assets
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { buildHeroLayers } from './hero-layers.mjs';

const SRC = 'design/source';
const OUT = 'client/public/img';
const ICONS = 'client/public/icons';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ICONS, { recursive: true });

/**
 * Removes the flat cream background of an illustration by flood-filling from the
 * image border. Pixels close to the background colour become transparent with a
 * soft edge; the cream fringe is "un-mixed" so the result looks clean on any colour.
 */
async function removeBackground(file, { low = 10, high = 42, seeds = [] } = {}) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const px = (x, y) => (y * w + x) * 4;
  // Estimate the background colour from the four corners.
  const corners = [px(2, 2), px(w - 3, 2), px(2, h - 3), px(w - 3, h - 3)];
  const bg = [0, 1, 2].map((c) => Math.round(corners.reduce((s, i) => s + data[i + c], 0) / 4));
  const dist = (i) => Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);

  const T_LOW = low; // fully background
  const T_HIGH = high; // fully foreground
  const visited = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, 0, x, h - 1);
  for (let y = 0; y < h; y++) stack.push(0, y, w - 1, y);
  // Extra seeds for enclosed background areas (e.g. the hole of the wreath)
  for (const [sx, sy] of seeds) stack.push(Math.round(sx * w), Math.round(sy * h));
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const k = y * w + x;
    if (visited[k]) continue;
    visited[k] = 1;
    const i = k * 4;
    const d = dist(i);
    if (d >= T_HIGH) continue;
    const a = Math.max(0, Math.min(1, (d - T_LOW) / (T_HIGH - T_LOW)));
    if (a > 0) {
      for (let c = 0; c < 3; c++) {
        data[i + c] = Math.max(0, Math.min(255, Math.round((data[i + c] - bg[c] * (1 - a)) / a)));
      }
    }
    data[i + 3] = Math.round(a * 255);
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function cutout(name, sizes, options) {
  const buf = await removeBackground(path.join(SRC, `${name}.webp`), options);
  const trimmed = await sharp(buf).trim({ threshold: 1 }).toBuffer();
  for (const size of sizes) {
    await sharp(trimmed)
      .resize(size, size, { fit: 'inside' })
      .webp({ quality: 86, alphaQuality: 90, effort: 6 })
      .toFile(path.join(OUT, `${name}-${size}.webp`));
  }
}

async function main() {
  // Hero illustration (responsive)
  for (const width of [768, 1280, 1536]) {
    await sharp(path.join(SRC, 'hero.webp'))
      .resize(width)
      .webp({ quality: 80, effort: 6 })
      .toFile(path.join(OUT, `hero-${width}.webp`));
  }
  await buildHeroLayers(path.join(SRC, 'hero.webp'), path.join(SRC, 'freistadt.webp'), OUT);

  await cutout('packerl', [256, 512]);
  await cutout('glocke', [256, 512]);
  // The letter paper is almost as light as the background → tighter thresholds
  await cutout('brief', [256, 512], { low: 4, high: 14 });
  await cutout('adventkranz', [256, 512], { seeds: [[0.5, 0.5], [0.49, 0.47], [0.52, 0.53]] });
  await cutout('christkind', [320, 640], { low: 6, high: 22 });

  // App icons
  const icon = path.join(SRC, 'icon.webp');
  for (const size of [192, 512]) {
    await sharp(icon).resize(size).png().toFile(path.join(ICONS, `icon-${size}.png`));
  }
  await sharp(icon).resize(180).png().toFile(path.join(ICONS, 'apple-touch-icon.png'));
  // Small favicons: crop closer to the star so it stays legible
  const cropped = await sharp(icon).extract({ left: 128, top: 128, width: 768, height: 768 }).toBuffer();
  for (const size of [32, 48]) {
    await sharp(cropped).resize(size).png().toFile(path.join(ICONS, `favicon-${size}.png`));
  }
  console.log('Assets built ✔');
}

await main();
