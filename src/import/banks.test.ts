/** Leitores da fatura Itaú e do extrato Banco do Brasil, com documentos inventados (nenhum dado real). */
import { describe, expect, it } from 'vitest';
import { looksLikeCompany, parseBBExtrato, sameHolderName } from './bbExtrato';
import { isItauFatura, parseItauFatura } from './itauFatura';
import { parseDocument } from './parse';
import type { Line } from './types';

let y = 1000;
const L = (...pieces: [number, string][]): Line => {
  y -= 10;
  const items = pieces.map(([x, s]) => ({ x, s }));
  return { y, items, text: items.map((i) => i.s).join(' ') };
};

describe('fatura Itaú', () => {
  const page1 = [
    L([45, 'Banco Ita'], [80, 'ú'], [90, 'S.A.']),
    L([243, 'Emiss'], [257, 'ã'], [260, 'o: 08/11/2026']),
    L([45, 'Titular FULANA DE TAL']),
    L([69, 'Cart'], [83, 'ã'], [87, 'o'], [96, '1234.XXXX.XXXX.9999']),
    L([365, 'Total desta fatura'], [530, '260,00']),
  ];
  const page2 = [
    L([133, 'Pagamentos efetuados'], [351, 'Lan'], [366, 'ç'], [371, 'amentos: compras e saques']),
    L([133, '08/10'], [161, 'PAGAMENTO PIX'], [303, '-100,00'], [351, '05/11'], [379, 'LOJA B'], [528, '50,00']),
    L([133, 'Lançamentos: compras e saques'], [379, 'outros CIDADE']),
    L([133, '10/01'], [161, 'LOJA A 10/10'], [311, '200,00']),
    L([161, 'vestuário CIDADE'], [351, 'Lançamentos no cartão'], [520, '250,00']),
    L([351, 'Lançamentos: produtos e serviços']),
    L([351, '08/10'], [379, 'Mensalidade - Plano'], [530, '10,00']),
    L([351, 'Lançamentos produtos e serviços'], [520, '10,00']),
    L([351, 'Total dos lançamentos atuais'], [520, '260,00']),
    L([351, 'Compras parceladas - próximas faturas']),
    L([351, '10/01'], [379, 'LOJA A 11/10'], [520, '200,00']),
  ];

  it('é reconhecida (mesmo com as palavras quebradas nos acentos)', () => {
    expect(isItauFatura([...page1, ...page2].map((l) => l.text).join('\n'))).toBe(true);
    expect(parseDocument([page1, page2]).source).toBe('fatura-itau');
  });

  it('lê as duas colunas, as parcelas e bate com os totais; ignora pagamento, tarifa e próximas faturas', () => {
    const doc = parseItauFatura([page1, page2]);
    expect(doc.periodEnd).toBe('2026-11-08');
    const compras = doc.items.filter((i) => i.kind === 'compra');
    expect(compras.map((i) => [i.description, i.date, i.month, i.installment, i.amount])).toEqual([
      ['LOJA A', '2026-01-10', '2026-10', { n: 10, total: 10 }, 20000],
      ['LOJA B', '2026-11-05', '2026-11', undefined, 5000],
    ]);
    expect(compras.every((i) => i.card?.last4 === '9999' && i.card.holder === 'FULANA DE TAL')).toBe(true);
    expect(doc.items.filter((i) => i.kind === 'ignorado').map((i) => i.ignoreReason)).toEqual([
      'Pagamento de fatura', 'Tarifa do cartão (anuidade/mensalidade)',
    ]);
    expect(doc.checks.map((c) => [c.label, c.expected - c.found])).toEqual([
      ['Compras do cartão', 0], ['Produtos e serviços', 0], ['Total da fatura', 0],
    ]);
  });
});

describe('extrato Banco do Brasil', () => {
  const page = [
    L([25, 'Extrato de Conta Corrente']),
    L([25, 'Cliente: FULANA DE TAL SOUZA']),
    L([20, 'Período: 01 a 31/10/2026'], [220, 'Agência: 0000-0']),
    L([30, 'Lançamentos']),
    L([30, 'Dia'], [99, 'Lote'], [148, 'Documento'], [265, 'Histórico'], [550, 'Valor']),
    L([30, '30/09/2026'], [265, 'Saldo Anterior'], [540, '10,00 (+)']),
    L([265, 'Pix - Enviado']),
    L([30, '05/10/2026'], [99, '13105'], [148, '100501'], [537, '50,00 (-)']),
    L([265, '03/10 12:03 Beltrano da Silva']),
    L([265, 'BB Rende Fácil']),
    L([30, '05/10/2026'], [148, '9903'], [535, '50,00 (+)']),
    L([265, 'Rende Facil']),
    L([30, '05/10/2026'], [99, '99020'], [265, 'Saldo do dia'], [540, '10,00 (+)']),
    L([265, 'Pix - Enviado']),
    L([30, '06/10/2026'], [99, '13105'], [148, '100601'], [265, '06/10 09:02 DEPARTAMENTO DE'], [532, '20,00 (-)']),
    L([265, 'TRANSITO']),
    L([265, 'Pix - Enviado']),
    L([30, '07/10/2026'], [99, '13105'], [148, '100701'], [523, '1.000,00 (-)']),
    L([265, '07/10 08:00 Fulana de Tal Sou']),
    L([265, 'Pagamento de Boleto']),
    L([30, '08/10/2026'], [99, '13105'], [148, '100801'], [532, '30,00 (-)']),
    L([265, 'ITAU UNIBANCO HOLDING S A']),
    L([265, 'Tarifa MSG - Mês Anterior']),
    L([30, '09/10/2026'], [99, '13113'], [148, '998'], [537, '5,00 (-)']),
    L([265, 'Pix - Recebido']),
    L([30, '10/10/2026'], [99, '14397'], [148, '101001'], [521, '1.100,00 (+)']),
    L([265, '10/10 10:00 12345678901 Ciclano']),
    L([30, '31/10/2026'], [265, 'S A L D O'], [521, '55,00 (+)']),
    L([30, 'Aplicações Financeiras']),
  ];

  it('é reconhecido e lê tipo (linha de cima), valor e favorecido (linha de baixo)', () => {
    const doc = parseDocument([page]);
    expect(doc.source).toBe('extrato-bb');
    expect([doc.periodStart, doc.periodEnd]).toEqual(['2026-10-01', '2026-10-31']);
    expect(doc.checks).toEqual([{ label: 'Saldo final do período', expected: 5500, found: 5500 }]);
    expect(doc.items.map((i) => [i.date, i.kind, i.amount, i.matchText, i.ignoreReason])).toEqual([
      ['2026-10-05', 'pix_pessoa', 5000, 'Beltrano da Silva', undefined],
      ['2026-10-05', 'ignorado', 5000, 'Rende Facil', 'Aplicação/resgate automático (BB Rende Fácil)'],
      ['2026-10-06', 'pix_empresa', 2000, 'DEPARTAMENTO DE TRANSITO', undefined],
      ['2026-10-07', 'ignorado', 100000, 'Fulana de Tal Sou', 'Transferência para conta própria'],
      ['2026-10-08', 'ignorado', 3000, 'ITAU UNIBANCO HOLDING S A', 'Pagamento de fatura de cartão (as compras vêm da fatura)'],
      ['2026-10-09', 'ignorado', 500, 'Tarifa MSG - Mês Anterior', 'Tarifa bancária'],
      ['2026-10-10', 'ignorado', 110000, 'Ciclano', 'Entrada de dinheiro (não é gasto)'],
    ]);
    expect(parseBBExtrato([page]).holderName).toBe('FULANA DE TAL SOUZA');
  });

  it('nome cortado do próprio titular conta como conta própria', () => {
    expect(sameHolderName('Fulana de Tal Sou', 'FULANA DE TAL SOUZA')).toBe(true);
    expect(sameHolderName('FULANA DE TAL SOUZ', 'FULANA DE TAL SOUZA')).toBe(true);
    expect(sameHolderName('Fulana', 'FULANA DE TAL SOUZA')).toBe(false);
    expect(sameHolderName('Maria de Tal', 'FULANA DE TAL SOUZA')).toBe(false);
  });

  it('Pix sem CPF/CNPJ: adivinha empresa pelo nome', () => {
    for (const n of ['Loja Exemplo Ltda', 'FARMACIAS EXEMPLO', '12.345.678 JOAO', '12 345 678 JOAO', 'ONR']) expect({ n, c: looksLikeCompany(n) }).toEqual({ n, c: true });
    for (const n of ['Joao da Silva', 'MARIA SOUZA']) expect({ n, c: looksLikeCompany(n) }).toEqual({ n, c: false });
  });
});
