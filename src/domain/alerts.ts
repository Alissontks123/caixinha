import { formatMoney } from '../lib/money';
import { monthShort } from '../lib/months';
import { summarizeMonth, type MonthSummary, type SummaryInput } from './summary';
import type { Cents, Month, Transaction } from './types';

export interface CategoryStatus {
  categoryId: string;
  name: string;
  /** 'over' = passou do limite; 'near' = atingiu o % de alerta. */
  level: 'over' | 'near';
  ratio: number;
  contribution: Cents;
  excess: Cents;
}

/** Categorias em alerta num mês (para a faixa do Painel). */
export function monthStatus(summary: MonthSummary, thresholdPct: number): CategoryStatus[] {
  const t = thresholdPct / 100;
  const out: CategoryStatus[] = [];
  for (const c of summary.categories) {
    if (c.contributes === false) continue;
    if (c.spent > c.limit) {
      out.push({ categoryId: c.categoryId, name: c.name, level: 'over', ratio: c.limit ? c.spent / c.limit : Infinity, contribution: c.contribution, excess: c.spent - c.limit });
    } else if (c.limit > 0 && c.spent / c.limit >= t) {
      out.push({ categoryId: c.categoryId, name: c.name, level: 'near', ratio: c.spent / c.limit, contribution: 0, excess: 0 });
    }
  }
  return out.sort((a, b) => (a.level === b.level ? b.ratio - a.ratio : a.level === 'over' ? -1 : 1));
}

export interface ChangeAlert {
  month: Month;
  categoryId: string;
  name: string;
  /** 'new-block' = abriu mais aporte; 'near-limit' = passou a ficar perto do limite. */
  type: 'new-block' | 'near-limit';
  /** Aporte acrescentado pela mudança. */
  added: Cents;
  /** Aporte total da categoria depois da mudança. */
  contribution: Cents;
  ratio: number;
}

/** Alertas causados por trocar a lista de lançamentos por `after`, nos meses afetados. */
export function alertsForChange(input: SummaryInput, after: Transaction[], months: Month[], thresholdPct: number): ChangeAlert[] {
  const unique = [...new Set(months)].sort();
  return unique.flatMap((m) => compareMonth(summarizeMonth(m, input), summarizeMonth(m, { ...input, transactions: after }), thresholdPct));
}

export function describeAlert(a: ChangeAlert): string {
  if (a.type === 'new-block') {
    return `${a.name} (${monthShort(a.month)}): +${formatMoney(a.added)} a aportar · total da categoria ${formatMoney(a.contribution)}`;
  }
  return `${a.name} (${monthShort(a.month)}) chegou a ${Math.round(a.ratio * 100)}% do limite`;
}

/** Compara um mês antes e depois de uma mudança (importação, lançamento manual, troca de categoria). */
export function compareMonth(before: MonthSummary, after: MonthSummary, thresholdPct: number): ChangeAlert[] {
  if (after.closed) return [];
  const t = thresholdPct / 100;
  const alerts: ChangeAlert[] = [];
  for (const c of after.categories) {
    if (c.contributes === false) continue;
    const b = before.categories.find((x) => x.categoryId === c.categoryId);
    const prevContribution = b?.contribution ?? 0;
    const ratio = c.limit > 0 ? c.spent / c.limit : c.spent > 0 ? Infinity : 0;
    if (c.contribution > prevContribution) {
      alerts.push({ month: after.month, categoryId: c.categoryId, name: c.name, type: 'new-block', added: c.contribution - prevContribution, contribution: c.contribution, ratio });
      continue;
    }
    const prevRatio = b && b.limit > 0 ? b.spent / b.limit : 0;
    if (c.limit > 0 && c.spent <= c.limit && ratio >= t && prevRatio < t) {
      alerts.push({ month: after.month, categoryId: c.categoryId, name: c.name, type: 'near-limit', added: 0, contribution: c.contribution, ratio });
    }
  }
  return alerts;
}
