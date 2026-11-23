import { describe, expect, it } from 'vitest';
import type { Category, LearnedRule } from '../domain/types';
import { matchKeyOf } from '../domain/categorize';
import { writeXlsx } from '../export/xlsx';
import { buildProfilePlan, parseProfileRows, PROFILE_EXAMPLES, readCsv, readProfileFile, readXlsx } from './profileSheet';

const cats: Category[] = [
  { id: 'ali', name: 'Alimentação', kind: 'normal', order: 0, color: '#000' },
  { id: 'sau', name: 'Saúde', kind: 'normal', order: 1, color: '#000' },
  { id: 'a-identificar', name: 'A identificar', kind: 'unidentified', order: 1000, color: '#000' },
  { id: 'nao-e-gasto', name: 'Não é gasto', kind: 'ignored', order: 1001, color: '#000' },
];

describe('perfil de compra', () => {
  it('lê a planilha .xlsx (modelo do app preenchido), pulando os exemplos', () => {
    const bytes = writeXlsx([
      {
        name: 'Perfil',
        columns: [{ header: 'Data', width: 10 }, { header: 'Descrição', width: 30 }, { header: 'Valor', width: 10 }, { header: 'Categoria', width: 20 }],
        rows: [
          ['05/10/2026', PROFILE_EXAMPLES[0], 120.5, 'Alimentação'],
          ['07/10/2026', 'MERCADO EXEMPLO 123', 45.9, 'alimentacao'],
          [46302, 'FARMACIA TESTE', '1.234,56', 'Saúde'],
          ['08/10/2026', 'LOJA SEM CATEGORIA', 10, ''],
        ],
        validations: [{ sqref: 'D2:D10', formula: 'Categorias!$A$2:$A$3' }],
      },
      { name: 'Categorias', columns: [{ header: 'Categoria', width: 20 }], rows: [['Alimentação'], ['Saúde']] },
    ]);
    const rows = parseProfileRows(readXlsx(bytes));
    expect(rows).toEqual([
      { line: 3, date: '07/10/2026', description: 'MERCADO EXEMPLO 123', amount: 4590, category: 'alimentacao' },
      { line: 4, date: '07/10/2026', description: 'FARMACIA TESTE', amount: 123456, category: 'Saúde' },
      { line: 5, date: '08/10/2026', description: 'LOJA SEM CATEGORIA', amount: 1000, category: '' },
    ]);
  });

  it('lê CSV com ; e aspas', () => {
    const t = readCsv('﻿Data;Descrição;Valor;Categoria\r\n01/10/2026;"PADARIA ""BOA""";12,30;Alimentação\r\n');
    expect(parseProfileRows(t)).toEqual([{ line: 2, date: '01/10/2026', description: 'PADARIA "BOA"', amount: 1230, category: 'Alimentação' }]);
    expect(parseProfileRows(readProfileFile('perfil.csv', new TextEncoder().encode('Descricao,Categoria\nPOSTO X,Saúde\n')))[0].category).toBe('Saúde');
  });

  it('sem as colunas certas: explica o que falta', () => {
    expect(() => parseProfileRows([['A', 'B'], ['1', '2']])).toThrow(/Descrição/);
    expect(() => readXlsx(new Uint8Array([1, 2, 3]))).toThrow(/planilha/);
  });

  it('agrupa por estabelecimento, escolhe a categoria mais usada e aponta as que não existem', () => {
    const rule: LearnedRule = { key: matchKeyOf('PADARIA CENTRAL'), categoryId: 'sau', example: 'PADARIA CENTRAL', updatedAt: 0 };
    const plan = buildProfilePlan([
      { line: 2, date: '', description: 'PADARIA CENTRAL 01', amount: 1000, category: 'Alimentação' },
      { line: 3, date: '', description: 'PADARIA CENTRAL 02', amount: 500, category: 'Alimentação' },
      { line: 4, date: '', description: 'Padaria Central', amount: 200, category: 'Saúde' },
      { line: 5, date: '', description: 'PET SHOP', amount: 300, category: 'Pets' },
      { line: 6, date: '', description: 'A IDENTIFICAR', amount: 1, category: 'A identificar' },
      { line: 7, date: '', description: 'LOJA', category: '' },
    ], cats, [rule]);
    expect(plan.rows).toBe(6);
    expect(plan.noCategory).toBe(1);
    const byKey = Object.fromEntries(plan.entries.map((e) => [e.example, e]));
    expect(byKey['PADARIA CENTRAL 01']).toMatchObject({ categoryId: 'ali', count: 3, total: 1700, others: ['Saúde'], previous: 'sau' });
    expect(byKey['PET SHOP']).toMatchObject({ categoryId: null, categoryName: 'Pets' });
    // "A identificar" não é uma categoria que se aprende
    expect(byKey['A IDENTIFICAR'].categoryId).toBeNull();
    // as desconhecidas aparecem primeiro na revisão
    expect(plan.entries[0].categoryId).toBeNull();
  });
});
