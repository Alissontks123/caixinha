import { monthOf } from '../lib/months';
import { makeDate, parseBRL } from './pdfText';
import type { DocCheck, ItemKind, Line, ParsedDocument, ParsedItem } from './types';

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function isBBExtrato(text: string): boolean {
  const t = plain(text);
  return /Extrato de Conta Corrente/i.test(t) && /Dia\s+Lote\s+Documento\s+Historico\s+Valor/i.test(t);
}

interface RawEntry {
  date: string;
  type: string;
  detail: string;
  /** Com sinal: + entrada, − saída (centavos). */
  signed: number;
}

const VALUE = /^([\d.]+,\d{2})\s*\(([+-])\)$/;

/**
 * Extrato da conta corrente do Banco do Brasil.
 * Cada lançamento ocupa 2 ou 3 linhas: o tipo ("Pix - Enviado") vem na linha de CIMA da data,
 * a linha da data tem lote, documento e valor "50,00 (-)", e a de baixo traz "dd/mm hh:mm NOME".
 * "Saldo do dia", "Saldo Anterior" e "S A L D O" não são lançamentos.
 */
export function parseBBExtrato(pages: Line[][]): ParsedDocument {
  const text = plain(pages.flat().map((l) => l.text).join('\n'));
  const p = text.match(/Periodo:\s*(\d{2})(?:\/(\d{2}))?(?:\/(\d{4}))?\s*a\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (!p) throw new Error('Extrato BB: não encontrei o período.');
  const end = makeDate(Number(p[6]), Number(p[5]), Number(p[4]));
  const start = makeDate(Number(p[3] ?? p[6]), Number(p[2] ?? p[5]), Number(p[1]));
  const holder = pages.flat().map((l) => l.text).find((l) => /^Cliente:/i.test(l))?.replace(/^Cliente:\s*/i, '').trim();

  const entries: RawEntry[] = [];
  let pending: string[] = [];
  let opening: number | undefined;
  let closing: number | undefined;
  const flushDetail = (lines: string[]) => {
    const e = entries[entries.length - 1];
    if (e && lines.length) e.detail = [e.detail, ...lines].filter(Boolean).join(' ');
  };

  outer: for (const lines of pages) {
    let active = false;
    for (const line of lines) {
      const t = plain(line.text);
      if (!active) { if (/^Dia\s+Lote\s+Documento/i.test(t)) active = true; continue; }
      if (/^(Aplicacoes Financeiras|Informacoes Adicionais)/i.test(t)) break outer;
      const first = line.items[0];
      const last = line.items[line.items.length - 1];
      const dm = first.s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const vm = last.s.match(VALUE);
      if (!dm || !vm || line.items.length < 2) { pending.push(line.text.trim()); continue; }
      const signed = (vm[2] === '-' ? -1 : 1) * (parseBRL(vm[1]) ?? 0);
      // texto da linha da data (coluna Histórico), sem lote/documento
      const inline = line.items.slice(1, -1).filter((i) => i.x >= 230).map((i) => i.s).join(' ').trim();
      const ip = plain(inline);
      if (/^(Saldo do dia|Saldo Anterior|S A L D O)$/i.test(ip)) {
        flushDetail(pending);
        pending = [];
        if (/Anterior/i.test(ip)) opening = signed;
        if (/S A L D O/i.test(ip)) closing = signed;
        continue;
      }
      const type = pending.length ? pending.pop()! : inline;
      flushDetail(pending);
      pending = [];
      entries.push({ date: makeDate(Number(dm[3]), Number(dm[2]), Number(dm[1])), type, detail: type === inline ? '' : inline, signed });
    }
  }
  flushDetail(pending);

  const items = entries.map((e) => classify(e, holder));
  const checks: DocCheck[] = [];
  if (closing !== undefined) {
    checks.push({ label: 'Saldo final do período', expected: closing, found: (opening ?? 0) + entries.reduce((s, e) => s + e.signed, 0) });
  }

  return {
    source: 'extrato-bb',
    label: `Extrato Banco do Brasil · ${start.split('-').reverse().join('/')} a ${end.split('-').reverse().join('/')}`,
    holderName: holder,
    periodStart: start,
    periodEnd: end,
    items,
    checks,
  };
}

const upper = (s: string) => plain(s).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const PARTICLES = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E']);
const tokens = (s: string) => upper(s).split(' ').filter((w) => w && !PARTICLES.has(w));

/** O BB corta o nome do favorecido ("Fulana de Tal Sou"): confere palavra por palavra, a última pode estar cortada. */
export function sameHolderName(name: string, holder: string | undefined): boolean {
  if (!holder) return false;
  const n = tokens(name);
  const h = tokens(holder);
  if (n.length < 2 || n.length > h.length) return false;
  return n.every((w, i) => (i === n.length - 1 ? h[i].startsWith(w) : h[i] === w));
}

/** Começo do CNPJ ("43.049.104" ou "51 649 354"): Pix para MEI/empresa. */
const CNPJ_ROOT = /^\d{2}[.\s]\d{3}[.\s]\d{3}\s+/;

const COMPANY = /\b(LTDA?|LT|ME|EPP|EIRELI|S ?A|CIA|COMERCIO|SERVICOS?|FARMACIAS?|DROGARIA|DISTRIBUIDORA|DEPARTAMENTO|TECNOLOGIA|SUPERMERCADOS?|MERCADO|LOJAS?|RESTAURANTE|POSTO|CAMPUS|UNIVERSIDADE|FACULDADE|ESCOLA|COLEGIO|INSTITUTO|ASSOCIACAO|CONDOMINIO|CLINICA|HOSPITAL|LABORATORIO|PADARIA|PANIFICADORA|IMOBILIARIA|PREFEITURA|SECRETARIA|BANCO|PAGAMENTOS|OPERADOR|ADMINISTRADORA|SEGUROS?|TELECOM|ENERGIA|SANEAMENTO|ACADEMIA|PUC|HOLDING|UNIBANCO|EDITORA|CONSULTORIA|ENGENHARIA|TRANSPORTES?|INDUSTRIA|ALIMENTOS)\b/;

/** Pix sem CPF/CNPJ: adivinha empresa pelo nome (termos de empresa, CNPJ no começo ou uma palavra só). */
export function looksLikeCompany(rawName: string): boolean {
  if (CNPJ_ROOT.test(rawName.trim())) return true;
  const u = upper(rawName);
  return COMPANY.test(u) || u.split(' ').length === 1;
}

const CARD_BILL = /\b(ITAU|UNIBANCO|NU PAGAMENTOS|NUBANK|BANCO C6|C6 BANK)\b/;

function classify(e: RawEntry, holder: string | undefined): ParsedItem {
  // "03/10 12:03 Nome" → "Nome" (e tira CPF/CNPJ em números do começo)
  const rawName = e.detail.replace(/^\d{2}\/\d{2}\s+\d{2}:\d{2}\s+/, '').replace(/^\d{11,14}\s+/, '').trim();
  const name = rawName.replace(CNPJ_ROOT, '').trim();
  const type = plain(e.type);
  const amount = Math.abs(e.signed);
  const base = { date: e.date, month: monthOf(e.date), amount };
  const item = (kind: ItemKind, description: string, matchText: string, extra: Partial<ParsedItem> = {}): ParsedItem =>
    ({ ...base, kind, description, matchText, ...extra });
  const label = name ? `${e.type} · ${name}` : e.type;
  const ignore = (reason: string) => item('ignorado', label, name || e.type, { ignoreReason: reason });

  if (/Rende F[aá]cil/i.test(e.type)) return ignore('Aplicação/resgate automático (BB Rende Fácil)');
  if (/poupanca/i.test(type)) return ignore('Poupança (investimento, não é gasto)');
  if (e.signed > 0) {
    if (/estorno|devolu/i.test(type)) return item('estorno', label, name || e.type, { amount: -amount });
    return ignore('Entrada de dinheiro (não é gasto)');
  }
  if (/tarifa|cesta de servicos|pacote de servicos/i.test(type)) return ignore('Tarifa bancária');
  const own = sameHolderName(name, holder);
  const cardBill = CARD_BILL.test(upper(name));
  if (/^(Pix - Enviado|Transferencia enviada|TED|DOC|Transferencia)/i.test(type)) {
    if (own) return ignore('Transferência para conta própria');
    if (cardBill) return ignore('Pagamento de fatura de cartão (as compras vêm da fatura)');
    return looksLikeCompany(rawName) ? item('pix_empresa', `Pix para ${name}`, name) : item('pix_pessoa', `Pix para ${name}`, name);
  }
  if (/Pagamento de Boleto/i.test(type)) {
    if (cardBill) return ignore('Pagamento de fatura de cartão (as compras vêm da fatura)');
    return item('boleto', `Boleto ${name}`, name || e.type);
  }
  if (/Debito Automatico/i.test(type)) return item('debito_automatico', `Débito automático ${name}`, name || e.type);
  if (/(Compra com Cartao|Compra no Debito|Pagto Cartao|Debito)/i.test(type)) return item('debito', label, name || e.type);
  return item('outro', label, name || e.type);
}
