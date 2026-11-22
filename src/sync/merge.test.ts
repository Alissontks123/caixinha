import { describe, expect, it } from 'vitest';
import { mergeSnapshots, stableStringify, unifyCategories, type Snapshot } from './merge';

const tx = (id: string, amount: number, updatedAt = 1, extra = {}) => ({ id, amount, updatedAt, ...extra });
const snap = (transactions: object[], more: Snapshot = {}): Snapshot => ({ transactions: transactions as never, ...more });
const ids = (s: Snapshot) => (s.transactions ?? []).map((t) => `${t.id}:${t.amount}`).sort();

describe('mesclagem item a item', () => {
  const base = snap([tx('a', 10), tx('b', 20), tx('c', 30)]);

  it('junta mudanças diferentes feitas nos dois aparelhos', () => {
    const local = snap([tx('a', 11, 5), tx('b', 20), tx('c', 30), tx('novoPC', 1, 6)]);
    const remote = snap([tx('a', 10), tx('b', 22, 7), tx('novoCel', 2, 8)]); // c excluído no celular
    const r = mergeSnapshots(base, local, remote);
    expect(ids(r.merged)).toEqual(['a:11', 'b:22', 'novoCel:2', 'novoPC:1']);
    expect(r.localChanged).toBe(true);
    expect(r.remoteChanged).toBe(true);
    expect(r.conflicts).toBe(0);
  });

  it('mesmo item alterado nos dois: vale o mais recente', () => {
    const r = mergeSnapshots(base, snap([tx('a', 11, 50), tx('b', 20), tx('c', 30)]), snap([tx('a', 12, 60), tx('b', 20), tx('c', 30)]));
    expect(ids(r.merged)).toContain('a:12');
    expect(r.conflicts).toBe(1);
  });

  it('excluído de um lado e editado do outro: a edição vence', () => {
    const r = mergeSnapshots(base, snap([tx('b', 20), tx('c', 30)]), snap([tx('a', 99, 9), tx('b', 20), tx('c', 30)]));
    expect(ids(r.merged)).toContain('a:99');
  });

  it('nada mudou: não grava nem envia', () => {
    const r = mergeSnapshots(base, base, base);
    expect(r.localChanged).toBe(false);
    expect(r.remoteChanged).toBe(false);
  });

  it('primeira conexão sem base: une tudo', () => {
    const r = mergeSnapshots(null, snap([tx('a', 1)]), snap([tx('b', 2)]));
    expect(ids(r.merged)).toEqual(['a:1', 'b:2']);
  });

  it('Drive salvo por uma versão antiga (sem a tabela de estrelas) não apaga as compras deste aparelho', () => {
    const compras = [{ id: 'compra-avatar:panda', amount: 100, updatedAt: 1 }];
    const base2 = snap([tx('a', 10)], { stars: compras });
    const remoteAntigo = snap([tx('a', 10)]); // sem a chave "stars"
    const r = mergeSnapshots(base2, base2, remoteAntigo);
    expect(r.merged.stars).toEqual(compras);
    expect(r.localChanged).toBe(false);
    expect(r.remoteChanged).toBe(true); // reenvia a tabela para o Drive
  });

  it('comparação ignora a ordem das chaves', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [1, { f: 1, e: 2 }] } })).toBe(stableStringify({ a: { c: [1, { e: 2, f: 1 }], d: 2 }, b: 1 }));
  });
});

describe('unificar categorias ao juntar dois aparelhos', () => {
  it('categoria de mesmo nome passa a usar a do Drive', () => {
    const local: Snapshot = {
      categories: [{ id: 'L1', name: 'Alimentação' }, { id: 'L2', name: 'Pets' }],
      categoryRules: [{ id: 'r1', categoryId: 'L1' }, { id: 'r2', categoryId: 'L2' }],
      transactions: [{ id: 't1', categoryId: 'L1' }, { id: 't2', categoryId: 'L2' }],
      learnedRules: [{ key: 'RAIA', categoryId: 'L1' }],
      closings: [{ month: '2026-10', categories: [{ categoryId: 'L1' }] }],
    };
    const remote: Snapshot = { categories: [{ id: 'R1', name: 'alimentacao' }] };
    const u = unifyCategories(local, remote);
    expect(u.categories!.map((c) => c.id)).toEqual(['L2']);
    expect(u.categoryRules!.map((c) => c.id)).toEqual(['r2']);
    expect(u.transactions!.map((t) => t.categoryId)).toEqual(['R1', 'L2']);
    expect(u.learnedRules![0].categoryId).toBe('R1');
    expect((u.closings![0].categories as { categoryId: string }[])[0].categoryId).toBe('R1');
  });
});
