import { STAR_PRICES } from '../domain/stars';
import { AVATARS, isAvatarUnlocked } from './avatars';
import { isUnlocked, THEMES } from './themes';

/** Item da loja: tema ou avatar que não é grátis. */
export interface ShopItem {
  /** 'tema:<id>' ou 'avatar:<id>' (o mesmo guardado na compra). */
  key: string;
  kind: 'tema' | 'avatar';
  id: string;
  name: string;
  price: number;
  premium: boolean;
}

export const SHOP_ITEMS: ShopItem[] = [
  ...AVATARS.filter((a) => !isAvatarUnlocked(a.id)).map((a): ShopItem => ({
    key: `avatar:${a.id}`, kind: 'avatar', id: a.id, name: a.name, premium: a.tier === 'premium',
    price: a.tier === 'premium' ? STAR_PRICES.avatarPremium : STAR_PRICES.avatarLoja,
  })),
  ...THEMES.filter((t) => !isUnlocked(t.id)).map((t): ShopItem => ({
    key: `tema:${t.id}`, kind: 'tema', id: t.id, name: t.name, premium: !!t.premium,
    price: t.premium ? STAR_PRICES.temaPremium : STAR_PRICES.temaComum,
  })),
];

export const shopItem = (key: string) => SHOP_ITEMS.find((i) => i.key === key);

/** Pode usar: é grátis ou foi comprado. */
export const themeOwned = (id: string, owned: Set<string>) => isUnlocked(id) || owned.has(`tema:${id}`);
export const avatarOwned = (id: string, owned: Set<string>) => isAvatarUnlocked(id) || owned.has(`avatar:${id}`);
