import { strToU8, zipSync } from 'fflate';
import { dateLabel, monthShort } from '../lib/months';
import type { Report } from './report';

/**
 * Gerador mínimo de planilha .xlsx (formato Office Open XML), sem dependências pesadas.
 * Valores em reais são gravados como número com formato de moeda, para dar para somar no Excel.
 */
type Cell = string | number | null | undefined;
type ColType = 'text' | 'money';

export interface Sheet {
  name: string;
  columns: { header: string; width: number; type?: ColType }[];
  rows: Cell[][];
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // remove caracteres de controle que o Excel recusa
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const colLetter = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : colLetter(Math.floor(i / 26) - 1) + colLetter(i % 26));

function sheetXml(sheet: Sheet): string {
  const cols = sheet.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`).join('');
  const header = `<row r="1">${sheet.columns.map((c, i) => `<c r="${colLetter(i)}1" t="inlineStr" s="2"><is><t>${esc(c.header)}</t></is></c>`).join('')}</row>`;
  const body = sheet.rows.map((row, r) => {
    const rn = r + 2;
    const cells = row.map((v, i) => {
      const ref = `${colLetter(i)}${rn}`;
      if (v === null || v === undefined || v === '') return '';
      if (typeof v === 'number') return `<c r="${ref}"${sheet.columns[i]?.type === 'money' ? ' s="1"' : ''}><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join('');
    return `<row r="${rn}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${header}${body}</sheetData></worksheet>`;
}

export function writeXlsx(sheets: Sheet[]): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00;[Red]-&quot;R$&quot; #,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0"/><xf numFmtId="164" fontId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" applyFont="1"/></cellXfs></styleSheet>`),
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s)); });
  return zipSync(files, { level: 6 });
}

const reais = (cents: number) => Math.round(cents) / 100;

export function reportToXlsx(r: Report): Uint8Array {
  return writeXlsx([
    {
      name: 'Resumo',
      columns: [
        { header: 'Mês', width: 12 }, { header: 'Situação', width: 10 },
        { header: 'Aporte fixo', width: 14, type: 'money' }, { header: 'Estouros', width: 14, type: 'money' },
        { header: 'Total devido', width: 14, type: 'money' }, { header: 'Pago', width: 14, type: 'money' },
        { header: 'Pendente', width: 14, type: 'money' },
      ],
      rows: r.months.map((m) => [
        monthShort(m.month), m.summary.closed ? 'Fechado' : 'Aberto',
        reais(m.summary.fixed), reais(m.summary.overflowTotal), reais(m.summary.totalDue),
        reais(m.ledger?.paid ?? 0), reais(m.ledger?.pending ?? 0),
      ]),
    },
    {
      name: 'Categorias',
      columns: [
        { header: 'Mês', width: 10 }, { header: 'Categoria', width: 24 }, { header: 'Gera aporte', width: 12 },
        { header: 'Gasto', width: 14, type: 'money' }, { header: 'Limite', width: 14, type: 'money' },
        { header: 'Excedente', width: 14, type: 'money' }, { header: 'Aporte', width: 14, type: 'money' },
      ],
      rows: r.months.flatMap((m) => m.summary.categories.map((c) => {
        const has = c.contributes !== false;
        return [monthShort(m.month), c.name, has ? 'Sim' : 'Não', reais(c.spent), has ? reais(c.limit) : null, has ? reais(Math.max(c.spent - c.limit, 0)) : null, reais(c.contribution)];
      })),
    },
    {
      name: 'Lançamentos',
      columns: [
        { header: 'Data', width: 12 }, { header: 'Mês', width: 10 }, { header: 'Descrição', width: 36 },
        { header: 'Categoria', width: 22 }, { header: 'Valor', width: 14, type: 'money' },
        { header: 'Total (dividido)', width: 16, type: 'money' },
        { header: 'Origem', width: 16 }, { header: 'Parcela', width: 9 }, { header: 'Cartão', width: 9 },
      ],
      rows: r.transactions.map((t) => [
        dateLabel(t.date), monthShort(t.month), t.description, t.category, reais(t.amount),
        t.total !== undefined ? reais(t.total) : undefined, t.source, t.installment, t.card,
      ]),
    },
    {
      name: 'Caixinha',
      columns: [{ header: 'Data', width: 12 }, { header: 'Movimento', width: 18 }, { header: 'Valor', width: 14, type: 'money' }, { header: 'Origem', width: 16 }],
      rows: [
        ...r.movements.map((m) => [dateLabel(m.date), m.type, reais(m.amount), m.source] as Cell[]),
        [],
        ['Saldo estimado atual', null, reais(r.balance), null],
      ],
    },
  ]);
}
