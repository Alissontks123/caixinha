import { normalizeText } from './categorize';
import type { Cents, ISODate, Transaction } from './types';

/** Palavras que não ajudam a identificar o estabelecimento. */
const NOISE = new Set(['LTDA', 'ME', 'EPP', 'SA', 'S', 'A', 'EIRELI', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'COM', 'COMERCIO', 'PARCELA']);

/** Nome comparável: sem acentos, números, símbolos e palavras genéricas. Ex.: "PADARIA CENTRAL LTDA - Parcela 1/2" → "PADARIA CENTRAL". */
export function nameKey(text: string): string {
  return normalizeText(text)
    .replace(/[^A-Z ]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 0 && !NOISE.has(w))
    .join(' ');
}

/** Nomes parecidos: um contém o outro, ou começam com a mesma palavra (de 4+ letras) ou as mesmas duas palavras. */
export function namesSimilar(a: string, b: string): boolean {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (!ka || !kb) return false;
  if (ka === kb || ka.includes(kb) || kb.includes(ka)) return true;
  const wa = ka.split(' ');
  const wb = kb.split(' ');
  if (wa.length >= 2 && wb.length >= 2 && wa[0] === wb[0] && wa[1] === wb[1]) return true;
  return wa[0] === wb[0] && wa[0].length >= 4 && (wa.length === 1 || wb.length === 1);
}

const dayNumber = (d: ISODate) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000);

type Comparable = { description: string; amount: Cents; date: ISODate; installment?: string };

/**
 * Mesmo valor, até 3 dias de diferença e nome parecido.
 * Parcelas diferentes da mesma compra (ex.: 1/3 e 2/3) nunca são repetidas: na C6 todas têm a data da compra.
 */
export function isSimilarTransaction(a: Comparable, b: Comparable): boolean {
  if (a.installment && b.installment && a.installment !== b.installment) return false;
  return a.amount === b.amount && Math.abs(dayNumber(a.date) - dayNumber(b.date)) <= 3 && namesSimilar(a.description, b.description);
}

/** Lançamento já existente parecido com o novo (o mais próximo na data). */
export function findSimilar(
  candidate: Comparable,
  existing: Transaction[],
  exclude: Set<string> = new Set(),
): Transaction | undefined {
  return existing
    .filter((t) => !exclude.has(t.id) && isSimilarTransaction(candidate, t))
    .sort((x, y) => Math.abs(dayNumber(x.date) - dayNumber(candidate.date)) - Math.abs(dayNumber(y.date) - dayNumber(candidate.date)))[0];
}
