import { addMonths, monthRange } from '../lib/months';
import { matchKeyOf } from './categorize';
import { installmentNumber, myAmount } from './share';
import type { Cents, Month, Transaction } from './types';

// ---------- previsão até o fim do mês ----------

/** Dias do mês (28 a 31). */
export const daysInMonth = (month: Month): number => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

/**
 * Previsão de quanto a categoria vai gastar até o fim do mês, no ritmo atual:
 * gasto até hoje ÷ dias que passaram × dias do mês. Só a partir do dia 5 (antes disso o ritmo engana).
 */
export function forecastMonth(spent: Cents, month: Month, today: string): Cents | undefined {
  if (today.slice(0, 7) !== month || spent <= 0) return undefined;
  const day = Number(today.slice(8, 10));
  if (day < 5) return undefined;
  const total = daysInMonth(month);
  if (day >= total) return undefined;
  return Math.round((spent / day) * total);
}

/** Variação em relação ao mês anterior (0,18 = 18% a mais). `undefined` quando não dá para comparar. */
export function changeVsPrevious(spent: Cents, previous: Cents): number | undefined {
  if (previous <= 0) return undefined;
  return (spent - previous) / previous;
}

// ---------- parcelas futuras ----------

export interface FutureInstallment {
  month: Month;
  description: string;
  categoryId: string;
  /** Parte do usuário (respeita a divisão). */
  amount: Cents;
  /** Ex.: "4/10". */
  installment: string;
}

const purchaseKey = (t: Transaction) => {
  const total = t.installment?.split('/')[1];
  return [t.source, t.matchKey ?? matchKeyOf(t.description), t.amount, t.cardLast4 ?? '', total].join('|');
};

/**
 * Parcelas que ainda vão chegar nas próximas faturas, a partir da última parcela já importada de cada compra.
 * Ex.: "3/10" em novembro → "4/10" em dezembro, ... "10/10" em junho.
 */
export function futureInstallments(transactions: Transaction[]): FutureInstallment[] {
  const latest = new Map<string, Transaction>();
  for (const t of transactions) {
    if (!t.installment || t.amount <= 0) continue;
    if (t.avista) continue; // compra considerada à vista: as próximas parcelas não contam
    const key = purchaseKey(t);
    const cur = latest.get(key);
    if (!cur || installmentNumber(t.installment) > installmentNumber(cur.installment)) latest.set(key, t);
  }
  const out: FutureInstallment[] = [];
  for (const t of latest.values()) {
    const [n, total] = t.installment!.split('/').map(Number);
    for (let k = n + 1; k <= total; k++) {
      out.push({
        month: addMonths(t.month, k - n),
        description: t.description.replace(/\s*-?\s*parcela\s*\d+\s*\/\s*\d+/i, '').trim(),
        categoryId: t.categoryId,
        amount: myAmount(t),
        installment: `${k}/${total}`,
      });
    }
  }
  return out.sort((a, b) => a.month.localeCompare(b.month) || b.amount - a.amount);
}

/** Total das parcelas futuras por mês, do mês seguinte a `from` até `count` meses depois. */
export function futureByMonth(items: FutureInstallment[], from: Month, count: number): { month: Month; total: Cents; items: FutureInstallment[] }[] {
  return monthRange(addMonths(from, 1), addMonths(from, count)).map((month) => {
    const list = items.filter((i) => i.month === month);
    return { month, total: list.reduce((s, i) => s + i.amount, 0), items: list };
  });
}

// ---------- gastos recorrentes ----------

/** O que identifica um gasto recorrente: o estabelecimento (sem números nem "Parcela"). */
export const recurringKey = (t: Pick<Transaction, 'matchKey' | 'description'>): string => t.matchKey || matchKeyOf(t.description);

export interface RecurringStatus {
  key: string;
  description: string;
  categoryId: string;
  /** Lançamento deste mês, se já apareceu. */
  current?: Transaction;
  /** Última vez antes deste mês. */
  previous?: Transaction;
  state: 'ok' | 'changed' | 'missing';
}

/** Situação de cada gasto recorrente no mês: já apareceu, apareceu com valor diferente ou ainda não apareceu. */
export function recurringStatus(transactions: Transaction[], month: Month): RecurringStatus[] {
  const keys = new Set(transactions.filter((t) => t.recurring).map(recurringKey));
  const out: RecurringStatus[] = [];
  for (const key of keys) {
    const same = transactions.filter((t) => recurringKey(t) === key && t.amount > 0);
    if (!same.some((t) => t.month <= month)) continue; // ainda não tinha começado
    const current = same.filter((t) => t.month === month).sort((a, b) => a.date.localeCompare(b.date))[0];
    const previous = same.filter((t) => t.month < month).sort((a, b) => b.month.localeCompare(a.month) || b.date.localeCompare(a.date))[0];
    if (!current && !previous) continue;
    const ref = current ?? previous!;
    const state = !current ? 'missing' : previous && myAmount(previous) !== myAmount(current) ? 'changed' : 'ok';
    out.push({ key, description: ref.description, categoryId: ref.categoryId, current, previous, state });
  }
  const order = { missing: 0, changed: 1, ok: 2 };
  return out.sort((a, b) => order[a.state] - order[b.state] || a.description.localeCompare(b.description));
}

// ---------- meta da caixinha ----------

export interface GoalProgress {
  goal: Cents;
  balance: Cents;
  /** 0 a 1. */
  ratio: number;
  missing: Cents;
  /** Meses que faltam, contando o atual (0 se a data já passou). */
  monthsLeft: number;
  /** Quanto aportar por mês para chegar na meta (undefined se já chegou ou a data passou). */
  perMonth?: Cents;
  reached: boolean;
}

export function goalProgress(goal: Cents, goalMonth: Month, balance: Cents, today: Month): GoalProgress {
  const missing = Math.max(goal - balance, 0);
  const monthsLeft = goalMonth >= today ? monthRange(today, goalMonth).length : 0;
  return {
    goal, balance,
    ratio: goal > 0 ? Math.min(Math.max(balance / goal, 0), 1) : 0,
    missing, monthsLeft,
    perMonth: missing > 0 && monthsLeft > 0 ? Math.ceil(missing / monthsLeft) : undefined,
    reached: missing === 0,
  };
}
