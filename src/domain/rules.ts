import type { Cents, CategoryRuleVersion, FixedContributionVersion, Month } from './types';

/**
 * Aporte por estouro de limite:
 *   aporte = arredondar_para_cima((gasto − limite) / X) × Y
 * Ex.: limite 500, X 100, Y 50, gasto 650 → ceil(150/100) = 2 blocos → 100.
 */
export function overflowContribution(spent: Cents, limit: Cents, blockSize: Cents, blockAmount: Cents): Cents {
  if (spent <= limit || blockSize <= 0) return 0;
  return Math.ceil((spent - limit) / blockSize) * blockAmount;
}

/** Quantos blocos de excedente foram abertos. */
export function overflowBlocks(spent: Cents, limit: Cents, blockSize: Cents): number {
  if (spent <= limit || blockSize <= 0) return 0;
  return Math.ceil((spent - limit) / blockSize);
}

/** Quanto ainda pode ser gasto até abrir o próximo bloco (ou até estourar o limite). */
export function roomUntilNextBlock(spent: Cents, limit: Cents, blockSize: Cents): Cents {
  if (spent <= limit) return limit - spent;
  const blocks = overflowBlocks(spent, limit, blockSize);
  return limit + blocks * blockSize - spent;
}

/** A regra gera aporte? (dados antigos sem o campo contam como sim) */
export function ruleContributes(rule: Pick<CategoryRuleVersion, 'contributes'> | undefined): boolean {
  return rule?.contributes !== false;
}

/** Versão vigente num mês: a mais recente com effectiveMonth <= mês. */
export function resolveVersion<T extends { effectiveMonth: Month }>(versions: T[], month: Month): T | undefined {
  let best: T | undefined;
  for (const v of versions) {
    if (v.effectiveMonth <= month && (!best || v.effectiveMonth > best.effectiveMonth)) best = v;
  }
  return best;
}

/**
 * Regra da categoria para o mês. Se o mês for anterior à primeira regra cadastrada,
 * usa a primeira (ex.: categoria criada depois, mas lançamentos antigos foram movidos para ela).
 */
export function ruleForMonth(rules: CategoryRuleVersion[], categoryId: string, month: Month): CategoryRuleVersion | undefined {
  const own = rules.filter((r) => r.categoryId === categoryId);
  const found = resolveVersion(own, month);
  if (found) return found;
  return own.sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth))[0];
}

/** Aporte fixo do mês (0 antes do mês de início da caixinha). */
export function fixedForMonth(versions: FixedContributionVersion[], month: Month, startMonth: Month): Cents {
  if (month < startMonth) return 0;
  return resolveVersion(versions, month)?.amount ?? 0;
}
