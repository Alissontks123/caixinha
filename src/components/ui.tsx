import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { addMonths, monthLabel } from '../lib/months';
import { formatMoney, parseMoney } from '../lib/money';
import type { Month } from '../domain/types';

export function MonthPicker({ month, onChange }: { month: Month; onChange: (m: Month) => void }) {
  return (
    <div className="month-picker">
      <button className="icon-btn" aria-label="Mês anterior" onClick={() => onChange(addMonths(month, -1))}>‹</button>
      <span className="month-picker-label">{monthLabel(month)}</span>
      <button className="icon-btn" aria-label="Próximo mês" onClick={() => onChange(addMonths(month, 1))}>›</button>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/** Campo de valor em reais. Guarda o texto digitado e devolve centavos (ou null se inválido). */
export function MoneyInput({
  value, onChange, placeholder = '0,00', autoFocus, ariaLabel,
}: { value: string; onChange: (text: string) => void; placeholder?: string; autoFocus?: boolean; ariaLabel?: string }) {
  const invalid = value.trim() !== '' && parseMoney(value) === null;
  return (
    <span className={`money-input ${invalid ? 'invalid' : ''}`}>
      <span>R$</span>
      <input inputMode="decimal" value={value} placeholder={placeholder} autoFocus={autoFocus} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}

/** Janela sobre a tela. Vai direto para o <body> para não ficar presa dentro da barra do topo. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Fechar" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ProgressBar({ ratio, color, alert }: { ratio: number; color: string; alert: boolean }) {
  const over = ratio > 1;
  return (
    <div className={`progress ${over ? 'over' : alert ? 'alert' : ''}`}>
      <div className="progress-fill" style={{ width: `${Math.min(ratio, 1) * 100}%`, background: over ? undefined : color }} />
    </div>
  );
}

/** Executa uma ação e mostra o erro (ex.: mês fechado) em vez de falhar em silêncio. */
export function useAction() {
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };
  return { error, setError, run };
}

/** Aviso rápido no rodapé, some sozinho depois de alguns segundos. */
export function Toast({ messages, onClose }: { messages: string[]; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 8000);
    return () => clearTimeout(t);
  }, [messages, onClose]);
  if (!messages.length) return null;
  return (
    <div className="toast" role="status">
      <span className="alert-icon near" aria-hidden>!</span>
      <div>{messages.map((m) => <div key={m}>{m}</div>)}</div>
      <button aria-label="Fechar aviso" onClick={onClose}>×</button>
    </div>
  );
}

export function ErrorBox({ error }: { error: string | null }) {
  return error ? <p className="error-box" role="alert">{error}</p> : null;
}

/**
 * Linha de botões (chips) que rola para o lado, com setas ‹ › que aparecem quando há mais itens
 * escondidos. `activeKey` muda quando o item ativo muda, para trazê-lo para a vista.
 */
export function ScrollRow({ children, label, activeKey }: { children: ReactNode; label?: string; activeKey?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update, children]);
  useEffect(() => {
    // centraliza o item ativo, para ele não ficar escondido embaixo de uma seta
    const el = ref.current;
    const chip = el?.querySelector<HTMLElement>('.chip.active');
    if (el && chip) el.scrollLeft = chip.offsetLeft - el.offsetLeft - (el.clientWidth - chip.offsetWidth) / 2;
  }, [activeKey]);
  const scroll = (dir: -1 | 1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: 'smooth' });
  };
  return (
    <div className={`scroll-row ${edges.left ? 'fade-left' : ''} ${edges.right ? 'fade-right' : ''}`}>
      {edges.left && <button type="button" className="scroll-arrow left" aria-label="Ver anteriores" onClick={() => scroll(-1)}>‹</button>}
      <div ref={ref} className="chips" role="group" aria-label={label} onScroll={update}>{children}</div>
      {edges.right && <button type="button" className="scroll-arrow right" aria-label="Ver mais" onClick={() => scroll(1)}>›</button>}
    </div>
  );
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Valor em reais que "conta" do valor anterior (ou de zero) até o novo, em menos de 1 segundo. */
export function CountUp({ cents, duration = 900 }: { cents: number; duration?: number }) {
  const [shown, setShown] = useState(reducedMotion() ? cents : 0);
  // valor que está na tela agora: uma nova contagem começa dele (inclusive se a anterior foi interrompida)
  const current = useRef(shown);
  useEffect(() => {
    if (reducedMotion()) { current.current = cents; setShown(cents); return; }
    const start = current.current;
    if (start === cents) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(start + (cents - start) * eased);
      current.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [cents, duration]);
  return <>{formatMoney(shown)}</>;
}

const CONFETTI = ['#9b8fe6', '#f29cb7', '#6fc6aa', '#f2bd5e', '#86b6ea', '#f3a07c'];

/** "✓ Mês quitado!" com confetes pastel, por cima da tela, que some sozinho. */
export function Celebration({ title, detail, onDone }: { title: string; detail?: string; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current(), 2700);
    return () => clearTimeout(t);
  }, []);
  const bits = Array.from({ length: 28 }, (_, i) => {
    const a = (i / 28) * Math.PI * 2;
    const r = 110 + (i % 4) * 30;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r - 30, rot: (i % 2 ? 1 : -1) * (200 + i * 15), color: CONFETTI[i % CONFETTI.length] };
  });
  return createPortal(
    <div className="celebrate-layer" role="status" aria-live="polite">
      <div className="confetti" aria-hidden>
        {bits.map((b, i) => (
          <i key={i} style={{ background: b.color, ['--x' as string]: `${b.x}px`, ['--y' as string]: `${b.y}px`, ['--r' as string]: `${b.rot}deg` }} />
        ))}
      </div>
      <div className="celebrate-card">
        <div className="celebrate-check"><svg viewBox="0 0 26 26" aria-hidden><path d="M6 13.5l4.5 4.5L20 8.5" /></svg></div>
        <b>{title}</b>
        {detail && <span className="muted small">{detail}</span>}
      </div>
    </div>,
    document.body,
  );
}
