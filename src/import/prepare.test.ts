import { describe, expect, it } from 'vitest';
import { matchKeyOf, suggestCategory } from '../domain/categorize';
import type { Category } from '../domain/types';
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
