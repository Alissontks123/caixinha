import { useEffect, useState } from 'react';
import { Celebration, CountUp, ErrorBox, ProgressBar, useAction } from '../components/ui';
import { closeMonth, reopenMonth } from '../db/repo';
import { overflowBlocks, roomUntilNextBlock } from '../domain/rules';
import { closeBlocker, summarizeMonth } from '../domain/summary';
import type { Month, Profile } from '../domain/types';
import { formatMoney } from '../lib/money';
import { addMonths, currentMonth, dateLabel, monthLabel, monthShort, todayISO } from '../lib/months';
import { monthStatus } from '../domain/alerts';
import { computeLedger, computeStatements } from '../domain/ledger';
import { summaryInput, type AppData } from '../useAppData';

interface Props {
  data: AppData & { profile: Profile };
  month: Month;
  goToTransactions: (filter?: string) => void;
  goToCaixinha: () => void;
}

export function Dashboard({ data, month, goToTransactions, goToCaixinha }: Props) {
  const summary = summarizeMonth(month, summaryInput(data));
  const statuses = summary.closed ? [] : monthStatus(summary, data.profile.alertThreshold);
  const ledger = computeLedger({
    profile: data.profile, fixedVersions: data.fixedVersions, closings: data.closings, movements: data.movements, today: todayISO(),
  });
  // aviso só no próprio mês que ficou com aporte pendente (nos meses seguintes ele aparece em "Meses anteriores")
  const overdue = ledger.months.filter((m) => m.month === month && m.month < currentMonth() && m.pending > 0);
  const overdueTotal = overdue.reduce((s, m) => s + m.pending, 0);
  const statement = computeStatements(
    { profile: data.profile, fixedVersions: data.fixedVersions, closings: data.closings, movements: data.movements, today: todayISO() },
    month,
    (m) => (m === month ? summary.overflowTotal : summarizeMonth(m, summaryInput(data)).overflowTotal),
  ).find((s) => s.month === month);

  // comemoração: uma vez por mês, quando o que falta aportar chega a zero (só no mês atual e no anterior)
  const quitado = !!statement && statement.total > 0 && statement.remaining <= 0 && month >= addMonths(currentMonth(), -1);
  const [celebrating, setCelebrating] = useState(false);
  useEffect(() => {
    if (!quitado) return;
    const key = `caixinha-comemorado-${month}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch { return; }
    setCelebrating(true);
  }, [quitado, month]);
  const blocker = closeBlocker(summary, currentMonth());
  const threshold = data.profile.alertThreshold / 100;
  const { error, run } = useAction();
  const unidentifiedId = data.categories.find((c) => c.kind === 'unidentified')?.id;

  const onClose = () => {
    const lines = [
      `Fechar ${monthLabel(month)}?`,
      '',
      `Aporte fixo: ${formatMoney(summary.fixed)}`,
      `Aportes por gastos excedentes: ${formatMoney(summary.overflowTotal)}`,
      `Total devido: ${formatMoney(summary.totalDue)}`,
      '',
      'Os valores ficarão congelados e os lançamentos do mês não poderão mais ser alterados.',
    ];
    if (window.confirm(lines.join('\n'))) run(() => closeMonth(summary));
  };
  const onReopen = () => {
    if (window.confirm(`Reabrir ${monthLabel(month)}? Os aportes por gastos excedentes voltam a ser recalculados até você fechar de novo.`)) {
      run(() => reopenMonth(month));
    }
  };

  return (
    <div className="stack">
      {overdueTotal > 0 && (
        <section className="card alert-banner warn-surface">
          <div className="alert-line">
            <span className="alert-icon over" aria-hidden>!</span>
            <span>
              <b>Aporte pendente: {formatMoney(overdueTotal)}</b> de {overdue.map((m) => monthShort(m.month)).join(', ')}.
            </span>
          </div>
          <button className="btn ghost small" onClick={goToCaixinha}>Ver caixinha</button>
        </section>
      )}

      {statuses.length > 0 && (
        <section className="card alert-banner" aria-label="Alertas do mês">
          <h3>Atenção neste mês</h3>
          {statuses.map((s) => (
            <button key={s.categoryId} className="alert-line link-line" onClick={() => goToTransactions(s.categoryId)}>
              <span className={`alert-icon ${s.level}`} aria-hidden>{s.level === 'over' ? '!' : '%'}</span>
              <span>
                {s.level === 'over'
                  ? <><b>{s.name}</b> passou do limite em {formatMoney(s.excess)} · aporte {formatMoney(s.contribution)}</>
                  : <><b>{s.name}</b> está em {Math.round(s.ratio * 100)}% do limite</>}
              </span>
            </button>
          ))}
        </section>
      )}

      <section className="card hero">
        <div className="hero-top">
          <span className={`badge ${summary.closed ? 'closed' : 'open'}`}>
            {summary.closed ? `Fechado em ${dateLabel(summary.closedAt!)}` : 'Mês aberto'}
          </span>
        </div>
        <p className="hero-label">Aportes necessários no mês</p>
        {statement ? (
          <>
            <p className="hero-value"><CountUp cents={Math.max(statement.total, 0)} /></p>
            <dl className="hero-lines">
              <dt>Fixo devido</dt><dd>{formatMoney(statement.fixed)}</dd>
              <dt>Gastos excedentes{statement.overflowForecast && statement.overflow > 0 ? ' (previsão)' : ''}</dt>
              <dd>{formatMoney(statement.overflow)}</dd>
              {statement.resgates > 0 && <><dt>Resgates a repor</dt><dd>{formatMoney(statement.resgates)}</dd></>}
              {statement.previous >= 0
                ? <><dt>Meses anteriores</dt><dd>{formatMoney(statement.previous)}</dd></>
                : <><dt>Crédito de meses anteriores</dt><dd className="refund">−{formatMoney(-statement.previous)}</dd></>}
            </dl>
            <p className="hero-foot small">
              Já aportado: <b>{formatMoney(statement.paid)}</b> ·{' '}
              {statement.remaining > 0
                ? <>Falta: <b className="text-danger">{formatMoney(statement.remaining)}</b></>
                : statement.remaining < 0
                  ? <span className="text-ok">Quitado, com crédito de <b>{formatMoney(-statement.remaining)}</b> para os próximos meses</span>
                  : <b className="text-ok">Quitado</b>}
            </p>
          </>
        ) : (
          <>
            <p className="hero-value"><CountUp cents={summary.totalDue} /></p>
            <dl className="hero-lines">
              <dt>Fixo devido</dt><dd>{formatMoney(summary.fixed)}</dd>
              <dt>Gastos excedentes</dt><dd>{formatMoney(summary.overflowTotal)}</dd>
            </dl>
          </>
        )}
      </section>

      {summary.unidentifiedCount > 0 && (
        <button className="card warn-card" onClick={() => goToTransactions(unidentifiedId)}>
          <b>{summary.unidentifiedCount} lançamento(s) a identificar</b>
          <span>{formatMoney(summary.unidentifiedTotal)} ainda sem categoria. Toque para classificar.</span>
        </button>
      )}

      <section className="stack-sm stagger" key={month}>
        {summary.categories.map((c, i) => {
          const order = { ['--i' as string]: i };
          if (c.contributes === false) {
            return (
              <button key={c.categoryId} className="card cat-card" style={order} onClick={() => goToTransactions(c.categoryId)}>
                <div className="cat-head">
                  <span className="cat-name"><span className="dot" style={{ background: c.color }} />{c.name}</span>
                  <span className="pill neutral">Não gera aporte</span>
                </div>
                <div className="cat-values"><b>{formatMoney(c.spent)}</b><span className="muted"> gastos no mês</span></div>
              </button>
            );
          }
          const ratio = c.limit > 0 ? c.spent / c.limit : c.spent > 0 ? 2 : 0;
          const over = c.spent > c.limit;
          const alert = !over && ratio >= threshold;
          const blocks = overflowBlocks(c.spent, c.limit, c.blockSize);
          const room = roomUntilNextBlock(c.spent, c.limit, c.blockSize);
          return (
            <button key={c.categoryId} className="card cat-card" style={order} onClick={() => goToTransactions(c.categoryId)}>
              <div className="cat-head">
                <span className="cat-name"><span className="dot" style={{ background: c.color }} />{c.name}</span>
                {c.contribution > 0 && <span className="pill danger">+{formatMoney(c.contribution)}</span>}
                {alert && <span className="pill warn">{Math.round(ratio * 100)}% do limite</span>}
              </div>
              <div className="cat-values">
                <b>{formatMoney(c.spent)}</b>
                <span className="muted"> de {formatMoney(c.limit)}</span>
              </div>
              <ProgressBar ratio={ratio} color={c.color} alert={alert} />
              {over ? (
                <>
                  <p className="cat-foot small">
                    Você excedeu o total de <b>{formatMoney(c.spent - c.limit)}</b>, gerando a necessidade de um aporte na caixinha de{' '}
                    <b>{formatMoney(c.contribution)}</b>.
                  </p>
                  <p className="cat-foot muted small">
                    {room === 0 ? 'Qualquer gasto a mais faz o aporte subir' : `Se gastar mais ${formatMoney(room)}, o aporte sobe`} para {formatMoney((blocks + 1) * c.blockAmount)}.
                  </p>
                </>
              ) : (
                <p className="cat-foot muted small">Você ainda pode gastar <b>{formatMoney(c.limit - c.spent)}</b> neste mês.</p>
              )}
            </button>
          );
        })}
      </section>

      {summary.ignoredTotal !== 0 && (
        <p className="muted small center">Lançamentos marcados como "Não é gasto": {formatMoney(summary.ignoredTotal)}</p>
      )}

      <section className="card stack-sm">
        {summary.closed ? (
          <>
            <p className="small">Mês fechado: os valores acima estão congelados.</p>
            <button className="btn ghost" onClick={onReopen}>Reabrir mês</button>
          </>
        ) : (
          <>
            <button className="btn primary" disabled={!!blocker} onClick={onClose}>Fechar {monthLabel(month)}</button>
            {blocker && <p className="muted small">{blocker}</p>}
          </>
        )}
        <ErrorBox error={error} />
      </section>
      {celebrating && statement && (
        <Celebration title="Mês quitado!" detail={`Já aportado: ${formatMoney(statement.paid)}`} onDone={() => setCelebrating(false)} />
      )}
    </div>
  );
}
