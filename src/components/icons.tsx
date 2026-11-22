/** Ícones de traço do app (caixa 24×24). Decorativos: quem usa põe o texto ou o aria-label no botão. */
export const ICONS = {
  painel: 'M12 3v9h9 M21 12a9 9 0 1 1-9-9',
  gastos: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  importar: 'M12 15V3 M7 8l5-5 5 5 M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  caixinha: 'M4 8h16v12H4z M2 4h20v4H2z M10 12h4',
  historico: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  ajustes: 'M4 6h10 M18 6h2 M16 4v4 M4 12h4 M12 12h8 M10 10v4 M4 18h12 M18 16v4',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  auto: 'M12 3a9 9 0 1 0 0 18z M12 3a9 9 0 0 1 0 18',
  play: 'M8 5v14l11-7z',
  help: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3 M12 17h.01 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  alert: 'M12 8v5 M12 16h.01 M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  check: 'M20 6 9 17l-5-5',
  palette: 'M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3.5 3H16a2 2 0 0 0-1.5 3.3A1.6 1.6 0 0 1 12 21z M7.5 11h.01 M10.5 7h.01 M15 7.5h.01',
} as const;

export const STAR = 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z';

export function Icon({ d, size = 20, width = 1.8, className }: { d: string; size?: number; width?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}

export function StarIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d={STAR} /></svg>
  );
}
