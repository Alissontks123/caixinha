import { matchKeyOf, normalizeText, suggestCategory } from '../domain/categorize';
import { installmentNumber, proportionalShare, sameInstallmentPurchase } from '../domain/share';
import { findSimilar } from '../domain/duplicates';
import type { AllocationPart, CaixinhaMovement, Category, ISODate, KnownCard, Month, Share, Transaction } from '../domain/types';
import { proportionalAllocation } from '../domain/allocation';
import type { ParsedDocument, ParsedItem } from './types';

export type ReviewStatus =
  | 'new'
  /** Aplicação/resgate da caixinha a registrar (o usuário pode desmarcar). */
  | 'caixinha'
  /** Movimento da caixinha anterior ao saldo inicial (já está dentro dele). */
  | 'before-start'
  | 'duplicate'
  | 'closed-month'
  | 'ignored'
  | 'not-mine';

export const isCaixinhaKind = (k: ParsedItem['kind']) => k === 'caixinha_aplicacao' || k === 'caixinha_resgate';

export interface ReviewItem {
  index: number;
  item: ParsedItem;
  status: ReviewStatus;
  /** Categoria sugerida ('' = o usuário precisa escolher). */
  categoryId: string;
  /** De onde veio a sugestão, para mostrar ao usuário. */
  reason?: string;
  /** Este item segue a categoria de outro item do mesmo documento (estorno, IOF). */
  linkTo?: number;
  learnable: boolean;
  matchKey: string;
  fingerprint: string;
  /** true quando a sugestão veio de uma regra memorizada. */
  fromLearned?: boolean;
  /** Movimento manual da caixinha (mesma data, tipo e valor) que será substituído por este. */
  replacesManualId?: string;
  /** Divisão herdada (parcela seguinte de uma compra dividida, ou estorno de uma compra dividida). */
  share?: Share;
  /** Rateio entre categorias herdado (estorno de compra rateada, parcela de compra rateada). */
  allocation?: AllocationPart[];
  /** Compra parcelada vista pela primeira vez: perguntar "parcela por mês" ou "à vista". */
  askInstallment?: boolean;
  /** Parcela de uma compra já considerada à vista: entra desconsiderada. */
  avista?: 'skip';
  /** Repetido: id do lançamento que já existe no app (mesmo item do PDF, ou parecido com um já lançado). */
  duplicateOf?: string;
  /** true quando o repetido é só parecido (nome, valor e data próximos), não o mesmo item do PDF. */
  similar?: boolean;
  /** Decisão do usuário na análise de repetidos. */
  duplicateChoice?: 'existing' | 'new' | 'both';
}

export interface PrepareContext {
  categories: Category[];
  learned: Map<string, string>;
  existingFingerprints: Set<string>;
  closedMonths: Set<Month>;
  cards: KnownCard[];
  transactions: Transaction[];
  /** Movimentos da caixinha já registrados (inclusive os desconsiderados). */
  movements?: CaixinhaMovement[];
  caixinhaStartDate?: ISODate;
}

export const bankOf = (source: ParsedDocument['source']): KnownCard['bank'] => (source === 'fatura-c6' ? 'c6' : 'nubank');
export const cardId = (bank: KnownCard['bank'], last4: string) => `${bank}:${last4}`;

/** Cartões que aparecem no documento (para perguntar quais são do usuário). */
export function cardsInDocument(doc: ParsedDocument): Omit<KnownCard, 'mine'>[] {
  const bank = bankOf(doc.source);
  const map = new Map<string, Omit<KnownCard, 'mine'>>();
  for (const it of doc.items) {
    if (!it.card) continue;
    const id = cardId(bank, it.card.last4);
    if (!map.has(id)) map.set(id, { id, bank, last4: it.card.last4, holder: it.card.holder });
  }
  return [...map.values()];
}

export function fingerprintsOf(doc: ParsedDocument): string[] {
  const seen = new Map<string, number>();
  return doc.items.map((it) => {
    const base = [doc.source, it.date, it.month, it.amount, matchKeyOf(it.description), it.card?.last4 ?? '',
      it.installment ? `${it.installment.n}/${it.installment.total}` : ''].join('|');
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}#${n}`;
  });
}

const findCategoryByName = (categories: Category[], name: string) =>
  categories.find((c) => normalizeText(c.name) === normalizeText(name));

export function prepareReview(doc: ParsedDocument, ctx: PrepareContext): ReviewItem[] {
  const bank = bankOf(doc.source);
  const cardMine = new Map(ctx.cards.map((c) => [c.id, c.mine]));
  const prints = fingerprintsOf(doc);
  const validIds = new Set(ctx.categories.map((c) => c.id));

  const movements = ctx.movements ?? [];
  const movementPrints = new Set(movements.map((m) => m.fingerprint).filter(Boolean));
  const usedManual = new Set<string>();

  const review: ReviewItem[] = doc.items.map((item, index) => {
    let status: ReviewStatus = 'new';
    if (isCaixinhaKind(item.kind)) {
      const r: ReviewItem = { index, item, status: 'caixinha', categoryId: '', learnable: false, matchKey: '', fingerprint: prints[index] };
      if (movementPrints.has(prints[index])) r.status = 'duplicate';
      else if (ctx.caixinhaStartDate && item.date <= ctx.caixinhaStartDate) r.status = 'before-start';
      else {
        const type = item.kind === 'caixinha_aplicacao' ? 'aplicacao' : 'resgate';
        const manual = movements.find(
          (m) => m.source === 'manual' && !m.deleted && m.type === type && m.date === item.date && m.amount === item.amount && !usedManual.has(m.id),
        );
        if (manual) { r.replacesManualId = manual.id; usedManual.add(manual.id); r.reason = 'Substitui o registro feito à mão'; }
      }
      return r;
    }
    if (item.kind === 'ignorado') status = 'ignored';
    else if (item.card && cardMine.get(cardId(bank, item.card.last4)) === false) status = 'not-mine';
    else if (ctx.existingFingerprints.has(prints[index])) status = 'duplicate';
    else if (ctx.closedMonths.has(item.month)) status = 'closed-month';
    const r: ReviewItem = { index, item, status, categoryId: '', learnable: false, matchKey: matchKeyOf(item.matchText), fingerprint: prints[index] };
    if (status === 'duplicate') {
      const same = ctx.transactions.find((t) => t.fingerprint === prints[index]);
      if (same) { r.duplicateOf = same.id; r.categoryId = same.categoryId; }
    }
    return r;
  });

  const active = review.filter((r) => r.status === 'new');
  for (const r of active) {
    const it = r.item;

    if (it.kind === 'iof') {
      const target = active.find((o) => o.item.kind === 'compra' && normalizeText(o.item.description) === normalizeText(it.iofOf ?? ''));
      if (target) { r.linkTo = target.index; r.reason = `IOF de "${target.item.description}"`; continue; }
    }

    if (it.kind === 'estorno') {
      const amount = -it.amount;
      const candidates = active.filter(
        (o) => o.item.amount === amount && o.item.kind !== 'estorno' && o.item.date <= it.date && o.linkTo === undefined,
      );
      const target = candidates.find((o) => o.item.card?.last4 === it.card?.last4) ?? candidates[candidates.length - 1];
      if (target) { r.linkTo = target.index; r.reason = `Estorno de "${target.item.description}"`; continue; }
      const previous = ctx.transactions
        .filter((t) => t.amount === amount && t.date <= it.date)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      if (previous && validIds.has(previous.categoryId)) {
        r.categoryId = previous.categoryId;
        r.reason = `Estorno de "${previous.description}" (${previous.date.split('-').reverse().join('/')})`;
      }
      if (previous?.share) {
        r.share = proportionalShare(previous);
        r.reason = [r.reason, 'dividido na mesma proporção da compra'].filter(Boolean).join(' · ');
      }
      const alloc = previous && proportionalAllocation(previous);
      if (alloc) {
        r.allocation = alloc;
        r.categoryId = alloc[0].categoryId;
        r.reason = [r.reason, 'rateado na mesma proporção da compra'].filter(Boolean).join(' · ');
      }
      continue;
    }

    if (it.kind === 'pix_pessoa') continue; // Pix para pessoa: sempre pergunta (sem aviso na tela)
    if (!it.matchText.trim()) continue;

    const s = suggestCategory(it.matchText, ctx.learned);
    if (s.type === 'learned' && validIds.has(s.categoryId)) {
      r.categoryId = s.categoryId;
      r.reason = 'Memorizado';
      r.fromLearned = true;
      r.learnable = true;
    } else if (s.type === 'base') {
      const cat = findCategoryByName(ctx.categories, s.categoryName);
      if (cat) { r.categoryId = cat.id; r.reason = 'Reconhecido automaticamente'; }
      r.learnable = true;
    } else if (s.type === 'ask') {
      r.learnable = s.learnable;
    } else {
      r.learnable = true;
    }
  }

  // repetidos: parecido com um lançamento que já existe (nome parecido, mesmo valor, até 3 dias)
  const used = new Set(review.map((r) => r.duplicateOf).filter((x): x is string => !!x));
  for (const r of active) {
    if (r.item.kind === 'iof') continue;
    const twin = findSimilar({ description: r.item.matchText || r.item.description, amount: r.item.amount, date: r.item.date }, ctx.transactions, used)
      ?? findSimilar({ description: r.item.description, amount: r.item.amount, date: r.item.date }, ctx.transactions, used);
    if (!twin) continue;
    used.add(twin.id);
    r.status = 'duplicate';
    r.duplicateOf = twin.id;
    r.similar = true;
  }

  // parcelas seguintes de uma compra que o usuário dividiu entram com a mesma divisão
  for (const r of active) {
    const inst = r.item.installment;
    if (!inst || r.item.kind === 'estorno') continue;
    const me = { matchKey: r.matchKey, amount: r.item.amount, cardLast4: r.item.card?.last4, installment: `${inst.n}/${inst.total}`, source: doc.source };
    const previous = ctx.transactions
      .filter((t) => t.share && installmentNumber(t.installment) < inst.n && sameInstallmentPurchase(me, t))
      .sort((a, b) => installmentNumber(b.installment) - installmentNumber(a.installment))[0];
    if (previous) {
      r.share = previous.share;
      r.reason = [r.reason, `dividido como a parcela ${previous.installment}`].filter(Boolean).join(' · ');
    }
    const allocated = ctx.transactions
      .filter((t) => (t.allocation?.length ?? 0) >= 2 && installmentNumber(t.installment) < inst.n && sameInstallmentPurchase(me, t))
      .sort((a, b) => installmentNumber(b.installment) - installmentNumber(a.installment))[0];
    if (allocated && r.status === 'new') {
      r.allocation = allocated.allocation;
      r.categoryId = allocated.allocation![0].categoryId;
      r.reason = [r.reason, `rateado como a parcela ${allocated.installment}`].filter(Boolean).join(' · ');
    }
    // à vista ou parcela por mês: pergunta só na primeira vez que a compra aparece
    if (r.item.amount <= 0 || r.item.kind !== 'compra') continue;
    const known = ctx.transactions.filter((t) => sameInstallmentPurchase(me, t));
    if (known.length === 0) r.askInstallment = true;
    else if (known.some((t) => t.avista)) {
      r.avista = 'skip';
      r.reason = [r.reason, 'compra já considerada à vista (esta parcela não conta)'].filter(Boolean).join(' · ');
    }
  }
  return review;
}

/** Categoria final de um item, seguindo os vínculos (estorno/IOF → compra). */
export function resolveCategory(review: ReviewItem[], choices: Map<number, string>, index: number, depth = 0): string {
  const r = review[index];
  const own = choices.get(index);
  if (own) return own;
  if (r.linkTo !== undefined && depth < 5) return resolveCategory(review, choices, r.linkTo, depth + 1);
  return r.categoryId;
}
