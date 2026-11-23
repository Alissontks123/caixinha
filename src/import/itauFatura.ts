import { addMonths, monthOf } from '../lib/months';
import { inferDate, makeDate, parseBRL } from './pdfText';
import type { DocCheck, Line, ParsedDocument, ParsedItem, TextPiece } from './types';

/** O PDF do Itaú quebra as palavras nas letras acentuadas ("Lan ç amentos"): junta de novo para comparar. */
export const squash = (s: string) => s.replace(/\s*([À-ÿ])\s*/g, '$1');
const plain = (s: string) => squash(s).normalize('NFD').replace(/[̀-ͯ]/g, '');

export function isItauFatura(text: string): boolean {
  const t = plain(text);
  return /Itau/i.test(t) && /Lancamentos: compras e saques/i.test(t) && /Total desta fatura/i.test(t);
}

/** Coluna da direita começa depois deste x (a fatura tem duas colunas por página). */
const SPLIT_X = 340;

type Section = 'pagamentos' | 'compras' | 'servicos' | 'outro';

/**
 * Fatura do cartão Itaú.
 * - Páginas em duas colunas: lê a coluna da esquerda inteira e depois a da direita.
 * - Cada compra: "dd/mm ESTABELECIMENTO [nn/tt] valor"; a linha de baixo (categoria e cidade) é ignorada.
 * - Parcelas mostram a data da compra ORIGINAL: o mês da parcela n é (data + n−1 meses), como na C6.
 * - "Compras parceladas - próximas faturas" e os quadros de encargos/limites não são lançamentos.
 */
export function parseItauFatura(pages: Line[][]): ParsedDocument {
  const allText = pages.flat().map((l) => l.text).join('\n');
  const text = plain(allText);

  const closingMatch = text.match(/Emissao:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (!closingMatch) throw new Error('Fatura Itaú: não encontrei a data de emissão.');
  const closing = makeDate(Number(closingMatch[3]), Number(closingMatch[2]), Number(closingMatch[1]));
  const last4 = text.match(/Cartao\s+\d{4}\.X{4}\.X{4}\.(\d{4})/i)?.[1] ?? '0000';
  const holder = allText.split('\n').map(squash).find((l) => /^Titular\s/i.test(l))?.replace(/^Titular\s+/i, '').trim() ?? '';
  const card = { last4, holder };

  // linhas de cada coluna, na ordem de leitura
  const stream: TextPiece[][] = [];
  for (const lines of pages) {
    const left: TextPiece[][] = [];
    const right: TextPiece[][] = [];
    for (const l of lines) {
      const a = l.items.filter((i) => i.x < SPLIT_X);
      const b = l.items.filter((i) => i.x >= SPLIT_X);
      if (a.length) left.push(a);
      if (b.length) right.push(b);
    }
    stream.push(...left, ...right);
  }

  const items: ParsedItem[] = [];
  const subtotals: { label: string; section: Section; value: number }[] = [];
  let totalAtual: number | undefined;
  let section: Section | undefined;

  for (const pieces of stream) {
    const t = plain(pieces.map((p) => p.s).join(' '));
    if (/^Pagamentos efetuados/i.test(t)) { section = 'pagamentos'; continue; }
    if (/^Lancamentos: compras e saques/i.test(t)) { section = 'compras'; continue; }
    if (/^Lancamentos: produtos e servicos/i.test(t)) { section = 'servicos'; continue; }
    if (/^(Compras parceladas|Encargos cobrados|Limites de credito|Novo teto|Credito Rotativo|Simulacao|Fique atento|Previsao)/i.test(t)) { section = 'outro'; continue; }
    const tot = t.match(/^(Lancamentos no cartao.*?|Lancamentos produtos e servicos)\s+(-?[\d.]+,\d{2})$/i);
    if (tot && section) {
      subtotals.push({ label: /servicos/i.test(tot[1]) ? 'Produtos e serviços' : 'Compras do cartão', section, value: parseBRL(tot[2]) ?? 0 });
      continue;
    }
    const total = t.match(/Total dos lancamentos atuais\s+(-?[\d.]+,\d{2})$/i);
    if (total) { totalAtual = parseBRL(total[1]) ?? undefined; section = 'outro'; continue; }
    if (!section || section === 'outro' || pieces.length < 3) continue;

    const dm = pieces[0].s.match(/^(\d{2})\/(\d{2})$/);
    const amount = parseBRL(pieces[pieces.length - 1].s);
    if (!dm || amount === null) continue;
    const raw = pieces.slice(1, -1).map((p) => p.s).join(' ').replace(/\s+/g, ' ').trim();
    const im = raw.match(/^(.*\S)\s+(\d{2})\/(\d{2})$/);
    const installment = im ? { n: Number(im[2]), total: Number(im[3]) } : undefined;
    const description = im ? im[1] : raw;
    const date = inferDate(Number(dm[1]), Number(dm[2]), closing);
    const month = installment ? addMonths(monthOf(date), installment.n - 1) : monthOf(date);
    const common = { date, month, card: { ...card }, installment, description, matchText: description };

    if (section === 'pagamentos') {
      items.push({ ...common, amount: Math.abs(amount), kind: 'ignorado', ignoreReason: 'Pagamento de fatura' });
    } else if (section === 'servicos') {
      // mensalidade/anuidade do cartão: não conta como gasto
      items.push({ ...common, amount, kind: 'ignorado', ignoreReason: 'Tarifa do cartão (anuidade/mensalidade)' });
    } else if (amount < 0) {
      items.push({ ...common, amount, kind: 'estorno' });
    } else {
      items.push({ ...common, amount, kind: 'compra' });
    }
  }

  const sumOf = (s: Section) => items.filter((i) => sectionOf(i) === s).reduce((a, i) => a + i.amount, 0);
  const checks: DocCheck[] = [];
  for (const st of subtotals) checks.push({ label: st.label, expected: st.value, found: sumOf(st.section) });
  if (totalAtual !== undefined) checks.push({ label: 'Total da fatura', expected: totalAtual, found: sumOf('compras') + sumOf('servicos') });

  return {
    source: 'fatura-itau',
    label: `Fatura Itaú · fechamento ${closing.split('-').reverse().join('/')}`,
    holderName: holder || undefined,
    periodEnd: closing,
    items,
    checks,
  };
}

function sectionOf(i: ParsedItem): Section {
  if (i.kind === 'ignorado') return /Pagamento/.test(i.ignoreReason ?? '') ? 'pagamentos' : 'servicos';
  return 'compras';
}
