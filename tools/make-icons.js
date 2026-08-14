// Generates the PWA icons with the kit's PNG painter.
// The motif is the ladder itself: hands going one, two, three, four and back
// down again, in cream on baize with the top hand in gold. No lettering — at
// 192px a glyph turns to mush, but seven bars rising and falling read at any
// size and are exactly what the game is.
// Run: node tools/make-icons.js   (from the app folder)
const fs = require("fs");
const path = require("path");
const { makeCanvas, downsample, encodePNG } = require("../lib/tools/png.js");

const FELT = "#1e5140";
const FELT_DEEP = "#12332a";
const CREAM = "#f7f2e6";
const GOLD = "#e0a83c";

const STEPS = [1, 2, 3, 4, 3, 2, 1];

// `scale` shrinks the motif toward the centre (maskable keeps its art ~76%).
function drawIcon(size, scale) {
  const SS = 4, big = size * SS;
  const cv = makeCanvas(big);

  cv.fillRoundRect(0, 0, big, big, big * 0.22, FELT_DEEP);

  // A soft pool of light, the way a table lamp falls on baize. The painter has
  // no gradients, so this is a dozen ellipses shrinking toward the middle at
  // low alpha — one big one leaves a hard rim you can see at 192px.
  for (let i = 0; i < 12; i++) {
    const k = 1 - i / 12;
    cv.fillEllipse(big / 2, big * 0.44, big * 0.78 * k, big * 0.66 * k, FELT, 0.13);
  }

  const W = big * 0.66 * scale;
  const gapRatio = 0.42;
  const barW = W / (STEPS.length + (STEPS.length - 1) * gapRatio);
  const gap = barW * gapRatio;
  const x0 = (big - W) / 2;
  const base = big / 2 + big * 0.30 * scale;
  const unit = (big * 0.50 * scale) / Math.max(...STEPS);

  STEPS.forEach((h, i) => {
    const bh = h * unit;
    const x = x0 + i * (barW + gap);
    cv.fillRoundRect(x, base - bh, barW, bh, barW * 0.34, h === 4 ? GOLD : CREAM);
  });

  return encodePNG(size, size, downsample(cv.px, big, SS));
}

const out = path.join(__dirname, "..", "icons");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "icon-512.png"), drawIcon(512, 1.0));
fs.writeFileSync(path.join(out, "icon-192.png"), drawIcon(192, 1.0));
fs.writeFileSync(path.join(out, "maskable-512.png"), drawIcon(512, 0.76));
console.log("Up & Down the River icons written");
