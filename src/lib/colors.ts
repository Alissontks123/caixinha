import { useIsDark } from './theme';

/**
 * Paleta categórica pastel ("Lavanda"), em ordem fixa.
 * Cada categoria recebe uma posição e a mantém (a cor segue a categoria, nunca a posição no ranking).
 * O modo escuro usa os mesmos tons, um pouco mais claros para o fundo escuro.
 */
export const SERIES_LIGHT = ['#9b8fe6', '#f29cb7', '#6fc6aa', '#f2bd5e', '#86b6ea', '#f3a07c', '#c39be0', '#e5868b'];
export const SERIES_DARK = ['#b1a7f0', '#f4abc2', '#8fd6bf', '#f7cd84', '#a0c8f0', '#f6b394', '#d1b2ea', '#ee9e9e'];

/** Paleta anterior (antes do tema Lavanda): convertida para a nova na mesma posição. */
export const LEGACY_SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

/** Status (reservado: nunca usado como cor de categoria). */
export const STATUS = { critical: '#e07a92', warning: '#f2bd5e', good: '#6fc6aa' };
export const NEUTRAL = { light: '#a9a5bd', dark: '#8c88a2' };

/** Cor de exibição de uma categoria no tema atual. */
export function displayColor(hex: string, dark: boolean): string {
  const legacy = LEGACY_SERIES.indexOf(hex.toLowerCase());
  const light = legacy >= 0 ? SERIES_LIGHT[legacy] : hex;
  if (!dark) return light;
  const i = SERIES_LIGHT.indexOf(light.toLowerCase());
  return i >= 0 ? SERIES_DARK[i] : light;
}

/** true quando o tema em uso é o escuro (respeita a escolha feita no botão de tema). */
export const useDarkMode = useIsDark;
