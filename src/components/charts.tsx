import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { MonthLedger } from '../domain/ledger';
import type { ClosedCategory, Month } from '../domain/types';
import { displayColor, SERIES_DARK, SERIES_LIGHT, STATUS } from '../lib/colors';
import { formatMoney } from '../lib/money';
import { monthShort } from '../lib/months';

// ---------- infraestrutura ----------

/** Largura reservada aos rótulos do eixo Y. */
const AXIS_LEFT = 44;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Escala "redonda" para o eixo: 0 até um máximo limpo, em 4 passos. */
function niceScale(maxCents: number): { max: number; ticks: number[] } {
  const max = Math.max(maxCents, 100);
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-6; v += step) ticks.push(v);
  return { max: top, ticks };
}

/** Rótulo do eixo: valores inteiros em reais; "mil" a partir de 10 mil. */
function axisLabel(cents: number): string {
  const reais = cents / 100;
  if (reais >= 10000) return `${(reais / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return reais.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

/** Retângulo com cantos de 4px só no topo (ponta do dado); base reta. */
function topRoundedRect(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

/** Retângulo com cantos de 4px só na direita (barras horizontais). */
function rightRoundedRect(x: number, y: number, w: number, h: number, r = 4): string {
  if (w <= 0) return '';
  const rr = Math.min(r, h / 2, w);
  return `M${x},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h - rr} Q${x + w},${y + h} ${x + w - rr},${y + h} H${x} Z`;
}

interface LegendItem {
  label: string;
  color: string;
  kind?: 'square' | 'line' | 'tick';
}

interface TooltipState {
  x: number;
  y: number;
  content: ReactNode;
}

function ChartCard({
  title, subtitle, legend, table, controls, children,
}: {
  title: string;
  subtitle?: string;
  legend?: LegendItem[];
  table: ReactNode;
  controls?: ReactNode;
  children: (width: number, setTip: (t: TooltipState | null) => void) => ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<TooltipState | null>(null);
  return (
    <section className="card chart-card">
      <div className="chart-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="muted small">{subtitle}</p>}
        </div>
        <button className="btn ghost small" onClick={() => setShowTable((v) => !v)}>{showTable ? 'Ver gráfico' : 'Ver tabela'}</button>
      </div>
      {controls}
      {legend && legend.length > 0 && !showTable && (
        <ul className="chart-legend">
          {legend.map((l) => (
            <li key={l.label}><span className={`key key-${l.kind ?? 'square'}`} style={{ background: l.color }} />{l.label}</li>
          ))}
        </ul>
      )}
      <div ref={ref} className="chart-plot" onPointerLeave={() => setTip(null)}>
        {showTable ? <div className="table-wrap">{table}</div> : children(width, setTip)}
        {tip && !showTable && (
          // abre para o lado com mais espaço (âncora = x do elemento apontado)
          <div
            className="chart-tip"
            style={tip.x > width * 0.55 ? { right: Math.max(width - tip.x + 10, 4), top: tip.y } : { left: Math.max(tip.x + 10, 4), top: tip.y }}
          >{tip.content}</div>
        )}
      </div>
    </section>
  );
}

const tipRows = (rows: [string, string, string?][]) => (
  <>
    {rows.map(([label, value, color]) => (
      <div key={label} className="tip-row">
        <span>{color && <span className="key key-square" style={{ background: color }} />}{label}</span>
        <b>{value}</b>
      </div>
    ))}
  </>
);

// ---------- 1. Gastos do mês por categoria ----------

export function CategoryBarsChart({ categories, dark, controls }: { categories: ClosedCategory[]; dark: boolean; controls?: ReactNode }) {
  const spentColor = dark ? SERIES_DARK[0] : SERIES_LIGHT[0];
  const scale = niceScale(Math.max(...categories.map((c) => Math.max(c.spent, c.contributes === false ? 0 : c.limit)), 0));
  const rowH = 46;
  const barH = 12;
  return (
    <ChartCard
      title="Gastos do mês por categoria"
      subtitle="Comparados com o limite de cada categoria"
      controls={controls}
      legend={[
        { label: 'Gasto', color: spentColor },
        { label: 'Acima do limite', color: STATUS.critical },
        { label: 'Limite', color: 'var(--text)', kind: 'tick' },
      ]}
      table={
        <table className="table">
          <thead><tr><th>Categoria</th><th>Gasto</th><th>Limite</th><th>Aporte</th></tr></thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.categoryId}>
                <td>{c.name}</td>
                <td>{formatMoney(c.spent)}</td>
                <td>{c.contributes === false ? 'sem limite' : formatMoney(c.limit)}</td>
                <td>{formatMoney(c.contribution)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      {(width, setTip) => {
        const w = Math.max(width, 200);
        const x = (v: number) => (Math.max(v, 0) / scale.max) * (w - 8);
        return (
          <svg width={w} height={categories.length * rowH + 4} role="img" aria-label="Gastos do mês por categoria comparados ao limite">
            {categories.map((c, i) => {
              const y = i * rowH;
              const hasLimit = c.contributes !== false;
              const within = hasLimit ? Math.min(c.spent, c.limit) : c.spent;
              const excess = hasLimit ? Math.max(c.spent - c.limit, 0) : 0;
              const wWithin = x(within);
              const wExcess = x(excess);
              const valueText = hasLimit ? `${formatMoney(c.spent)} de ${formatMoney(c.limit)}` : `${formatMoney(c.spent)} · sem limite`;
              return (
                <g
                  key={c.categoryId}
                  onPointerEnter={() => setTip({
                    x: Math.max(wWithin + wExcess, 40), y: y + 30,
                    content: tipRows([
                      [c.name, ''],
                      ['Gasto', formatMoney(c.spent)],
                      ...(hasLimit ? [['Limite', formatMoney(c.limit)] as [string, string], ['Aporte', formatMoney(c.contribution)] as [string, string]] : []),
                    ]),
                  })}
                >
                  <rect x={0} y={y} width={w} height={rowH} fill="transparent" />
                  <text x={0} y={y + 14} className="chart-label">{c.name}</text>
                  <text x={w - 4} y={y + 14} className="chart-value" textAnchor="end">{valueText}</text>
                  <rect x={0} y={y + 22} width={w - 8} height={barH} rx={4} className="chart-track" />
                  {excess > 0 ? (
                    <>
                      <rect x={0} y={y + 22} width={Math.max(wWithin - 2, 0)} height={barH} fill={spentColor} />
                      <path d={rightRoundedRect(wWithin, y + 22, wExcess, barH)} fill={STATUS.critical} />
                    </>
                  ) : (
                    <path d={rightRoundedRect(0, y + 22, wWithin, barH)} fill={spentColor} />
                  )}
                  {hasLimit && <rect x={x(c.limit) - 1} y={y + 18} width={2} height={barH + 8} className="chart-limit" />}
                </g>
              );
            })}
          </svg>
        );
      }}
    </ChartCard>
  );
}

// ---------- 2. Evolução mensal por categoria (colunas empilhadas) ----------

export interface SeriesDef {
  id: string;
  name: string;
  color: string;
}

export function StackedMonthlyChart({ months, series, values, dark }: {
  months: Month[];
  series: SeriesDef[];
  /** values[mês][id da série] em centavos */
  values: Record<Month, Record<string, number>>;
  dark: boolean;
}) {
  const colorOf = (s: SeriesDef) => displayColor(s.color, dark);
  const totals = months.map((m) => series.reduce((s, x) => s + Math.max(values[m]?.[x.id] ?? 0, 0), 0));
  const scale = niceScale(Math.max(...totals, 0));
  const visible = series.filter((s) => months.some((m) => (values[m]?.[s.id] ?? 0) > 0));
  return (
    <ChartCard
      title="Evolução mensal por categoria"
      subtitle="Quanto foi gasto em cada categoria, mês a mês"
      legend={visible.map((s) => ({ label: s.name, color: colorOf(s) }))}
      table={
        <table className="table">
          <thead><tr><th>Mês</th>{visible.map((s) => <th key={s.id}>{s.name}</th>)}<th>Total</th></tr></thead>
          <tbody>
            {months.map((m, i) => (
              <tr key={m}>
                <td>{monthShort(m)}</td>
                {visible.map((s) => <td key={s.id}>{formatMoney(values[m]?.[s.id] ?? 0)}</td>)}
                <td><b>{formatMoney(totals[i])}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      {(width, setTip) => (
        <ColumnFrame width={width} months={months} scale={scale}>
          {(band, x0, yOf, plotH) => months.map((m, i) => {
            const colW = Math.min(24, band * 0.6);
            const cx = x0(i) + (band - colW) / 2;
            let cursor = plotH;
            const parts = visible.map((s) => ({ s, v: Math.max(values[m]?.[s.id] ?? 0, 0) })).filter((p) => p.v > 0);
            return (
              <g
                key={m}
                onPointerEnter={() => setTip({
                  x: AXIS_LEFT + cx + colW / 2, y: 8,
                  content: (
                    <>
                      <div className="tip-title">{monthShort(m)}</div>
                      {tipRows([...parts].reverse().map((p) => [p.s.name, formatMoney(p.v), colorOf(p.s)] as [string, string, string]))}
                      {tipRows([['Total', formatMoney(totals[i])]])}
                    </>
                  ),
                })}
              >
                <rect x={x0(i)} y={0} width={band} height={plotH} fill="transparent" />
                {parts.map((p, j) => {
                  const h = plotH - yOf(p.v);
                  const top = j === parts.length - 1;
                  const y = cursor - h;
                  cursor = y;
                  const drawH = top ? h : Math.max(h - 2, 0); // 2px de fundo entre segmentos
                  return top
                    ? <path key={p.s.id} d={topRoundedRect(cx, y, colW, drawH)} fill={colorOf(p.s)} />
                    : <rect key={p.s.id} x={cx} y={y + 2} width={colW} height={drawH} fill={colorOf(p.s)} />;
                })}
              </g>
            );
          })}
        </ColumnFrame>
      )}
    </ChartCard>
  );
}

/** Eixo Y (grade + rótulos) e eixo X (meses) para gráficos de colunas e linhas. */
function ColumnFrame({ width, months, scale, children }: {
  width: number;
  months: Month[];
  scale: { max: number; ticks: number[] };
  children: (band: number, x0: (i: number) => number, yOf: (v: number) => number, plotH: number) => ReactNode;
}) {
  const H = 220;
  const left = AXIS_LEFT;
  const bottom = 24;
  const plotH = H - bottom - 8;
  const plotW = Math.max(width - left, 100);
  const band = plotW / Math.max(months.length, 1);
  const yOf = (v: number) => plotH - (Math.max(v, 0) / scale.max) * plotH;
  const step = Math.ceil(months.length / Math.floor(plotW / 44)); // evita rótulos encavalados
  return (
    <svg width={width} height={H} role="img">
      <g transform="translate(0,8)">
        {scale.ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={width} y1={yOf(t)} y2={yOf(t)} className={t === 0 ? 'chart-baseline' : 'chart-grid'} />
            <text x={left - 6} y={yOf(t) + 4} textAnchor="end" className="chart-axis">{axisLabel(t)}</text>
          </g>
        ))}
        <g transform={`translate(${left},0)`}>{children(band, (i) => i * band, yOf, plotH)}</g>
        {months.map((m, i) => (i % step === 0 || i === months.length - 1) && (
          <text key={m} x={left + i * band + band / 2} y={plotH + 18} textAnchor="middle" className="chart-axis">{monthShort(m)}</text>
        ))}
      </g>
    </svg>
  );
}

// ---------- 3. Aportes: devido x pago ----------

export function DueVsPaidChart({ rows, dark }: { rows: MonthLedger[]; dark: boolean }) {
  const due = dark ? SERIES_DARK[0] : SERIES_LIGHT[0];
  const paid = dark ? SERIES_DARK[1] : SERIES_LIGHT[1];
  const sorted = [...rows].sort((a, b) => a.month.localeCompare(b.month));
  const months = sorted.map((r) => r.month);
  const scale = niceScale(Math.max(...sorted.map((r) => Math.max(r.due, r.paid)), 0));
  return (
    <ChartCard
      title="Aportes: devido × pago"
      subtitle="Aporte fixo + gastos excedentes + resgates a repor, comparado com o que foi aplicado"
      legend={[{ label: 'Devido', color: due }, { label: 'Pago', color: paid }]}
      table={
        <table className="table">
          <thead><tr><th>Mês</th><th>Fixo</th><th>Estouro</th><th>Resgates</th><th>Devido</th><th>Pago</th><th>Pendente</th></tr></thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.month}>
                <td>{monthShort(r.month)}</td>
                <td>{formatMoney(r.fixed)}</td>
                <td>{r.closed ? formatMoney(r.overflow) : 'mês aberto'}</td>
                <td>{formatMoney(r.resgates)}</td>
                <td>{formatMoney(r.due)}</td>
                <td>{formatMoney(r.paid)}</td>
                <td>{formatMoney(r.pending)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      {(width, setTip) => sorted.length === 0 ? <p className="empty">Sem meses desde o início da caixinha.</p> : (
        <ColumnFrame width={width} months={months} scale={scale}>
          {(band, x0, yOf, plotH) => sorted.map((r, i) => {
            const bw = Math.min(16, band * 0.3);
            const gx = x0(i) + band / 2 - bw - 1;
            return (
              <g
                key={r.month}
                onPointerEnter={() => setTip({
                  x: AXIS_LEFT + gx + bw, y: 8,
                  content: (
                    <>
                      <div className="tip-title">{monthShort(r.month)}{r.closed ? '' : ' (aberto)'}</div>
                      {tipRows([
                        ['Fixo', formatMoney(r.fixed)],
                        ['Estouro', r.closed ? formatMoney(r.overflow) : 'ao fechar'],
                        ...(r.resgates ? [['Resgates', formatMoney(r.resgates)] as [string, string]] : []),
                        ['Devido', formatMoney(r.due), due],
                        ['Pago', formatMoney(r.paid), paid],
                        ['Pendente', formatMoney(r.pending)],
                      ])}
                    </>
                  ),
                })}
              >
                <rect x={x0(i)} y={0} width={band} height={plotH} fill="transparent" />
                <path d={topRoundedRect(gx, yOf(r.due), bw, plotH - yOf(r.due))} fill={due} />
                <path d={topRoundedRect(gx + bw + 2, yOf(r.paid), bw, plotH - yOf(r.paid))} fill={paid} />
              </g>
            );
          })}
        </ColumnFrame>
      )}
    </ChartCard>
  );
}

// ---------- 4. Saldo da caixinha ----------

export function BalanceChart({ points, dark }: { points: { month: Month; balance: number }[]; dark: boolean }) {
  const color = dark ? SERIES_DARK[0] : SERIES_LIGHT[0];
  // folga de 15% no topo para a linha e o rótulo final não encostarem na borda
  const scale = niceScale(Math.max(...points.map((p) => p.balance), 0) * 1.15);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => setHover(null), [points.length]);
  return (
    <ChartCard
      title="Saldo da caixinha"
      subtitle="Saldo estimado no fim de cada mês"
      table={
        <table className="table">
          <thead><tr><th>Mês</th><th>Saldo</th></tr></thead>
          <tbody>{points.map((p) => <tr key={p.month}><td>{monthShort(p.month)}</td><td>{formatMoney(p.balance)}</td></tr>)}</tbody>
        </table>
      }
    >
      {(width, setTip) => points.length === 0 ? <p className="empty">Sem dados ainda.</p> : (
        <ColumnFrame width={width} months={points.map((p) => p.month)} scale={scale}>
          {(band, x0, yOf, plotH) => {
            const xs = points.map((_, i) => x0(i) + band / 2);
            const line = points.map((p, i) => `${i ? 'L' : 'M'}${xs[i]},${yOf(p.balance)}`).join(' ');
            const area = `${line} L${xs[xs.length - 1]},${plotH} L${xs[0]},${plotH} Z`;
            const last = points.length - 1;
            return (
              <>
                <path d={area} fill={color} opacity={0.1} />
                <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {hover !== null && <line x1={xs[hover]} x2={xs[hover]} y1={0} y2={plotH} className="chart-crosshair" />}
                {points.map((p, i) => (
                  <circle key={p.month} cx={xs[i]} cy={yOf(p.balance)} r={i === last || i === hover ? 5 : 4} fill={color} className="chart-dot" />
                ))}
                <text
                  x={xs[last] - 8}
                  y={yOf(points[last].balance) < 24 ? yOf(points[last].balance) + 20 : yOf(points[last].balance) - 12}
                  textAnchor="end"
                  className="chart-value"
                >
                  {formatMoney(points[last].balance)}
                </text>
                {points.map((p, i) => (
                  <rect
                    key={`h${p.month}`}
                    x={x0(i)} y={0} width={band} height={plotH} fill="transparent"
                    onPointerEnter={() => {
                      setHover(i);
                      setTip({ x: AXIS_LEFT + xs[i], y: Math.max(yOf(p.balance) - 30, 0), content: tipRows([[monthShort(p.month), formatMoney(p.balance)]]) });
                    }}
                    onPointerLeave={() => setHover(null)}
                  />
                ))}
              </>
            );
          }}
        </ColumnFrame>
      )}
    </ChartCard>
  );
}
