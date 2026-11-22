import { useEffect, useState } from 'react';
import { updateThemeColor } from './themes';

/** Tema escolhido neste aparelho: automático (segue o sistema), claro ou escuro. */
export type ThemePref = 'auto' | 'light' | 'dark';

const KEY = 'caixinha-tema';
const EVENT = 'caixinha-tema';

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

/** Aplica o tema na página (o CSS usa data-theme no <html>; sem ele, segue o sistema). */
export function applyTheme(pref: ThemePref = getThemePref()) {
  const root = document.documentElement;
  if (pref === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  updateThemeColor();
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch { /* sem armazenamento: vale só até fechar */ }
  const root = document.documentElement;
  root.classList.add('theme-anim');
  applyTheme(pref);
  window.setTimeout(() => root.classList.remove('theme-anim'), 500);
  window.dispatchEvent(new Event(EVENT));
}

export function useThemePref(): ThemePref {
  const [pref, setPref] = useState(getThemePref);
  useEffect(() => {
    const on = () => setPref(getThemePref());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return pref;
}

/** true quando o tema em uso é o escuro (escolhido ou, no automático, vindo do sistema). */
export function useIsDark(): boolean {
  const pref = useThemePref();
  const query = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined;
  const [systemDark, setSystemDark] = useState(() => !!query?.matches);
  useEffect(() => {
    if (!query) return;
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener('change', on);
    return () => query.removeEventListener('change', on);
  }, [query]);
  return pref === 'dark' || (pref === 'auto' && systemDark);
}
