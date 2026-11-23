/**
 * Caixa surpresa da Loja: sorteia um item que a pessoa ainda NÃO tem (nunca repete).
 * Duas raridades: Comum (avatares e temas comuns) e Raro (avatares e temas premium).
 * Cada grupo tem a sua chance; quando um grupo acaba, a chance dele vai para os outros na mesma proporção.
 */
import { SHOP_ITEMS, type ShopItem } from './shop';

export const BOX = { price: 150 };

export type Rarity = 'comum' | 'raro';

export const RARITY_NAMES: Record<Rarity, string> = { comum: 'Comum', raro: 'Raro' };

export const rarityOf = (i: ShopItem): Rarity => (i.premium ? 'raro' : 'comum');
export const rarityName = (r: Rarity) => RARITY_NAMES[r];

type GroupId = 'avatar' | 'tema' | 'avatar-raro' | 'tema-raro';

/** Grupos do sorteio, com a chance de cada um. */
export const BOX_GROUPS: { id: GroupId; rarity: Rarity; kind: ShopItem['kind']; weight: number; what: string }[] = [
  { id: 'avatar', rarity: 'comum', kind: 'avatar', weight: 50, what: 'avatares' },
  { id: 'tema', rarity: 'comum', kind: 'tema', weight: 30, what: 'temas' },
  { id: 'avatar-raro', rarity: 'raro', kind: 'avatar', weight: 12, what: 'avatares' },
  { id: 'tema-raro', rarity: 'raro', kind: 'tema', weight: 8, what: 'temas' },
];

export interface GroupOdds { group: GroupId; rarity: Rarity; what: string; chance: number; items: ShopItem[] }

/** Chances de cada grupo entre os itens que a pessoa ainda não tem (soma 1; vazio = já tem tudo). */
export function boxOdds(owned: Set<string>): GroupOdds[] {
  const groups = BOX_GROUPS
    .map((g) => ({ ...g, items: SHOP_ITEMS.filter((i) => i.kind === g.kind && rarityOf(i) === g.rarity && !owned.has(i.key)) }))
    .filter((g) => g.items.length > 0);
  const total = groups.reduce((s, g) => s + g.weight, 0);
  return groups.map((g) => ({ group: g.id, rarity: g.rarity, what: g.what, chance: g.weight / total, items: g.items }));
}

/** Sorteia o item da caixa. `rand` devolve um número em [0, 1). Null = já tem tudo. */
export function drawBox(owned: Set<string>, rand: () => number): ShopItem | null {
  const odds = boxOdds(owned);
  if (!odds.length) return null;
  let r = rand();
  let group = odds[odds.length - 1];
  for (const g of odds) {
    if (r < g.chance) { group = g; break; }
    r -= g.chance;
  }
  return group.items[Math.min(Math.floor(rand() * group.items.length), group.items.length - 1)];
}

/** Número aleatório seguro em [0, 1). */
export function secureRandom(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
