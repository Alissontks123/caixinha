import { addMonths, monthRange } from '../lib/months';
import type { Month, Transaction } from './types';

export type RangeKey = '6' | '12' | 'all';

/** Primeiro mês com dados: o menor entre o início da caixinha e o lançamento mais antigo. */
export function earliestMonth(startMonth: Month, transactions: Transaction[]): Month {
  return transactions.reduce((min, t) => (t.month < min ? t.month : min), startMonth);
}

/** Meses exibidos nos gráficos, terminando no mês atual. */
export function historyMonths(range: RangeKey, earliest: Month, current: Month): Month[] {
  const from = range === 'all' ? earliest : addMonths(current, -(Number(range) - 1));
  return monthRange(from <= current ? from : current, current);
}
