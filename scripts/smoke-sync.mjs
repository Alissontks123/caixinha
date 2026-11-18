/**
 * Teste de ponta a ponta da sincronização, com o Google SIMULADO (login e Drive em memória).
 * Três "aparelhos" (contextos de navegador independentes) usando a mesma conta.
 * Uso: inicie `VITE_GOOGLE_CLIENT_ID=teste npx vite --port 5200` e rode `node scripts/smoke-sync.mjs`.
 */
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:5200/';
const drive = new Map(); // id -> { content, modifiedTime }
let seq = 0;
const stats = { uploads: 0, downloads: 0 };
const log = (...a) => console.log(...a);

async function device(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/WebSocket/.test(m.text()) && errors.push(m.text()));
  page.on('dialog', (d) => d.accept());
  // login do Google: devolve direto para o app com um token
  await ctx.route('https://accounts.google.com/**', (route) => {
    const u = new URL(route.request().url());
    const hash = new URLSearchParams({ access_token: `tok-${name}`, expires_in: '3600', state: u.searchParams.get('state'), token_type: 'Bearer' });
    route.fulfill({ status: 302, headers: { location: `${u.searchParams.get('redirect_uri')}#${hash}` } });
  });
  await ctx.route('https://www.googleapis.com/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.pathname === '/oauth2/v3/userinfo') return json({ email: 'pessoa@exemplo.com' });
    if (u.pathname === '/drive/v3/files' && req.method() === 'GET') {
      return json({ files: [...drive.entries()].map(([id, f]) => ({ id, modifiedTime: f.modifiedTime })) });
    }
    const m = u.pathname.match(/^\/drive\/v3\/files\/(.+)$/);
    if (m && u.searchParams.get('alt') === 'media') {
      stats.downloads++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: drive.get(m[1]).content });
    }
    const up = u.pathname.match(/^\/upload\/drive\/v3\/files\/?(.*)$/);
    if (up) {
      stats.uploads++;
      const body = req.postData() ?? '';
      let content = body;
      if (req.method() === 'POST') {
        const parts = body.split(/--caixinha[^\r\n]*/);
        content = parts[2].split('\r\n\r\n').slice(1).join('\r\n\r\n').trim();
      }
      const id = up[1] || `file${++seq}`;
      const modifiedTime = new Date(Date.now() + seq++).toISOString();
      drive.set(id, { content, modifiedTime });
      return json({ id, modifiedTime });
    }
    return json({ error: 'não simulado' }, 500);
  });
  await page.goto(BASE);
  return { page, errors };
}

async function setup(page, name, txDesc) {
  await page.getByText('Bem-vindo(a)!').waitFor();
  await page.getByLabel('Seu nome').fill(name);
  await page.getByLabel('Data do saldo').fill('2026-10-31');
  await page.getByLabel('Saldo total da caixinha nessa data').fill('500');
  await page.getByLabel('Aporte fixo mensal').fill('200');
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.getByText('Aporte previsto no mês').waitFor();
  if (txDesc) await addTx(page, txDesc, '100');
}

async function addTx(page, desc, value) {
  await page.getByRole('button', { name: /Gastos$/ }).click();
  await page.getByRole('button', { name: '+ Novo lançamento' }).click();
  await page.getByLabel('Descrição').fill(desc);
  await page.getByLabel('Valor').fill(value);
  await page.getByLabel('Data').fill('2026-11-05');
  await page.getByRole('dialog').getByLabel('Categoria').selectOption({ label: 'Alimentação' });
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
}

const txList = async (page) => {
  await page.getByRole('button', { name: /Gastos$/ }).click();
  return (await page.locator('.tx-desc').allInnerTexts()).sort().join(', ');
};
const syncStatus = (page) => page.locator('[role=status]').first().innerText();

const browser = await chromium.launch({ channel: 'msedge', headless: true });

// Aparelho A: configura, lança e conecta (Drive vazio → envia)
const A = await device(browser, 'A');
await setup(A.page, 'Teste', 'Gasto do PC');
await A.page.getByRole('button', { name: /Ajustes/ }).click();
await A.page.getByRole('button', { name: 'Conectar ao Google Drive' }).click();
// depois do login o app volta ao Painel; o indicador do topo mostra o estado
await A.page.locator('.sync-badge.idle').waitFor();
await A.page.getByRole('button', { name: /Ajustes/ }).click();
await A.page.getByText(/Sincronizado em/).waitFor();
log('A conectado:', await syncStatus(A.page), '| arquivos no Drive:', drive.size);

// Aparelho B: novo, "Já uso em outro aparelho" → recebe tudo do Drive
const B = await device(browser, 'B');
await B.page.getByRole('button', { name: /Já uso em outro aparelho/ }).click();
await B.page.getByText('Aporte previsto no mês').waitFor();
log('B recebeu:', await B.page.locator('.brand').innerText(), '|', await txList(B.page));

// B lança algo → sincroniza sozinho em ~4s; A sincroniza e recebe
await addTx(B.page, 'Gasto do celular', '50');
await B.page.waitForTimeout(6000);
await A.page.getByRole('button', { name: /Ajustes/ }).click();
await A.page.getByRole('button', { name: 'Sincronizar agora' }).click();
await A.page.getByText(/Sincronizado em/).waitFor();
log('A depois de sincronizar:', await txList(A.page));

// A exclui o gasto do PC e altera o nome; B altera outra coisa ao mesmo tempo → mescla
await A.page.locator('.tx-row', { hasText: 'Gasto do PC' }).locator('.tx-main').click();
await A.page.getByRole('button', { name: 'Excluir' }).click();
await A.page.getByRole('dialog').waitFor({ state: 'detached' });
await addTx(B.page, 'Outro do celular', '30');
await A.page.waitForTimeout(6000);
await B.page.waitForTimeout(1000);
await B.page.getByRole('button', { name: /Ajustes/ }).click();
await B.page.getByRole('button', { name: 'Sincronizar agora' }).click();
await B.page.getByText(/Sincronizado em/).waitFor();
await A.page.getByRole('button', { name: /Ajustes/ }).click();
await A.page.getByRole('button', { name: 'Sincronizar agora' }).click();
await A.page.getByText(/Sincronizado em/).waitFor();
log('Depois de mudanças nos dois → A:', await txList(A.page), '| B:', await txList(B.page));

// Aparelho C: configurado separadamente (com dados) → conecta → pergunta → juntar
const C = await device(browser, 'C');
await setup(C.page, 'Teste', 'Gasto do notebook');
await C.page.getByRole('button', { name: /Ajustes/ }).click();
await C.page.getByRole('button', { name: 'Conectar ao Google Drive' }).click();
await C.page.getByText('Já existem dados nos dois lugares').waitFor();
log('C pergunta:', (await C.page.locator('.modal p').first().innerText()).replace(/\n/g, ' '));
await C.page.getByRole('button', { name: /Juntar os dois/ }).click();
await C.page.locator('.sync-badge.idle').waitFor();
log('C depois de juntar:', await txList(C.page));
const chips = await C.page.locator('.chip').allInnerTexts();
log('C categorias (sem duplicar):', chips.filter((c) => /Alimentação/.test(c)).join(' | '));

log('Drive: uploads', stats.uploads, 'downloads', stats.downloads);
log('ERROS:', [...A.errors, ...B.errors, ...C.errors].length ? [...A.errors, ...B.errors, ...C.errors] : 'nenhum');
await browser.close();
