import { formatMoney } from '../lib/money';
import { dateLabel, monthLabel, monthShort } from '../lib/months';

/** Valor com sinal de menos para crédito. */
const signedMoney = (c: number) => (c < 0 ? `−${formatMoney(-c)}` : formatMoney(c));
import type { Report } from './report';

const PRIMARY: [number, number, number] = [47, 111, 94];

/** Gera o relatório em PDF (A4). As bibliotecas só são carregadas quando o usuário exporta. */
export async function reportToPdf(r: Report): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const { autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  let y = margin;
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  const heading = (text: string, size = 13) => {
    if (y > 760) { doc.addPage(); y = margin; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    doc.setTextColor(20, 20, 20);
    doc.text(text, margin, y);
    y += size + 6;
  };
  const table = (head: string[], body: (string | number)[][], moneyCols: number[] = [], opts: { foot?: string[] } = {}) => {
    autoTable(doc, {
      startY: y,
      head: [head],
      body: body.map((row) => row.map(String)),
      foot: opts.foot ? [opts.foot] : undefined,
      margin: { left: margin, right: margin },
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 4, overflow: 'linebreak' },
      headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [240, 239, 236], textColor: 20, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 246] },
      columnStyles: Object.fromEntries(moneyCols.map((c) => [c, { halign: 'right' }])),
      showFoot: 'lastPage',
    });
    y = lastY() + 22;
  };

  // capa
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Relatório de gastos e caixinha', margin, y);
  y += 22;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(`${r.name} · ${r.title} · gerado em ${dateLabel(r.generatedAt)}`, margin, y);
  y += 28;

  heading('Resumo');
  table(
    ['Mês', 'Situação', 'Saldo anterior', 'Fixo', 'Excedentes', 'Resgates', 'Total', 'Aportado', 'Falta'],
    r.months.map((m) => {
      const s = m.statement;
      return [
        monthShort(m.month), m.summary.closed ? 'Fechado' : 'Aberto',
        signedMoney(s?.previous ?? 0), formatMoney(s?.fixed ?? m.summary.fixed), formatMoney(s?.overflow ?? m.summary.overflowTotal),
        formatMoney(s?.resgates ?? 0), signedMoney(s?.total ?? m.summary.totalDue), formatMoney(s?.paid ?? 0), signedMoney(s?.remaining ?? 0),
      ];
    }),
    [2, 3, 4, 5, 6, 7, 8],
    {
      foot: r.months.length > 1
        ? ['Total', '', '', formatMoney(sum(r.months.map((m) => m.statement?.fixed ?? 0))), formatMoney(sum(r.months.map((m) => m.statement?.overflow ?? 0))),
          formatMoney(sum(r.months.map((m) => m.statement?.resgates ?? 0))), '', formatMoney(sum(r.months.map((m) => m.statement?.paid ?? 0))), signedMoney(r.pendingTotal)]
        : undefined,
    },
  );
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.setFont('helvetica', 'normal');
  doc.text('O que falta num mês passa para o seguinte como saldo anterior; cada aporte abate primeiro o mais antigo. Valores negativos = crédito.', margin, y - 12);
  doc.text('Excedentes de meses ainda abertos são previsões: só passam para o mês seguinte quando o mês é fechado.', margin, y);
  y += 12;
  y += 6;

  for (const m of r.months) {
    heading(`Categorias - ${monthLabel(m.month)}`, 11);
    table(
      ['Categoria', 'Gasto', 'Limite', 'Excedente', 'Aporte'],
      m.summary.categories.map((c) => {
        const has = c.contributes !== false;
        return [c.name, formatMoney(c.spent), has ? formatMoney(c.limit) : 'sem limite', has ? formatMoney(Math.max(c.spent - c.limit, 0)) : '-', formatMoney(c.contribution)];
      }),
      [1, 2, 3, 4],
    );
  }

  heading('Lançamentos');
  if (r.transactions.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text('Nenhum lançamento no período.', margin, y); y += 20;
  } else {
    table(
      ['Data', 'Conta em', 'Descrição', 'Categoria', 'Origem', 'Total (dividido)', 'Valor'],
      r.transactions.map((t) => [
        dateLabel(t.date),
        monthShort(t.month),
        t.description + (t.installment ? ` - parcela ${t.installment}` : ''),
        t.category,
        t.source + (t.card ? ` final ${t.card}` : ''),
        t.total !== undefined ? formatMoney(t.total) : '',
        formatMoney(t.amount),
      ]),
      [5, 6],
      { foot: ['Total', '', '', '', '', '', formatMoney(sum(r.transactions.map((t) => t.amount)))] },
    );
  }

  heading('Caixinha');
  table(
    ['Data', 'Movimento', 'Origem', 'Valor'],
    r.movements.length ? r.movements.map((m) => [dateLabel(m.date), m.type, m.source, formatMoney(m.amount)]) : [['-', 'Nenhum movimento no período', '', '']],
    [3],
    { foot: ['Saldo estimado atual', '', '', formatMoney(r.balance)] },
  );

  // numeração das páginas
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`Página ${p} de ${pages}`, doc.internal.pageSize.getWidth() - margin, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
  }
  return doc.output('blob');
}

const sum = (v: number[]) => v.reduce((s, x) => s + x, 0);
