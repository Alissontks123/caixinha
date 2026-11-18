import { useState } from 'react';
import { ErrorBox, Field, Modal, MoneyInput, useAction } from '../components/ui';
import { addCaixinhaMovement, deleteCaixinhaMovement, restoreCaixinhaMovement } from '../db/repo';
import { computeLedger, computeStatements } from '../domain/ledger';
import { summarizeMonth } from '../domain/summary';
import type { CaixinhaMovementType, Profile } from '../domain/types';
import { formatMoney, parseMoney } from '../lib/money';
import { currentMonth, dateLabel, monthShort, todayISO } from '../lib/months';
import { summaryInput, type AppData } from '../useAppData';

const TYPE_LABEL: Record<CaixinhaMovementType, string> = {
  aplicacao: 'Aplicação',
  resgate: 'Resgate',
  saldo_informado: 'Saldo real informado',
};

export function Caixinha({ data }: { data: AppData & { profile: Profile } }) {
  const [adding, setAdding] = useState<CaixinhaMovementType | null>(null);
  const { error, run } = useAction();
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
                    onClick={() =>
                      window.confirm(
                        m.source === 'extrato'
                          ? 'Desconsiderar esta movimentação do extrato? Ela não voltará ao reimportar o extrato (dá para restaurar abaixo).'
                          : 'Excluir esta movimentação?',
                      ) && run(() => deleteCaixinhaMovement(m.id))
                    }
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
