// Regenerates assets/images/splash-icon.png from the brand shield SVG:
// the cream Vector1 shield centered on a 1024x1024 transparent canvas. The
// teal background + sizing are set by the expo-splash-screen config in app.json.
//   node scripts/gen-splash.cjs <path-to-shield.svg>
const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const src = process.argv[2] || "C:/Users/bsale/Downloads/Vector1.svg";
const out = path.join(__dirname, "..", "assets", "images", "splash-icon.png");

const raw = fs.readFileSync(src, "utf8");
const inner = raw.replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim();

// Vector1 viewBox is 0 0 455 395; place it ~74% wide, centered, on a 1024 square.
const scale = 760 / 455;
const w = 760;
const h = 395 * scale;
const tx = (1024 - w) / 2;
const ty = (1024 - h) / 2;
const svg =
  `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">` +
  `<g transform="translate(${tx} ${ty}) scale(${scale})">${inner}</g></svg>`;

const png = new Resvg(svg, { background: "rgba(0,0,0,0)" }).render().asPng();
fs.writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
