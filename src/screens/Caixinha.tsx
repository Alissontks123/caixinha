import { useCallback, useState } from 'react';
import { ErrorBox, Field, Modal, MoneyInput, ProgressBar, UndoToast, useAction, type UndoInfo } from '../components/ui';
import { addCaixinhaMovement, deleteCaixinhaMovement, restoreCaixinhaMovement, updateProfile } from '../db/repo';
import { goalProgress } from '../domain/insights';
import { computeLedger, computeStatements } from '../domain/ledger';
import { summarizeMonth } from '../domain/summary';
import type { CaixinhaMovementType, Profile } from '../domain/types';
import { centsToInput, formatMoney, parseMoney } from '../lib/money';
import { addMonths, currentMonth, dateLabel, monthLabel, monthShort, todayISO } from '../lib/months';
import { summaryInput, type AppData } from '../useAppData';

const TYPE_LABEL: Record<CaixinhaMovementType, string> = {
  aplicacao: 'Aplicação',
  resgate: 'Resgate',
  saldo_informado: 'Saldo real informado',
};

export function Caixinha({ data }: { data: AppData & { profile: Profile } }) {
  const [adding, setAdding] = useState<CaixinhaMovementType | null>(null);
  const { error, run } = useAction();
  const [undo, setUndo] = useState<UndoInfo | null>(null);
  const closeUndo = useCallback(() => setUndo(null), []);
  const today = todayISO();
  const ledger = computeLedger({
    profile: data.profile,
    fixedVersions: data.fixedVersions,
    closings: data.closings,
    movements: data.movements,
    today,
  });
  // estouro previsto do mês corrente (ainda não é dívida até fechar)
  const current = summarizeMonth(currentMonth(), summaryInput(data));
  const input = summaryInput(data);
  const statements = computeStatements(
    { profile: data.profile, fixedVersions: data.fixedVersions, closings: data.closings, movements: data.movements, today },
    currentMonth(),
    (m) => summarizeMonth(m, input).overflowTotal,
  ).reverse();
  const hasResgates = statements.some((s) => s.resgates > 0);
  const signed = (c: number) => (c < 0 ? `−${formatMoney(-c)}` : formatMoney(c));
  const sorted = [...data.movements].sort((a, b) => b.date.localeCompare(a.date));
  const movements = sorted.filter((m) => !m.deleted);
  const dismissed = sorted.filter((m) => m.deleted);

  return (
    <div className="stack">
      <section className="card hero">
        <p className="hero-label">Saldo estimado da caixinha</p>
        <p className="hero-value">{formatMoney(ledger.balance)}</p>
        <div className="hero-split">
          <div><span className="muted">Pendente</span><b className={ledger.totalPending > 0 ? 'text-danger' : ''}>{formatMoney(ledger.totalPending)}</b></div>
          <div><span className="muted">Crédito</span><b>{formatMoney(ledger.credit)}</b></div>
        </div>
        <div className="hero-split">
          <div><span className="muted">Total aportado</span><b>{formatMoney(ledger.totalApplied)}</b></div>
          <div><span className="muted">Rendimentos</span><b>{formatMoney(ledger.earnings)}</b></div>
        </div>
        <p className="muted small">
          Desde {dateLabel(data.profile.caixinhaStartDate)} (saldo inicial {formatMoney(data.profile.caixinhaStartBalance)}).
        </p>
      </section>

      <GoalCard profile={data.profile} balance={ledger.balance} />

      {!current.closed && current.overflowTotal > 0 && (
        <p className="card warn-card static">
          <b>Previsão: +{formatMoney(current.overflowTotal)} por gastos excedentes neste mês</b>
          <span>Vira dívida quando o mês for fechado.</span>
        </p>
      )}

      <div className="grid-3 actions">
        <button className="btn primary" onClick={() => setAdding('aplicacao')}>+ Aplicação</button>
        <button className="btn ghost" onClick={() => setAdding('resgate')}>− Resgate</button>
        <button className="btn ghost" onClick={() => setAdding('saldo_informado')}>Informar saldo</button>
      </div>
      <p className="muted small">
        Aplicações e resgates entram sozinhos ao importar o extrato da conta Nubank (aba Importar). Use os botões acima só para o que não estiver no extrato.
      </p>

      <section>
        <h2 className="section-title">Devido × pago por mês</h2>
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Mês</th><th>Saldo anterior</th><th>Fixo</th><th>Excedentes</th>{hasResgates && <th>Resgates</th>}
                <th>Total</th><th>Aportado</th><th>Falta</th>
              </tr>
            </thead>
            <tbody>
              {statements.map((s) => (
                <tr key={s.month}>
                  <td>{monthShort(s.month)}<span className="sub">{s.closed ? 'fechado' : 'aberto'}</span></td>
                  <td className={s.previous < 0 ? 'text-ok' : ''}>{signed(s.previous)}{s.previous < 0 && <span className="sub">crédito</span>}</td>
                  <td>{formatMoney(s.fixed)}</td>
                  <td>{formatMoney(s.overflow)}{s.overflowForecast && s.overflow > 0 && <span className="sub">previsão</span>}</td>
                  {hasResgates && <td>{formatMoney(s.resgates)}</td>}
                  <td><b>{signed(s.total)}</b></td>
                  <td>{formatMoney(s.paid)}</td>
                  <td className={s.remaining > 0 ? 'text-danger' : 'text-ok'}>
                    {s.remaining > 0
                      ? <>{formatMoney(s.remaining)}{s.month < currentMonth() && <span className="sub">passou para o mês seguinte</span>}</>
                      : s.remaining < 0 ? <>Quitado<span className="sub">crédito {formatMoney(-s.remaining)}</span></> : 'Quitado'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Funciona como uma fatura: o que falta num mês passa para o seguinte como saldo anterior, e cada aplicação abate primeiro
          o saldo anterior (o mais antigo). Excedentes de meses abertos são previsão: só passam para o mês seguinte quando o mês é fechado.
          Resgates precisam ser repostos.
        </p>
      </section>

      <section>
        <h2 className="section-title">Movimentações</h2>
        <ErrorBox error={error} />
        {movements.length === 0 ? (
          <p className="empty">Nenhuma movimentação registrada.</p>
        ) : (
          <div className="card tx-list">
            {movements.map((m) => {
              const before = m.date <= data.profile.caixinhaStartDate;
              return (
                <div key={m.id} className={`tx-row ${before ? 'faded' : ''}`}>
                  <div className="tx-main static">
                    <span className="tx-desc">{TYPE_LABEL[m.type]}</span>
                    <span className="tx-meta muted small">
                      {dateLabel(m.date)} · {m.source === 'extrato' ? 'extrato' : 'manual'}
                      {m.note ? ` · ${m.note}` : ''}{before ? ' · antes do saldo inicial (ignorada)' : ''}
                    </span>
                  </div>
                  <span className={`tx-amount ${m.type === 'resgate' ? 'refund' : ''}`}>
                    {m.type === 'resgate' ? '−' : ''}{formatMoney(m.amount)}
                  </span>
                  <button
                    className="icon-btn"
                    aria-label="Excluir movimentação"
                    onClick={async () => {
                      let undoFn: (() => Promise<void>) | undefined;
                      if (await run(async () => { undoFn = await deleteCaixinhaMovement(m.id); })) {
                        setUndo({
                          message: m.source === 'extrato' ? 'Movimentação desconsiderada (não volta ao reimportar).' : 'Movimentação excluída.',
                          undo: async () => { await undoFn?.(); },
                        });
                      }
                    }}
                  >×</button>
                </div>
              );
            })}
          </div>
        )}
        {dismissed.length > 0 && (
          <details className="card details" style={{ marginTop: 12 }}>
            <summary>Desconsideradas ({dismissed.length})</summary>
            <div className="tx-list">
              {dismissed.map((m) => (
                <div key={m.id} className="tx-row">
                  <div className="tx-main static">
                    <span className="tx-desc">{TYPE_LABEL[m.type]}</span>
                    <span className="tx-meta muted small">{dateLabel(m.date)} · extrato</span>
                  </div>
                  <span className="tx-amount">{formatMoney(m.amount)}</span>
                  <button className="btn ghost small" onClick={() => run(() => restoreCaixinhaMovement(m.id))}>Restaurar</button>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {adding && <MovementForm type={adding} onClose={() => setAdding(null)} />}
      <UndoToast info={undo} onClose={closeUndo} />
    </div>
  );
}

function MovementForm({ type, onClose }: { type: CaixinhaMovementType; onClose: () => void }) {
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const { error, setError, run } = useAction();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseMoney(amount);
    if (!date) return setError('Informe a data.');
    if (cents === null || cents < 0 || (type !== 'saldo_informado' && cents === 0)) return setError('Informe um valor válido.');
    if (await run(() => addCaixinhaMovement({ date, type, amount: cents, note: note.trim() || undefined }))) onClose();
  };

  return (
    <Modal title={TYPE_LABEL[type]} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {type === 'saldo_informado' && (
          <p className="muted small">
            Informe o saldo real que aparece no app da Nubank. A diferença para o saldo calculado é registrada como rendimento.
          </p>
        )}
        {type === 'resgate' && <p className="muted small">O valor resgatado volta a ser devido e precisa ser reposto.</p>}
        <div className="grid-2">
          <Field label={type === 'saldo_informado' ? 'Saldo real' : 'Valor'}><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field>
          <Field label="Data"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Observação (opcional)"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <div className="row-end"><button className="btn primary" type="submit">Salvar</button></div>
      </form>
    </Modal>
  );
}

/** Meta da caixinha: juntar um valor até um mês, medido pelo saldo estimado. */
function GoalCard({ profile, balance }: { profile: Profile; balance: number }) {
  const [editing, setEditing] = useState(false);
  const has = !!profile.goalAmount && !!profile.goalMonth;
  const g = has ? goalProgress(profile.goalAmount!, profile.goalMonth!, balance, currentMonth()) : undefined;
  return (
    <section className="card stack-sm">
      <div className="row-between">
        <h2 className="card-title">Meta da caixinha</h2>
        <button className="btn ghost small" onClick={() => setEditing(true)}>{has ? 'Alterar' : 'Definir meta'}</button>
      </div>
      {!g ? (
        <p className="muted small">Defina quanto quer juntar e até quando. O app mostra o progresso e quanto aportar por mês.</p>
      ) : (
        <>
          <p className="small">Juntar <b>{formatMoney(g.goal)}</b> até <b>{monthLabel(profile.goalMonth!)}</b></p>
          <ProgressBar ratio={g.ratio} color="var(--primary)" alert={false} />
          <p className="small">
            {g.reached
              ? <b className="text-ok">Meta alcançada! O saldo estimado é {formatMoney(g.balance)}.</b>
              : <>
                  {Math.round(g.ratio * 100)}% · faltam <b>{formatMoney(g.missing)}</b>
                  {g.perMonth !== undefined
                    ? <> · <b>{formatMoney(g.perMonth)}</b> por mês {g.monthsLeft === 1 ? 'neste mês' : `nos próximos ${g.monthsLeft} meses`}</>
                    : <> · a data da meta já passou</>}
                </>}
          </p>
        </>
      )}
      {editing && <GoalForm profile={profile} onClose={() => setEditing(false)} />}
    </section>
  );
}

function GoalForm({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [amount, setAmount] = useState(profile.goalAmount ? centsToInput(profile.goalAmount) : '');
  const [month, setMonth] = useState(profile.goalMonth ?? addMonths(currentMonth(), 12));
  const { error, setError, run } = useAction();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseMoney(amount);
    if (cents === null || cents <= 0) return setError('Informe o valor da meta.');
    if (!month) return setError('Escolha até quando quer juntar.');
    if (await run(() => updateProfile({ goalAmount: cents, goalMonth: month }))) onClose();
  };
  return (
    <Modal title="Meta da caixinha" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Quanto quer juntar"><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field>
        <Field label="Até quando" hint="O progresso usa o saldo estimado da caixinha.">
          <input type="month" value={month} min={currentMonth()} onChange={(e) => setMonth(e.target.value)} />
        </Field>
        <ErrorBox error={error} />
        <div className="row-end">
          {profile.goalAmount && (
            <button type="button" className="btn danger-ghost" onClick={async () => {
              if (await run(() => updateProfile({ goalAmount: undefined, goalMonth: undefined }))) onClose();
            }}>Remover meta</button>
          )}
          <button className="btn primary" type="submit">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
