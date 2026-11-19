import { describe, expect, it } from 'vitest';
import { changeVsPrevious, forecastMonth, futureByMonth, futureInstallments, goalProgress, recurringStatus } from './insights';
import type { Transaction } from './types';

const tx = (p: Partial<Transaction> & Pick<Transaction, 'id' | 'month' | 'amount'>): Transaction => ({
  date: `${p.month}-10`, description: p.id, categoryId: 'ali', source: 'fatura-c6', createdAt: 0, ...p,
});

describe('previsão e comparação', () => {
  it('projeta no ritmo do mês a partir do dia 5', () => {
    expect(forecastMonth(30000, '2026-11', '2026-11-10')).toBe(90000); // 300 em 10 dias → 900 em 30
    expect(forecastMonth(30000, '2026-11', '2026-11-04')).toBeUndefined(); // cedo demais
    expect(forecastMonth(30000, '2026-10', '2026-11-10')).toBeUndefined(); // outro mês
    expect(forecastMonth(0, '2026-11', '2026-11-10')).toBeUndefined();
  });
  it('compara com o mês anterior', () => {
    expect(changeVsPrevious(11800, 10000)).toBeCloseTo(0.18);
    expect(changeVsPrevious(8000, 10000)).toBeCloseTo(-0.2);
    expect(changeVsPrevious(5000, 0)).toBeUndefined();
  });
});

describe('parcelas futuras', () => {
  it('projeta a partir da última parcela importada e respeita a divisão', () => {
    const txs = [
      tx({ id: 'a1', month: '2026-10', amount: 10000, installment: '2/4', matchKey: 'LOJA X', description: 'LOJA X - Parcela 2/4' }),
      tx({ id: 'a2', month: '2026-11', amount: 10000, installment: '3/4', matchKey: 'LOJA X', description: 'LOJA X - Parcela 3/4' }),
      tx({ id: 'b', month: '2026-11', amount: 30000, installment: '1/3', matchKey: 'VIAGEM', share: { mode: 'people', people: 3 } }),
      tx({ id: 'c', month: '2026-11', amount: 5000 }), // à vista
    ];
    const f = futureInstallments(txs);
    expect(f.map((i) => `${i.month} ${i.installment} ${i.amount}`)).toEqual([
      '2026-12 4/4 10000', '2026-12 2/3 10000', '2027-01 3/3 10000',
    ]);
    const by = futureByMonth(f, '2026-11', 3);
    expect(by.map((m) => m.total)).toEqual([20000, 10000, 0]);
    expect(f[0].description).toBe('LOJA X');
  });
});

describe('recorrentes', () => {
  it('mostra o que apareceu, mudou de valor ou ainda não apareceu', () => {
    const txs = [
      tx({ id: 's1', month: '2026-10', amount: 2190, matchKey: 'SPOTIFY', recurring: true }),
      tx({ id: 's2', month: '2026-11', amount: 2190, matchKey: 'SPOTIFY' }),
      tx({ id: 'n1', month: '2026-10', amount: 4490, matchKey: 'NETFLIX', recurring: true }),
      tx({ id: 'n2', month: '2026-11', amount: 5590, matchKey: 'NETFLIX' }),
      tx({ id: 'g1', month: '2026-10', amount: 12000, matchKey: 'ACADEMIA', recurring: true }),
    ];
    const st = recurringStatus(txs, '2026-11');
    expect(st.map((s) => `${s.key}:${s.state}`)).toEqual(['ACADEMIA:missing', 'NETFLIX:changed', 'SPOTIFY:ok']);
    expect(recurringStatus(txs, '2026-09')).toEqual([]); // antes de começar
  });
});

describe('meta da caixinha', () => {
  it('calcula quanto falta por mês', () => {
    const g = goalProgress(1000000, '2027-10', 400000, '2026-11'); // 12 meses
    expect(g.monthsLeft).toBe(12);
    expect(g.perMonth).toBe(50000);
    expect(g.ratio).toBeCloseTo(0.4);
    expect(goalProgress(1000000, '2027-10', 1200000, '2026-11').reached).toBe(true);
    expect(goalProgress(1000000, '2026-10', 0, '2026-11').perMonth).toBeUndefined(); // data passou
  });
});
