/** Gera os ícones PNG (iPhone e Android/Windows) a partir de public/icon.svg usando o Edge. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const svg = fs.readFileSync('public/icon.svg', 'utf8');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
const make = async (size, file, { maskable = false, square = false } = {}) => {
  await page.setViewportSize({ width: size, height: size });
  // maskable: ícone menor com fundo cheio (o sistema recorta em círculo/quadrado)
  const inner = maskable ? size * 0.8 : size;
  const body = svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `).replace(square || maskable ? 'rx="112"' : '__nada__', 'rx="0"');
  await page.setContent(`<html><body style="margin:0;background:${maskable || square ? '#7b6fcf' : 'transparent'};display:grid;place-items:center;width:${size}px;height:${size}px">${body}</body></html>`);
  await page.screenshot({ path: `public/${file}`, omitBackground: !(maskable || square) });
};
await make(180, 'apple-touch-icon.png', { square: true }); // iOS arredonda sozinho
await make(192, 'icon-192.png');
await make(512, 'icon-512.png');
await make(512, 'icon-maskable-512.png', { maskable: true });
await browser.close();
console.log(fs.readdirSync('public'));
