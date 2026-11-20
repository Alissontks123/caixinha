import { splitAmount } from '../domain/allocation';
import type { AllocationPart, Category, Cents } from '../domain/types';
import { centsToInput, formatMoney, parseMoney } from '../lib/money';
import { MoneyInput } from './ui';

/** Parte do rateio como digitada. A última parte é sempre o restante (modo e valor ignorados). */
export interface AllocDraftPart {
  categoryId: string;
  mode: 'amount' | 'percent';
  value: string;
}

export interface AllocDraft {
  on: boolean;
  parts: AllocDraftPart[];
}

/** Categorias que podem receber uma parte (não faz sentido ratear para "A identificar"). */
export const allocatable = (categories: Category[]) => categories.filter((c) => c.kind !== 'unidentified');

const pctText = (p: number) => String(Number(p.toFixed(2))).replace('.', ',');

/** Rascunho a partir do rateio salvo; sem rateio, começa com a categoria atual + outra. */
export function allocDraftOf(parts: AllocationPart[] | undefined, categoryId: string, categories: Category[]): AllocDraft {
  if (parts && parts.length >= 2) {
    return {
      on: true,
      parts: parts.map((p) => ({
        categoryId: p.categoryId,
        mode: p.mode === 'percent' ? 'percent' : 'amount',
        value: p.mode === 'amount' ? centsToInput(p.cents) : p.mode === 'percent' ? pctText(p.percent) : '',
      })),
    };
  }
  const options = allocatable(categories);
  const first = options.find((c) => c.id === categoryId)?.id ?? options.find((c) => c.kind === 'normal')?.id ?? options[0]?.id ?? '';
  const second = options.find((c) => c.id !== first && c.kind === 'normal')?.id ?? options.find((c) => c.id !== first)?.id ?? '';
  return { on: false, parts: [{ categoryId: first, mode: 'amount', value: '' }, { categoryId: second, mode: 'amount', value: '' }] };
}

/**
 * Converte o rascunho no rateio (undefined = sem rateio) ou devolve a mensagem de erro.
 * `base` é o valor que será rateado (a parte do usuário); 0 = não confere os valores.
 */
export function parseAllocation(d: AllocDraft, base: Cents): AllocationPart[] | undefined | string {
  if (!d.on) return undefined;
  if (d.parts.length < 2) return 'O rateio precisa de pelo menos 2 categorias.';
  if (d.parts.some((p) => !p.categoryId)) return 'Escolha a categoria de cada parte do rateio.';
  if (new Set(d.parts.map((p) => p.categoryId)).size !== d.parts.length) return 'Escolha uma categoria diferente em cada parte do rateio.';
  const out: AllocationPart[] = [];
  for (const [i, p] of d.parts.entries()) {
    if (i === d.parts.length - 1) { out.push({ categoryId: p.categoryId, mode: 'rest' }); break; }
    if (p.mode === 'amount') {
      const c = parseMoney(p.value);
      if (c === null || c <= 0) return `Informe o valor da parte ${i + 1} do rateio.`;
      out.push({ categoryId: p.categoryId, mode: 'amount', cents: c });
    } else {
      const n = Number(p.value.replace(',', '.'));
      if (!p.value.trim() || !Number.isFinite(n) || n <= 0 || n >= 100) return `O percentual da parte ${i + 1} do rateio deve ficar entre 0 e 100.`;
      out.push({ categoryId: p.categoryId, mode: 'percent', percent: n });
    }
  }
  const abs = Math.abs(base);
  if (abs > 0) {
    // confere sem o limite do splitAmount: as partes informadas precisam deixar algo para a última
    const informed = out.slice(0, -1).reduce((s, p) => s + (p.mode === 'amount' ? p.cents : p.mode === 'percent' ? Math.round((abs * p.percent) / 100) : 0), 0);
    if (informed >= abs) {
      return `As partes do rateio já somam ${formatMoney(informed)}, ${informed > abs ? 'mais que' : 'o valor todo de'} ${formatMoney(abs)}: deixe algo para a última categoria ou remova-a.`;
    }
  }
  return out;
}

/** Campos do rateio entre categorias (usados no lançamento e na revisão da importação). */
export function AllocationFields({ value, onChange, base, categories, note }: {
  value: AllocDraft;
  onChange: (v: AllocDraft) => void;
  /** Valor a ratear (centavos, com sinal). */
  base: Cents | null;
  categories: Category[];
  /** Texto extra embaixo (ex.: aviso das parcelas). */
  note?: string;
}) {
  const options = allocatable(categories);
  const parts = value.parts;
  const setPart = (i: number, patch: Partial<AllocDraftPart>) =>
    onChange({ ...value, parts: parts.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const remove = (i: number) => onChange({ ...value, parts: parts.filter((_, k) => k !== i) });
  const add = () => {
    const used = new Set(parts.map((p) => p.categoryId));
    const next = options.find((c) => !used.has(c.id) && c.kind === 'normal')?.id ?? options.find((c) => !used.has(c.id))?.id ?? '';
    // entra antes da última (que é sempre o restante)
    onChange({ ...value, parts: [...parts.slice(0, -1), { categoryId: next, mode: 'amount', value: '' }, parts[parts.length - 1]] });
  };

  const abs = Math.abs(base ?? 0);
  const parsed = abs > 0 ? parseAllocation({ ...value, on: true }, base ?? 0) : undefined;
  const amounts = Array.isArray(parsed) ? splitAmount(abs, parsed) : null;
  // valor de cada parte já digitada, para mostrar ao lado mesmo antes de tudo estar preenchido
  const partial = (p: AllocDraftPart): Cents | null => {
    if (p.mode === 'amount') return parseMoney(p.value);
    const n = Number(p.value.replace(',', '.'));
    return p.value.trim() && Number.isFinite(n) && abs > 0 ? Math.round((abs * n) / 100) : null;
  };
  const informed = parts.slice(0, -1).reduce((s, p) => s + (partial(p) ?? 0), 0);
  const rest = abs - informed;

  return (
    <div className="alloc-box stack-sm">
      <label className="switch-row">
        <input type="checkbox" checked={value.on} onChange={(e) => onChange({ ...value, on: e.target.checked })} />
        <span className="switch" aria-hidden />
        <span>Ratear entre categorias <span className="muted small">(ex.: parte Mercado, parte Casa)</span></span>
      </label>
      {value.on && (
        <>
          {abs > 0 && <p className="muted small">Valor a ratear: <b>{formatMoney(abs)}</b>. A última categoria fica com o que sobrar.</p>}
          {parts.map((p, i) => {
            const last = i === parts.length - 1;
            const shown = amounts ? amounts[i] : last ? rest : partial(p);
            return (
              <div key={i} className="alloc-part">
                <div className="alloc-line">
                  <select value={p.categoryId} aria-label={`Categoria da parte ${i + 1}`} onChange={(e) => setPart(i, { categoryId: e.target.value })}>
                    {!p.categoryId && <option value="">Escolha…</option>}
                    {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {parts.length > 2 && (
                    <button type="button" className="icon-btn" aria-label={`Remover a parte ${i + 1}`} onClick={() => remove(i)}>×</button>
                  )}
                </div>
                {last ? (
                  <span className={`small ${abs > 0 && rest <= 0 ? 'text-danger' : 'muted'}`}>
                    Fica com o restante{abs > 0 ? <>: <b>{formatMoney(Math.max(rest, 0))}</b></> : ''}
                  </span>
                ) : (
                  <div className="alloc-line">
                    <div className="segmented alloc-mode">
                      <button type="button" className={p.mode === 'amount' ? 'active' : ''} onClick={() => setPart(i, { mode: 'amount', value: '' })}>R$</button>
                      <button type="button" className={p.mode === 'percent' ? 'active' : ''} onClick={() => setPart(i, { mode: 'percent', value: '' })}>%</button>
                    </div>
                    {p.mode === 'amount'
                      ? <MoneyInput value={p.value} onChange={(v) => setPart(i, { value: v })} ariaLabel={`Valor da parte ${i + 1}`} />
                      : <input className="alloc-pct" inputMode="decimal" placeholder="Ex.: 30" value={p.value} aria-label={`Percentual da parte ${i + 1}`} onChange={(e) => setPart(i, { value: e.target.value })} />}
                    {p.mode === 'percent' && shown !== null && abs > 0 && <span className="small muted">= {formatMoney(shown)}</span>}
                  </div>
                )}
              </div>
            );
          })}
          <button type="button" className="link-btn small" onClick={add} disabled={parts.length >= options.length}>+ Adicionar categoria</button>
          {typeof parsed === 'string' && parts.every((p, i) => i === parts.length - 1 || p.value.trim()) && (
            <p className="text-danger small">{parsed}</p>
          )}
          {note && <p className="muted small">{note}</p>}
        </>
      )}
    </div>
  );
}
