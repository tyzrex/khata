const { mkdirSync, writeFileSync } = require("node:fs");
const { PNG } = require("pngjs");

const ink = [28, 25, 21, 255];
const saffron = [232, 148, 74, 255];

function paint(size) {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (size * y + x) << 2;
      png.data[index] = ink[0];
      png.data[index + 1] = ink[1];
      png.data[index + 2] = ink[2];
      png.data[index + 3] = ink[3];
    }
  }
  const barHeight = Math.max(4, Math.round(size * 0.065));
  const gap = Math.max(3, Math.round(size * 0.05));
  const top = Math.round((size - (barHeight * 3 + gap * 2)) / 2);
  const widths = [0.52, 0.38, 0.26];
  const left = Math.round(size * 0.24);
  for (let bar = 0; bar < widths.length; bar += 1) {
    const width = Math.round(size * widths[bar]);
    const y0 = top + bar * (barHeight + gap);
    for (let y = y0; y < y0 + barHeight; y += 1) {
      for (let x = left; x < left + width; x += 1) {
        const index = (size * y + x) << 2;
        png.data[index] = saffron[0];
        png.data[index + 1] = saffron[1];
        png.data[index + 2] = saffron[2];
        png.data[index + 3] = saffron[3];
      }
    }
  }
  return PNG.sync.write(png);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", paint(192));
writeFileSync("public/icons/icon-512.png", paint(512));
writeFileSync("public/icons/icon-maskable-512.png", paint(512));
writeFileSync("public/icons/apple-touch-icon.png", paint(180));
writeFileSync("src/app/icon.png", paint(192));
console.log("icons written");
