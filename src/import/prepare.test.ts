import { describe, expect, it } from 'vitest';
import { matchKeyOf, suggestCategory } from '../domain/categorize';
import type { Category, Transaction } from '../domain/types';
import { fingerprintsOf, prepareReview, resolveCategory, type PrepareContext } from './prepare';
import type { ParsedDocument, ParsedItem } from './types';

const cats: Category[] = [
  { id: 'ali', name: 'Alimentação', kind: 'normal', order: 0, color: '' },
  { id: 'ass', name: 'Assinaturas', kind: 'normal', order: 1, color: '' },
  { id: 'via', name: 'Viagem', kind: 'normal', order: 2, color: '' },
  { id: 'nec', name: 'Gastos necessários', kind: 'normal', order: 3, color: '' },
  { id: 'a-identificar', name: 'A identificar', kind: 'unidentified', order: 9, color: '' },
];
const none = new Map<string, string>();
const base = (text: string) => {
  const s = suggestCategory(text, none);
  return s.type === 'base' ? s.categoryName : s.type;
};

describe('regras de base', () => {
  it.each([
    ['SUPERMERCADO EXEMPLO L', 'Alimentação'],
    ['BISTEK SUPERMERCADOS', 'Alimentação'],
    ['FORT ATACADISTA 115', 'Alimentação'],
    ['IFD*RDV COZINHA E ALIM', 'Alimentação'],
    ['IFD *B4 PIZZAS LTDA', 'Alimentação'],
    ['CAFE CENTRAL', 'Alimentação'],
    ['Bk Brasil Comercio de', 'Alimentação'],
    ['IFD*IFOOD CLUB', 'Assinaturas'],
    ['EBN*SPOTIFY', 'Assinaturas'],
    ['DL*HELPHBOMAXCOM', 'Assinaturas'],
    ['AMAZON PRIME BR', 'Assinaturas'],
    ['APPLE.COM/BILL', 'Assinaturas'],
    ['DISNEY PLUS', 'Assinaturas'],
    ['GLOBO GLOBOPLAY', 'Assinaturas'],
    ['LATAM AIR*DEAIAV', 'Viagem'],
    ['AIRBNB * HMATFDJXP8', 'Viagem'],
    ['SMILES CLUB SMILES', 'Viagem'],
    ['CELESC DISTRIBUICAO S.A', 'Gastos necessários'],
    ['CLARO MOVEL', 'Gastos necessários'],
    ['TIM*00000000000', 'Gastos necessários'],
    ['EXEMPLO TELECOM LTDA', 'Gastos necessários'],
    ['RAIA2766', 'Gastos necessários'],
    ['Raia362', 'Gastos necessários'],
    ['Farmacia Preco Popular', 'Gastos necessários'],
    ['POSTO SOFIA', 'Gastos necessários'],
    ['AUTO POSTO PORTAL DE', 'Gastos necessários'],
    ['DL *UBERRIDES', 'Gastos necessários'],
    ['BUS SERVICOS*CLICKBUS', 'Gastos necessários'],
    ['Anuidade Diferenciada', 'Gastos necessários'],
    ['SHOPEE *TBACRILICO', 'ask'],
    ['MERCADOLIVRE*MERCADOL', 'ask'],
    ['AMAZON MARKETPLACE', 'ask'],
    ['AMAZON DIGITAL BR', 'ask'],
    ['MAGALU *MAGALU', 'ask'],
    ['NAT*NATURA PAGAMENTOS', 'ask'],
    ['INDITEX BRASIL LTDA', 'ask'],
    ['ACADEMIA EXEMPLO - U', 'ask'],
    ['PRAIA BRAVA HOSTEL', 'ask'],
  ])('%s → %s', (text, expected) => {
    expect(base(text)).toBe(expected);
  });

  it('marketplaces nunca são memorizados; academia é', () => {
    expect(suggestCategory('SHOPEE *X', none)).toEqual({ type: 'ask', learnable: false });
    expect(suggestCategory('ACADEMIA EXEMPLO', none)).toEqual({ type: 'ask', learnable: true });
  });

  it('regra memorizada vence a base, mas não vale para marketplace', () => {
    const learned = new Map([[matchKeyOf('RAIA2766'), 'ali'], [matchKeyOf('SHOPEE *X'), 'ali']]);
    expect(suggestCategory('Raia362', learned)).toEqual({ type: 'learned', categoryId: 'ali' });
    expect(suggestCategory('SHOPEE *X', learned).type).toBe('ask');
  });

  it('chave ignora números e parcela', () => {
    expect(matchKeyOf('RAIA2766')).toBe('RAIA');
    expect(matchKeyOf('AMAZON BR - Parcela 1/3')).toBe('AMAZON BR');
    expect(matchKeyOf('Fulanadetal')).toBe('FULANADETAL');
  });
});

describe('revisão da importação', () => {
  const item = (p: Partial<ParsedItem>): ParsedItem => ({
    date: '2026-10-10', month: '2026-10', description: 'X', matchText: p.description ?? 'X', amount: 1000, kind: 'compra', ...p,
  });
  const doc = (items: ParsedItem[]): ParsedDocument => ({ source: 'fatura-c6', label: '', periodEnd: '2026-11-03', items, checks: [] });
  const ctx = (over: Partial<PrepareContext> = {}): PrepareContext => ({
    categories: cats, learned: new Map(), existingFingerprints: new Set(), closedMonths: new Set(), cards: [], transactions: [], ...over,
  });

  it('estorno segue a compra de mesmo valor; IOF segue a compra pelo nome', () => {
    const d = doc([
      item({ description: 'Anuidade Diferenciada', amount: 9800, card: { last4: '1111', holder: 'A' } }),
      item({ description: 'Estorno Tarifa', amount: -9800, kind: 'estorno', card: { last4: '1111', holder: 'A' } }),
      item({ description: 'Via Eneba', amount: 10615 }),
      item({ description: 'IOF de "Via Eneba"', kind: 'iof', iofOf: 'Via Eneba', amount: 372 }),
    ]);
    const r = prepareReview(d, ctx());
    expect(r[0].categoryId).toBe('nec');
    expect(r[1].linkTo).toBe(0);
    expect(r[3].linkTo).toBe(2);
    const choices = new Map([[2, 'ali']]);
    expect(resolveCategory(r, choices, 3)).toBe('ali');
    expect(resolveCategory(r, choices, 1)).toBe('nec');
  });

  it('parcela seguinte e estorno de compra dividida herdam a divisão', () => {
    const card = { last4: '1111', holder: 'A' };
    const prev: Transaction[] = [
      { id: 't1', date: '2026-09-05', month: '2026-09', description: 'LOJA X - Parcela 1/3', amount: 9000, categoryId: 'ali',
        source: 'fatura-c6', createdAt: 0, matchKey: matchKeyOf('LOJA X'), cardLast4: '1111', installment: '1/3',
        share: { mode: 'fixed', cents: 3000 } },
      { id: 't2', date: '2026-09-20', month: '2026-09', description: 'RESTAURANTE Y', amount: 12000, categoryId: 'ali',
        source: 'fatura-c6', createdAt: 0, matchKey: matchKeyOf('RESTAURANTE Y'), cardLast4: '1111', share: { mode: 'people', people: 4 } },
    ];
    const d = doc([
      item({ description: 'LOJA X - Parcela 2/3', matchText: 'LOJA X', amount: 9000, card, installment: { n: 2, total: 3 } }),
      item({ description: 'LOJA Z - Parcela 2/3', matchText: 'LOJA Z', amount: 9000, card, installment: { n: 2, total: 3 } }),
      item({ description: 'Estorno RESTAURANTE Y', amount: -12000, kind: 'estorno', card }),
    ]);
    const r = prepareReview(d, ctx({ transactions: prev }));
    expect(r[0].share).toEqual({ mode: 'fixed', cents: 3000 });
    expect(r[0].reason).toMatch(/parcela 1\/3/);
    expect(r[1].share).toBeUndefined(); // outra compra
    expect(r[2].share).toEqual({ mode: 'people', people: 4 });
  });

  it('parcela seguinte e estorno de compra rateada herdam o rateio', () => {
    const card = { last4: '1111', holder: 'A' };
    const allocation = [{ categoryId: 'via', mode: 'amount' as const, cents: 6000 }, { categoryId: 'ali', mode: 'rest' as const }];
    const prev: Transaction[] = [
      { id: 't1', date: '2026-09-05', month: '2026-09', description: 'LOJA X - Parcela 1/3', amount: 9000, categoryId: 'via',
        source: 'fatura-c6', createdAt: 0, matchKey: matchKeyOf('LOJA X'), cardLast4: '1111', installment: '1/3', allocation },
      { id: 't2', date: '2026-09-20', month: '2026-09', description: 'RESTAURANTE Y', amount: 12000, categoryId: 'via',
        source: 'fatura-c6', createdAt: 0, matchKey: matchKeyOf('RESTAURANTE Y'), cardLast4: '1111', allocation },
    ];
    const d = doc([
      item({ description: 'LOJA X - Parcela 2/3', matchText: 'LOJA X', amount: 9000, card, installment: { n: 2, total: 3 } }),
      item({ description: 'Estorno RESTAURANTE Y', amount: -12000, kind: 'estorno', card }),
    ]);
    const r = prepareReview(d, ctx({ transactions: prev }));
    expect(r[0].allocation).toEqual(allocation);
    expect(r[0].categoryId).toBe('via');
    expect(r[0].reason).toMatch(/rateado como a parcela 1\/3/);
    // estorno: em proporção (60 de 120 = 50%)
    expect(r[1].allocation).toEqual([{ categoryId: 'via', mode: 'percent', percent: 50 }, { categoryId: 'ali', mode: 'rest' }]);
  });

  it('compra parcelada: pergunta na primeira vez; parcelas de compra à vista não contam', () => {
    const card = { last4: '1111', holder: 'A' };
    const known: Transaction[] = [
      { id: 'k1', date: '2026-09-05', month: '2026-10', description: 'LOJA X - Parcela 1/3', amount: 9000, categoryId: 'ali',
        source: 'fatura-c6', createdAt: 0, matchKey: matchKeyOf('LOJA X'), cardLast4: '1111', installment: '1/3', avista: 'total' },
      { id: 'k2', date: '2026-08-05', month: '2026-10', description: 'LOJA Y - Parcela 2/5', amount: 5000, categoryId: 'ali',
        source: 'fatura-c6', createdAt: 0, matchKey: matchKeyOf('LOJA Y'), cardLast4: '1111', installment: '2/5' },
    ];
    const d = doc([
      item({ description: 'LOJA X - Parcela 2/3', matchText: 'LOJA X', amount: 9000, card, installment: { n: 2, total: 3 } }),
      item({ description: 'LOJA Y - Parcela 3/5', matchText: 'LOJA Y', amount: 5000, card, installment: { n: 3, total: 5 } }),
      item({ description: 'LOJA Z - Parcela 4/6', matchText: 'LOJA Z', amount: 7000, card, installment: { n: 4, total: 6 } }),
    ]);
    const r = prepareReview(d, ctx({ transactions: known }));
    expect(r[0].avista).toBe('skip'); // compra já considerada à vista
    expect(r[0].askInstallment).toBeFalsy();
    expect(r[1].askInstallment).toBeFalsy(); // já conhecida, parcela por mês
    expect(r[1].avista).toBeUndefined();
    expect(r[2].askInstallment).toBe(true); // nova (mesmo sendo do meio): pergunta
  });

  it('repetidos: mesmo item do PDF ou parecido com lançamento manual (nome, valor e até 3 dias)', () => {
    const manual: Transaction[] = [
      { id: 'm1', date: '2026-10-08', month: '2026-10', description: 'Padaria Central', amount: 3500, categoryId: 'ali', source: 'manual', createdAt: 0 },
      { id: 'm2', date: '2026-10-01', month: '2026-10', description: 'Padaria Central', amount: 3500, categoryId: 'ali', source: 'manual', createdAt: 0 },
    ];
    const d = doc([
      item({ description: 'PADARIA CENTRAL LTDA', date: '2026-10-10', amount: 3500 }),
      item({ description: 'PADARIA CENTRAL LTDA', date: '2026-10-25', amount: 3500 }), // longe demais das duas
      item({ description: 'CINEMA', date: '2026-10-10', amount: 3500 }),
    ]);
    const prints = fingerprintsOf(d);
    const r = prepareReview(d, ctx({ transactions: manual }));
    expect(r[0].status).toBe('duplicate');
    expect(r[0].duplicateOf).toBe('m1'); // o mais próximo na data
    expect(r[0].similar).toBe(true);
    expect(r[1].status).toBe('new');
    expect(r[2].status).toBe('new');
    // mesmo PDF de novo: aponta para o lançamento importado antes
    const imported: Transaction[] = [{ id: 'i1', date: '2026-10-10', month: '2026-10', description: 'CINEMA', amount: 3500, categoryId: 'via',
      source: 'fatura-c6', createdAt: 0, fingerprint: prints[2] }];
    const again = prepareReview(d, ctx({ transactions: imported, existingFingerprints: new Set([prints[2]]) }));
    expect(again[2].status).toBe('duplicate');
    expect(again[2].duplicateOf).toBe('i1');
    expect(again[2].categoryId).toBe('via');
  });

  it('parcela seguinte (mesma data da compra, como na C6) não é tratada como repetida da anterior', () => {
    const card = { last4: '1111', holder: 'A' };
    const prev: Transaction[] = [
      { id: 'p1', date: '2026-09-05', month: '2026-09', description: 'LOJA X - Parcela 1/3', amount: 9000, categoryId: 'ali',
        source: 'fatura-c6', createdAt: 0, matchKey: matchKeyOf('LOJA X'), cardLast4: '1111', installment: '1/3' },
    ];
    const d = doc([
      item({ description: 'LOJA X - Parcela 2/3', matchText: 'LOJA X', date: '2026-09-05', month: '2026-10', amount: 9000, card, installment: { n: 2, total: 3 } }),
    ]);
    const r = prepareReview(d, ctx({ transactions: prev }));
    expect(r[0].status).toBe('new');
    expect(r[0].duplicateOf).toBeUndefined();
  });

  it('marca duplicados, mês fechado, ignorados e cartões de outra pessoa', () => {
    const items = [
      item({ description: 'A' }),
      item({ description: 'B', month: '2026-09' }),
      item({ description: 'C', kind: 'ignorado', ignoreReason: 'Pagamento' }),
      item({ description: 'D', card: { last4: '2222', holder: 'OUTRO' } }),
      item({ description: 'E' }),
    ];
    const prints = fingerprintsOf(doc(items));
    const r = prepareReview(doc(items), ctx({
      existingFingerprints: new Set([prints[0]]),
      closedMonths: new Set(['2026-09']),
      cards: [{ id: 'c6:2222', bank: 'c6', last4: '2222', holder: 'OUTRO', mine: false }],
    }));
    expect(r.map((x) => x.status)).toEqual(['duplicate', 'closed-month', 'ignored', 'not-mine', 'new']);
  });

  it('compras idênticas no mesmo dia não são tratadas como duplicadas entre si', () => {
    const items = [item({ description: 'CAFE CENTRAL', amount: 2800 }), item({ description: 'CAFE CENTRAL', amount: 2800 })];
    const prints = fingerprintsOf(doc(items));
    expect(prints[0]).not.toBe(prints[1]);
  });

  it('caixinha: novo, antes do início, duplicado e substituição do registro manual', () => {
    const items = [
      item({ description: 'Aplicação na caixinha', kind: 'caixinha_aplicacao', date: '2026-11-03', amount: 60000 }),
      item({ description: 'Aplicação na caixinha', kind: 'caixinha_aplicacao', date: '2026-09-10', amount: 5000 }),
      item({ description: 'Resgate da caixinha', kind: 'caixinha_resgate', date: '2026-11-05', amount: 1000 }),
    ];
    const d = { ...doc(items), source: 'extrato-nubank' as const };
    const prints = fingerprintsOf(d);
    const r = prepareReview(d, ctx({
      caixinhaStartDate: '2026-09-30',
      movements: [
        { id: 'man', date: '2026-11-03', type: 'aplicacao', amount: 60000, source: 'manual' },
        { id: 'old', date: '2026-11-05', type: 'resgate', amount: 1000, source: 'extrato', fingerprint: prints[2], deleted: true },
      ],
    }));
    expect(r.map((x) => x.status)).toEqual(['caixinha', 'before-start', 'duplicate']);
    expect(r[0].replacesManualId).toBe('man');
  });

  it('pix para pessoa sempre pergunta e não é memorizado', () => {
    const r = prepareReview(
      { ...doc([item({ description: 'Pix para FULANO', matchText: 'FULANO', kind: 'pix_pessoa' })]), source: 'extrato-nubank' },
      ctx({ learned: new Map([['FULANO', 'ali']]) }),
    );
    expect(r[0].categoryId).toBe('');
    expect(r[0].learnable).toBe(false);
  });
});
