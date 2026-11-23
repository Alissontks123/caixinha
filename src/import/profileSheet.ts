/**
 * Perfil de compra: planilha (Data, Descrição, Valor, Categoria) que a pessoa preenche com a ajuda de uma IA
 * a partir das próprias faturas e extratos. O app lê e aprende "estabelecimento → categoria" (não cria lançamentos).
 */
import { strFromU8, unzipSync } from 'fflate';
import { matchKeyOf, normalizeText } from '../domain/categorize';
import type { Category, LearnedRule } from '../domain/types';
import { parseBRL } from './pdfText';

export const PROFILE_SHEET = 'Perfil';
export const PROFILE_HEADERS = ['Data', 'Descrição', 'Valor', 'Categoria'] as const;
/** Linhas de exemplo do modelo: são puladas na leitura. */
export const PROFILE_EXAMPLES = ['EXEMPLO SUPERMERCADO CENTRAL', 'EXEMPLO POSTO DE COMBUSTIVEL'];

export type Table = string[][];

const decode = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');
const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.match(/^[A-Z]+/)?.[0] ?? 'A') n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

const BAD_FILE = 'Não consegui ler esta planilha. Envie o arquivo .xlsx (ou .csv) com as colunas Data, Descrição, Valor e Categoria.';

/** Lê a aba "Perfil" (ou a primeira) de um .xlsx. */
export function readXlsx(bytes: Uint8Array): Table {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(bytes); } catch { throw new Error(BAD_FILE); }
  const get = (p: string) => (files[p] ? strFromU8(files[p]) : undefined);
  const wb = get('xl/workbook.xml');
  if (!wb) throw new Error(BAD_FILE);
  const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({ name: decode(attr(m[0], 'name') ?? ''), rid: attr(m[0], 'r:id') ?? '' }));
  const pick = sheets.find((s) => normalizeText(s.name) === normalizeText(PROFILE_SHEET)) ?? sheets[0];
  if (!pick) throw new Error(BAD_FILE);
  const rel = [...(get('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => attr(t, 'Id') === pick.rid);
  const target = rel && attr(rel, 'Target');
  const sheet = target && get(target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`);
  if (!sheet) throw new Error(BAD_FILE);
  const shared = [...(get('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));

  const table: Table = [];
  let rowN = 0;
  for (const row of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    rowN = Number(attr(row[1], 'r') ?? rowN + 1);
    const cells: string[] = [];
    let col = -1;
    for (const c of (row[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[1], 'r');
      col = ref ? colIndex(ref) : col + 1;
      const t = attr(c[1], 't');
      const body = c[2] ?? '';
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = '';
      if (t === 's') value = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') value = texts(body);
      else if (v !== undefined) value = decode(v);
      cells[col] = value.trim();
    }
    table[rowN - 1] = Array.from(cells, (x) => x ?? '');
  }
  return Array.from(table, (r) => r ?? []);
}

/** Lê um .csv (separado por ; , ou tabulação). */
export function readCsv(text: string): Table {
  const src = text.replace(/^﻿/, '');
  const first = src.split(/\r?\n/)[0] ?? '';
  const delim = [';', ',', '\t'].map((d) => ({ d, n: first.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
  const rows: Table = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell.trim()); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows;
}

export function readProfileFile(name: string, bytes: Uint8Array): Table {
  if (/\.(csv|txt)$/i.test(name)) return readCsv(new TextDecoder().decode(bytes));
  return readXlsx(bytes);
}

export interface ProfileRow { line: number; date: string; description: string; amount?: number; category: string }

/** Data do Excel (número de dias desde 1899-12-30) ou texto. */
function dateLabel(v: string): string {
  if (/^\d{4,6}(\.\d+)?$/.test(v)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(v)) * 86_400_000);
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  }
  return v;
}
function amountOf(v: string): number | undefined {
  if (!v) return undefined;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Math.round(Math.abs(Number(v)) * 100);
  const c = parseBRL(v.replace(/^-\s*/, ''));
  return c === null ? undefined : Math.abs(c);
}

/** Acha a linha de títulos (Descrição e Categoria) e lê as linhas preenchidas. */
export function parseProfileRows(table: Table): ProfileRow[] {
  const norm = (s: string) => normalizeText(s ?? '');
  const hi = table.slice(0, 15).findIndex((r) => r.some((c) => /^DESCRI/.test(norm(c))) && r.some((c) => /^CATEGORIA/.test(norm(c))));
  if (hi < 0) throw new Error('A planilha precisa ter as colunas "Descrição" e "Categoria" (use o modelo baixado do app).');
  const h = table[hi].map(norm);
  const col = (re: RegExp) => h.findIndex((c) => re.test(c));
  const [cd, cs, cv, cc] = [col(/^DATA/), col(/^DESCRI/), col(/^VALOR/), col(/^CATEGORIA/)];
  const examples = new Set(PROFILE_EXAMPLES.map(norm));
  const rows: ProfileRow[] = [];
  table.slice(hi + 1).forEach((r, i) => {
    const description = (r[cs] ?? '').trim();
    if (!description || examples.has(norm(description))) return;
    rows.push({
      line: hi + i + 2,
      date: cd >= 0 ? dateLabel(r[cd] ?? '') : '',
      description,
      amount: cv >= 0 ? amountOf(r[cv] ?? '') : undefined,
      category: (r[cc] ?? '').trim(),
    });
  });
  return rows;
}

export interface PlanEntry {
  key: string;
  /** Descrição mais comum (mostrada e guardada como exemplo). */
  example: string;
  categoryName: string;
  /** null = categoria que não existe no app (a pessoa escolhe na revisão). */
  categoryId: string | null;
  count: number;
  total: number;
  /** Outras categorias que a planilha deu para o mesmo estabelecimento. */
  others: string[];
  /** Categoria que o app já tinha memorizado (se for diferente). */
  previous?: string;
}

export interface ProfilePlan { entries: PlanEntry[]; rows: number; noCategory: number }

/** Categorias que podem receber um estabelecimento (todas menos "A identificar"). */
export const learnableCategories = (cats: Category[]) => cats.filter((c) => c.kind !== 'unidentified');

export function findCategory(name: string, cats: Category[]): Category | undefined {
  const k = normalizeText(name).replace(/[^A-Z0-9]/g, '');
  return k ? learnableCategories(cats).find((c) => normalizeText(c.name).replace(/[^A-Z0-9]/g, '') === k) : undefined;
}

/** Agrupa por estabelecimento e escolhe a categoria mais usada para ele. */
export function buildProfilePlan(rows: ProfileRow[], cats: Category[], rules: LearnedRule[]): ProfilePlan {
  const groups = new Map<string, ProfileRow[]>();
  let noCategory = 0;
  for (const r of rows) {
    if (!r.category) { noCategory++; continue; }
    const key = matchKeyOf(r.description);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const ruleOf = new Map(rules.map((r) => [r.key, r.categoryId]));
  const entries: PlanEntry[] = [];
  for (const [key, list] of groups) {
    const votes = new Map<string, { name: string; n: number }>();
    for (const r of list) {
      const k = normalizeText(r.category);
      votes.set(k, { name: votes.get(k)?.name ?? r.category, n: (votes.get(k)?.n ?? 0) + 1 });
    }
    const ranked = [...votes.values()].sort((a, b) => b.n - a.n);
    const cat = findCategory(ranked[0].name, cats);
    const descs = new Map<string, number>();
    for (const r of list) descs.set(r.description, (descs.get(r.description) ?? 0) + 1);
    const prev = ruleOf.get(key);
    entries.push({
      key,
      example: [...descs].sort((a, b) => b[1] - a[1])[0][0],
      categoryName: cat?.name ?? ranked[0].name,
      categoryId: cat?.id ?? null,
      count: list.length,
      total: list.reduce((s, r) => s + (r.amount ?? 0), 0),
      others: ranked.slice(1).map((x) => x.name),
      previous: prev && prev !== cat?.id ? prev : undefined,
    });
  }
  entries.sort((a, b) => (a.categoryId === null ? 0 : 1) - (b.categoryId === null ? 0 : 1) || b.count - a.count || a.example.localeCompare(b.example));
  return { entries, rows: rows.length, noCategory };
}

/** Texto da aba "Instruções" do modelo (para a pessoa ou a IA dela). */
export function profileInstructions(categoryNames: string[]): string[] {
  return [
    'Como preencher (pode pedir para a sua IA fazer isso, anexando seus PDFs de faturas e extratos):',
    '1. Na aba "Perfil", coloque UMA LINHA PARA CADA LANÇAMENTO das faturas e extratos: Data, Descrição, Valor e Categoria.',
    '2. Descrição: copie o nome EXATAMENTE como aparece no documento (estabelecimento ou nome de quem recebeu o Pix). É assim que o app reconhece depois.',
    '3. Valor: só o número (ex.: 120,50). Data: dd/mm/aaaa.',
    `4. Categoria: use SOMENTE um destes nomes (estão também na aba "Categorias"): ${categoryNames.join(', ')}.`,
    '5. Pagamento de fatura, transferência entre contas suas, investimentos e dinheiro recebido: use "Não é gasto" ou deixe a linha de fora.',
    '6. Se não souber a categoria, deixe em branco (a linha é pulada). Não crie categorias novas e não mude os títulos das colunas.',
    '7. Apague as duas linhas de EXEMPLO (se ficarem, o app ignora).',
    '8. Salve como .xlsx (ou .csv) e envie em Ajustes › Perfil de compra › Importar perfil de compra.',
    'O app não cria lançamentos com esta planilha: ele só aprende de qual categoria é cada estabelecimento, para classificar sozinho nas próximas importações (e já corrige o que estiver "A identificar").',
  ];
}
