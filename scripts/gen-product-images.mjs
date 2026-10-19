// Generates one SVG placeholder per seeded product into public/products/ (committed; no network needed).
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync(new URL("../server/src/seed/catalog.ts", import.meta.url), "utf8");
const products = [...src.matchAll(/\{ name: "([^"]+)", category: "([^"]+)"/g)].map((m) => ({ name: m[1], category: m[2] }));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const palettes = {
  tops: ["#e8efe9", "#2f5d50"], outerwear: ["#e9ecf2", "#34465f"], bottoms: ["#efebe4", "#6b5a3c"],
  bags: ["#f1ece6", "#7a4f32"], accessories: ["#ece9f1", "#4f4470"], bottles: ["#e6eef0", "#2f5f6b"], notebooks: ["#f2efe6", "#5c5a3a"],
};
const shapes = {
  tops: '<path d="M110 60l30-18h40l30 18 28 30-22 18-16-12v86h-100v-86l-16 12-22-18z"/>',
  outerwear: '<path d="M108 56l32-16h40l32 16 26 40-20 14-14-12v94h-120v-94l-14 12-20-14z"/><path d="M160 46v148" stroke="#fff" stroke-width="4"/>',
  bottoms: '<path d="M122 44h76l10 150h-34l-14-104-14 104h-34z"/>',
  bags: '<rect x="104" y="78" width="112" height="98" rx="10"/><path d="M134 80v-14a26 26 0 0 1 52 0v14" fill="none" stroke-width="8"/>',
  accessories: '<circle cx="160" cy="112" r="50"/><circle cx="160" cy="112" r="22" fill="#fff" opacity=".5"/>',
  bottles: '<rect x="140" y="40" width="40" height="18" rx="4"/><rect x="128" y="58" width="64" height="130" rx="18"/>',
  notebooks: '<rect x="112" y="46" width="96" height="134" rx="6"/><path d="M126 46v134" stroke="#fff" stroke-width="4"/>',
};
for (const p of products) {
  const [bg, fg] = palettes[p.category] ?? ["#eeede8", "#c9c8c0"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240" role="img" aria-label="${p.name}">` +
    `<rect width="320" height="240" fill="${bg}"/><g fill="${fg}" stroke="${fg}">${shapes[p.category] ?? ""}</g>` +
    `<text x="160" y="222" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="15" fill="${fg}">${p.name}</text></svg>\n`;
  writeFileSync(new URL(`../public/products/${slug(p.name)}.svg`, import.meta.url), svg);
}
console.log(`wrote ${products.length} images`);
