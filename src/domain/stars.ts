/**
 * Estrelas (pontos da gamificação).
 *
 * As estrelas ganhas são RECALCULADAS sempre a partir dos dados (meses fechados, aportes na caixinha):
 * se um mês for reaberto e mudar, o saldo acompanha. A exceção são os marcos da meta, que valem uma vez
 * na vida e por isso ficam registrados. As compras da loja também ficam registradas (tabela `stars`).
 */
import { addMonths, lastDay as lastDayOf, monthOf, monthRange, monthShort } from '../lib/months';
import { computeLedger, computeStatements, startMonthOf, type LedgerInput } from './ledger';
import { fixedForMonth } from './rules';
import type { Cents, ISODate, Month } from './types';

export const STAR_RULES = {
  /** Categoria com limite que fechou o mês sem gerar aporte. */
  categoria: 100,
  /** Aporte fixo do mês pago por completo. */
  fixo: 100,
  /** Aporte extra (além do devido) de pelo menos 20% do fixo, uma vez por mês. */
  extra: 300,
  extraPct: 0.2,
  /** Mês fechado até o dia 10 do mês seguinte. */
  organizado: 50,
  organizadoDia: 10,
  /** A cada 3 meses fechados seguidos sem nenhuma categoria estourar. */
  sequencia: 500,
  sequenciaMeses: 3,
  /** Marcos da meta da caixinha (uma vez na vida cada). */
  meta: 250,
  metaMarcos: [25, 50, 75, 100] as const,
};

export const STAR_PRICES = { avatarLoja: 100, temaComum: 200, avatarPremium: 300, temaPremium: 500, lendario: 1000 };

/** Registro guardado (e sincronizado): compra na loja ou marco da meta alcançado. */
export interface StarRecord {
  id: string;
  kind: 'compra' | 'marco';
  /** Compra: 'tema:<id>', 'avatar:<id>' ou 'lendario:<id>' (avatar + tema). Marco: 'meta:<pct>'. */
  item: string;
  /** Sempre positivo (a compra desconta, o marco soma). */
  amount: number;
  date: ISODate;
  label: string;
  /** Compra que veio da Caixa surpresa. */
  box?: boolean;
  /** Quando a caixa foi aberta (ms), para a garantia de premium. */
  openedAt?: number;
  updatedAt?: number;
}

export type StarGroup = 'categoria' | 'fixo' | 'extra' | 'organizado' | 'sequencia' | 'meta' | 'compra';

/** Linha do extrato de estrelas (positivo = ganhou, negativo = gastou). */
export interface StarEntry {
  id: string;
  group: StarGroup;
  date: ISODate;
  label: string;
  amount: number;
}

export interface StarsInput extends LedgerInput {
  records: StarRecord[];
  /** Aporte previsto por gastos excedentes de um mês ainda aberto (para a regra do aporte extra). */
  forecast?: (m: Month) => Cents;
}

/** Prazo do "mês organizado": dia 10 do mês seguinte. */
export const organizedDeadline = (m: Month): ISODate => `${addMonths(m, 1)}-${String(STAR_RULES.organizadoDia).padStart(2, '0')}`;

/** Quanto foi aplicado no mês além do devido (fixo + excedentes + resgates + o que faltava de antes). */
export const extraPaid = (s: { paid: Cents; fixed: Cents; overflow: Cents; resgates: Cents; previous: Cents }) =>
  s.paid - (s.fixed + s.overflow + s.resgates + Math.max(s.previous, 0));

/** Todas as estrelas: ganhas (calculadas + marcos) e gastas (compras). Mais recentes primeiro. */
export function starEntries(input: StarsInput): StarEntry[] {
  const out: StarEntry[] = [];
  const start = startMonthOf(input.profile);
  const todayMonth = input.today.slice(0, 7);
  const closings = [...input.closings].filter((c) => c.month >= start).sort((a, b) => a.month.localeCompare(b.month));

  // categorias dentro do limite e mês organizado (só meses fechados)
  for (const c of closings) {
    for (const cat of c.categories) {
      if (cat.contributes === false || cat.limit <= 0 || cat.contribution > 0) continue;
      out.push({ id: `cat:${c.month}:${cat.categoryId}`, group: 'categoria', date: c.closedAt, amount: STAR_RULES.categoria, label: `${cat.name} dentro do limite · ${monthShort(c.month)}` });
    }
    if (c.closedAt <= organizedDeadline(c.month)) {
      out.push({ id: `org:${c.month}`, group: 'organizado', date: c.closedAt, amount: STAR_RULES.organizado, label: `${monthShort(c.month)} fechado em dia` });
    }
  }

  // sequência de meses fechados sem estourar
  const closedBy = new Map(closings.map((c) => [c.month, c]));
  if (closings.length) {
    let streak = 0;
    for (let m = start; m <= closings[closings.length - 1].month; m = addMonths(m, 1)) {
      const c = closedBy.get(m);
      if (c && c.overflowTotal === 0 && c.categories.every((x) => x.contribution === 0)) {
        streak += 1;
        if (streak % STAR_RULES.sequenciaMeses === 0) {
          out.push({ id: `seq:${m}`, group: 'sequencia', date: c.closedAt, amount: STAR_RULES.sequencia, label: `${STAR_RULES.sequenciaMeses} meses seguidos sem estourar (até ${monthShort(m)})` });
        }
      } else streak = 0;
    }
  }

  // aporte fixo pago por completo
  for (const [month, date] of fixedPaidMonths(input)) {
    out.push({ id: `fixo:${month}`, group: 'fixo', date, amount: STAR_RULES.fixo, label: `Aporte fixo de ${monthShort(month)} pago` });
  }

  // aporte extra: uma vez por mês
  for (const s of computeStatements(input, todayMonth, input.forecast)) {
    if (s.month > todayMonth || s.fixed <= 0) continue;
    if (extraPaid(s) >= Math.ceil(s.fixed * STAR_RULES.extraPct)) {
      out.push({ id: `extra:${s.month}`, group: 'extra', date: s.month === todayMonth ? input.today : lastDayOf(s.month), amount: STAR_RULES.extra, label: `Aporte extra em ${monthShort(s.month)}` });
    }
  }

  // registrados: marcos (somam) e compras (descontam)
  for (const r of input.records) {
    out.push({ id: r.id, group: r.kind === 'compra' ? 'compra' : 'meta', date: r.date, label: r.label, amount: r.kind === 'compra' ? -r.amount : r.amount });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
}

/**
 * Meses com o aporte fixo pago e a data em que ficou completo.
 * Cada aplicação quita primeiro o que está em aberto até o mês dela (o mais antigo antes; o fixo antes do
 * excedente). O que sobra NÃO adianta o fixo dos meses seguintes: pagar adiantado conta como aporte extra.
 */
export function fixedPaidMonths(input: LedgerInput): Map<Month, ISODate> {
  const start = startMonthOf(input.profile);
  const todayMonth = monthOf(input.today);
  const out = new Map<Month, ISODate>();
  if (todayMonth < start) return out;
  const valid = input.movements.filter((m) => !m.deleted && m.date > input.profile.caixinhaStartDate);
  const overflow = new Map(input.closings.filter((c) => c.month >= start).map((c) => [c.month, c.overflowTotal]));
  const open: { month: Month; fixo: boolean; left: Cents }[] = [];
  for (const month of monthRange(start, todayMonth)) {
    const fixed = fixedForMonth(input.fixedVersions, month, start);
    if (fixed > 0) open.push({ month, fixo: true, left: fixed });
    if ((overflow.get(month) ?? 0) > 0) open.push({ month, fixo: false, left: overflow.get(month)! });
    for (const r of valid.filter((m) => m.type === 'resgate' && monthOf(m.date) === month)) open.push({ month, fixo: false, left: r.amount });
    const pays = valid.filter((m) => m.type === 'aplicacao' && monthOf(m.date) === month).sort((a, b) => a.date.localeCompare(b.date));
    for (const p of pays) {
      let amount = p.amount;
      for (const d of open) {
        if (amount <= 0) break;
        if (d.left <= 0) continue;
        const used = Math.min(amount, d.left);
        d.left -= used;
        amount -= used;
        if (d.fixo && d.left === 0) out.set(d.month, p.date);
      }
    }
  }
  return out;
}

export function starTotals(entries: StarEntry[]) {
  const earned = entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const spent = -entries.filter((e) => e.amount < 0).reduce((s, e) => s + e.amount, 0);
  return { earned, spent, balance: earned - spent };
}

/** Marcos da meta já alcançados que ainda não foram registrados (o app registra e eles ficam para sempre). */
export function newMilestones(input: StarsInput): StarRecord[] {
  const goal = input.profile.goalAmount ?? 0;
  if (goal <= 0) return [];
  const balance = computeLedger(input).balance;
  const have = new Set(input.records.filter((r) => r.kind === 'marco').map((r) => r.item));
  return STAR_RULES.metaMarcos
    .filter((p) => balance >= Math.ceil((goal * p) / 100) && !have.has(`meta:${p}`))
    .map((p) => ({ id: `marco-meta-${p}`, kind: 'marco' as const, item: `meta:${p}`, amount: STAR_RULES.meta, date: input.today, label: `Meta da caixinha: ${p}% alcançado` }));
}

/** Itens comprados ('tema:<id>', 'avatar:<id>'). */
export function ownedItems(records: StarRecord[]): Set<string> {
  return new Set(records.filter((r) => r.kind === 'compra').map((r) => r.item));
}
