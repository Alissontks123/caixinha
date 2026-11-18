import { monthOf } from '../lib/months';
import { makeDate, monthNumber, parseBRL } from './pdfText';
import type { DocCheck, ItemKind, Line, ParsedDocument, ParsedItem } from './types';

export function isNubankExtrato(text: string): boolean {
  return /Saldo final do período/i.test(text) && /Movimentações/i.test(text) && /nubank/i.test(text);
}

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const sameName = (a: string, b: string) =>
  stripAccents(a).toUpperCase().replace(/\s+/g, ' ').trim() === stripAccents(b).toUpperCase().replace(/\s+/g, ' ').trim();

interface RawEntry {
  date: string;
  direction: 'in' | 'out';
  type: string;
  detail: string;
  amount: number;
}

/**
 * Extrato da conta Nubank.
 * Cada dia tem blocos "Total de entradas" / "Total de saídas", seguidos dos lançamentos:
 * tipo (coluna ~120), detalhe/favorecido (coluna ~260, pode quebrar em várias linhas) e valor.
 */
export function parseNubankExtrato(pages: Line[][]): ParsedDocument {
  const all = pages.flat();
  const text = all.map((l) => l.text).join('\n');

  const period = stripAccents(text).match(/(\d{2}) DE ([A-Z]+) DE (\d{4}) a (\d{2}) DE ([A-Z]+) DE (\d{4})/i);
  if (!period) throw new Error('Extrato Nubank: não encontrei o período.');
  const start = makeDate(Number(period[3]), monthNumber(period[2]) ?? 1, Number(period[1]));
  const end = makeDate(Number(period[6]), monthNumber(period[5]) ?? 1, Number(period[4]));

  const holder = pages[0]?.[0]?.text.trim();
  const ownCpf = text.match(/CPF\s*•+\.?(\d{3}\.\d{3})-•+/)?.[1];

  const entries: RawEntry[] = [];
  const dayTotals: { date: string; direction: 'in' | 'out'; total: number }[] = [];
  let headerOut: number | undefined;
  let date: string | undefined;
  let direction: 'in' | 'out' | undefined;

  pages.forEach((lines, pageIndex) => {
    let active = false;
    for (const line of lines) {
      const t = line.text;
      if (pageIndex === 0 && !active) {
        const h = t.match(/^Total de saídas\s+(-?[\d.]+,\d{2})$/);
        if (h && line.items[0].x > 250) headerOut = Math.abs(parseBRL(h[1]) ?? 0);
      }
      if (!active) {
        if (pageIndex === 0 ? /^Movimentações$/.test(t) : /VALORES EM R\$/.test(t)) active = true;
        continue;
      }
      if (/^(Tem alguma dúvida|O saldo líquido corresponde)/.test(t)) break;

      let items = line.items;
      const dm = items[0].s.match(/^(\d{2}) ([A-ZÇ]{3}) (\d{4})$/i);
      if (dm) {
        date = makeDate(Number(dm[3]), monthNumber(dm[2]) ?? 1, Number(dm[1]));
        items = items.slice(1);
        if (!items.length) continue;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const tot = first.s.match(/^Total de (saídas|entradas)$/i);
      if (tot) {
        direction = /sa/i.test(tot[1]) ? 'out' : 'in';
        if (date) dayTotals.push({ date, direction, total: Math.abs(parseBRL(last.s) ?? 0) });
        continue;
      }
      const amount = items.length > 1 ? parseBRL(last.s) : null;
      if (first.x < 200 && amount !== null && date && direction) {
        const detail = items.slice(1, -1).map((i) => i.s).join(' ');
        entries.push({ date, direction, type: first.s.trim(), detail, amount: Math.abs(amount) });
      } else if (first.x >= 200 && amount === null && entries.length) {
        // continuação do detalhe da linha anterior
        const e = entries[entries.length - 1];
        const piece = items.map((i) => i.s).join(' ');
        e.detail = /[-/]$/.test(e.detail) || /^[/-]/.test(piece) ? e.detail + piece : `${e.detail} ${piece}`;
      }
    }
  });

  const items = entries.map((e) => classify(e, holder, ownCpf));

  const checks: DocCheck[] = [];
  for (const d of dayTotals) {
    const found = entries.filter((e) => e.date === d.date && e.direction === d.direction).reduce((s, e) => s + e.amount, 0);
    if (found !== d.total) {
      checks.push({ label: `${d.direction === 'out' ? 'Saídas' : 'Entradas'} de ${d.date.split('-').reverse().join('/')}`, expected: d.total, found });
    }
  }
  if (headerOut !== undefined) {
    checks.push({
      label: 'Total de saídas do período',
      expected: headerOut,
      found: entries.filter((e) => e.direction === 'out').reduce((s, e) => s + e.amount, 0),
    });
  }

  return {
    source: 'extrato-nubank',
    label: `Extrato Nubank · ${start.split('-').reverse().join('/')} a ${end.split('-').reverse().join('/')}`,
    holderName: holder,
    periodStart: start,
    periodEnd: end,
    items,
    checks,
  };
}

function classify(e: RawEntry, holder: string | undefined, ownCpf: string | undefined): ParsedItem {
  const name = e.detail.split(' - ')[0].trim();
  const personCpf = e.detail.match(/•+\.(\d{3}\.\d{3})-•+/)?.[1];
  const base = { date: e.date, month: monthOf(e.date), amount: e.amount };
  const item = (kind: ItemKind, description: string, matchText: string, extra: Partial<ParsedItem> = {}): ParsedItem =>
    ({ ...base, kind, description, matchText, ...extra });
  const ignore = (reason: string) =>
    item('ignorado', e.detail ? `${e.type} · ${name}` : e.type, name || e.type, { ignoreReason: reason });

  if (e.direction === 'in') {
    if (/^estorno/i.test(e.type)) return item('estorno', e.type, e.type, { amount: -e.amount });
    if (/resgate|rdb|caixinha/i.test(e.type)) return item('caixinha_resgate', 'Resgate da caixinha', e.type);
    return ignore('Entrada de dinheiro (não é gasto)');
  }

  const isOwn = (personCpf && ownCpf && personCpf === ownCpf) || (holder && name && sameName(name, holder));
  // pagar a fatura do cartão (boleto/Pix para o banco do cartão) não é gasto: as compras vêm da fatura
  const isCardBill = !personCpf && /BANCO C6|C6 BANK|NU PAGAMENTOS|NUBANK/i.test(name);
  if (/^(transferência enviada|pix enviado)/i.test(e.type)) {
    if (isOwn) return ignore('Transferência para conta própria');
    if (isCardBill) return ignore('Pagamento de fatura de cartão (as compras vêm da fatura)');
    if (personCpf) return item('pix_pessoa', `Pix para ${name}`, name);
    return item('pix_empresa', `Pix para ${name}`, name);
  }
  if (/^pagamento de fatura/i.test(e.type)) return ignore('Pagamento de fatura (as compras vêm da fatura)');
  if (/^pagamento de boleto/i.test(e.type)) {
    if (isCardBill) return ignore('Pagamento de fatura de cartão (as compras vêm da fatura)');
    return item('boleto', `Boleto ${name}`, name);
  }
  if (/^débito automático/i.test(e.type)) return item('debito_automatico', `Débito automático ${name}`, name);
  if (/^(débito em conta|compra no débito)/i.test(e.type)) {
    return item('debito', name ? `${e.type} · ${name}` : e.type, name);
  }
  if (/a[cç][oõ]es|bdr|fii|tesouro|cdb|lci|lca|investimento/i.test(e.type)) return ignore('Investimento');
  if (/conta global/i.test(e.type)) return ignore('Conta Global (dinheiro continua seu)');
  if (/rdb|caixinha|guardad|aplica[cç][aã]o/i.test(e.type)) return item('caixinha_aplicacao', 'Aplicação na caixinha', e.type);
  return item('outro', name ? `${e.type} · ${name}` : e.type, name || e.type);
}
