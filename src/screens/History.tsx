import { useState } from 'react';
import { BalanceChart, CategoryBarsChart, DueVsPaidChart, StackedMonthlyChart, type SeriesDef } from '../components/charts';
import { ErrorBox, Field, MonthPicker } from '../components/ui';
import { earliestMonth, historyMonths, type RangeKey } from '../domain/history';
import { balanceByMonth, computeLedger } from '../domain/ledger';
import { summarizeMonth } from '../domain/summary';
import type { Month } from '../domain/types';
import { reportFileName, buildReport } from '../export/report';
import { NEUTRAL, useDarkMode } from '../lib/colors';
import { downloadBlob } from '../lib/download';
import { currentMonth, todayISO } from '../lib/months';
import { summaryInput, type ReadyData } from '../useAppData';

const RANGES: { id: RangeKey; label: string }[] = [
  { id: '6', label: '6 meses' },
  { id: '12', label: '12 meses' },
  { id: 'all', label: 'Tudo' },
];
const UNIDENTIFIED_SERIES = '__a_identificar__';

export function History({ data }: { data: ReadyData }) {
  const dark = useDarkMode();
  const today = todayISO();
  const current = currentMonth();
  const [range, setRange] = useState<RangeKey>('6');
  const [barMonth, setBarMonth] = useState<Month>(current);
  const input = summaryInput(data);
  const months = historyMonths(range, earliestMonth(input.startMonth, data.transactions), current);
  const summaries = months.map((m) => summarizeMonth(m, input));

  // séries: categorias atuais na ordem do app + categorias que só existem em meses fechados
  const series: SeriesDef[] = data.categories.filter((c) => c.kind === 'normal').map((c) => ({ id: c.id, name: c.name, color: c.color }));
  for (const s of summaries) {
    for (const c of s.categories) if (!series.some((x) => x.id === c.categoryId)) series.push({ id: c.categoryId, name: c.name, color: c.color });
  }
  if (summaries.some((s) => s.unidentifiedTotal > 0)) {
    series.push({ id: UNIDENTIFIED_SERIES, name: 'A identificar', color: dark ? NEUTRAL.dark : NEUTRAL.light });
  }
  const values: Record<Month, Record<string, number>> = {};
  for (const s of summaries) {
    values[s.month] = Object.fromEntries(s.categories.map((c) => [c.categoryId, c.spent]));
    values[s.month][UNIDENTIFIED_SERIES] = s.unidentifiedTotal;
  }

  const ledgerInput = { profile: data.profile, fixedVersions: data.fixedVersions, closings: data.closings, movements: data.movements, today };
  const ledger = computeLedger(ledgerInput);
  const dueRows = ledger.months.filter((m) => months.includes(m.month));
  const balance = balanceByMonth(ledgerInput, months);

  return (
    <div className="stack">
      <div className="chips" role="group" aria-label="Período dos gráficos">
        {RANGES.map((r) => (
          <button key={r.id} className={`chip ${range === r.id ? 'active' : ''}`} onClick={() => setRange(r.id)}>{r.label}</button>
        ))}
      </div>

      <CategoryBarsChart
        categories={summarizeMonth(barMonth, input).categories}
        dark={dark}
        controls={<MonthPicker month={barMonth} onChange={setBarMonth} />}
      />
      <StackedMonthlyChart months={months} series={series} values={values} dark={dark} />
      <DueVsPaidChart rows={dueRows} dark={dark} />
      <BalanceChart points={balance} dark={dark} />

      <ExportSection data={data} />
    </div>
  );
}

function ExportSection({ data }: { data: ReadyData }) {
  const current = currentMonth();
  const [from, setFrom] = useState<Month>(current);
  const [to, setTo] = useState<Month>(current);
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'pdf' | 'xlsx') => {
    if (!from || !to) return setError('Escolha o mês inicial e o final.');
    if (from > to) return setError('O mês inicial precisa ser anterior ou igual ao final.');
    setError(null);
    setBusy(kind);
    try {
      const report = buildReport(data, from, to, todayISO());
      if (kind === 'pdf') {
        const { reportToPdf } = await import('../export/pdf');
        downloadBlob(await reportToPdf(report), reportFileName(report, 'pdf'));
      } else {
        const { reportToXlsx } = await import('../export/xlsx');
        const bytes = reportToXlsx(report);
        downloadBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), reportFileName(report, 'xlsx'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card stack-sm">
      <h2>Exportar relatório</h2>
      <p className="muted small">Resumo de cada mês, categorias, todos os lançamentos e os movimentos da caixinha.</p>
      <div className="grid-2">
        <Field label="De"><input type="month" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Até"><input type="month" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <div className="grid-2">
        <button className="btn primary" disabled={!!busy} onClick={() => run('pdf')}>{busy === 'pdf' ? 'Gerando…' : 'Baixar PDF'}</button>
        <button className="btn ghost" disabled={!!busy} onClick={() => run('xlsx')}>{busy === 'xlsx' ? 'Gerando…' : 'Baixar Excel'}</button>
      </div>
      <ErrorBox error={error} />
    </section>
  );
}
