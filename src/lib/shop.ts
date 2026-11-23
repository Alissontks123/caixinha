import { STAR_PRICES } from '../domain/stars';
import { AVATARS, isAvatarUnlocked } from './avatars';
import { isUnlocked, THEMES } from './themes';

/** Item da loja: tema, avatar ou lendário (avatar + tema juntos) que não é grátis. */
export interface ShopItem {
  /** 'tema:<id>', 'avatar:<id>' ou 'lendario:<id>' (o mesmo guardado na compra). */
  key: string;
  kind: 'tema' | 'avatar' | 'lendario';
  id: string;
  name: string;
  price: number;
  premium: boolean;
}

/** Lendário: um avatar e um tema que vêm juntos numa compra só (e mudam com o horário do dia). */
export interface Legendary { id: string; name: string; theme: string; avatar: string; detail: string }

export const LEGENDARIES: Legendary[] = [
  { id: 'ceu', name: 'Céu de Bolso', theme: 'ceu', avatar: 'nuvem', detail: 'O avatar Nuvem e o tema Céu de Bolso, animados, mudando sozinhos de manhã, à tarde, no entardecer e à noite.' },
];

export const legendaryById = (id: string) => LEGENDARIES.find((l) => l.id === id);
const legendaryWith = (kind: 'tema' | 'avatar', id: string) => LEGENDARIES.find((l) => (kind === 'tema' ? l.theme : l.avatar) === id);

export const SHOP_ITEMS: ShopItem[] = [
  ...AVATARS.filter((a) => !isAvatarUnlocked(a.id) && a.tier !== 'lendario').map((a): ShopItem => ({
    key: `avatar:${a.id}`, kind: 'avatar', id: a.id, name: a.name, premium: a.tier === 'premium',
    price: a.tier === 'premium' ? STAR_PRICES.avatarPremium : STAR_PRICES.avatarLoja,
  })),
  ...THEMES.filter((t) => !isUnlocked(t.id) && !t.legendary).map((t): ShopItem => ({
    key: `tema:${t.id}`, kind: 'tema', id: t.id, name: t.name, premium: !!t.premium,
    price: t.premium ? STAR_PRICES.temaPremium : STAR_PRICES.temaComum,
  })),
  ...LEGENDARIES.map((l): ShopItem => ({ key: `lendario:${l.id}`, kind: 'lendario', id: l.id, name: l.name, premium: false, price: STAR_PRICES.lendario })),
];

export const shopItem = (key: string) => SHOP_ITEMS.find((i) => i.key === key);

/** O item à venda que dá este tema / avatar (ele mesmo ou o lendário que o inclui). */
export const itemForTheme = (id: string) => {
  const l = legendaryWith('tema', id);
  return l ? shopItem(`lendario:${l.id}`) : shopItem(`tema:${id}`);
};
export const itemForAvatar = (id: string) => {
  const l = legendaryWith('avatar', id);
  return l ? shopItem(`lendario:${l.id}`) : shopItem(`avatar:${id}`);
};

/** Pode usar: é grátis, foi comprado, ou veio num lendário comprado. */
export const themeOwned = (id: string, owned: Set<string>) => {
  const l = legendaryWith('tema', id);
  return isUnlocked(id) || owned.has(`tema:${id}`) || (!!l && owned.has(`lendario:${l.id}`));
};
export const avatarOwned = (id: string, owned: Set<string>) => {
  const l = legendaryWith('avatar', id);
  return isAvatarUnlocked(id) || owned.has(`avatar:${id}`) || (!!l && owned.has(`lendario:${l.id}`));
};

/** O que "Usar" muda no perfil (o lendário troca o avatar e o tema juntos). */
export function profilePatch(item: ShopItem): { theme?: string; avatar?: string } {
  if (item.kind === 'tema') return { theme: item.id };
  if (item.kind === 'avatar') return { avatar: item.id };
  const l = legendaryById(item.id)!;
  return { theme: l.theme, avatar: l.avatar };
}

/** "Tema", "Avatar" ou "Lendário · avatar + tema". */
export const itemKindLabel = (item: ShopItem) =>
  item.kind === 'tema' ? 'Tema' : item.kind === 'avatar' ? 'Avatar' : 'Lendário · avatar + tema';
