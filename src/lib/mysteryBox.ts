/**
 * Caixa surpresa da Loja: sorteia um item que a pessoa ainda NÃO tem (nunca repete).
 * Chances por raridade; quando uma raridade acaba, a chance dela vai para as outras na mesma proporção.
 * Garantia: depois de 5 caixas seguidas sem item premium, a 6ª dá um premium (se ainda houver).
 */
import type { StarRecord } from '../domain/stars';
import { SHOP_ITEMS, type ShopItem } from './shop';

export const BOX = { price: 150, pity: 5 };

export type Rarity = 'comum' | 'raro' | 'epico' | 'lendario';

export const RARITIES: { id: Rarity; name: string; weight: number; what: string }[] = [
  { id: 'comum', name: 'Comum', weight: 50, what: 'avatares' },
  { id: 'raro', name: 'Raro', weight: 30, what: 'temas' },
  { id: 'epico', name: 'Épico', weight: 12, what: 'avatares premium' },
  { id: 'lendario', name: 'Lendário', weight: 8, what: 'temas premium' },
];

export const rarityOf = (i: ShopItem): Rarity =>
  i.kind === 'avatar' ? (i.premium ? 'epico' : 'comum') : (i.premium ? 'lendario' : 'raro');

export const rarityName = (r: Rarity) => RARITIES.find((x) => x.id === r)!.name;

export interface RarityOdds { rarity: Rarity; name: string; what: string; chance: number; items: ShopItem[] }

/** Chances de cada raridade entre os itens que a pessoa ainda não tem (soma 1; vazio = já tem tudo). */
export function boxOdds(owned: Set<string>, onlyPremium = false): RarityOdds[] {
  const groups = RARITIES
    .filter((r) => !onlyPremium || r.id === 'epico' || r.id === 'lendario')
    .map((r) => ({ ...r, items: SHOP_ITEMS.filter((i) => rarityOf(i) === r.id && !owned.has(i.key)) }))
    .filter((g) => g.items.length > 0);
  const total = groups.reduce((s, g) => s + g.weight, 0);
  return groups.map((g) => ({ rarity: g.id, name: g.name, what: g.what, chance: g.weight / total, items: g.items }));
}

/** Quantas caixas seguidas (das mais recentes para trás) saíram sem item premium. */
export function boxPityCount(records: StarRecord[]): number {
  const boxes = records.filter((r) => r.box).sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0));
  let n = 0;
  for (const r of boxes) {
    const item = SHOP_ITEMS.find((i) => i.key === r.item);
    if (item?.premium) break;
    n += 1;
  }
  return n;
}

/** A próxima caixa garante um premium? (só se ainda houver premium para ganhar) */
export const pityActive = (records: StarRecord[], owned: Set<string>) =>
  boxPityCount(records) >= BOX.pity && boxOdds(owned, true).length > 0;

/** Sorteia o item da caixa. `rand` devolve um número em [0, 1). Null = já tem tudo. */
export function drawBox(owned: Set<string>, records: StarRecord[], rand: () => number): ShopItem | null {
  const odds = boxOdds(owned, pityActive(records, owned));
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
