import type { Cents, Share, Transaction } from './types';

/** Parte do usuário num valor (centavos, com sinal: estornos continuam negativos). */
export function shareOf(amount: Cents, share: Share | undefined): Cents {
  if (!share) return amount;
  const sign = amount < 0 ? -1 : 1;
  const abs = Math.abs(amount);
  switch (share.mode) {
    case 'fixed': return sign * Math.min(Math.max(share.cents, 0), abs);
    case 'percent': return sign * Math.round((abs * Math.min(Math.max(share.percent, 0), 100)) / 100);
    case 'people': return share.people >= 1 ? sign * Math.round(abs / share.people) : amount;
  }
}

/** Quanto do lançamento conta para o usuário (limites, aportes, totais e relatórios). */
export const myAmount = (t: Pick<Transaction, 'amount' | 'share'>): Cents => shareOf(t.amount, t.share);

/**
 * A mesma divisão expressa como proporção, para aplicar num estorno de valor diferente.
 * Ex.: R$ 100 fixos de uma compra de R$ 300 → 33,33…%.
 */
export function proportionalShare(original: Pick<Transaction, 'amount' | 'share'>): Share | undefined {
  const s = original.share;
  if (!s) return undefined;
  if (s.mode !== 'fixed') return s;
  const abs = Math.abs(original.amount);
  return abs > 0 ? { mode: 'percent', percent: (Math.min(s.cents, abs) / abs) * 100 } : undefined;
}

/** Texto curto da divisão, ex.: "1/3 (3 pessoas)", "50%", "R$ 100,00 fixos". */
export function describeShare(share: Share, format: (c: Cents) => string): string {
  switch (share.mode) {
    case 'fixed': return `${format(share.cents)} fixos`;
    case 'percent': return `${Number(share.percent.toFixed(2)).toLocaleString('pt-BR')}%`;
    case 'people': return `dividido por ${share.people} pessoas`;
  }
}

/** Mesma compra parcelada: mesmo estabelecimento, mesmo valor, mesmo cartão e mesmo total de parcelas. */
export function sameInstallmentPurchase(
  a: Pick<Transaction, 'matchKey' | 'amount' | 'cardLast4' | 'installment' | 'source'>,
  b: Pick<Transaction, 'matchKey' | 'amount' | 'cardLast4' | 'installment' | 'source'>,
): boolean {
  if (!a.installment || !b.installment || !a.matchKey || a.matchKey !== b.matchKey) return false;
  const [, ta] = a.installment.split('/');
  const [, tb] = b.installment.split('/');
  return ta === tb && a.amount === b.amount && (a.cardLast4 ?? '') === (b.cardLast4 ?? '') && a.source === b.source;
}

export const installmentNumber = (installment: string | undefined): number => Number(installment?.split('/')[0] ?? 0);
