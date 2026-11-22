import { useMemo } from 'react';
import { computeLedger, computeStatements, startMonthOf } from './domain/ledger';
import { extraPaid, newMilestones, organizedDeadline, ownedItems, STAR_RULES, starEntries, starTotals, type StarEntry, type StarRecord, type StarsInput } from './domain/stars';
import { summarizeMonth } from './domain/summary';
import { formatMoney } from './lib/money';
import { addMonths, currentMonth, dateLabel, monthShort, todayISO } from './lib/months';
import { summaryInput, type ReadyData } from './useAppData';

/** Linha da previsão do mês atual na Loja. */
export interface ForecastLine { label: string; amount: number; done: boolean }

export interface StarsState {
  entries: StarEntry[];
  earned: number;
  spent: number;
  balance: number;
  owned: Set<string>;
  forecast: ForecastLine[];
  /** Marcos da meta alcançados e ainda não registrados (o App registra). */
  milestones: StarRecord[];
}

export function starsInput(data: ReadyData, today = todayISO()): StarsInput {
  const sInput = summaryInput(data);
  return {
    profile: data.profile, fixedVersions: data.fixedVersions, closings: data.closings, movements: data.movements, today,
    records: data.stars, forecast: (m) => summarizeMonth(m, sInput).overflowTotal,
  };
}

export function computeStars(data: ReadyData, today = todayISO()): StarsState {
  const input = starsInput(data, today);
  const entries = starEntries(input);
  const totals = starTotals(entries);
  return { entries, ...totals, owned: ownedItems(data.stars), forecast: monthForecast(data, input, entries), milestones: newMilestones(input) };
}

export function useStars(data: ReadyData | undefined): StarsState | undefined {
  return useMemo(() => (data?.profile ? computeStars(data as ReadyData) : undefined), [data]);
}

/** O que ainda dá para ganhar no mês atual (e o que já foi ganho nele). */
function monthForecast(data: ReadyData, input: StarsInput, entries: StarEntry[]): ForecastLine[] {
  const month = currentMonth();
  if (month < startMonthOf(data.profile)) return [];
  const has = (id: string) => entries.some((e) => e.id === id);
  const lines: ForecastLine[] = [];
  const summary = summarizeMonth(month, summaryInput(data));
  const withLimit = summary.categories.filter((c) => c.contributes !== false && c.limit > 0);
  const within = withLimit.filter((c) => c.contribution === 0);
  if (withLimit.length) {
    lines.push({ label: `Categorias dentro do limite: ${within.length} de ${withLimit.length} até agora (contam ao fechar o mês)`, amount: within.length * STAR_RULES.categoria, done: false });
  }
  const st = computeStatements(input, month, input.forecast).find((s) => s.month === month);
  if (st && st.fixed > 0) {
    const fixoOk = has(`fixo:${month}`);
    lines.push({ label: fixoOk ? `Aporte fixo de ${monthShort(month)} pago` : `Pagar o aporte fixo de ${monthShort(month)} (${formatMoney(st.fixed)})`, amount: STAR_RULES.fixo, done: fixoOk });
    const extraOk = has(`extra:${month}`);
    const falta = Math.max(Math.ceil(st.fixed * STAR_RULES.extraPct) - Math.max(extraPaid(st), 0), 0);
    lines.push({ label: extraOk ? `Aporte extra em ${monthShort(month)} feito` : `Aplicar mais ${formatMoney(falta)} além do devido no mês`, amount: STAR_RULES.extra, done: extraOk });
  }
  lines.push({ label: `Fechar ${monthShort(month)} até ${dateLabel(organizedDeadline(month))}`, amount: STAR_RULES.organizado, done: false });

  // sequência: quantos meses fechados seguidos sem estourar já tem
  const closed = new Map(data.closings.map((c) => [c.month, c]));
  let streak = 0;
  for (let m = addMonths(month, -1); m >= startMonthOf(data.profile); m = addMonths(m, -1)) {
    const c = closed.get(m);
    if (!c || c.overflowTotal > 0) break;
    streak += 1;
  }
  const left = STAR_RULES.sequenciaMeses - (streak % STAR_RULES.sequenciaMeses);
  lines.push({ label: `Sequência sem estourar: faltam ${left} ${left === 1 ? 'mês fechado' : 'meses fechados'}`, amount: STAR_RULES.sequencia, done: false });

  const goal = data.profile.goalAmount ?? 0;
  if (goal > 0) {
    const reached = new Set(data.stars.filter((r) => r.kind === 'marco').map((r) => r.item));
    const next = STAR_RULES.metaMarcos.find((p) => !reached.has(`meta:${p}`));
    if (next) {
      const target = Math.ceil((goal * next) / 100);
      const balance = computeLedger(input).balance;
      lines.push({ label: `Chegar a ${formatMoney(target)} na caixinha (${next}% da meta; faltam ${formatMoney(Math.max(target - balance, 0))})`, amount: STAR_RULES.meta, done: false });
    }
  }
  // do menor para o maior número de estrelas
  return lines.sort((a, b) => a.amount - b.amount);
}
