import { describe, expect, it } from 'vitest';
import { daySlotAt, nextDaySlot } from './daySlot';
import { boxOdds } from './mysteryBox';
import { avatarOwned, itemForAvatar, itemForTheme, profilePatch, SHOP_ITEMS, shopItem, themeOwned } from './shop';
import { themeById, themeCss } from './themes';

const at = (h: number, m = 0) => new Date(2026, 10, 23, h, m);

describe('lendário Céu de Bolso', () => {
  it('horários: manhã 5h–12h, tarde 12h–18h, entardecer 18h–20h, noite 20h–5h', () => {
    expect([at(4, 59), at(5), at(11, 59), at(12), at(17, 59), at(18), at(19, 59), at(20), at(0)].map((d) => daySlotAt(d)))
      .toEqual(['noite', 'manha', 'manha', 'tarde', 'tarde', 'entardecer', 'entardecer', 'noite', 'noite']);
    expect(nextDaySlot('noite')).toBe('manha');
  });

  it('custa 1000 e é uma compra só: o avatar Nuvem e o tema Céu de Bolso', () => {
    const item = shopItem('lendario:ceu')!;
    expect(item.price).toBe(1000);
    // o avatar e o tema não são vendidos separados
    expect(SHOP_ITEMS.some((i) => i.key === 'tema:ceu' || i.key === 'avatar:nuvem')).toBe(false);
    expect(itemForTheme('ceu')).toBe(item);
    expect(itemForAvatar('nuvem')).toBe(item);
    expect(profilePatch(item)).toEqual({ theme: 'ceu', avatar: 'nuvem' });
    const owned = new Set(['lendario:ceu']);
    expect(themeOwned('ceu', owned)).toBe(true);
    expect(avatarOwned('nuvem', owned)).toBe(true);
    expect(themeOwned('ceu', new Set())).toBe(false);
    expect(avatarOwned('nuvem', new Set())).toBe(false);
  });

  it('não sai na Caixa surpresa', () => {
    expect(boxOdds(new Set()).flatMap((g) => g.items).some((i) => i.kind === 'lendario')).toBe(false);
  });

  it('o tema usa as cores do horário, iguais no claro e no escuro', () => {
    const t = themeById('ceu');
    const noite = themeCss(t, 'noite');
    expect(noite).toContain(`--bg:${t.daySlots!.noite.bg}`);
    expect(noite).toContain('color-scheme:dark');
    expect(noite).not.toContain(t.daySlots!.manha.bg);
    const manha = themeCss(t, 'manha');
    expect(manha).toContain(`--bg:${t.daySlots!.manha.bg}`);
    expect(manha).not.toContain('color-scheme:dark');
  });
});
