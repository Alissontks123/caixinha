import { describe, expect, it } from 'vitest';
import { AVATARS, avatarById, DEFAULT_AVATAR, isAvatarUnlocked } from './avatars';

describe('avatares', () => {
  it('3 Standard, 10 da Loja e 3 Premium (um deles de gato), sem nomes repetidos', () => {
    expect(AVATARS.filter((a) => a.tier === 'standard')).toHaveLength(3);
    expect(AVATARS.filter((a) => a.tier === 'shop')).toHaveLength(10);
    const premium = AVATARS.filter((a) => a.tier === 'premium');
    expect(premium).toHaveLength(3);
    expect(premium.some((a) => a.id === 'gatinho')).toBe(true);
    expect(new Set(AVATARS.map((a) => a.id)).size).toBe(AVATARS.length);
    expect(new Set(AVATARS.map((a) => a.name)).size).toBe(AVATARS.length);
  });

  it('quem não escolheu fica com o Pintinho; só os Standard estão liberados por enquanto', () => {
    expect(DEFAULT_AVATAR).toBe('pintinho');
    expect(avatarById(undefined).id).toBe('pintinho');
    expect(avatarById('nao-existe').id).toBe('pintinho');
    expect(AVATARS.filter((a) => isAvatarUnlocked(a.id)).map((a) => a.id)).toEqual(['pintinho', 'ratinho', 'coelho']);
    expect(isAvatarUnlocked('nao-existe')).toBe(false);
  });
});
