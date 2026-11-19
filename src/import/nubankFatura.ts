import { monthOf } from '../lib/months';
import { inferDate, makeDate, monthNumber, parseBRL, splitInstallment } from './pdfText';
import type { DocCheck, Line, ParsedDocument, ParsedItem } from './types';

/**
 * Fatura do cartão Nubank. Nem toda fatura traz a página de encargos com "Nu Pagamentos S.A."
 * (algumas têm só 4 páginas), então aceita também as outras marcas do Nubank.
 */
export function isNubankFatura(text: string): boolean {
  const nubank = /Nu Pagamentos|Nubank|aplicativo do Nu/i.test(text);
  return nubank && /TRANSAÇÕES/.test(text) && /EMISSÃO E ENVIO/i.test(text) && /RESUMO DA FATURA ATUAL|Total a pagar/i.test(text);
}

/**
 * Fatura do cartão Nubank.
 * - As transações são agrupadas por portador ("Fulano  R$ 686,81") e há um grupo "Pagamentos".
 * - Parcelas já aparecem com a data da própria parcela.
 * - IOF de compra internacional vem numa linha separada ("IOF de "Loja"").
 */
export function parseNubankFatura(pages: Line[][]): ParsedDocument {
  const lines = pages.flat();
  const text = lines.map((l) => l.text).join('\n');

  const em = text.match(/EMISSÃO E ENVIO (\d{2}) ([A-ZÇ]{3}) (\d{4})/i);
  const emMonth = em && monthNumber(em[2]);
  if (!em || !emMonth) throw new Error('Fatura Nubank: não encontrei a data de emissão.');
  const closing = makeDate(Number(em[3]), emMonth, Number(em[1]));

  const items: ParsedItem[] = [];
  const groupTotals: { name: string; total: number }[] = [];
  let group: { name: string; payments: boolean } | undefined;
  let inTransactions = false;

  for (const line of lines) {
    if (/^TRANSAÇÕES\b/.test(line.text)) { inTransactions = true; continue; }
    if (!inTransactions) continue;
    const first = line.items[0];
    const lastText = line.items[line.items.length - 1]?.s ?? '';
    const amount = parseBRL(lastText);
    const dm = first.s.match(/^(\d{2}) ([A-ZÇ]{3})$/i);

    // cabeçalho de grupo: "Nome do portador   R$ 686,81" ou "Pagamentos   -R$ 481,36"
    if (!dm && line.items.length === 2 && amount !== null && /R\$/.test(lastText)) {
      group = { name: first.s.trim(), payments: /^pagamentos$/i.test(first.s.trim()) };
      if (!group.payments) groupTotals.push({ name: group.name, total: amount });
      continue;
    }
    const month = dm && monthNumber(dm[2]);
    if (!dm || !month || amount === null || line.items.length < 3 || !group) continue;

    const middle = line.items.slice(1, -1);
    const cardItem = middle.find((i) => /^[•*]+\s?\d{4}$/.test(i.s));
    const desc = middle.filter((i) => i !== cardItem).map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim();
    const { base, installment } = splitInstallment(desc);
    const date = inferDate(Number(dm[1]), month, closing);
    const card = cardItem ? { last4: cardItem.s.replace(/\D/g, ''), holder: group.name } : undefined;
    const common = { date, month: monthOf(date), card, installment, description: base, matchText: base };

    if (group.payments || /^pagamento (em|recebido)/i.test(base)) {
      items.push({ ...common, amount: Math.abs(amount), kind: 'ignorado', ignoreReason: 'Pagamento de fatura' });
      continue;
    }
    const iof = base.match(/^IOF de (?:volta de )?"?(.+?)"?$/i);
    if (iof) {
      items.push({ ...common, amount, kind: 'iof', iofOf: iof[1] });
    } else if (amount < 0) {
      items.push({ ...common, amount, kind: 'estorno' });
    } else {
      items.push({ ...common, amount, kind: 'compra' });
    }
  }

  // IOF herda o cartão da compra correspondente
  for (const it of items) {
    if (it.kind !== 'iof' || it.card) continue;
    const target = items.find((o) => o.kind === 'compra' && o.description.toLowerCase() === it.iofOf?.toLowerCase());
    if (target?.card) it.card = { ...target.card };
  }

  const checks: DocCheck[] = [];
  const counted = items.filter((i) => i.kind !== 'ignorado');
  for (const g of groupTotals) {
    checks.push({
      label: `Transações de ${g.name}`,
      expected: g.total,
      found: counted.filter((i) => i.card?.holder === g.name || (!i.card && groupTotals.length === 1)).reduce((s, i) => s + i.amount, 0),
    });
  }
  const total = text.match(/Total de compras de todos os cartões[^\n]*?R\$ ?([\d.]+,\d{2})/i);
  if (total) {
    checks.push({ label: 'Total de compras da fatura', expected: parseBRL(total[1]) ?? 0, found: counted.reduce((s, i) => s + i.amount, 0) });
  }

  return {
    source: 'fatura-nubank',
    label: `Fatura Nubank · fechamento ${closing.split('-').reverse().join('/')}`,
    holderName: groupTotals[0]?.name,
    periodEnd: closing,
    items,
    checks,
  };
}
