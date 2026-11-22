/**
 * Temas do app (paletas pastel). Cada tema tem versão clara e escura; o claro/escuro continua
 * seguindo o aparelho (ou o botão ☀/☾), e o tema escolhido fica no perfil (sincroniza entre aparelhos).
 * Só o tema padrão está liberado por enquanto: os outros virão da loja de pontos.
 */

export interface Palette {
  bg: string;
  surface: string;
  surface2: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  /** Texto sobre a cor principal (botões, cartão do mês). */
  ink: string;
  soft: string;
  hero: string;
  /** Cor do desenho decorativo do tema. */
  accent: string;
}

export interface Theme {
  id: string;
  name: string;
  tagline: string;
  /** Desenho do tema (caminho SVG em uma caixa 24×24, só traço). */
  motif: string;
  /** Arredondamento dos cartões, em px. */
  radius: number;
  light: Palette;
  dark: Palette;
}

export const DEFAULT_THEME = 'lavanda';

/** Temas que já podem ser usados (os outros aparecem com cadeado até a loja existir). */
export const UNLOCKED_THEMES: readonly string[] = [DEFAULT_THEME];

export const THEMES: Theme[] = [
  {
    id: 'lavanda', name: 'Lavanda', tagline: 'O clássico do app', radius: 20,
    motif: 'M12 22V8 M12 8c-2-1-2-4 0-5 2 1 2 4 0 5 M12 13c-3 0-4-2-4-4 3 0 4 2 4 4 M12 13c3 0 4-2 4-4-3 0-4 2-4 4 M12 18c-3 0-4-2-4-4 3 0 4 2 4 4 M12 18c3 0 4-2 4-4-3 0-4 2-4 4',
    light: { bg: '#f6f5fb', surface: '#ffffff', surface2: '#f0eef8', text: '#2a2738', muted: '#6b6780', border: '#e6e3f3', primary: '#665abc', ink: '#ffffff', soft: '#ebe8fb', hero: '#efecfc', accent: '#f4c6d7' },
    dark: { bg: '#15141c', surface: '#1e1c28', surface2: '#262433', text: '#ebe9f5', muted: '#a6a2bd', border: '#2c2a3b', primary: '#b4aaf3', ink: '#17142a', soft: '#2a2642', hero: '#221f35', accent: '#5c3c50' },
  },
  {
    id: 'jardim', name: 'Jardim', tagline: 'Rosa e sálvia', radius: 22,
    motif: 'M12 9a3 3 0 1 1 0-6 3 3 0 0 1 0 6 M12 15a3 3 0 1 1 0 6 3 3 0 0 1 0-6 M9 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M15 12a3 3 0 1 1 6 0 3 3 0 0 1-6 0 M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
    light: { bg: '#fbf6f6', surface: '#ffffff', surface2: '#f6eded', text: '#33282b', muted: '#74656a', border: '#efe2e3', primary: '#a74a66', ink: '#ffffff', soft: '#fbe6ec', hero: '#fcebef', accent: '#cfe3c8' },
    dark: { bg: '#1a1517', surface: '#241d20', surface2: '#2e2529', text: '#f3e9ec', muted: '#bba8ae', border: '#382c31', primary: '#f2a8bd', ink: '#2a1219', soft: '#3a2530', hero: '#2c1f25', accent: '#2f4430' },
  },
  {
    id: 'oceano', name: 'Oceano', tagline: 'Azul-água e brisa', radius: 18,
    motif: 'M2 9c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2 M2 14c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2 M2 19c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2',
    light: { bg: '#f3f8fb', surface: '#ffffff', surface2: '#e9f2f7', text: '#1f2d36', muted: '#5c6d77', border: '#dbe8ef', primary: '#2a6e91', ink: '#ffffff', soft: '#dcedf6', hero: '#e3f1f8', accent: '#c6ece4' },
    dark: { bg: '#11181d', surface: '#182229', surface2: '#1f2c34', text: '#e4f0f6', muted: '#9fb4bf', border: '#26353e', primary: '#8ccbe8', ink: '#0d2330', soft: '#1c3442', hero: '#172a35', accent: '#1d3f3a' },
  },
  {
    id: 'floresta', name: 'Floresta', tagline: 'Menta e folhas', radius: 16,
    motif: 'M12 2 5 12h4l-3 5h12l-3-5h4z M12 17v5',
    light: { bg: '#f4f8f4', surface: '#ffffff', surface2: '#eaf2ea', text: '#223024', muted: '#5f6f61', border: '#dce8dc', primary: '#39744f', ink: '#ffffff', soft: '#ddefe2', hero: '#e4f2e7', accent: '#f1e3b5' },
    dark: { bg: '#121814', surface: '#1a231d', surface2: '#212d25', text: '#e5f1e8', muted: '#a0b5a6', border: '#28362d', primary: '#93d4a8', ink: '#0f2618', soft: '#1e3527', hero: '#1a2c20', accent: '#3d3820' },
  },
  {
    id: 'confeitaria', name: 'Confeitaria', tagline: 'Morango e baunilha', radius: 26,
    motif: 'M6 12h12l-2 9H8z M5 12a7 5 0 0 1 14 0 M12 4v3 M10 15v4 M14 15v4',
    light: { bg: '#fdf7f3', surface: '#ffffff', surface2: '#f9eee7', text: '#3a2a26', muted: '#7a6660', border: '#f1e2d9', primary: '#af4256', ink: '#ffffff', soft: '#fde3e6', hero: '#fde9e4', accent: '#f8e2b0' },
    dark: { bg: '#1c1614', surface: '#261e1b', surface2: '#302623', text: '#f6ebe6', muted: '#c0aba3', border: '#3a2e2a', primary: '#f5a6b4', ink: '#2c1015', soft: '#3d2529', hero: '#2f2220', accent: '#463a1f' },
  },
  {
    id: 'algodao', name: 'Algodão-doce', tagline: 'Rosa e azul bebê', radius: 26,
    motif: 'M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 9a4.5 4.5 0 0 1 .5 9z',
    light: { bg: '#f8f6fc', surface: '#ffffff', surface2: '#f1eef9', text: '#2c2838', muted: '#6c6880', border: '#e7e2f4', primary: '#a5447a', ink: '#ffffff', soft: '#fbe3f0', hero: '#eef3fd', accent: '#bfdcf7' },
    dark: { bg: '#16151d', surface: '#1f1d29', surface2: '#272534', text: '#efeaf7', muted: '#aba5c0', border: '#2f2c3e', primary: '#f3a7d0', ink: '#2c1022', soft: '#3a2336', hero: '#1d2436', accent: '#24395a' },
  },
  {
    id: 'pordosol', name: 'Pôr do sol', tagline: 'Pêssego e coral', radius: 20,
    motif: 'M3 18h18 M6 18a6 6 0 0 1 12 0 M12 7V4 M5.6 10.6 3.5 8.5 M18.4 10.6l2.1-2.1 M7 21h10',
    light: { bg: '#fdf6f1', surface: '#ffffff', surface2: '#f9ece3', text: '#382822', muted: '#7a6459', border: '#f2e0d4', primary: '#a44e2c', ink: '#ffffff', soft: '#fde4d6', hero: '#fde8dc', accent: '#f9d9a8' },
    dark: { bg: '#1b1513', surface: '#261d19', surface2: '#302520', text: '#f7ebe4', muted: '#c2aa9d', border: '#3b2d27', primary: '#f7b28f', ink: '#2e140a', soft: '#3f2a20', hero: '#33221b', accent: '#4a3320' },
  },
  {
    id: 'noite', name: 'Noite estrelada', tagline: 'Azul profundo e estrelas', radius: 18,
    motif: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z M17 3v4 M15 5h4',
    light: { bg: '#f3f4fb', surface: '#ffffff', surface2: '#e9ebf7', text: '#1e2240', muted: '#5f6384', border: '#dcdff0', primary: '#4652a8', ink: '#ffffff', soft: '#e0e3f8', hero: '#e3e6f8', accent: '#f6e7a6' },
    dark: { bg: '#0f1122', surface: '#171a30', surface2: '#1f233d', text: '#e7e9fb', muted: '#a3a8cc', border: '#272b48', primary: '#aab4f6', ink: '#121638', soft: '#232a52', hero: '#1a1f40', accent: '#4a4226' },
  },
  {
    id: 'outono', name: 'Outono', tagline: 'Terracota e mostarda', radius: 16,
    motif: 'M5 19C5 10 10 5 20 4c-1 10-6 15-15 15z M5 19l8-8',
    light: { bg: '#faf6f0', surface: '#ffffff', surface2: '#f3ece1', text: '#352b20', muted: '#746759', border: '#ebe0d0', primary: '#9a542b', ink: '#ffffff', soft: '#f6e4d3', hero: '#f6ead9', accent: '#e9d29a' },
    dark: { bg: '#1a1612', surface: '#241e18', surface2: '#2e261f', text: '#f4ece2', muted: '#bcab98', border: '#382e25', primary: '#eab48c', ink: '#2c1708', soft: '#3d2c1f', hero: '#2e241a', accent: '#43381c' },
  },
  {
    id: 'areia', name: 'Areia', tagline: 'Bege e caramelo', radius: 12,
    motif: 'M12 20 4 10a8 8 0 0 1 16 0z M12 20V7 M12 20 7.5 8.5 M12 20l4.5-11.5',
    light: { bg: '#f8f6f2', surface: '#ffffff', surface2: '#f0ece5', text: '#2f2b26', muted: '#6e675e', border: '#e6e0d6', primary: '#7a6247', ink: '#ffffff', soft: '#efe7dc', hero: '#f1ebe2', accent: '#d9e2d6' },
    dark: { bg: '#171614', surface: '#201e1b', surface2: '#2a2723', text: '#eeeae4', muted: '#b2aba1', border: '#33302b', primary: '#d9c0a0', ink: '#261c10', soft: '#352e25', hero: '#2a2620', accent: '#2c3429' },
  },
];

export function themeById(id: string | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export const isUnlocked = (id: string) => UNLOCKED_THEMES.includes(id);

/** Variáveis CSS de uma paleta (as mesmas que o styles.css usa). */
function vars(p: Palette, dark: boolean): string {
  return [
    `--bg:${p.bg}`, `--surface:${p.surface}`, `--surface-2:${p.surface2}`, `--text:${p.text}`, `--muted:${p.muted}`,
    `--border:${p.border}`, `--primary:${p.primary}`, `--primary-ink:${p.ink}`, `--primary-soft:${p.soft}`,
    `--hero:${p.hero}`, `--hero-border:${p.border}`, `--track:${p.surface2}`, `--accent:${p.accent}`,
    `--chart-grid:${p.border}`, `--chart-baseline:${p.border}`, `--chart-axis:${p.muted}`, `--chart-track:${p.surface2}`,
    `color-scheme:${dark ? 'dark' : 'light'}`,
  ].join(';');
}

/** CSS do tema: claro por padrão; escuro quando o aparelho está no escuro (automático) ou o usuário escolheu escuro. */
export function themeCss(t: Theme): string {
  const light = `${vars(t.light, false)};--radius:${t.radius}px`;
  const dark = vars(t.dark, true);
  return `:root{${light}}`
    + `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark}}}`
    + `:root[data-theme="dark"]{${dark}}`;
}

const CACHE_KEY = 'caixinha-paleta';
const STYLE_ID = 'caixinha-paleta';

/** Último tema usado neste aparelho (para não piscar o tema padrão ao abrir, antes de carregar o perfil). */
export function cachedThemeId(): string | undefined {
  try { return localStorage.getItem(CACHE_KEY) ?? undefined; } catch { return undefined; }
}

/** Aplica o tema na página: troca as cores e a cor da barra do navegador. */
export function applyPalette(id: string | undefined) {
  const t = themeById(id);
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  const css = themeCss(t);
  if (el.textContent !== css) el.textContent = css;
  document.documentElement.dataset.palette = t.id;
  updateThemeColor();
  try { localStorage.setItem(CACHE_KEY, t.id); } catch { /* sem armazenamento */ }
}

/** A barra do navegador/celular acompanha o fundo do tema (claro ou escuro). */
export function updateThemeColor() {
  const t = themeById(document.documentElement.dataset.palette);
  const pref = document.documentElement.getAttribute('data-theme');
  const dark = pref === 'dark' || (pref !== 'light' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', (dark ? t.dark : t.light).bg);
}
