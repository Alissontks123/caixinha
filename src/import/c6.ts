import { addMonths, monthOf } from '../lib/months';
import { inferDate, makeDate, monthNumber, parseBRL, splitInstallment } from './pdfText';
import type { DocCheck, Line, ParsedDocument, ParsedItem } from './types';

export function isC6Fatura(text: string): boolean {
  return /C6 BANK|BANCO C6/i.test(text) && /Transações do(s)? cart/i.test(text);
}

/**
 * Fatura do cartão C6.
 * - Cada cartão (principal, virtual, adicional) tem um cabeçalho "Final 1234 - NOME ... Subtotal deste cartão".
 * - Parcelas mostram a data da compra ORIGINAL: o mês da parcela n é (data + n−1 meses).
 */
export function parseC6(pages: Line[][]): ParsedDocument {
  const lines = pages.flat();
  const text = lines.map((l) => l.text).join('\n');

  const closingMatch = text.match(/fechamento desta fatura em (\d{2})\/(\d{2})\/(\d{2,4})/i);
  if (!closingMatch) throw new Error('Fatura C6: não encontrei a data de fechamento.');
  const year = Number(closingMatch[3].length === 2 ? `20${closingMatch[3]}` : closingMatch[3]);
  const closing = makeDate(year, Number(closingMatch[2]), Number(closingMatch[1]));

  const items: ParsedItem[] = [];
  const cardTotals: { last4: string; holder: string; subtotal: number }[] = [];
  let card: { last4: string; holder: string } | undefined;

  for (const line of lines) {
    const header = line.text.match(/Final (\d{4}) - (.+?)(?: Cartão Virtual)?\s+Subtotal deste cartão\s+(-?R\$ ?-?[\d.]+,\d{2})/i);
    if (header) {
      card = { last4: header[1], holder: header[2].trim() };
      cardTotals.push({ ...card, subtotal: parseBRL(header[3]) ?? 0 });
      continue;
    }
    if (!card || line.items.length < 3) continue;
    const dm = line.items[0].s.match(/^(\d{2}) ([a-zç]{3})$/i);
    const amount = parseBRL(line.items[line.items.length - 1].s);
    const month = dm && monthNumber(dm[2]);
    if (!dm || !month || amount === null) continue;

    const rawDesc = line.items.slice(1, -1).map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim();
    const { base, installment } = splitInstallment(rawDesc);
    const date = inferDate(Number(dm[1]), month, closing);
    const itemMonth = installment ? addMonths(monthOf(date), installment.n - 1) : monthOf(date);
    const common = { date, month: itemMonth, card: { ...card }, installment };

    if (/^(pag(amento)?\.? ?(de )?fatura|inclus[aã]o de pagamento|pagamento recebido)/i.test(base)) {
      items.push({ ...common, description: base, matchText: base, amount: Math.abs(amount), kind: 'ignorado', ignoreReason: 'Pagamento de fatura' });
    } else if (/estorno|cr[eé]dito na fatura|devolu[cç][aã]o/i.test(rawDesc)) {
      const clean = base.replace(/\s*-\s*Estorno$/i, '').trim();
      items.push({ ...common, description: clean, matchText: clean, amount: -Math.abs(amount), kind: 'estorno' });
    } else if (/^IOF\b/i.test(base)) {
      items.push({ ...common, description: base, matchText: base, amount, kind: 'iof' });
    } else {
      items.push({ ...common, description: base, matchText: base, amount, kind: 'compra' });
    }
  }

  // conferências: subtotal de cada cartão e total da fatura
  const checks: DocCheck[] = [];
  const sum = (filter: (i: ParsedItem) => boolean) =>
    items.filter((i) => i.kind !== 'ignorado' && filter(i)).reduce((s, i) => s + i.amount, 0);
  for (const c of cardTotals) {
    checks.push({ label: `Cartão final ${c.last4}`, expected: c.subtotal, found: sum((i) => i.card?.last4 === c.last4) });
  }
  const totalMatch = text.match(/Total a pagar\s+R\$ ?([\d.]+,\d{2})/i);
  if (totalMatch) checks.push({ label: 'Total da fatura', expected: parseBRL(totalMatch[1]) ?? 0, found: sum(() => true) });

  return {
    source: 'fatura-c6',
    label: `Fatura C6 · fechamento ${closing.split('-').reverse().join('/')}`,
    holderName: cardTotals[0]?.holder,
    periodEnd: closing,
    items,
    checks,
  };
}
