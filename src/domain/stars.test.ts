import { describe, expect, it } from 'vitest';
import { newMilestones, ownedItems, starEntries, starTotals, type StarRecord, type StarsInput } from './stars';
import type { CaixinhaMovement, ClosedCategory, MonthClosing, Profile } from './types';

const R = (reais: number) => Math.round(reais * 100);
const profile: Profile = {
  id: 'me', name: 'Teste', caixinhaStartDate: '2026-08-31', caixinhaStartBalance: R(1000), alertThreshold: 80, createdAt: 0,
};
const cat = (p: Partial<ClosedCategory>): ClosedCategory => ({
  categoryId: 'ali', name: 'Alimentação', color: '', spent: R(800), limit: R(1000), blockSize: R(100), blockAmount: R(50), contribution: 0, ...p,
});
const closing = (month: string, closedAt: string, categories: ClosedCategory[]): MonthClosing => ({
  month, closedAt, categories, ignoredTotal: 0, fixed: R(300), overflowTotal: categories.reduce((s, c) => s + c.contribution, 0),
});
const app = (date: string, reais: number): CaixinhaMovement => ({ id: date + reais, date, type: 'aplicacao', amount: R(reais), source: 'manual' });
const input = (p: Partial<StarsInput>): StarsInput => ({
  profile, fixedVersions: [{ id: 'f', effectiveMonth: '2026-09', amount: R(300) }], closings: [], movements: [], today: '2026-11-15', records: [], ...p,
});
const ids = (i: StarsInput) => starEntries(i).map((e) => e.id).sort();

describe('estrelas', () => {
  it('categoria com limite sem aporte (+100) e mês fechado até o dia 10 (+50); sem limite ou estourada não contam', () => {
    const e = starEntries(input({
      closings: [closing('2026-09', '2026-10-05', [
        cat({}),
        cat({ categoryId: 'hob', name: 'Hobbys', spent: R(700), limit: R(500), contribution: R(100) }),
        cat({ categoryId: 'nec', name: 'Necessários', limit: 0, contributes: false }),
      ])],
    }));
    expect(e.filter((x) => x.group === 'categoria').map((x) => [x.label, x.amount])).toEqual([['Alimentação dentro do limite · set/26', 100]]);
    expect(e.some((x) => x.id === 'org:2026-09' && x.amount === 50)).toBe(true);
    // fechado depois do dia 10 do mês seguinte: não ganha o "em dia"
    expect(ids(input({ closings: [closing('2026-09', '2026-10-11', [cat({})])] }))).not.toContain('org:2026-09');
  });

  it('aporte fixo pago por completo dá +100 no mês; pagamento parcial não', () => {
    expect(ids(input({ movements: [app('2026-09-10', 300)] }))).toContain('fixo:2026-09');
    expect(ids(input({ movements: [app('2026-09-10', 299)] }))).not.toContain('fixo:2026-09');
  });

  it('aporte extra: só o que passa do devido (fixo + excedente + o que faltava antes), a partir de 20% do fixo, uma vez no mês', () => {
    const closings = [closing('2026-09', '2026-10-02', [cat({ spent: R(1100), contribution: R(50) })])];
    // setembro: devia 300 (fixo) e pagou 300; o excedente de 50 passa para outubro
    const base = [app('2026-09-10', 300)];
    // outubro: devia 300 + 50; pagou 400 → extra de 50 (< 60, que é 20% do fixo)
    expect(ids(input({ closings, movements: [...base, app('2026-10-05', 400)] }))).not.toContain('extra:2026-10');
    // pagou 410 em duas vezes → extra de 60 → +300 uma vez só
    const e = starEntries(input({ closings, movements: [...base, app('2026-10-05', 350), app('2026-10-20', 60)] }));
    expect(e.filter((x) => x.group === 'extra').map((x) => x.id)).toEqual(['extra:2026-10']);
  });

  it('sequência: +500 a cada 3 meses fechados seguidos sem estourar; um estouro zera a contagem', () => {
    const ok = (m: string) => closing(m, `${m}-28`, [cat({})]);
    const over = (m: string) => closing(m, `${m}-28`, [cat({ contribution: R(50) })]);
    const months = ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02'];
    const seq = (cs: MonthClosing[]) => starEntries(input({ today: '2027-03-15', closings: cs })).filter((x) => x.group === 'sequencia').map((x) => x.id);
    expect(seq(months.map(ok))).toEqual(['seq:2027-02', 'seq:2026-11']);
    expect(seq([ok(months[0]), over(months[1]), ...months.slice(2).map(ok)])).toEqual(['seq:2027-01']);
  });

  it('marcos da meta valem uma vez na vida; compras descontam do saldo', () => {
    const withGoal = { ...profile, goalAmount: R(3000), goalMonth: '2027-12' };
    // saldo 1000 + 600 = 1600 → 25% (750) e 50% (1500) alcançados
    const i = input({ profile: withGoal, movements: [app('2026-09-10', 600)] });
    const marcos = newMilestones(i);
    expect(marcos.map((m) => m.item)).toEqual(['meta:25', 'meta:50']);
    // já registrados: não aparecem de novo, nem com uma meta nova (aqui 1.600 de 4.000 = 40%: 25% de novo não conta)
    expect(newMilestones({ ...i, profile: { ...withGoal, goalAmount: R(4000) }, records: marcos })).toEqual([]);
    // um marco ainda não ganho conta com a meta nova (1.600 de 2.000 = 80% → 75%)
    expect(newMilestones({ ...i, profile: { ...withGoal, goalAmount: R(2000) }, records: marcos }).map((m) => m.item)).toEqual(['meta:75']);

    const compra: StarRecord = { id: 'compra-avatar:panda', kind: 'compra', item: 'avatar:panda', amount: 100, date: '2026-11-15', label: 'Comprou Panda' };
    const t = starTotals(starEntries({ ...i, records: [...marcos, compra] }));
    // 600 em setembro: fixo de set (+100), adianta o fixo de out (+100) e é extra em set (+300); + 2 marcos (+500) − Panda
    expect(t).toEqual({ earned: 1000, spent: 100, balance: 900 });
    expect([...ownedItems([...marcos, compra])]).toEqual(['avatar:panda']);
  });
});
