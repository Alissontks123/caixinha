import { describe, expect, it } from 'vitest';
import { BOX, boxOdds, drawBox, rarityOf } from './mysteryBox';
import { SHOP_ITEMS } from './shop';

const none = new Set<string>();
const all = (pred: (k: string) => boolean) => new Set(SHOP_ITEMS.map((i) => i.key).filter(pred));
/** gerador previsível (para os testes) */
const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };

describe('caixa surpresa', () => {
  it('preço 150; só Comum e Raro; chances 50/30/12/8 por grupo', () => {
    expect(BOX.price).toBe(150);
    expect(new Set(SHOP_ITEMS.map(rarityOf))).toEqual(new Set(['comum', 'raro']));
    const o = boxOdds(none);
    expect(o.map((x) => [x.rarity, x.what, x.chance, x.items.length])).toEqual([
      ['comum', 'avatares', 0.5, 10], ['comum', 'temas', 0.3, 9], ['raro', 'avatares', 0.12, 3], ['raro', 'temas', 0.08, 3],
    ]);
  });

  it('avatar de 100 e tema de 200 são Comum; avatar de 300 e tema de 500 são Raro', () => {
    for (const i of SHOP_ITEMS) {
      const expected = (i.kind === 'avatar' && i.price === 300) || (i.kind === 'tema' && i.price === 500) ? 'raro' : 'comum';
      expect(rarityOf(i), i.key).toBe(expected);
    }
  });

  it('nunca sorteia o que a pessoa já tem; a chance de um grupo esgotado vai para os outros', () => {
    const owned = all((k) => k.startsWith('avatar:') && !SHOP_ITEMS.find((i) => i.key === k)!.premium); // todos os avatares comuns
    const o = boxOdds(owned);
    expect(o.map((x) => x.group)).toEqual(['tema', 'avatar-raro', 'tema-raro']);
    expect(o.reduce((s, x) => s + x.chance, 0)).toBeCloseTo(1);
    expect(o[0].chance).toBeCloseTo(0.6); // 30 / 50
    for (let k = 0; k < 200; k++) {
      const item = drawBox(owned, Math.random)!;
      expect(owned.has(item.key)).toBe(false);
    }
  });

  it('já tem tudo: não há o que sortear', () => {
    expect(boxOdds(all(() => true))).toEqual([]);
    expect(drawBox(all(() => true), Math.random)).toBeNull();
  });

  it('o sorteio segue as faixas de chance', () => {
    const pick = (r: number) => { const i = drawBox(none, seq(r, 0))!; return [rarityOf(i), i.kind]; };
    expect(pick(0.1)).toEqual(['comum', 'avatar']);
    expect(pick(0.6)).toEqual(['comum', 'tema']);
    expect(pick(0.85)).toEqual(['raro', 'avatar']);
    expect(pick(0.95)).toEqual(['raro', 'tema']);
  });
});
