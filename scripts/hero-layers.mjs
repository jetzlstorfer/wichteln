import sharp from 'sharp';
import path from 'node:path';

// Separate the warm-toned figure from the blue sky in the original illustration.
export async function buildHeroLayers(source, skySource, out) {
  const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const alpha = Buffer.alloc(width * height);
  const foreground = Buffer.alloc(width * height * 4);
  const smoothstep = (a, b, value) => {
    const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  for (let y = 35; y < 430; y++) {
    for (let x = 550; x < 990; x++) {
      const i = y * width + x;
      const [r, g, b] = data.subarray(i * 3, i * 3 + 3);
      const opacity = smoothstep(4, 24, r - b) * smoothstep(35, 75, Math.max(r, g, b));
      alpha[i] = Math.round(opacity * 255);
      foreground[i * 4] = r;
      foreground[i * 4 + 1] = g;
      foreground[i * 4 + 2] = b;
      foreground[i * 4 + 3] = alpha[i];
    }
  }

  for (const size of [768, 1280, 1536]) {
    await sharp(skySource)
      .resize(size).webp({ quality: 80, effort: 6 }).toFile(path.join(out, `hero-sky-${size}.webp`));
    await sharp(foreground, { raw: { width, height, channels: 4 } })
      .resize(size).webp({ quality: 86, alphaQuality: 90, effort: 6 }).toFile(path.join(out, `hero-flying-${size}.webp`));
  }

  const overlay = await sharp(foreground, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const composed = await sharp(skySource)
    .resize(width, height)
    .composite([{ input: overlay }])
    .png().toBuffer();
  await sharp(composed)
    .resize(1200, 630, { fit: 'cover', position: 'top' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(path.join(out, 'og-image.jpg'));
}
