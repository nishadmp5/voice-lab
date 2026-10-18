import sharp from "sharp";
import { mkdir } from "node:fs/promises";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="110" fill="#101212"/><rect x="80" y="80" width="352" height="352" rx="100" fill="#c0f3d3"/><g stroke="#203c2a" stroke-width="22" stroke-linecap="round"><path d="M160 234v44M208 186v140M256 151v210M304 199v114M352 229v54"/></g></svg>`;
await mkdir("public/icons", { recursive: true });
for (const [name, size] of [
  ["icon-192", 192],
  ["icon-512", 512],
  ["icon-maskable", 512],
  ["apple-touch-icon", 180],
]) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(`public/icons/${name}.png`);
}
await sharp(Buffer.from(svg)).resize(32, 32).png().toFile("app/icon.png");
