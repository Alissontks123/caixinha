/**
 * Testa os leitores com os PDFs reais da pasta exemplos/ (que NÃO vai para o Git).
 * Se os arquivos não existirem (ex.: no GitHub), os testes são pulados.
 * A senha da fatura C6 vem da variável de ambiente C6_PDF_PASSWORD (nunca gravada no código).
 * As verificações são estruturais de propósito: nenhum dado pessoal dos PDFs aparece neste arquivo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { addMonths, monthOf } from '../lib/months';
import { extractPages } from './pdfText';
import { parseDocument } from './parse';
import type { ParsedItem } from './types';

const dir = path.resolve(__dirname, '../../exemplos');
const file = (name: string) => path.join(dir, name);
const has = (name: string) => fs.existsSync(file(name));
const load = (name: string, password?: string) =>
  extractPages(pdfjs as never, new Uint8Array(fs.readFileSync(file(name))), password).then(parseDocument);

const expectChecksOk = (checks: { label: string; expected: number; found: number }[]) => {
  expect(checks.length).toBeGreaterThan(0);
  for (const c of checks) expect({ label: c.label, diff: c.found - c.expected }).toEqual({ label: c.label, diff: 0 });
};
const counted = (items: ParsedItem[]) => items.filter((i) => i.kind !== 'ignorado');

describe.skipIf(!has('fatura_nubank.pdf'))('fatura Nubank real', () => {
  it('lê todas as transações e bate com os totais', async () => {
    const doc = await load('fatura_nubank.pdf');
    expect(doc.source).toBe('fatura-nubank');
    expectChecksOk(doc.checks);
    const items = counted(doc.items);
    expect(items.length).toBeGreaterThan(5);
    // parcela: a Nubank já mostra a data da parcela
    const parcel = items.find((i) => i.installment)!;
    expect(parcel.month).toBe(monthOf(parcel.date));
    // IOF e "IOF de volta" se anulam e herdam o cartão da compra
    const iof = items.filter((i) => i.kind === 'iof');
    expect(iof.reduce((s, i) => s + i.amount, 0)).toBe(0);
    expect(iof.every((i) => !!i.card)).toBe(true);
    expect(doc.items.some((i) => i.kind === 'ignorado' && /fatura/i.test(i.ignoreReason ?? ''))).toBe(true);
  });
});

// fatura Nubank sem a página de encargos ("Nu Pagamentos S.A."): antes não era reconhecida
describe.skipIf(!has('fatura_nubank_2.pdf'))('fatura Nubank real (4 páginas, sem página de encargos)', () => {
  it('é reconhecida e bate com os totais', async () => {
    const doc = await load('fatura_nubank_2.pdf');
    expect(doc.source).toBe('fatura-nubank');
    expectChecksOk(doc.checks);
    const items = counted(doc.items);
    expect(items.length).toBeGreaterThan(5);
    expect(items.some((i) => i.installment)).toBe(true);
    expect(doc.items.some((i) => i.kind === 'ignorado' && /fatura/i.test(i.ignoreReason ?? ''))).toBe(true);
  });
});

describe.skipIf(!has('fatura_c6.pdf') || !process.env.C6_PDF_PASSWORD)('fatura C6 real', () => {
  it('pede senha quando não informada e recusa senha errada', async () => {
    await expect(load('fatura_c6.pdf')).rejects.toMatchObject({ incorrect: false });
    await expect(load('fatura_c6.pdf', '000000')).rejects.toMatchObject({ incorrect: true });
  });
  it('lê os cartões, parcelas e bate com os subtotais', async () => {
    const doc = await load('fatura_c6.pdf', process.env.C6_PDF_PASSWORD);
    expect(doc.source).toBe('fatura-c6');
    expectChecksOk(doc.checks);
    const cards = new Set(doc.items.map((i) => i.card?.last4));
    expect(doc.checks).toHaveLength(cards.size + 1); // um subtotal por cartão + total
    // parcelas mostram a data da compra original: parcela n conta n−1 meses depois
    const parcels = doc.items.filter((i) => i.installment && i.installment.n > 1);
    expect(parcels.length).toBeGreaterThan(0);
    for (const p of parcels) expect(p.month).toBe(addMonths(monthOf(p.date), p.installment!.n - 1));
    // compra do ano anterior (data depois do fechamento) volta um ano
    expect(doc.items.every((i) => i.date <= doc.periodEnd)).toBe(true);
    expect(doc.items.some((i) => i.kind === 'ignorado')).toBe(true);
    const estorno = doc.items.find((i) => i.kind === 'estorno')!;
    expect(estorno.amount).toBeLessThan(0);
  });
});

describe.skipIf(!has('extrato_nubank_caixinha.pdf'))('extrato Nubank real com caixinha (RDB)', () => {
  it('reconhece a aplicação RDB e ignora o boleto da fatura do cartão', async () => {
    const doc = await load('extrato_nubank_caixinha.pdf');
    expectChecksOk(doc.checks);
    expect(doc.items.filter((i) => i.kind === 'caixinha_aplicacao').length).toBeGreaterThan(0);
    expect(doc.items.some((i) => i.kind === 'ignorado' && /fatura de cartão/.test(i.ignoreReason ?? ''))).toBe(true);
    // Pix para pessoa: o nome vem limpo, mesmo com o CPF quebrado em duas linhas
    const pix = doc.items.filter((i) => i.kind === 'pix_pessoa');
    expect(pix.length).toBeGreaterThan(0);
    expect(pix.every((i) => !/•|CPF|\d{3}\./.test(i.matchText))).toBe(true);
  });
});

describe.skipIf(!has('extrato_nubank.pdf'))('extrato Nubank real', () => {
  it('lê os lançamentos, bate com os totais diários e classifica', async () => {
    const doc = await load('extrato_nubank.pdf');
    expect(doc.source).toBe('extrato-nubank');
    expect(doc.periodStart! <= doc.periodEnd).toBe(true);
    expectChecksOk(doc.checks);
    const kinds = (k: string) => doc.items.filter((i) => i.kind === k);
    for (const k of ['boleto', 'debito_automatico', 'pix_pessoa', 'pix_empresa', 'estorno', 'debito']) {
      expect({ k, n: kinds(k).length > 0 }).toEqual({ k, n: true });
    }
    expect(kinds('estorno').every((i) => i.amount < 0)).toBe(true);
    const reasons = kinds('ignorado').map((i) => i.ignoreReason);
    expect(reasons).toContain('Pagamento de fatura (as compras vêm da fatura)');
    expect(reasons).toContain('Investimento');
    expect(reasons).toContain('Conta Global (dinheiro continua seu)');
  });
});
