import type { CSSProperties } from 'react';
import { useIsDark } from '../lib/theme';
import type { ThemeEffect } from '../lib/themes';

/**
 * Animações dos temas premium. Tudo em CSS (leve), decorativo e escondido de leitores de tela.
 * Quem liga "Reduzir movimento" no aparelho vê tudo parado (regra no styles.css).
 */

/** Números "aleatórios" sempre iguais (as partículas não pulam de lugar a cada renderização). */
function seq(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function particles(count: number, seed: number) {
  const r = seq(seed);
  return Array.from({ length: count }, () => ({ x: r(), y: r(), size: r(), dur: r(), delay: r() }));
}

const PETALS = particles(14, 5);
const FIREFLIES = particles(16, 3);
const BUBBLES = particles(14, 11);
const STARS = particles(26, 7);

/** Fundo animado (atrás de todas as telas). `contained` = dentro de uma caixa (prévia em Temas). */
export function ThemeBackdrop({ effect, contained, dark: forceDark }: { effect?: ThemeEffect; contained?: boolean; dark?: boolean }) {
  const systemDark = useIsDark();
  if (!effect) return null;
  const dark = forceDark ?? systemDark;
  const take = <T,>(list: T[]) => (contained ? list.slice(0, Math.ceil(list.length / 2)) : list);
  return (
    <div className={`fx-layer fx-${effect} ${dark ? 'fx-dark' : ''} ${contained ? 'fx-contained' : ''}`} aria-hidden="true">
      {effect === 'sakura' && !dark && take(PETALS).map((p, i) => (
        <span key={i} className="fx-petal" style={{ left: `${p.x * 96}%`, width: 9 + p.size * 7, height: (9 + p.size * 7) * 0.8, animationDuration: `${12 + p.dur * 8}s`, animationDelay: `${-p.delay * 20}s` }}><i /></span>
      ))}
      {effect === 'sakura' && dark && take(FIREFLIES).map((p, i) => (
        <span key={i} className="fx-firefly" style={{ left: `${p.x * 96}%`, top: `${8 + p.y * 84}%`, animationDuration: `${7 + p.dur * 6}s, ${2 + p.size * 2}s`, animationDelay: `${-p.delay * 12}s, ${-p.delay * 3}s` }} />
      ))}
      {effect === 'aquario' && take(BUBBLES).map((p, i) => (
        <span key={i} className="fx-bubble" style={{ left: `${p.x * 96}%`, width: 6 + p.size * 12, height: 6 + p.size * 12, animationDuration: `${11 + p.dur * 9}s`, animationDelay: `${-p.delay * 20}s` }} />
      ))}
      {effect === 'aquario' && !dark && (
        <>
          <span className="fx-ray" style={{ left: '8%', width: 46 }} />
          <span className="fx-ray" style={{ left: '42%', width: 70, animationDelay: '-4s' }} />
          <span className="fx-ray" style={{ left: '76%', width: 40, animationDelay: '-7s' }} />
        </>
      )}
      {effect === 'soneca' && dark && take(STARS).map((p, i) => (
        <span key={i} className="fx-star" style={{ left: `${p.x * 98}%`, top: `${p.y * 96}%`, width: 1 + p.size * 2, height: 1 + p.size * 2, animationDuration: `${2 + p.dur * 3}s`, animationDelay: `${-p.delay * 4}s` }} />
      ))}
      {effect === 'soneca' && (
        <>
          <span className="fx-cloud" style={{ top: '24%', width: 90, height: 26, animationDuration: '50s' }} />
          <span className="fx-cloud" style={{ top: '58%', width: 120, height: 30, animationDuration: '64s', animationDelay: '-32s' }} />
          <span className="fx-cloud" style={{ top: '82%', width: 70, height: 20, animationDuration: '42s', animationDelay: '-14s' }} />
        </>
      )}
    </div>
  );
}

/** Enfeite dentro do cartão do mês (galho, peixinho, céu da soneca). */
export function HeroDecor({ effect }: { effect?: ThemeEffect }) {
  if (!effect) return null;
  return (
    <span className={`hero-fx hero-fx-${effect}`} aria-hidden="true">
      {effect === 'sakura' && (
        <>
          <svg className="fx-branch" width="170" height="120" viewBox="0 0 170 120">
            <path d="M170 6 C130 16 100 30 70 58 C55 72 44 88 36 110" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".55" />
            <path d="M110 30 C112 46 106 58 96 66" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".55" />
            <g fill="#ffd3e0">
              <circle cx="70" cy="56" r="7" /><circle cx="78" cy="50" r="6" /><circle cx="63" cy="48" r="6" /><circle cx="96" cy="66" r="7" />
              <circle cx="104" cy="60" r="5" /><circle cx="130" cy="20" r="7" /><circle cx="140" cy="14" r="6" /><circle cx="44" cy="92" r="6" /><circle cx="52" cy="86" r="5" />
            </g>
            <g fill="#f59ab6"><circle cx="70" cy="54" r="2.5" /><circle cx="96" cy="66" r="2.5" /><circle cx="130" cy="20" r="2.5" /><circle cx="44" cy="92" r="2.2" /></g>
          </svg>
          {PETALS.slice(0, 4).map((p, i) => (
            <span key={i} className="fx-petal fx-petal-hero" style={{ left: `${50 + p.x * 45}%`, width: 10, height: 8, animationDuration: `${7 + p.dur * 4}s`, animationDelay: `${-p.delay * 10}s` }}><i /></span>
          ))}
        </>
      )}
      {effect === 'aquario' && (
        <>
          <span className="fx-fish">
            <svg width="64" height="32" viewBox="0 0 64 32">
              <g className="fx-fish-tail"><path d="M14 16 L0 5 L3 16 L0 27 Z" fill="#ffc27a" /></g>
              <ellipse cx="34" cy="16" rx="22" ry="12" fill="#ff9f6b" />
              <path d="M30 5 Q36 0 42 5" fill="none" stroke="#ffc27a" strokeWidth="3" strokeLinecap="round" />
              <circle cx="47" cy="13" r="2.6" fill="#1a3442" />
              <path d="M24 9 Q28 16 24 23" fill="none" stroke="#ffd9b0" strokeWidth="2" />
            </svg>
          </span>
          <span className="fx-waves" />
        </>
      )}
      {effect === 'soneca' && (
        <>
          {STARS.slice(0, 7).map((p, i) => (
            <span key={i} className="fx-twinkle" style={{ left: `${58 + p.x * 37}%`, top: `${4 + p.y * 24}%`, fontSize: 7 + p.size * 6, animationDuration: `${2 + p.dur * 2}s`, animationDelay: `${-p.delay * 3}s` }}>✦</span>
          ))}
          <svg className="fx-moon" width="54" height="54" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" fill="#ffe9a8" /></svg>
        </>
      )}
    </span>
  );
}

/** O gatinho da Soneca, dormindo em cima do cartão do mês. */
export function SleepingCat() {
  const z: CSSProperties[] = [{ left: 98, top: 0, fontSize: 14 }, { left: 104, top: -6, fontSize: 18, animationDelay: '1.2s' }, { left: 110, top: -12, fontSize: 22, animationDelay: '2.4s' }];
  return (
    <span className="sleeping-cat" aria-hidden="true">
      {z.map((s, i) => <span key={i} className="fx-z" style={s}>{i === 2 ? 'Z' : 'z'}</span>)}
      <svg width="130" height="56" viewBox="0 0 130 56">
        <g className="fx-breathe">
          <path d="M14 56 C 8 30, 36 14, 66 16 C 96 18, 116 32, 112 56 Z" fill="#f2b37c" />
          <path d="M40 22 C 50 18, 58 20, 62 26 M70 20 C 80 20, 88 24, 92 30 M54 18 C 60 16, 66 17, 70 20" fill="none" stroke="#d98c55" strokeWidth="4" strokeLinecap="round" />
          <circle cx="28" cy="40" r="17" fill="#f6c28f" />
          <path d="M14 30 L12 16 L24 25 Z" fill="#f6c28f" /><path d="M38 26 L44 13 L46 29 Z" fill="#f6c28f" />
          <path d="M16 28 L15 20 L21 25 Z" fill="#f7a8bd" />
          <path d="M19 41 Q22 44 25 41 M31 41 Q34 44 37 41" fill="none" stroke="#5a3a28" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M26.5 46 L29.5 46 L28 48 Z" fill="#e98da5" />
          <ellipse cx="44" cy="54" rx="9" ry="4" fill="#fbe0c3" />
        </g>
        <path d="M108 52 C 120 50, 126 40, 118 34" fill="none" stroke="#f2b37c" strokeWidth="7" strokeLinecap="round" />
        <g className="fx-tail-tip"><path d="M118 34 C 114 30, 110 31, 108 33" fill="none" stroke="#d98c55" strokeWidth="7" strokeLinecap="round" /></g>
      </svg>
    </span>
  );
}
