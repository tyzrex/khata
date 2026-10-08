/*
 * Generates every PWA image from the Khata mark (src/components/mark.tsx):
 * three rounded ledger bars on the brand blue. Run with `bun scripts/make-icons.cjs`.
 *
 *   public/icons/icon-{192,512}.png           purpose "any": rounded square, transparent corners
 *   public/icons/icon-maskable-{192,512}.png  purpose "maskable": full bleed, bars inside the 80% safe zone
 *   public/icons/icon-monochrome-512.png      purpose "monochrome": white bars on transparent (Android themed icons)
 *   public/icons/apple-touch-icon.png         180px full bleed (iOS rounds it itself)
 *   public/splash/*.png                       iOS launch images, dark canvas to match the default theme
 *   src/app/icon.png                          favicon
 */
const { mkdirSync, writeFileSync } = require("node:fs");
const { PNG } = require("pngjs");

const BRAND = [0x1a, 0x0f, 0xd1];
const WHITE = [255, 255, 255];
const CANVAS_DARK = [0x0a, 0x0a, 0x0d];
const SAMPLES = 4;

/** Bars in the mark's 32-unit box: x, y, width, height, corner radius. */
const BARS = [
  [8, 10, 16, 2, 1],
  [8, 15, 11, 2, 1],
  [8, 20, 6, 2, 1],
];

function insideRoundRect(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function canvas(width, height, background) {
  const png = new PNG({ width, height });
  for (let index = 0; index < width * height; index += 1) {
    const offset = index << 2;
    png.data[offset] = background ? background[0] : 0;
    png.data[offset + 1] = background ? background[1] : 0;
    png.data[offset + 2] = background ? background[2] : 0;
    png.data[offset + 3] = background ? 255 : 0;
  }
  return png;
}

/** Composite `color` over the pixels where `inside(x, y)` holds, anti-aliased by supersampling, within a bounding box. */
function fill(png, box, color, inside) {
  const [x0, y0, x1, y1] = box.map(Math.round);
  for (let y = Math.max(0, y0); y < Math.min(png.height, y1); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(png.width, x1); x += 1) {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          if (inside(x + (sx + 0.5) / SAMPLES, y + (sy + 0.5) / SAMPLES)) hits += 1;
        }
      }
      if (hits === 0) continue;
      const alpha = hits / (SAMPLES * SAMPLES);
      const offset = (png.width * y + x) << 2;
      const baseAlpha = png.data[offset + 3] / 255;
      const outAlpha = alpha + baseAlpha * (1 - alpha);
      for (let channel = 0; channel < 3; channel += 1) {
        const mixed = (color[channel] * alpha + png.data[offset + channel] * baseAlpha * (1 - alpha)) / (outAlpha || 1);
        png.data[offset + channel] = Math.round(mixed);
      }
      png.data[offset + 3] = Math.round(outAlpha * 255);
    }
  }
}

/** Draw the bars with the mark's 32-unit box mapped to a square at (left, top) of side `span`. */
function bars(png, left, top, span, color) {
  const unit = span / 32;
  for (const [x, y, w, h, r] of BARS) {
    const box = [left + x * unit - 1, top + y * unit - 1, left + (x + w) * unit + 1, top + (y + h) * unit + 1];
    fill(png, box, color, (px, py) => insideRoundRect(px, py, left + x * unit, top + y * unit, w * unit, h * unit, r * unit));
  }
}

function roundedSquare(size) {
  const png = canvas(size, size, null);
  const radius = size * 0.225;
  fill(png, [0, 0, size, size], BRAND, (px, py) => insideRoundRect(px, py, 0, 0, size, size, radius));
  bars(png, 0, 0, size, WHITE);
  return PNG.sync.write(png);
}

function fullBleed(size) {
  const png = canvas(size, size, BRAND);
  bars(png, 0, 0, size, WHITE);
  return PNG.sync.write(png);
}

/** Maskable: the launcher may crop to a circle of 80% diameter, so the mark is drawn at 80% and centred. */
function maskable(size) {
  const png = canvas(size, size, BRAND);
  const span = size * 0.8;
  bars(png, (size - span) / 2, (size - span) / 2, span, WHITE);
  return PNG.sync.write(png);
}

function monochrome(size) {
  const png = canvas(size, size, null);
  const span = size * 0.8;
  bars(png, (size - span) / 2, (size - span) / 2, span, WHITE);
  return PNG.sync.write(png);
}

/** Launch image: the full mark (disc and bars) centred on the dark canvas. */
function splash(width, height, scale) {
  const png = canvas(width, height, CANVAS_DARK);
  const span = 88 * scale;
  const left = (width - span) / 2;
  const top = (height - span) / 2;
  const radius = span / 2;
  fill(png, [left - 1, top - 1, left + span + 1, top + span + 1], BRAND, (px, py) => (px - left - radius) ** 2 + (py - top - radius) ** 2 <= radius * radius);
  bars(png, left, top, span, WHITE);
  return PNG.sync.write(png);
}

/** Portrait iOS launch images: device pixels, CSS points and pixel ratio. Keep in sync with layout.tsx. */
const SPLASH = [
  [1320, 2868, 440, 956, 3],
  [1206, 2622, 402, 874, 3],
  [1290, 2796, 430, 932, 3],
  [1179, 2556, 393, 852, 3],
  [1284, 2778, 428, 926, 3],
  [1170, 2532, 390, 844, 3],
  [1125, 2436, 375, 812, 3],
  [1242, 2688, 414, 896, 3],
  [828, 1792, 414, 896, 2],
  [750, 1334, 375, 667, 2],
  [1640, 2360, 820, 1180, 2],
  [1668, 2388, 834, 1194, 2],
  [1620, 2160, 810, 1080, 2],
  [2048, 2732, 1024, 1366, 2],
];

mkdirSync("public/icons", { recursive: true });
mkdirSync("public/splash", { recursive: true });
writeFileSync("public/icons/icon-192.png", roundedSquare(192));
writeFileSync("public/icons/icon-512.png", roundedSquare(512));
writeFileSync("public/icons/icon-maskable-192.png", maskable(192));
writeFileSync("public/icons/icon-maskable-512.png", maskable(512));
writeFileSync("public/icons/icon-monochrome-512.png", monochrome(512));
writeFileSync("public/icons/apple-touch-icon.png", fullBleed(180));
writeFileSync("src/app/icon.png", roundedSquare(192));
for (const [width, height, , , scale] of SPLASH) writeFileSync(`public/splash/launch-${width}x${height}.png`, splash(width, height, scale));
console.log(`icons and ${SPLASH.length} launch images written`);

module.exports = { SPLASH };
