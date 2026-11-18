import type { Cents, ISODate } from '../domain/types';
import { PdfPasswordError, type Line, type TextPiece } from './types';

interface RawItem extends TextPiece {
  y: number;
}

/** Agrupa os pedaços de texto em linhas (mesma altura, tolerância de 2,5pt). */
export function groupLines(raw: RawItem[]): Line[] {
  const sorted = raw.filter((r) => r.s.trim()).sort((a, b) => b.y - a.y);
  const lines: { y: number; items: TextPiece[] }[] = [];
  for (const r of sorted) {
    const line = lines.find((l) => Math.abs(l.y - r.y) <= 2.5);
    if (line) line.items.push({ x: r.x, s: r.s.trim() });
    else lines.push({ y: r.y, items: [{ x: r.x, s: r.s.trim() }] });
  }
  return lines.map((l) => {
    const items = l.items.sort((a, b) => a.x - b.x);
    return { y: l.y, items, text: items.map((i) => i.s).join(' ') };
  });
}

// Tipagem mínima do pdf.js (para funcionar tanto no navegador quanto nos testes)
interface PdfJsLike {
  getDocument(src: { data: Uint8Array; password?: string; isEvalSupported?: boolean }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{
        getTextContent(): Promise<{ items: unknown[] }>;
      }>;
      destroy(): Promise<void>;
    }>;
  };
}

/** Lê o PDF e devolve as linhas de cada página. */
export async function extractPages(pdfjs: PdfJsLike, data: Uint8Array, password?: string): Promise<Line[][]> {
  let doc;
  try {
    // cópia: o pdf.js transfere o buffer para o worker, e precisamos dele para tentar de novo com senha
    doc = await pdfjs.getDocument({ data: data.slice(), password, isEvalSupported: false }).promise;
  } catch (e) {
    const err = e as { name?: string; code?: number };
    if (err?.name === 'PasswordException') throw new PdfPasswordError(err.code === 2);
    throw e;
  }
  const pages: Line[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const raw: RawItem[] = [];
    for (const it of content.items as { str?: string; transform?: number[] }[]) {
      if (typeof it.str !== 'string' || !it.transform) continue;
      raw.push({ x: Math.round(it.transform[4]), y: it.transform[5], s: it.str });
    }
    pages.push(groupLines(raw));
  }
  await doc.destroy();
  return pages;
}

/** Converte valores como "1.234,56", "R$ 98,00", "−R$ 3,72", "- 5.000,00", "(-) 98,00". */
export function parseBRL(input: string): Cents | null {
  const t = input.replace(/R\$/g, '').replace(/\(-\)/g, '-').replace(/−/g, '-').replace(/\s/g, '');
  const m = t.match(/^([+-]?)(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})$/);
  if (!m) return null;
  const v = Number(m[2].replace(/\./g, '')) * 100 + Number(m[3]);
  return m[1] === '-' ? -v : v;
}

const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};
const FULL_MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');
const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function monthNumber(name: string): number | undefined {
  const k = stripAccents(name.toLowerCase());
  return MONTHS[k.slice(0, 3)] ?? FULL_MONTHS[k];
}

export function makeDate(year: number, month: number, day: number): ISODate {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Datas sem ano (ex.: "28 out"): usa o ano da data de referência (fechamento);
 * se cair depois dela, é do ano anterior.
 */
export function inferDate(day: number, month: number, reference: ISODate): ISODate {
  const year = Number(reference.slice(0, 4));
  const candidate = makeDate(year, month, day);
  return candidate > reference ? makeDate(year - 1, month, day) : candidate;
}

/** Extrai "- Parcela 5/12" de uma descrição. */
export function splitInstallment(desc: string): { base: string; installment?: { n: number; total: number } } {
  const m = desc.match(/\s*-?\s*Parcela\s+(\d+)\s*\/\s*(\d+)/i);
  if (!m) return { base: desc.trim() };
  return { base: desc.replace(m[0], '').trim(), installment: { n: Number(m[1]), total: Number(m[2]) } };
}
