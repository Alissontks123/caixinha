import { describe, expect, it } from 'vitest';
import { allocationParts, amountInCategory, categoriesOf, proportionalAllocation, splitAmount, toProportional } from './allocation';
import { summarizeMonth, type SummaryInput } from './summary';
import type { AllocationPart, Category, CategoryRuleVersion, Transaction } from './types';

const R = (reais: number) => Math.round(reais * 100);
const parts: AllocationPart[] = [
  { categoryId: 'ali', mode: 'amount', cents: R(200) },
  { categoryId: 'casa', mode: 'rest' },
];
const tx = (p: Partial<Transaction>): Transaction => ({
  id: 'x', date: '2026-10-10', month: '2026-10', description: 'SUPERMERCADO', amount: R(300), categoryId: 'ali',
  source: 'manual', createdAt: 0, ...p,
});

describe('rateio entre categorias', () => {
  it('valor fixo, percentual e o restante na última parte', () => {
    expect(splitAmount(R(300), parts)).toEqual([R(200), R(100)]);
    expect(splitAmount(R(300), [
      { categoryId: 'a', mode: 'percent', percent: 50 },
      { categoryId: 'b', mode: 'amount', cents: R(50) },
      { categoryId: 'c', mode: 'rest' },
    ])).toEqual([R(150), R(50), R(100)]);
    // estorno: mesmos valores, negativos
    expect(splitAmount(-R(300), parts)).toEqual([-R(200), -R(100)]);
    // partes maiores que o total não passam do total
    expect(splitAmount(R(150), parts)).toEqual([R(150), 0]);
  });

  it('rateia a parte do usuário (depois da divisão com outras pessoas)', () => {
    const t = tx({ allocation: [{ categoryId: 'ali', mode: 'percent', percent: 60 }, { categoryId: 'casa', mode: 'rest' }], share: { mode: 'percent', percent: 50 } });
    expect(allocationParts(t)).toEqual([{ categoryId: 'ali', amount: R(90) }, { categoryId: 'casa', amount: R(60) }]);
    expect(amountInCategory(t, 'casa')).toBe(R(60));
    expect(amountInCategory(t, 'via')).toBe(0);
    expect(categoriesOf(t)).toEqual(['ali', 'casa']);
    // sem rateio: uma parte só
    expect(allocationParts(tx({ amount: R(80) }))).toEqual([{ categoryId: 'ali', amount: R(80) }]);
  });

  it('proporção para estornos e outros valores', () => {
    const p = proportionalAllocation(tx({ allocation: parts }))!;
    expect(p[0]).toMatchObject({ categoryId: 'ali', mode: 'percent' });
    expect((p[0] as { percent: number }).percent).toBeCloseTo(66.667, 2);
    expect(p[1]).toEqual({ categoryId: 'casa', mode: 'rest' });
    // estorno de R$ 30 da compra de R$ 300: 20 + 10
    expect(splitAmount(-R(30), p)).toEqual([-R(20), -R(10)]);
    expect(toProportional(R(300), undefined)).toBeUndefined();
  });

  it('no Painel, cada parte conta na sua categoria', () => {
    const categories: Category[] = [
      { id: 'ali', name: 'Alimentação', kind: 'normal', order: 0, color: '' },
      { id: 'casa', name: 'Casa', kind: 'normal', order: 1, color: '' },
      { id: 'ign', name: 'Não é gasto', kind: 'ignored', order: 9, color: '' },
    ];
    const rules: CategoryRuleVersion[] = [
      { id: '1', categoryId: 'ali', effectiveMonth: '2026-01', limit: R(150), blockSize: R(50), blockAmount: R(10) },
      { id: '2', categoryId: 'casa', effectiveMonth: '2026-01', limit: R(500), blockSize: R(100), blockAmount: R(50) },
    ];
    const input: SummaryInput = {
      categories, rules, closings: [], startMonth: '2026-01', fixedVersions: [],
      transactions: [
        tx({ allocation: parts }),
        tx({ id: 'y', amount: R(100), allocation: [{ categoryId: 'casa', mode: 'percent', percent: 40 }, { categoryId: 'ign', mode: 'rest' }] }),
      ],
    };
    const s = summarizeMonth('2026-10', input);
    const ali = s.categories.find((c) => c.categoryId === 'ali')!;
    expect(ali.spent).toBe(R(200));
    expect(ali.contribution).toBe(R(10)); // 50 acima do limite → 1 bloco
    expect(s.categories.find((c) => c.categoryId === 'casa')!.spent).toBe(R(140));
    expect(s.ignoredTotal).toBe(R(60));
  });
});
