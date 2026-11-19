/** Confere o app publicado: carrega, manifesto, ícones, service worker, funciona offline e importa um PDF. */
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
const URL_APP = process.argv[2] ?? 'https://alissontks123.github.io/caixinha/';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL_APP);
await page.getByText('Bem-vindo(a)!').waitFor();
console.log('Carregou:', await page.title());
const manifest = await page.evaluate(async () => {
  const href = document.querySelector('link[rel=manifest]')?.getAttribute('href');
  const m = await (await fetch(href)).json();
  const icons = await Promise.all(m.icons.map(async (i) => `${i.src}:${(await fetch(i.src)).status}`));
  const apple = (await fetch('apple-touch-icon.png')).status;
  return { name: m.name, start_url: m.start_url, display: m.display, icons, apple };
});
console.log('Manifesto:', JSON.stringify(manifest));
await page.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker?.ready.then(() => true), null, { timeout: 30000 });
await page.evaluate(() => navigator.serviceWorker.ready);
console.log('Service worker: ativo');
await page.reload();
await page.waitForTimeout(2000);
await ctx.setOffline(true);
await page.reload();
await page.getByText('Bem-vindo(a)!').waitFor({ timeout: 15000 });
console.log('Offline: abre normalmente');
// configura e importa um PDF ainda offline (leitor de PDF guardado no aparelho)
await page.getByLabel('Seu nome').fill('Teste');
await page.getByLabel(/Saldo da caixinha no fim de/).fill('0');
await page.getByLabel('Aporte fixo mensal').fill('100');
await page.getByRole('button', { name: 'Começar' }).click();
await page.getByRole('button', { name: /Importar$/ }).click();
const pdf = path.resolve('exemplos/fatura_nubank.pdf');
if (fs.existsSync(pdf)) {
  await page.locator('input[type=file]').setInputFiles(pdf);
  await page.getByText(/De quem são estes cartões|lançamento\(s\) novo\(s\)/).waitFor({ timeout: 30000 });
  console.log('Importação offline: PDF lido');
}
console.log('ERROS:', errors.length ? errors : 'nenhum');
await browser.close();
