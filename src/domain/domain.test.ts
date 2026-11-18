import { merchantHint, searchUrl } from './hints';
import { myAmount, proportionalShare, shareOf } from './share';
import { describe, expect, it } from 'vitest';
import { parseMoney, formatMoney } from '../lib/money';
import { addMonths, lastDay, monthRange } from '../lib/months';
import { compareMonth, monthStatus } from './alerts';
import { historyMonths } from './history';
import { balanceByMonth, computeLedger, computeStatements, startMonthOf, type LedgerInput } from './ledger';
import { fixedForMonth, overflowContribution, resolveVersion, roomUntilNextBlock, ruleForMonth } from './rules';
import { closeBlocker, summarizeMonth, type SummaryInput } from './summary';
import type { CaixinhaMovement, Category, CategoryRuleVersion, MonthClosing, Profile, Transaction } from './types';

const R = (reais: number) => Math.round(reais * 100);

describe('aporte por estouro', () => {
  it('exemplo do usuário: limite 500, X 100, Y 50', () => {
    expect(overflowContribution(R(500), R(500), R(100), R(50))).toBe(0);
    expect(overflowContribution(R(500.01), R(500), R(100), R(50))).toBe(R(50)); // 1 centavo já abre bloco
    expect(overflowContribution(R(600), R(500), R(100), R(50))).toBe(R(50));
    expect(overflowContribution(R(650), R(500), R(100), R(50))).toBe(R(100));
    expect(overflowContribution(R(700), R(500), R(100), R(50))).toBe(R(100));
    expect(overflowContribution(R(700.01), R(500), R(100), R(50))).toBe(R(150));
  });
  it('abaixo do limite e X inválido não geram aporte', () => {
    expect(overflowContribution(R(100), R(500), R(100), R(50))).toBe(0);
    expect(overflowContribution(R(900), R(500), 0, R(50))).toBe(0);
  });
  it('limite zero: qualquer gasto gera aporte', () => {
    expect(overflowContribution(R(10), 0, R(50), R(20))).toBe(R(20));
  });
  it('quanto falta até o próximo bloco', () => {
    expect(roomUntilNextBlock(R(400), R(500), R(100))).toBe(R(100));
    expect(roomUntilNextBlock(R(650), R(500), R(100))).toBe(R(50));
  });
});

describe('versões de regras', () => {
  const rules: CategoryRuleVersion[] = [
    { id: '1', categoryId: 'a', effectiveMonth: '2026-08', limit: R(500), blockSize: R(100), blockAmount: R(50) },
    { id: '2', categoryId: 'a', effectiveMonth: '2026-11', limit: R(800), blockSize: R(100), blockAmount: R(50) },
  ];
  it('usa a versão vigente no mês', () => {
    expect(resolveVersion(rules, '2026-10')?.limit).toBe(R(500));
    expect(resolveVersion(rules, '2026-11')?.limit).toBe(R(800));
    expect(resolveVersion(rules, '2027-03')?.limit).toBe(R(800));
  });
  it('mês anterior à primeira regra usa a primeira', () => {
    expect(ruleForMonth(rules, 'a', '2026-01')?.limit).toBe(R(500));
  });
  it('aporte fixo não vale antes do início', () => {
    const fixed = [{ id: 'f', effectiveMonth: '2026-09', amount: R(300) }];
    expect(fixedForMonth(fixed, '2026-08', '2026-09')).toBe(0);
    expect(fixedForMonth(fixed, '2026-10', '2026-09')).toBe(R(300));
  });
});

describe('resumo do mês', () => {
  const categories: Category[] = [
    { id: 'ali', name: 'Alimentação', kind: 'normal', order: 0, color: '#000' },
    { id: 'hob', name: 'Hobbys', kind: 'normal', order: 1, color: '#000' },
    { id: 'aid', name: 'A identificar', kind: 'unidentified', order: 8, color: '#000' },
    { id: 'ign', name: 'Não é gasto', kind: 'ignored', order: 9, color: '#000' },
  ];
  const rules: CategoryRuleVersion[] = [
    { id: '1', categoryId: 'ali', effectiveMonth: '2026-01', limit: R(500), blockSize: R(100), blockAmount: R(50) },
    { id: '2', categoryId: 'hob', effectiveMonth: '2026-01', limit: R(300), blockSize: R(50), blockAmount: R(25) },
  ];
  const tx = (id: string, categoryId: string, amount: number, month = '2026-10'): Transaction => ({
    id, date: `${month}-10`, month, description: id, amount: R(amount), categoryId, source: 'manual', createdAt: 0,
  });
  const base: SummaryInput = {
    categories, rules, closings: [], startMonth: '2026-01',
    fixedVersions: [{ id: 'f', effectiveMonth: '2026-01', amount: R(300) }],
    transactions: [
      tx('a', 'ali', 400), tx('b', 'ali', 250), tx('c', 'ali', -30), // 620 → 2 blocos → 100
      tx('d', 'hob', 200), // abaixo
      tx('e', 'ign', 13000), // não conta
      tx('f', 'ali', 999, '2026-09'), // outro mês
    ],
  };
  it('soma por categoria com estorno e calcula aporte', () => {
    const s = summarizeMonth('2026-10', base);
    const ali = s.categories.find((c) => c.categoryId === 'ali')!;
    expect(ali.spent).toBe(R(620));
    expect(ali.contribution).toBe(R(100));
    expect(s.categories.find((c) => c.categoryId === 'hob')!.contribution).toBe(0);
    expect(s.ignoredTotal).toBe(R(13000));
    expect(s.totalDue).toBe(R(400)); // 300 fixo + 100
  });
  it('gasto dividido: só a parte do usuário conta no limite e no aporte', () => {
    const input: SummaryInput = {
      ...base,
      transactions: [
        { ...tx('a', 'ali', 900), share: { mode: 'people', people: 3 } }, // 300
        { ...tx('b', 'ali', 400), share: { mode: 'fixed', cents: R(150) } }, // 150
        { ...tx('c', 'ali', 200), share: { mode: 'percent', percent: 50 } }, // 100
        { ...tx('d', 'ali', -60), share: { mode: 'percent', percent: 50 } }, // -30
      ],
    };
    const ali = summarizeMonth('2026-10', input).categories.find((c) => c.categoryId === 'ali')!;
    expect(ali.spent).toBe(R(520)); // 300 + 150 + 100 - 30
    expect(ali.contribution).toBe(R(50)); // passou 20 → 1 bloco
  });
  it('categoria que não gera aporte nunca entra no cálculo', () => {
    const nec: Category = { id: 'nec', name: 'Gastos necessários', kind: 'normal', order: 2, color: '#000' };
    const input: SummaryInput = {
      ...base,
      categories: [...categories, nec],
      rules: [
        ...rules,
        { id: '3', categoryId: 'nec', effectiveMonth: '2026-01', limit: 0, blockSize: 0, blockAmount: 0, contributes: false },
        // a partir de dezembro passa a gerar
        { id: '4', categoryId: 'nec', effectiveMonth: '2026-12', limit: R(100), blockSize: R(100), blockAmount: R(10), contributes: true },
      ],
      transactions: [tx('n', 'nec', 5000), tx('m', 'nec', 300, '2026-12')],
    };
    const out = summarizeMonth('2026-10', input);
    const necOut = out.categories.find((c) => c.categoryId === 'nec')!;
    expect(necOut.spent).toBe(R(5000));
    expect(necOut.contribution).toBe(0);
    expect(necOut.contributes).toBe(false);
    expect(out.overflowTotal).toBe(0);
    expect(summarizeMonth('2026-12', input).overflowTotal).toBe(R(20));
  });
  it('regra antiga sem o campo continua gerando aporte', () => {
    expect(summarizeMonth('2026-10', base).categories.every((c) => c.contributes)).toBe(true);
  });
  it('sem compensação entre categorias', () => {
    const s = summarizeMonth('2026-10', { ...base, transactions: [tx('a', 'ali', 600), tx('b', 'hob', 0)] });
    expect(s.overflowTotal).toBe(R(50));
  });
  it('bloqueia fechamento com A identificar pendente e mês corrente', () => {
    const s = summarizeMonth('2026-10', { ...base, transactions: [...base.transactions, tx('z', 'aid', 10)] });
    expect(closeBlocker(s, '2026-11')).toMatch(/A identificar/);
    expect(closeBlocker(summarizeMonth('2026-11', base), '2026-11')).toMatch(/terminar/);
    expect(closeBlocker(summarizeMonth('2026-10', base), '2026-11')).toBeNull();
  });
  it('mês fechado usa a fotografia congelada', () => {
    const closing: MonthClosing = {
      month: '2026-10', closedAt: '2026-11-05', categories: [], ignoredTotal: 0, fixed: R(300), overflowTotal: R(77),
    };
    const s = summarizeMonth('2026-10', { ...base, closings: [closing] });
    expect(s.closed).toBe(true);
    expect(s.totalDue).toBe(R(377));
  });
});

describe('caixinha', () => {
  const profile: Profile = {
    id: 'me', name: 'Teste', caixinhaStartDate: '2026-08-31', caixinhaStartBalance: R(1000), alertThreshold: 80, createdAt: 0,
  };
  const mv = (date: string, type: CaixinhaMovement['type'], amount: number): CaixinhaMovement => ({
    id: date + type + amount, date, type, amount: R(amount), source: 'manual',
  });
  const input = (over: Partial<LedgerInput> = {}): LedgerInput => ({
    profile,
    fixedVersions: [{ id: 'f', effectiveMonth: '2026-09', amount: R(300) }],
    closings: [],
    movements: [],
    today: '2026-11-17',
    ...over,
  });

  it('extrato do mês: o que falta passa para o mês seguinte e o aporte abate primeiro o anterior', () => {
    const closing = (month: string, overflow: number) => ({
      month, closedAt: `${month}-28`, overflowTotal: R(overflow), totalDue: R(300 + overflow), fixedAmount: R(300), categories: [],
    }) as unknown as LedgerInput['closings'][number];
    const st = computeStatements(
      input({
        closings: [closing('2026-09', 0), closing('2026-10', 200)],
        movements: [mv('2026-09-05', 'aplicacao', 300), mv('2026-10-05', 'aplicacao', 300), mv('2026-11-03', 'aplicacao', 250)],
      }),
      '2026-11',
      (m) => (m === '2026-11' ? R(200) : 0), // previsão de excedente do mês aberto
    );
    const by = Object.fromEntries(st.map((s) => [s.month, s]));
    expect(by['2026-09'].remaining).toBe(0);
    // outubro: 300 fixo + 200 excedente − 300 aportado = faltam 200
    expect(by['2026-10'].remaining).toBe(R(200));
    // novembro: 200 de meses anteriores + 300 fixo + 200 excedente (previsão) = 700; aportou 250 → faltam 450
    expect(by['2026-11'].previous).toBe(R(200));
    expect(by['2026-11'].total).toBe(R(700));
    expect(by['2026-11'].paid).toBe(R(250));
    expect(by['2026-11'].remaining).toBe(R(450));
    expect(by['2026-11'].overflowForecast).toBe(true);
  });

  it('extrato: mês aberto leva só o fixo para o mês seguinte; aporte a mais vira crédito', () => {
    const st = computeStatements(
      input({ movements: [mv('2026-09-05', 'aplicacao', 1000)], today: '2026-11-17' }),
      '2026-11',
      () => R(500), // previsão alta em todos os meses abertos: não deve passar adiante
    );
    const by = Object.fromEntries(st.map((s) => [s.month, s]));
    expect(by['2026-09'].remaining).toBe(R(300 + 500 - 1000)); // -200 (sobra no próprio mês)
    expect(by['2026-10'].previous).toBe(R(-700)); // crédito: 1000 − 300 fixo (a previsão não passa adiante)
    expect(by['2026-11'].previous).toBe(R(-400));
    expect(by['2026-11'].remaining).toBe(R(-400 + 300 + 500));
  });

  it('aplicação feita antes de fechar o mês anterior quita primeiro o excedente dele', () => {
    const closingOct = { month: '2026-10', closedAt: '2026-11-18', overflowTotal: R(200), fixed: R(300), ignoredTotal: 0, categories: [] };
    const l = computeLedger(input({
      today: '2026-11-18',
      closings: [closingOct],
      movements: [mv('2026-09-05', 'aplicacao', 300), mv('2026-10-05', 'aplicacao', 300), mv('2026-11-03', 'aplicacao', 250)],
    }));
    const by = Object.fromEntries(l.months.map((m) => [m.month, m]));
    expect(by['2026-10'].pending).toBe(0); // os 250 de novembro quitaram os 200 de outubro
    expect(by['2026-11'].pending).toBe(R(250));
  });

  it('aporte fixo é devido desde o dia 1º de cada mês', () => {
    const l = computeLedger(input());
    expect(l.months.map((m) => m.month)).toEqual(['2026-11', '2026-10', '2026-09']);
    expect(l.totalDue).toBe(R(900));
    expect(l.totalPending).toBe(R(900));
  });

  it('aplicação quita a dívida mais antiga primeiro', () => {
    const l = computeLedger(input({ movements: [mv('2026-11-02', 'aplicacao', 450)] }));
    const by = Object.fromEntries(l.months.map((m) => [m.month, m]));
    expect(by['2026-09'].paid).toBe(R(300));
    expect(by['2026-10'].paid).toBe(R(150));
    expect(by['2026-11'].paid).toBe(0);
    expect(l.balance).toBe(R(1450));
  });

  it('sobra vira crédito e abate dívidas futuras (estouro no fechamento)', () => {
    const closing: MonthClosing = {
      month: '2026-10', closedAt: '2026-11-05', categories: [], ignoredTotal: 0, fixed: R(300), overflowTotal: R(100),
    };
    const l = computeLedger(input({
      closings: [closing],
      movements: [mv('2026-09-01', 'aplicacao', 300), mv('2026-10-01', 'aplicacao', 400), mv('2026-11-01', 'aplicacao', 300)],
    }));
    const by = Object.fromEntries(l.months.map((m) => [m.month, m]));
    // 01/10: 400 quita o fixo de out (300) e sobra 100 de crédito
    // 01/11: fixo de nov nasce, crédito paga 100; aplicação de 300 paga 200 e sobra 100
    // 05/11: fecha outubro com estouro de 100, que é quitado pelo crédito
    expect(by['2026-10'].due).toBe(R(400));
    expect(by['2026-10'].paid).toBe(R(400));
    expect(by['2026-11'].paid).toBe(R(300));
    expect(l.totalPending).toBe(0);
    expect(l.credit).toBe(0);
  });

  it('resgate vira dívida de novo', () => {
    const l = computeLedger(input({
      fixedVersions: [],
      movements: [mv('2026-10-10', 'resgate', 200)],
    }));
    expect(l.totalPending).toBe(R(200));
    expect(l.balance).toBe(R(800));
  });

  it('saldo informado registra rendimento', () => {
    const l = computeLedger(input({
      movements: [mv('2026-10-01', 'aplicacao', 300), mv('2026-10-31', 'saldo_informado', 1320)],
    }));
    expect(l.earnings).toBe(R(20));
    expect(l.balance).toBe(R(1320));
  });

  it('movimentos desconsiderados não contam', () => {
    const l = computeLedger(input({
      movements: [{ ...mv('2026-10-01', 'aplicacao', 300), deleted: true }, mv('2026-10-02', 'aplicacao', 100)],
    }));
    expect(l.totalApplied).toBe(R(100));
    expect(l.ignoredMovements).toBe(0);
  });

  it('ignora movimentos até a data do saldo inicial', () => {
    const l = computeLedger(input({ movements: [mv('2026-08-31', 'aplicacao', 500), mv('2026-08-10', 'aplicacao', 500)] }));
    expect(l.ignoredMovements).toBe(2);
    expect(l.balance).toBe(R(1000));
  });
});

describe('alertas', () => {
  const cat = (spent: number, limit = 500, contribution = 0, contributes = true) => ({
    categoryId: 'a', name: 'Alimentação', color: '', spent: R(spent), limit: R(limit), blockSize: R(100), blockAmount: R(50),
    contribution: R(contribution), contributes,
  });
  const sum = (c: ReturnType<typeof cat>[]) => ({
    month: '2026-11', closed: false, categories: c, unidentifiedCount: 0, unidentifiedTotal: 0, ignoredTotal: 0, fixed: 0,
    overflowTotal: c.reduce((s, x) => s + x.contribution, 0), totalDue: 0,
  });
  it('faixa do Painel: estourou antes, perto do limite depois; sem aporte fica de fora', () => {
    const s = monthStatus(sum([cat(420), { ...cat(650, 500, 100), categoryId: 'b', name: 'Viagem' }, { ...cat(9999, 0, 0, false), categoryId: 'n' }]), 80);
    expect(s.map((x) => [x.name, x.level])).toEqual([['Viagem', 'over'], ['Alimentação', 'near']]);
  });
  it('mudança que abre bloco novo ou chega perto do limite', () => {
    expect(compareMonth(sum([cat(550, 500, 50)]), sum([cat(650, 500, 100)]), 80)).toMatchObject([{ type: 'new-block', added: R(50) }]);
    expect(compareMonth(sum([cat(300)]), sum([cat(420)]), 80)).toMatchObject([{ type: 'near-limit' }]);
    expect(compareMonth(sum([cat(420)]), sum([cat(450)]), 80)).toEqual([]); // já estava perto
  });
});

describe('histórico', () => {
  it('intervalo de meses', () => {
    expect(historyMonths('6', '2026-01', '2026-11')).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(historyMonths('all', '2026-09', '2026-11')).toEqual(['2026-09', '2026-10', '2026-11']);
  });
  it('saldo da caixinha no fim de cada mês', () => {
    const profile: Profile = { id: 'me', name: 'T', caixinhaStartDate: '2026-08-31', caixinhaStartBalance: R(1000), alertThreshold: 80, createdAt: 0 };
    const movements: CaixinhaMovement[] = [
      { id: '1', date: '2026-09-10', type: 'aplicacao', amount: R(300), source: 'manual' },
      { id: '2', date: '2026-10-05', type: 'resgate', amount: R(100), source: 'manual' },
      { id: '3', date: '2026-10-06', type: 'aplicacao', amount: R(999), source: 'extrato', deleted: true },
    ];
    expect(balanceByMonth({ profile, movements, today: '2026-11-17' }, ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11'])).toEqual([
      { month: '2026-08', balance: R(1000) },
      { month: '2026-09', balance: R(1300) },
      { month: '2026-10', balance: R(1200) },
      { month: '2026-11', balance: R(1200) },
    ]);
  });
});

describe('utilitários', () => {
  it('lê valores em reais', () => {
    expect(parseMoney('1.234,56')).toBe(123456);
    expect(parseMoney('1234,5')).toBe(123450);
    expect(parseMoney('1234.56')).toBe(123456);
    expect(parseMoney('1.234')).toBe(123400);
    expect(parseMoney('R$ 50')).toBe(5000);
    expect(parseMoney('-10,00')).toBe(-1000);
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('')).toBeNull();
    expect(formatMoney(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
  });
  it('mês de início da caixinha é o do dia seguinte ao saldo', () => {
    expect(startMonthOf({ caixinhaStartDate: '2026-08-31' })).toBe('2026-09');
    expect(startMonthOf({ caixinhaStartDate: '2026-11-17' })).toBe('2026-11');
    expect(startMonthOf({ caixinhaStartDate: '2026-12-31' })).toBe('2027-01');
  });
  it('meses', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthRange('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });
});

describe('merchantHint (dica do que é a despesa)', () => {
  it('reconhece pistas no nome', () => {
    expect(merchantHint('Force One Academia')).toBe('academia ou atividade física');
    expect(merchantHint('SMARTFIT PALHOCA')).toBe('academia ou atividade física');
    expect(merchantHint('PETZ FLORIANOPOLIS')).toBe('pet shop ou veterinário');
    expect(merchantHint('Barbearia do Zé')).toBe('salão de beleza, barbearia ou estética');
    expect(merchantHint('CACAU SHOW 123')).toBe('doces, chocolates ou confeitaria');
    expect(merchantHint('PAG*JoseSilva')).toMatch(/maquininha/);
    expect(merchantHint('Shopee *Loja')).toMatch(/vende de tudo/);
  });
  it('não inventa quando não há pista', () => {
    expect(merchantHint('XPTO COMERCIO LTDA')).toBeUndefined();
    expect(merchantHint('PERSONALIZADOS ANA')).toBeUndefined();
    expect(merchantHint('PETROBRAS POSTO')).toBeUndefined();
  });
  it('monta a pesquisa sem a parcela', () => {
    expect(searchUrl('Force One Academia - Parcela 2/3')).toBe('https://www.google.com/search?q=Force%20One%20Academia');
  });
});

describe('divisão do gasto (minha parte)', () => {
  it('calcula a parte por pessoas, percentual e valor fixo', () => {
    expect(shareOf(30000, { mode: 'people', people: 3 })).toBe(10000);
    expect(shareOf(1000, { mode: 'people', people: 3 })).toBe(333);
    expect(shareOf(30000, { mode: 'percent', percent: 25 })).toBe(7500);
    expect(shareOf(30000, { mode: 'fixed', cents: 12000 })).toBe(12000);
    expect(shareOf(30000, { mode: 'fixed', cents: 99999 })).toBe(30000); // nunca mais que o total
    expect(shareOf(-3000, { mode: 'people', people: 3 })).toBe(-1000); // estorno continua negativo
    expect(myAmount({ amount: 5000 })).toBe(5000); // sem divisão
  });
  it('estorno de compra com valor fixo vira a mesma proporção', () => {
    const share = proportionalShare({ amount: 30000, share: { mode: 'fixed', cents: 10000 } });
    expect(share?.mode).toBe('percent');
    expect(shareOf(-3000, share)).toBe(-1000);
  });
});

describe('início da caixinha', () => {
  it('fixo cadastrado depois vale desde o início antecipado', () => {
    const versions = [{ id: 'f', effectiveMonth: '2026-11', amount: 30000 }];
    expect(fixedForMonth(versions, '2026-10', '2026-10')).toBe(30000);
    expect(fixedForMonth(versions, '2026-09', '2026-10')).toBe(0); // antes do início
  });
  it('último dia do mês', () => {
    expect(lastDay('2026-09')).toBe('2026-09-30');
    expect(lastDay('2026-02')).toBe('2026-02-28');
    expect(lastDay('2026-12')).toBe('2026-12-31');
    expect(startMonthOf({ caixinhaStartDate: lastDay('2026-09') })).toBe('2026-10');
  });
});
