import { setThemePref, useThemePref, type ThemePref } from '../lib/theme';

const NEXT: Record<ThemePref, ThemePref> = { auto: 'light', light: 'dark', dark: 'auto' };
const INFO: Record<ThemePref, { icon: string; label: string }> = {
  auto: { icon: '◐', label: 'automático' },
  light: { icon: '☀', label: 'claro' },
  dark: { icon: '☾', label: 'escuro' },
};

/** Botão que alterna o tema: automático → claro → escuro. */
export function ThemeButton() {
  const pref = useThemePref();
  const next = NEXT[pref];
  const text = `Tema ${INFO[pref].label}. Toque para usar o tema ${INFO[next].label}`;
  return (
    <button type="button" className="help-btn theme-btn" aria-label={text} title={text} onClick={() => setThemePref(next)}>
      <span aria-hidden>{INFO[pref].icon}</span>
    </button>
  );
}
