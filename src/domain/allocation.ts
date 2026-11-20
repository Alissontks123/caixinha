import { myAmount } from './share';
import type { AllocationPart, Cents, Transaction } from './types';

type Allocated = Pick<Transaction, 'amount' | 'categoryId'> & Partial<Pick<Transaction, 'share' | 'avista' | 'installment' | 'allocation'>>;

/** O rateio está ativo (2 partes ou mais). */
export const isAllocated = (t: Pick<Transaction, 'allocation'>): boolean => (t.allocation?.length ?? 0) >= 2;

/**
 * Divide um valor (centavos, com sinal) entre as partes do rateio.
 * Cada parte recebe o valor fixo ou o percentual informado; a última fica com o que sobrar.
 */
export function splitAmount(base: Cents, parts: AllocationPart[]): Cents[] {
  const sign = base < 0 ? -1 : 1;
  const abs = Math.abs(base);
  let left = abs;
  const fixed = parts.map((p, i) => {
    if (i === parts.length - 1 || p.mode === 'rest') return null;
    const v = p.mode === 'amount' ? p.cents : Math.round((abs * Math.min(Math.max(p.percent, 0), 100)) / 100);
    const c = Math.min(Math.max(v, 0), left);
    left -= c;
    return c;
  });
  // só a última parte fica com o restante (uma "rest" no meio, se existir, fica sem nada)
  return fixed.map((c, i) => {
    const v = c ?? (i === parts.length - 1 ? left : 0);
    return v === 0 ? 0 : sign * v;
  });
}

/** Quanto do lançamento conta em cada categoria (já considerando a divisão com outras pessoas). */
export function allocationParts(t: Allocated): { categoryId: string; amount: Cents }[] {
  const base = myAmount(t);
  if (!isAllocated(t)) return [{ categoryId: t.categoryId, amount: base }];
  const amounts = splitAmount(base, t.allocation!);
  return t.allocation!.map((p, i) => ({ categoryId: p.categoryId, amount: amounts[i] }));
}

/** Quanto do lançamento conta numa categoria. */
export const amountInCategory = (t: Allocated, categoryId: string): Cents =>
  allocationParts(t).filter((p) => p.categoryId === categoryId).reduce((s, p) => s + p.amount, 0);

/** Categorias em que o lançamento conta. */
export const categoriesOf = (t: Allocated): string[] => [...new Set(allocationParts(t).map((p) => p.categoryId))];

/**
 * O mesmo rateio expresso em percentuais, para aplicar num valor diferente (estorno, outra parcela).
 * Ex.: R$ 200 (Mercado) + restante (Casa) numa compra de R$ 300 → 66,67% + restante.
 */
export function toProportional(base: Cents, parts: AllocationPart[] | undefined): AllocationPart[] | undefined {
  if (!parts || parts.length < 2) return undefined;
  const abs = Math.abs(base);
  if (abs === 0) return parts;
  const amounts = splitAmount(base, parts);
  return parts.map((p, i) => (i === parts.length - 1
    ? { categoryId: p.categoryId, mode: 'rest' as const }
    : { categoryId: p.categoryId, mode: 'percent' as const, percent: (Math.abs(amounts[i]) / abs) * 100 }));
}

export const proportionalAllocation = (t: Allocated): AllocationPart[] | undefined => toProportional(myAmount(t), t.allocation);

/** Texto do rateio, ex.: "Mercado R$ 200,00 · Casa R$ 100,00". */
export function describeAllocation(t: Allocated, catName: (id: string) => string, format: (c: Cents) => string): string {
  return allocationParts(t).map((p) => `${catName(p.categoryId)} ${format(p.amount)}`).join(' · ');
}
