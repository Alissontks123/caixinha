import { effectiveAmount, myAmount } from '../domain/share';
import { allocationParts, isAllocated } from '../domain/allocation';
import { formatMoney } from '../lib/money';
import { computeLedger, computeStatements, type MonthLedger, type MonthStatement } from '../domain/ledger';
import { summarizeMonth, type MonthSummary } from '../domain/summary';
import type { CaixinhaMovement, Cents, ISODate, Month } from '../domain/types';
import { monthLabel, monthRange } from '../lib/months';
import { summaryInput, type ReadyData } from '../useAppData';

export interface ReportMonth {
  month: Month;
  summary: MonthSummary;
  ledger?: MonthLedger;
  /** Formato de fatura: saldo anterior + do mês − aportado = falta. */
  statement?: MonthStatement;
}

export interface ReportTransaction {
  date: ISODate;
  month: Month;
  description: string;
  category: string;
  /** Parte do usuário. */
  amount: Cents;
  /** Valor total da fatura, só quando o gasto foi dividido. */
  total?: Cents;
  source: string;
  installment?: string;
  card?: string;
}

export interface ReportMovement {
  date: ISODate;
  type: string;
  amount: Cents;
  source: string;
}

export interface Report {
  name: string;
  from: Month;
  to: Month;
  title: string;
  generatedAt: ISODate;
  months: ReportMonth[];
  transactions: ReportTransaction[];
  movements: ReportMovement[];
  balance: Cents;
  pendingTotal: Cents;
}

const SOURCE: Record<string, string> = {
  manual: 'Manual', 'fatura-c6': 'Fatura C6', 'fatura-nubank': 'Fatura Nubank', 'extrato-nubank': 'Extrato Nubank', extrato: 'Extrato Nubank',
};
const MOVE: Record<CaixinhaMovement['type'], string> = { aplicacao: 'Aplicação', resgate: 'Resgate', saldo_informado: 'Saldo informado' };

export function buildReport(data: ReadyData, from: Month, to: Month, today: ISODate): Report {
  const input = summaryInput(data);
  const ledger = computeLedger({ profile: data.profile, fixedVersions: data.fixedVersions, closings: data.closings, movements: data.movements, today });
  const statements = computeStatements(
    { profile: data.profile, fixedVersions: data.fixedVersions, closings: data.closings, movements: data.movements, today },
    to,
    (m) => summarizeMonth(m, input).overflowTotal,
  );
  const months = monthRange(from, to).map((month) => ({
    month,
    summary: summarizeMonth(month, input),
    ledger: ledger.months.find((l) => l.month === month),
    statement: statements.find((s) => s.month === month),
  }));
  const catName = new Map(data.categories.map((c) => [c.id, c.name]));
  const inRange = (m: Month) => m >= from && m <= to;
  const transactions = data.transactions
    .filter((t) => inRange(t.month))
    .sort((a, b) => a.month.localeCompare(b.month) || a.date.localeCompare(b.date))
    .map((t) => ({
      date: t.date, month: t.month, description: t.description, category: isAllocated(t)
        ? `Rateado: ${allocationParts(t).map((p) => `${catName.get(p.categoryId) ?? '—'} ${formatMoney(p.amount)}`).join(' + ')}`
        : catName.get(t.categoryId) ?? '—',
      amount: myAmount(t), total: t.share ? effectiveAmount(t) : undefined, source: SOURCE[t.source] ?? t.source, installment: t.installment, card: t.cardLast4,
    }));
  const movements = data.movements
    .filter((m) => !m.deleted && inRange(m.date.slice(0, 7)))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({ date: m.date, type: MOVE[m.type], amount: m.amount, source: SOURCE[m.source] ?? m.source }));
  return {
    name: data.profile.name,
    from,
    to,
    title: from === to ? monthLabel(from) : `${monthLabel(from)} a ${monthLabel(to)}`,
    generatedAt: today,
    months,
    transactions,
    movements,
    balance: ledger.balance,
    // o que falta no último mês do período já inclui o que veio dos meses anteriores
    pendingTotal: months[months.length - 1]?.statement?.remaining ?? 0,
  };
}

export const reportFileName = (r: Report, ext: string) =>
  `relatorio-${r.name.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}-${r.from}${r.from === r.to ? '' : `_a_${r.to}`}.${ext}`;
