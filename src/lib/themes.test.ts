import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, isUnlocked, themeById, themeCss, THEMES } from './themes';

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('temas', () => {
  it('são 10 comuns + 3 premium, com nomes e ids diferentes, e o padrão é o primeiro', () => {
    expect(THEMES).toHaveLength(13);
    expect(THEMES.filter((t) => !t.premium)).toHaveLength(10);
    expect(THEMES.filter((t) => t.premium).map((t) => t.id)).toEqual(['sakura', 'aquario', 'soneca']);
    expect(THEMES.filter((t) => t.premium).every((t) => t.effect === t.id)).toBe(true);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(13);
    expect(new Set(THEMES.map((t) => t.name)).size).toBe(13);
    expect(THEMES[0].id).toBe(DEFAULT_THEME);
  });

  it('o texto fica legível (contraste mínimo 4,5:1) no claro e no escuro de todos os temas', () => {
    for (const t of THEMES) {
      for (const p of [t.light, t.dark]) {
        const pairs: [string, string, string][] = [
          ['texto/fundo', p.text, p.bg], ['texto/cartão', p.text, p.surface],
          ['secundário/fundo', p.muted, p.bg], ['secundário/cartão', p.muted, p.surface],
          ['botão', p.ink, p.primary], ['destaque/cartão', p.primary, p.surface], ['selo', p.primary, p.soft],
          ['quadro principal', p.heroInk ?? p.ink, p.heroBg ?? p.primary],
        ];
        for (const [what, a, b] of pairs) {
          expect(contrast(a, b), `${t.name}: ${what}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('só o padrão está liberado por enquanto; id desconhecido volta ao padrão', () => {
    expect(THEMES.filter((t) => isUnlocked(t.id)).map((t) => t.id)).toEqual([DEFAULT_THEME]);
    expect(themeById('nao-existe').id).toBe(DEFAULT_THEME);
    expect(themeById(undefined).id).toBe(DEFAULT_THEME);
  });

  it('gera o CSS do claro e do escuro (automático e escolhido)', () => {
    const css = themeCss(themeById('oceano'));
    expect(css).toContain(':root{--bg:#f3f8fb');
    expect(css).toContain('@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#11181d');
    expect(css).toContain(':root[data-theme="dark"]{--bg:#11181d');
    expect(css).toContain('--radius:18px');
  });
});
