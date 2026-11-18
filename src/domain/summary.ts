import { fixedForMonth, overflowContribution, ruleContributes, ruleForMonth } from './rules';
import type {
  Category, CategoryRuleVersion, Cents, ClosedCategory, FixedContributionVersion,
  Month, MonthClosing, Transaction,
} from './types';

export interface MonthSummary {
  month: Month;
  closed: boolean;
  closedAt?: string;
  /** Categorias com limite (kind 'normal'). */
  categories: ClosedCategory[];
  unidentifiedCount: number;
  unidentifiedTotal: Cents;
  ignoredTotal: Cents;
  fixed: Cents;
  overflowTotal: Cents;
  totalDue: Cents;
}

export interface SummaryInput {
  categories: Category[];
  rules: CategoryRuleVersion[];
  fixedVersions: FixedContributionVersion[];
  transactions: Transaction[];
  closings: MonthClosing[];
  startMonth: Month;
}

/** Calcula os números de um mês. Meses fechados usam a fotografia congelada. */
export function summarizeMonth(month: Month, input: SummaryInput): MonthSummary {
  const txs = input.transactions.filter((t) => t.month === month);
  const unidentifiedIds = new Set(input.categories.filter((c) => c.kind === 'unidentified').map((c) => c.id));
  const unidentified = txs.filter((t) => unidentifiedIds.has(t.categoryId));
  const unidentifiedCount = unidentified.length;
  const unidentifiedTotal = unidentified.reduce((s, t) => s + t.amount, 0);

  const closing = input.closings.find((c) => c.month === month);
  if (closing) {
    return {
      month,
      closed: true,
      closedAt: closing.closedAt,
      categories: closing.categories,
      unidentifiedCount,
      unidentifiedTotal,
      ignoredTotal: closing.ignoredTotal,
      fixed: closing.fixed,
      overflowTotal: closing.overflowTotal,
      totalDue: closing.fixed + closing.overflowTotal,
    };
  }

  const spentBy = new Map<string, Cents>();
  for (const t of txs) spentBy.set(t.categoryId, (spentBy.get(t.categoryId) ?? 0) + t.amount);

  const categories: ClosedCategory[] = input.categories
    .filter((c) => c.kind === 'normal')
    .map((c) => {
      const rule = ruleForMonth(input.rules, c.id, month);
      const contributes = !!rule && ruleContributes(rule);
      const spent = spentBy.get(c.id) ?? 0;
      const limit = contributes ? rule.limit : 0;
      const blockSize = contributes ? rule.blockSize : 0;
      const blockAmount = contributes ? rule.blockAmount : 0;
      return {
        categoryId: c.id,
        name: c.name,
        color: c.color,
        spent,
        limit,
        blockSize,
        blockAmount,
        contribution: contributes ? overflowContribution(spent, limit, blockSize, blockAmount) : 0,
        contributes,
      };
    });

  const ignoredIds = new Set(input.categories.filter((c) => c.kind === 'ignored').map((c) => c.id));
  const ignoredTotal = txs.filter((t) => ignoredIds.has(t.categoryId)).reduce((s, t) => s + t.amount, 0);
  const fixed = fixedForMonth(input.fixedVersions, month, input.startMonth);
  const overflowTotal = categories.reduce((s, c) => s + c.contribution, 0);

  return {
    month,
    closed: false,
    categories,
    unidentifiedCount,
    unidentifiedTotal,
    ignoredTotal,
    fixed,
    overflowTotal,
    totalDue: fixed + overflowTotal,
  };
}

/** Motivo pelo qual o mês ainda não pode ser fechado (ou null se pode). */
export function closeBlocker(summary: MonthSummary, current: Month): string | null {
  if (summary.closed) return 'Este mês já está fechado.';
  if (summary.month >= current) return 'Só é possível fechar um mês depois que ele terminar.';
  if (summary.unidentifiedCount > 0) {
    return `Ainda há ${summary.unidentifiedCount} lançamento(s) em "A identificar". Classifique-os antes de fechar.`;
  }
  return null;
}
