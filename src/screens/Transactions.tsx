import { useCallback, useState } from 'react';
import { MerchantHint } from '../components/MerchantHint';
import { ErrorBox, Field, Modal, MoneyInput, Toast, useAction } from '../components/ui';
import { UNIDENTIFIED_ID } from '../db/db';
import { deleteTransaction, saveTransaction, setTransactionCategory } from '../db/repo';
import { alertsForChange, describeAlert } from '../domain/alerts';
import { describeShare, myAmount, shareOf } from '../domain/share';
import type { Category, Month, Share, Transaction } from '../domain/types';
import { centsToInput, formatMoney, parseMoney } from '../lib/money';
import { currentMonth, dateLabel, monthOf, todayISO } from '../lib/months';
import { summaryInput, type ReadyData } from '../useAppData';

type Notify = (after: Transaction[], months: Month[]) => void;

interface Props {
  data: ReadyData;
  month: Month;
  filter?: string;
  setFilter: (f?: string) => void;
}

const SOURCE_LABEL: Record<Transaction['source'], string> = {
  manual: 'Manual',
  'fatura-c6': 'Fatura C6',
  'fatura-nubank': 'Fatura Nubank',
  'extrato-nubank': 'Extrato Nubank',
};

export function Transactions({ data, month, filter, setFilter }: Props) {
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null);
  const [toast, setToast] = useState<string[]>([]);
  const closeToast = useCallback(() => setToast([]), []);
  const { error, run } = useAction();
  // avisa quando a mudança abre um novo bloco de aporte ou deixa a categoria perto do limite
  const notify: Notify = (after, months) => {
    const alerts = alertsForChange(summaryInput(data), after, months, data.profile.alertThreshold);
    if (alerts.length) setToast(alerts.map(describeAlert));
  };
  const closed = data.closings.some((c) => c.month === month);
  const catById = new Map(data.categories.map((c) => [c.id, c]));

  const all = data.transactions
    .filter((t) => t.month === month)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const list = filter ? all.filter((t) => t.categoryId === filter) : all;
  const total = list.reduce((s, t) => s + myAmount(t), 0);

  const counts = new Map<string, number>();
  for (const t of all) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);

  // agrupa por data
  const groups: { date: string; items: Transaction[] }[] = [];
  for (const t of list) {
    const g = groups[groups.length - 1];
    if (g && g.date === t.date) g.items.push(t);
    else groups.push({ date: t.date, items: [t] });
  }

  return (
    <div className="stack">
      <div className="chips">
        <button className={`chip ${!filter ? 'active' : ''}`} onClick={() => setFilter(undefined)}>Todos ({all.length})</button>
        {data.categories.map((c) => (
          <button key={c.id} className={`chip ${filter === c.id ? 'active' : ''}`} onClick={() => setFilter(c.id)}>
            <span className="dot" style={{ background: c.color }} />{c.name} ({counts.get(c.id) ?? 0})
          </button>
        ))}
      </div>

      {closed ? (
        <p className="card muted small">Este mês está fechado. Reabra-o no Painel para alterar lançamentos.</p>
      ) : (
        <button className="btn primary" onClick={() => setEditing('new')}>+ Novo lançamento</button>
      )}
      <ErrorBox error={error} />

      {list.length === 0 ? (
        <p className="empty">Nenhum lançamento {filter ? 'nesta categoria ' : ''}neste mês.</p>
      ) : (
        <>
          <p className="muted small">{list.length} lançamento(s) · total {formatMoney(total)}</p>
          {groups.map((g) => (
            <section key={g.date} className="tx-group">
              <h3 className="tx-date">{dateLabel(g.date)}</h3>
              <div className="card tx-list">
                {g.items.map((t) => {
                  const cat = catById.get(t.categoryId);
                  return (
                    <div key={t.id} className="tx-row">
                      <button className="tx-main" disabled={closed} onClick={() => setEditing(t)}>
                        <span className="tx-desc">{t.description}</span>
                        <span className="tx-meta muted small">
                          {[
                            SOURCE_LABEL[t.source],
                            t.installment && `parcela ${t.installment}`,
                            t.cardLast4 && `final ${t.cardLast4}`,
                            t.date.slice(0, 7) !== t.month && `compra em ${dateLabel(t.date)}`,
                            t.share && `dividido · total ${formatMoney(t.amount)}`,
                            t.note,
                          ].filter(Boolean).join(' · ')}
                        </span>
                      </button>
                      <span className={`tx-amount ${t.amount < 0 ? 'refund' : ''}`}>{formatMoney(myAmount(t))}</span>
                      <CategorySelect
                        categories={data.categories}
                        value={t.categoryId}
                        color={cat?.color}
                        disabled={closed}
                        onChange={async (id) => {
                          if (await run(() => setTransactionCategory(t.id, id))) {
                            notify(data.transactions.map((x) => (x.id === t.id ? { ...x, categoryId: id } : x)), [t.month]);
                          }
                        }}
                      />
                      {t.categoryId === UNIDENTIFIED_ID && <MerchantHint text={t.description} />}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}

      {editing && (
        <TransactionForm
          categories={data.categories}
          month={month}
          initial={editing === 'new' ? undefined : editing}
          defaultCategory={filter}
          onClose={() => setEditing(null)}
          onSaved={(tx) => notify(
            [...data.transactions.filter((x) => x.id !== tx.id), tx],
            [tx.month, ...(editing !== 'new' ? [editing.month] : [])],
          )}
        />
      )}
      <Toast messages={toast} onClose={closeToast} />
    </div>
  );
}

function CategorySelect({
  categories, value, color, disabled, onChange,
}: { categories: Category[]; value: string; color?: string; disabled?: boolean; onChange: (id: string) => void }) {
  return (
    <select
      className="cat-select"
      style={{ borderColor: color }}
      value={value}
      disabled={disabled}
      aria-label="Categoria"
      onChange={(e) => onChange(e.target.value)}
    >
      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

function TransactionForm({
  categories, month, initial, defaultCategory, onClose, onSaved,
}: {
  categories: Category[];
  month: Month;
  initial?: Transaction;
  defaultCategory?: string;
  onClose: () => void;
  onSaved: (tx: Transaction) => void;
}) {
  const defaultDate = month === currentMonth() ? todayISO() : `${month}-01`;
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState(initial ? centsToInput(Math.abs(initial.amount)) : '');
  const [isRefund, setIsRefund] = useState(initial ? initial.amount < 0 : false);
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId ?? defaultCategory ?? categories.find((c) => c.kind === 'unidentified')?.id ?? categories[0]?.id,
  );
  const [note, setNote] = useState(initial?.note ?? '');
  const [split, setSplit] = useState<SplitDraft>(() => splitDraftOf(initial?.share));
  const { error, setError, run } = useAction();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseMoney(amount);
    if (!date) return setError('Informe a data.');
    if (!description.trim()) return setError('Informe a descrição.');
    if (cents === null || cents <= 0) return setError('Informe um valor maior que zero.');
    const share = parseSplit(split, cents);
    if (typeof share === 'string') return setError(share);
    const draft = {
      id: initial?.id,
      date,
      // lançamentos importados mantêm o mês calculado (ex.: parcelas); manuais seguem a data
      month: initial && initial.source !== 'manual' ? initial.month : monthOf(date),
      description: description.trim(),
      amount: isRefund ? -cents : cents,
      categoryId,
      source: initial?.source ?? 'manual',
      note: note.trim() || undefined,
      share,
    };
    const ok = await run(() => saveTransaction(draft));
    if (ok) {
      onSaved({ ...initial, ...draft, id: initial?.id ?? '__novo__', createdAt: initial?.createdAt ?? Date.now() });
      onClose();
    }
  };

  const remove = async () => {
    if (!initial || !window.confirm(`Excluir "${initial.description}"?`)) return;
    if (await run(() => deleteTransaction(initial.id))) onClose();
  };

  return (
    <Modal title={initial ? 'Editar lançamento' : 'Novo lançamento'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="segmented">
          <button type="button" className={!isRefund ? 'active' : ''} onClick={() => setIsRefund(false)}>Gasto</button>
          <button type="button" className={isRefund ? 'active' : ''} onClick={() => setIsRefund(true)}>Estorno</button>
        </div>
        <Field label="Descrição">
          <input value={description} onChange={(e) => setDescription(e.target.value)} autoFocus={!initial} />
        </Field>
        <div className="grid-2">
          <Field label="Valor"><MoneyInput value={amount} onChange={setAmount} /></Field>
          <Field label="Data"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Categoria">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Observação (opcional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <SplitFields value={split} onChange={setSplit} total={parseMoney(amount)} installment={initial?.installment} />
        {isRefund && <p className="muted small">Estornos abatem o total da categoria escolhida.</p>}
        <ErrorBox error={error} />
        <div className="row-end">
          {initial && <button type="button" className="btn danger-ghost" onClick={remove}>Excluir</button>}
          <button type="submit" className="btn primary">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- divisão do gasto com outras pessoas ----------

interface SplitDraft {
  on: boolean;
  mode: Share['mode'];
  /** Texto digitado: valor (fixo), porcentagem ou número de pessoas. */
  value: string;
}

function splitDraftOf(share: Share | undefined): SplitDraft {
  if (!share) return { on: false, mode: 'people', value: '2' };
  if (share.mode === 'fixed') return { on: true, mode: 'fixed', value: centsToInput(share.cents) };
  if (share.mode === 'percent') return { on: true, mode: 'percent', value: String(Number(share.percent.toFixed(2))).replace('.', ',') };
  return { on: true, mode: 'people', value: String(share.people) };
}

/** Converte o rascunho na divisão (ou undefined se não dividido). Retorna mensagem de erro (string) se inválido. */
function parseSplit(d: SplitDraft, total: number): Share | undefined | string {
  if (!d.on) return undefined;
  if (d.mode === 'fixed') {
    const c = parseMoney(d.value);
    if (c === null || c <= 0) return 'Informe o valor da sua parte.';
    if (c > total) return 'A sua parte não pode ser maior que o valor total.';
    return { mode: 'fixed', cents: c };
  }
  if (d.mode === 'percent') {
    const p = Number(d.value.replace(',', '.'));
    if (!Number.isFinite(p) || p <= 0 || p > 100) return 'A porcentagem da sua parte deve estar entre 0 e 100.';
    return { mode: 'percent', percent: p };
  }
  const n = Number(d.value);
  if (!Number.isInteger(n) || n < 2) return 'Informe quantas pessoas dividem o gasto (2 ou mais, contando você).';
  return { mode: 'people', people: n };
}

const SPLIT_MODES: { id: Share['mode']; label: string }[] = [
  { id: 'people', label: 'Por pessoas' },
  { id: 'percent', label: 'Percentual' },
  { id: 'fixed', label: 'Valor fixo' },
];

function SplitFields({ value, onChange, total, installment }: {
  value: SplitDraft; onChange: (v: SplitDraft) => void; total: number | null; installment?: string;
}) {
  const set = (patch: Partial<SplitDraft>) => onChange({ ...value, ...patch });
  const share = total && total > 0 ? parseSplit(value, total) : undefined;
  return (
    <div className="split-box stack-sm">
      <label className="switch-row">
        <input type="checkbox" checked={value.on} onChange={(e) => set({ on: e.target.checked })} />
        <span className="switch" aria-hidden />
        <span>Dividir este gasto com outras pessoas</span>
      </label>
      {value.on && (
        <>
          <div className="segmented three">
            {SPLIT_MODES.map((m) => (
              <button key={m.id} type="button" className={value.mode === m.id ? 'active' : ''}
                onClick={() => set({ mode: m.id, value: m.id === 'people' ? '2' : '' })}>{m.label}</button>
            ))}
          </div>
          {value.mode === 'people' && (
            <Field label="Quantas pessoas dividem (contando você)?">
              <input type="number" inputMode="numeric" min={2} step={1} value={value.value} onChange={(e) => set({ value: e.target.value })} />
            </Field>
          )}
          {value.mode === 'percent' && (
            <Field label="Sua parte (%)">
              <input inputMode="decimal" placeholder="Ex.: 50" value={value.value} onChange={(e) => set({ value: e.target.value })} />
            </Field>
          )}
          {value.mode === 'fixed' && (
            <Field label="Sua parte (R$)"><MoneyInput value={value.value} onChange={(v) => set({ value: v })} /></Field>
          )}
          {share && typeof share !== 'string' && total ? (
            <p className="ok-box small">
              Sua parte: <b>{formatMoney(shareOf(total, share))}</b> de {formatMoney(total)} ({describeShare(share, formatMoney)}).
              Só a sua parte conta nos limites e nos aportes.
            </p>
          ) : null}
          {installment && <p className="muted small">As próximas parcelas desta compra também serão divididas assim.</p>}
        </>
      )}
    </div>
  );
}
