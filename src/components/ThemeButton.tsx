import { setThemePref, useThemePref, type ThemePref } from '../lib/theme';
import { Icon, ICONS } from './icons';

const NEXT: Record<ThemePref, ThemePref> = { auto: 'light', light: 'dark', dark: 'auto' };
const INFO: Record<ThemePref, { icon: string; label: string }> = {
  auto: { icon: ICONS.auto, label: 'automático' },
  light: { icon: ICONS.sun, label: 'claro' },
  dark: { icon: ICONS.moon, label: 'escuro' },
};

/** Botão que alterna o modo: automático → claro → escuro. */
export function ThemeButton() {
  const pref = useThemePref();
  const next = NEXT[pref];
  const text = `Modo ${INFO[pref].label}. Toque para usar o modo ${INFO[next].label}`;
  return (
    <button type="button" className="help-btn theme-btn" aria-label={text} title={text} onClick={() => setThemePref(next)}>
      <Icon d={INFO[pref].icon} size={17} width={1.9} />
    </button>
  );
}
