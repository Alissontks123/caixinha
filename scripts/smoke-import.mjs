/**
 * Teste de ponta a ponta da importação (Edge headless via playwright-core).
 * Uso: C6_PDF_PASSWORD=xxxxxx node scripts/smoke-import.mjs [pasta-de-screenshots]
 * Requer o servidor de desenvolvimento rodando em http://localhost:5199 e os PDFs em exemplos/.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const shots = process.argv[2] ?? 'scripts/shots';
fs.mkdirSync(shots, { recursive: true });
const ex = (f) => path.resolve('exemplos', f);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
page.on('dialog', (d) => d.accept());
const shot = (n, full = false) => page.screenshot({ path: `${shots}/${n}.png`, fullPage: full });
const log = (...a) => console.log(...a);

await page.goto('http://localhost:5199/');
await page.getByText('Bem-vindo(a)!').waitFor();
await page.getByLabel('Seu nome').fill('Teste');
await page.getByLabel('A caixinha conta a partir de').fill('2026-10');
await page.getByLabel(/Saldo da caixinha no fim de/).fill('1000');
await page.getByLabel('Aporte fixo mensal').fill('300');
await page.getByRole('button', { name: 'Começar' }).click();
await page.getByText('Aportes necessários no mês').waitFor();

const goImport = () => page.getByRole('button', { name: /Importar$/ }).click();
const pick = (file) => page.locator('input[type=file]').setInputFiles(ex(file));
const resolvePending = async (label) => {
  for (let i = 0; i < 60; i++) {
    const sel = page.locator('.tx-row.needs select').first();
    if (!(await sel.count())) break;
    await sel.selectOption({ label });
  }
};
const reviewSummary = async () => {
  const head = await page.locator('section.card').first().innerText();
  const sections = await page.locator('h3.section-title, details summary').allInnerTexts();
  return `${head.replace(/\n+/g, ' | ')}\n   ${sections.join(' / ')}`;
};

// 1) Fatura C6 (com senha)
await goImport();
await pick('fatura_c6.pdf');
await page.getByText('PDF com senha').waitFor();
await page.getByLabel('Senha do PDF').fill('000000');
await page.getByRole('button', { name: 'Abrir' }).click();
await page.getByText('Senha incorreta').waitFor();
log('C6: senha errada recusada');
await page.getByLabel('Senha do PDF').fill(process.env.C6_PDF_PASSWORD);
await page.getByRole('button', { name: 'Abrir' }).click();
await page.getByText('De quem são estes cartões?').waitFor();
log('C6 cartões:', (await page.locator('.card-choice').allInnerTexts()).map((t) => t.replace(/\n/g, ' ')).join(' ; '));
// marca como meus os três primeiros cartões (o último é o adicional de outra pessoa)
for (const i of [0, 1, 2]) await page.locator('.card-choice').nth(i).locator('.switch').click();
await shot('20-c6-cartoes');
await page.getByRole('button', { name: 'Continuar' }).click();
await page.getByText(/lançamento\(s\) novo\(s\)/).waitFor();
log('C6 revisão:', await reviewSummary());
await shot('21-c6-revisao'); await page.getByText(/Reconhecidos automaticamente/).scrollIntoViewIfNeeded(); await shot('21b-c6-reconhecidos');
await resolvePending('Gastos desnecessários');
await page.getByRole('button', { name: /^Importar \d+/ }).click();
await page.getByText('Importação concluída').waitFor();
log('C6 resultado:', (await page.locator('.plain-list').innerText()).replace(/\n/g, ' | '));

// 2) Mesma fatura de novo → tudo duplicado, senha e cartões já memorizados
await page.getByRole('button', { name: 'Importar outro PDF' }).click();
await pick('fatura_c6.pdf');
await page.getByText(/lançamento\(s\) novo\(s\)/).waitFor();
log('C6 de novo:', await reviewSummary());

// 3) Fatura Nubank
await page.getByRole('button', { name: 'Cancelar' }).last().click();
await pick('fatura_nubank.pdf');
await page.getByText('De quem são estes cartões?').waitFor();
await page.locator('.card-choice').first().locator('.switch').click();
await page.getByRole('button', { name: 'Continuar' }).click();
await page.getByText(/lançamento\(s\) novo\(s\)/).waitFor();
log('Nubank revisão:', await reviewSummary());
await shot('22-nubank-revisao');
await resolvePending('Hobbys');
await page.getByRole('button', { name: /^Importar \d+/ }).click();
await page.getByText('Importação concluída').waitFor();

// 4) Extrato Nubank
await page.getByRole('button', { name: 'Importar outro PDF' }).click();
await pick('extrato_nubank.pdf');
await page.getByText(/lançamento\(s\) novo\(s\)/).waitFor();
log('Extrato revisão:', await reviewSummary());
await shot('23-extrato-revisao');
await resolvePending('Não é gasto');
await page.getByRole('button', { name: /^Importar \d+/ }).click();
await page.getByText('Importação concluída').waitFor();
log('Extrato resultado:', (await page.locator('.plain-list').innerText()).replace(/\n/g, ' | '));

// 5) Painel de outubro
await page.getByRole('button', { name: 'Ver lançamentos' }).click();
await page.getByRole('button', { name: /Painel/ }).click();
await page.getByText('Aportes necessários no mês').waitFor();
log('Painel:', (await page.locator('.month-picker-label').innerText()), '|', (await page.locator('.hero').innerText()).replace(/\n+/g, ' | '));
log('Categorias:', (await page.locator('.cat-card .cat-head, .cat-card .cat-values').allInnerTexts()).join(' ; ').replace(/\n/g, ' '));
await shot('24-painel', true);
await page.getByRole('button', { name: /Ajustes/ }).click();
await shot('25-ajustes');

// 6) Caixinha: registro manual + extrato com "Aplicação RDB" (deve substituir, não duplicar)
await page.getByRole('button', { name: /Caixinha/ }).click();
await page.getByRole('button', { name: '+ Aplicação' }).click();
await page.getByLabel('Valor').fill('600');
await page.getByLabel('Data').fill('2026-11-03');
await page.getByRole('button', { name: 'Salvar' }).click();
await page.getByRole('dialog').waitFor({ state: 'detached' });
await goImport();
await pick('extrato_nubank_caixinha.pdf');
await page.getByText(/lançamento\(s\) novo\(s\)/).waitFor();
log('Extrato caixinha revisão:', await reviewSummary());
log('  caixinha:', (await page.locator('.caixinha-row').allInnerTexts()).map((t) => t.replace(/\n/g, ' ')).join(' ; '));
await shot('26-extrato-caixinha-revisao');
await page.getByText(/Movimentos da caixinha/).scrollIntoViewIfNeeded();
await shot('26b-extrato-caixinha-secao');
await resolvePending('Não é gasto');
await page.getByRole('button', { name: /^Importar (\d|movimentos)/ }).click();
await page.getByText('Importação concluída').waitFor();
log('Extrato caixinha resultado:', (await page.locator('.plain-list').innerText()).replace(/\n/g, ' | '));
await page.getByRole('button', { name: 'Importar outro PDF' }).click();
await pick('extrato_nubank_caixinha.pdf');
await page.getByText(/lançamento\(s\) novo\(s\)/).waitFor();
log('Extrato caixinha de novo:', await reviewSummary());
await page.getByRole('button', { name: 'Cancelar' }).last().click();
await page.getByRole('button', { name: /Caixinha/ }).click();
log('Caixinha:', (await page.locator('.hero').innerText()).replace(/\n+/g, ' | '));
log('  movimentos:', (await page.locator('section').last().locator('.tx-row').allInnerTexts()).map((t) => t.replace(/\n/g, ' ')).join(' ; '));
log('  tabela:', (await page.locator('.table tbody tr').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join(' ; '));
await shot('27-caixinha', true);

// 7) Painel de outubro com alertas
await page.getByRole('button', { name: /Painel/ }).click();
for (let i = 0; i < 24; i++) {
  const label = (await page.locator('.month-picker-label').innerText()).toLowerCase();
  if (label === 'outubro de 2026') break;
  await page.getByLabel(label.startsWith('novembro') || label.startsWith('dezembro') ? 'Mês anterior' : 'Próximo mês').click();
}
await page.getByText('Aportes necessários no mês').waitFor();
log('Alertas outubro:', (await page.locator('.alert-banner').allInnerTexts()).map((t) => t.replace(/\n+/g, ' | ')).join(' ## '));
await shot('28-painel-alertas');

// 8) Aviso de novo bloco num lançamento manual (novembro, Alimentação acima de R$ 1.000)
await page.getByLabel('Próximo mês').click(); // novembro
await page.getByRole('button', { name: /^. ?Gastos$|Gastos$/ }).click();
await page.getByRole('button', { name: '+ Novo lançamento' }).click();
await page.getByLabel('Descrição').fill('Mercado grande');
await page.getByLabel('Valor').fill('1.050');
await page.getByLabel('Data').fill('2026-11-10');
await page.getByRole('dialog').getByLabel('Categoria').selectOption({ label: 'Alimentação' });
await page.getByRole('button', { name: 'Salvar' }).click();
await page.locator('.toast').waitFor();
log('Toast:', (await page.locator('.toast').innerText()).replace(/\n/g, ' | '));
await shot('29-toast');

// 9) Histórico + exportações
await page.getByRole('button', { name: /Histórico/ }).click();
await page.getByText('Evolução mensal por categoria').waitFor();
await shot('30-historico', true);
await page.getByRole('button', { name: '12 meses' }).click();
const stacked = page.locator('.chart-card', { hasText: 'Evolução mensal' });
await stacked.locator('svg g g g').nth(10).hover().catch(() => {});
await stacked.locator('svg').hover({ position: { x: 300, y: 120 } });
await page.waitForTimeout(200);
log('Tooltip evolução:', (await page.locator('.chart-tip').allInnerTexts()).map((t) => t.replace(/\n/g, ' | ')).join(' ## '));
await shot('31-tooltip');
await stacked.getByRole('button', { name: 'Ver tabela' }).click();
log('Tabela evolução:', (await stacked.locator('table').innerText()).split('\n').slice(0, 3).join(' / ').replace(/\t/g, ' '));
await page.getByLabel('De').fill('2026-10');
await page.getByLabel('Até').fill('2026-11');
for (const [btn, ext] of [['Baixar PDF', 'pdf'], ['Baixar Excel', 'xlsx']]) {
  const dl = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  await page.getByRole('button', { name: btn }).click();
  const file = await dl;
  if (!file) { log(`FALHA ${ext}:`, await page.locator('.error-box').allInnerTexts()); continue; }
  const target = path.join(shots, `relatorio.${ext}`);
  await file.saveAs(target);
  log(`Exportado ${ext}:`, file.suggestedFilename(), fs.statSync(target).size, 'bytes');
}

log('ERROS:', errors.length ? errors : 'nenhum');
await browser.close();
