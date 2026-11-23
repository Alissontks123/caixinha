import { describe, expect, it } from 'vitest';
import type { StarRecord } from '../domain/stars';
import { BOX, boxOdds, boxPityCount, drawBox, pityActive, rarityOf } from './mysteryBox';
import { SHOP_ITEMS } from './shop';

const none = new Set<string>();
const all = (pred: (k: string) => boolean) => new Set(SHOP_ITEMS.map((i) => i.key).filter(pred));
const boxRec = (item: string, openedAt: number): StarRecord => ({
  id: `compra-${item}`, kind: 'compra', item, amount: BOX.price, date: '2026-11-23', label: 'Caixa surpresa', box: true, openedAt,
});
/** gerador previsível (para os testes) */
const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };

describe('caixa surpresa', () => {
  it('preço 150 e chances 50/30/12/8 com os 25 itens da loja', () => {
    expect(BOX.price).toBe(150);
    const o = boxOdds(none);
    expect(o.map((x) => [x.rarity, x.chance, x.items.length])).toEqual([
      ['comum', 0.5, 10], ['raro', 0.3, 9], ['epico', 0.12, 3], ['lendario', 0.08, 3],
    ]);
  });

  it('nunca sorteia o que a pessoa já tem; a chance de uma raridade esgotada vai para as outras', () => {
    const owned = all((k) => k.startsWith('avatar:') && !SHOP_ITEMS.find((i) => i.key === k)!.premium); // todos os comuns
    const o = boxOdds(owned);
    expect(o.map((x) => x.rarity)).toEqual(['raro', 'epico', 'lendario']);
    expect(o.reduce((s, x) => s + x.chance, 0)).toBeCloseTo(1);
    expect(o[0].chance).toBeCloseTo(0.6); // 30 / 50
    for (let k = 0; k < 200; k++) {
      const item = drawBox(owned, [], Math.random)!;
      expect(owned.has(item.key)).toBe(false);
    }
  });

  it('já tem tudo: não há o que sortear', () => {
    expect(boxOdds(all(() => true))).toEqual([]);
    expect(drawBox(all(() => true), [], Math.random)).toBeNull();
  });

  it('o sorteio segue as faixas de chance', () => {
    expect(rarityOf(drawBox(none, [], seq(0.1, 0))!)).toBe('comum');
    expect(rarityOf(drawBox(none, [], seq(0.6, 0))!)).toBe('raro');
    expect(rarityOf(drawBox(none, [], seq(0.85, 0))!)).toBe('epico');
    expect(rarityOf(drawBox(none, [], seq(0.95, 0.999))!)).toBe('lendario');
  });

  it('garantia: depois de 5 caixas seguidas sem premium, a 6ª dá premium', () => {
    const comuns = SHOP_ITEMS.filter((i) => rarityOf(i) === 'comum');
    const five = comuns.slice(0, 5).map((i, n) => boxRec(i.key, n + 1));
    expect(boxPityCount(five.slice(0, 4))).toBe(4);
    expect(pityActive(five.slice(0, 4), none)).toBe(false);
    expect(boxPityCount(five)).toBe(5);
    const owned = new Set(five.map((r) => r.item));
    expect(pityActive(five, owned)).toBe(true);
    // mesmo com o número que daria "comum", sai premium
    expect(drawBox(owned, five, seq(0.01, 0))!.premium).toBe(true);
    // um premium zera a contagem; compras diretas (sem caixa) não contam
    const premium = SHOP_ITEMS.find((i) => i.premium)!;
    expect(boxPityCount([...five, boxRec(premium.key, 10)])).toBe(0);
    expect(boxPityCount([{ ...five[0], box: undefined }])).toBe(0);
  });
});
