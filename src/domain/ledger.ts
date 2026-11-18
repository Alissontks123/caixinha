import { firstDay, monthOf, monthRange, nextDay } from '../lib/months';
import { fixedForMonth } from './rules';
import type {
  CaixinhaMovement, Cents, FixedContributionVersion, ISODate, Month, MonthClosing, Profile,
} from './types';

export type DebtKind = 'fixo' | 'estouro' | 'resgate';

export interface Debt {
  refMonth: Month;
  /** Data em que a dívida passa a existir. */
  date: ISODate;
  kind: DebtKind;
  amount: Cents;
}

export interface MonthLedger {
  month: Month;
  fixed: Cents;
  overflow: Cents;
  resgates: Cents;
  due: Cents;
  paid: Cents;
  pending: Cents;
  /** true quando os estouros já foram apurados (mês fechado). */
  closed: boolean;
}

export interface Ledger {
  months: MonthLedger[];
  totalDue: Cents;
  totalPaid: Cents;
  totalPending: Cents;
  /** Aplicações que sobraram depois de quitar todas as dívidas (abatem as próximas). */
  credit: Cents;
  balance: Cents;
  totalApplied: Cents;
  totalWithdrawn: Cents;
  /** Diferença acumulada entre saldos reais informados e o saldo calculado. */
  earnings: Cents;
  /** Movimentos anteriores à data de início (não entram em nada). */
  ignoredMovements: number;
}

export interface LedgerInput {
  profile: Profile;
  fixedVersions: FixedContributionVersion[];
  closings: MonthClosing[];
  movements: CaixinhaMovement[];
  today: ISODate;
}

/**
 * Primeiro mês controlado: o mês do dia SEGUINTE ao saldo inicial
 * (saldo informado em 31/08 → começa em setembro; em 17/11 → começa em novembro).
 */
export function startMonthOf(profile: Pick<Profile, 'caixinhaStartDate'>): Month {
  return monthOf(nextDay(profile.caixinhaStartDate));
}

/** Monta a lista de dívidas: aporte fixo, estouros (mês fechado) e resgates. */
export function buildDebts(input: LedgerInput): Debt[] {
  const startMonth = startMonthOf(input.profile);
  const debts: Debt[] = [];
  for (const m of monthRange(startMonth, monthOf(input.today))) {
    const amount = fixedForMonth(input.fixedVersions, m, startMonth);
    if (amount > 0) debts.push({ refMonth: m, date: firstDay(m), kind: 'fixo', amount });
  }
  for (const c of input.closings) {
    if (c.month >= startMonth && c.overflowTotal > 0) {
      debts.push({ refMonth: c.month, date: c.closedAt, kind: 'estouro', amount: c.overflowTotal });
    }
  }
  for (const mv of validMovements(input)) {
    if (mv.type === 'resgate') debts.push({ refMonth: monthOf(mv.date), date: mv.date, kind: 'resgate', amount: mv.amount });
  }
  return debts;
}

/** Movimentos depois da data do saldo inicial (o saldo inicial é o do FINAL daquele dia). */
function validMovements(input: LedgerInput): CaixinhaMovement[] {
  return input.movements.filter((m) => !m.deleted && m.date > input.profile.caixinhaStartDate);
}

/**
 * Calcula a situação da caixinha.
 * Os eventos são processados em ordem de data. Cada aplicação quita primeiro a dívida
 * do mês mais antigo; o que sobra vira crédito que abate as próximas dívidas.
 */
export function computeLedger(input: LedgerInput): Ledger {
  const debts = buildDebts(input);
  const movements = validMovements(input);

  type Event =
    | { date: ISODate; order: number; debt: Debt }
    | { date: ISODate; order: number; payment: Cents };
  const events: Event[] = [
    // no mesmo dia, a dívida nasce antes da aplicação (aplicar no dia 1º quita o fixo do mês)
    ...debts.map((debt) => ({ date: debt.date, order: 0, debt })),
    ...movements.filter((m) => m.type === 'aplicacao').map((m) => ({ date: m.date, order: 1, payment: m.amount })),
  ];
  events.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);

  const open: { debt: Debt; remaining: Cents }[] = [];
  const paidByMonth = new Map<Month, Cents>();
  let credit = 0;

  const pay = (amount: Cents): Cents => {
    open.sort((a, b) => a.debt.refMonth.localeCompare(b.debt.refMonth) || a.debt.date.localeCompare(b.debt.date));
    let left = amount;
    for (const item of open) {
      if (left <= 0) break;
      const used = Math.min(left, item.remaining);
      item.remaining -= used;
      left -= used;
      paidByMonth.set(item.debt.refMonth, (paidByMonth.get(item.debt.refMonth) ?? 0) + used);
    }
    for (let i = open.length - 1; i >= 0; i--) if (open[i].remaining === 0) open.splice(i, 1);
    return left;
  };

  for (const ev of events) {
    if ('debt' in ev) {
      open.push({ debt: ev.debt, remaining: ev.debt.amount });
      if (credit > 0) credit = pay(credit);
    } else {
      credit += pay(ev.payment);
    }
  }

  // agrupa por mês de referência
  const byMonth = new Map<Month, MonthLedger>();
  const startMonth = startMonthOf(input.profile);
  for (const m of monthRange(startMonth, monthOf(input.today))) byMonth.set(m, emptyMonth(m));
  for (const d of debts) {
    const row = byMonth.get(d.refMonth) ?? emptyMonth(d.refMonth);
    if (d.kind === 'fixo') row.fixed += d.amount;
    if (d.kind === 'estouro') row.overflow += d.amount;
    if (d.kind === 'resgate') row.resgates += d.amount;
    row.due += d.amount;
    byMonth.set(d.refMonth, row);
  }
  const closedMonths = new Set(input.closings.map((c) => c.month));
  for (const row of byMonth.values()) {
    row.paid = paidByMonth.get(row.month) ?? 0;
    row.pending = row.due - row.paid;
    row.closed = closedMonths.has(row.month);
  }
  const months = [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));

  const { balance, earnings, totalApplied, totalWithdrawn } = balanceOf(input.profile.caixinhaStartBalance, movements);

  const totalDue = debts.reduce((s, d) => s + d.amount, 0);
  const totalPaid = [...paidByMonth.values()].reduce((s, v) => s + v, 0);
  return {
    months,
    totalDue,
    totalPaid,
    totalPending: totalDue - totalPaid,
    credit,
    balance,
    totalApplied,
    totalWithdrawn,
    earnings,
    ignoredMovements: input.movements.filter((m) => !m.deleted).length - movements.length,
  };
}

/** Saldo a partir do inicial, aplicando os movimentos em ordem de data. */
function balanceOf(start: Cents, movements: CaixinhaMovement[]) {
  let balance = start;
  let earnings = 0;
  let totalApplied = 0;
  let totalWithdrawn = 0;
  const ordered = [...movements].sort(
    (a, b) => a.date.localeCompare(b.date) || Number(a.type === 'saldo_informado') - Number(b.type === 'saldo_informado'),
  );
  for (const m of ordered) {
    if (m.type === 'aplicacao') { balance += m.amount; totalApplied += m.amount; }
    if (m.type === 'resgate') { balance -= m.amount; totalWithdrawn += m.amount; }
    if (m.type === 'saldo_informado') { earnings += m.amount - balance; balance = m.amount; }
  }
  return { balance, earnings, totalApplied, totalWithdrawn };
}

/** Saldo estimado da caixinha no fim de cada mês (a partir do mês de início). */
export function balanceByMonth(input: Omit<LedgerInput, 'fixedVersions' | 'closings'>, months: Month[]): { month: Month; balance: Cents }[] {
  const start = startMonthOf(input.profile);
  const valid = input.movements.filter((m) => !m.deleted && m.date > input.profile.caixinhaStartDate);
  return months
    .filter((m) => m >= monthOf(input.profile.caixinhaStartDate))
    .map((month) => {
      const until = `${month}-31`; // comparação de texto: cobre qualquer dia do mês
      const balance = month < start ? input.profile.caixinhaStartBalance : balanceOf(input.profile.caixinhaStartBalance, valid.filter((m) => m.date <= until)).balance;
      return { month, balance };
    });
}

function emptyMonth(month: Month): MonthLedger {
  return { month, fixed: 0, overflow: 0, resgates: 0, due: 0, paid: 0, pending: 0, closed: false };
}
