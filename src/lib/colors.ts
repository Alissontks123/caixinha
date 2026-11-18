import { useEffect, useState } from 'react';

/**
 * Paleta categórica validada (daltonismo e contraste), em ordem fixa.
 * Cada categoria recebe uma posição e a mantém (a cor segue a categoria, nunca a posição no ranking).
 * O modo escuro usa os mesmos tons ajustados para fundo escuro.
 */
export const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'];

/** Status (reservado: nunca usado como cor de categoria). */
export const STATUS = { critical: '#d03b3b', warning: '#fab219', good: '#0ca30c' };
export const NEUTRAL = { light: '#8a8f98', dark: '#898781' };

/** Cor de exibição de uma categoria no tema atual. */
export function displayColor(hex: string, dark: boolean): string {
  if (!dark) return hex;
  const i = SERIES_LIGHT.indexOf(hex.toLowerCase());
  return i >= 0 ? SERIES_DARK[i] : hex;
}

export function useDarkMode(): boolean {
  const query = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined;
  const [dark, setDark] = useState(() => !!query?.matches);
  useEffect(() => {
    if (!query) return;
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    query.addEventListener('change', on);
    return () => query.removeEventListener('change', on);
  }, [query]);
  return dark;
}
