import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { addMonths, monthLabel } from '../lib/months';
import { parseMoney } from '../lib/money';
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
