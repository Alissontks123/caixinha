import { BACKUP_TABLES, CATEGORY_COLORS, DEFAULT_CATEGORIES, SPECIAL_CATEGORIES, UNIDENTIFIED_ID, db } from './db';
import { monthOf, todayISO } from '../lib/months';
import type { MonthSummary } from '../domain/summary';
import type {
  CaixinhaMovement, Category, Cents, ISODate, KnownCard, Month, Profile, Transaction,
} from '../domain/types';
import { resolveCategory, type ReviewItem } from '../import/prepare';
import type { ParsedDocument } from '../import/types';

const uid = () => crypto.randomUUID();

export interface RuleValues {
  contributes: boolean;
  limit: Cents;
  blockSize: Cents;
  blockAmount: Cents;
}

export interface SetupInput {
  name: string;
  caixinhaStartDate: ISODate;
  caixinhaStartBalance: Cents;
  fixedAmount: Cents;
  categories: (RuleValues & { name: string; color: string })[];
}

/** Primeira configuração do app. */
export async function initialize(input: SetupInput, startMonth: Month) {
  await db.transaction('rw', [db.profile, db.categories, db.categoryRules, db.fixedContributions], async () => {
    const profile: Profile = {
      id: 'me',
      name: input.name.trim(),
      caixinhaStartDate: input.caixinhaStartDate,
      caixinhaStartBalance: input.caixinhaStartBalance,
      alertThreshold: 80,
      createdAt: Date.now(),
    };
    await db.profile.put(profile);
    // regras valem desde bem antes, para cobrir lançamentos antigos
    const effectiveMonth = startMonth;
    let order = 0;
    for (const c of input.categories) {
      const id = uid();
      await db.categories.put({ id, name: c.name.trim(), kind: 'normal', order: order++, color: c.color });
      await db.categoryRules.put({ id: uid(), categoryId: id, effectiveMonth, ...pickRule(c) });
    }
    await db.categories.bulkPut(SPECIAL_CATEGORIES);
    await db.fixedContributions.put({ id: uid(), effectiveMonth, amount: input.fixedAmount });
  });
}

export function defaultSetupCategories() {
  return DEFAULT_CATEGORIES.map((c) => ({ ...c }));
}

/** Sem aporte = sem limite: zera limite, X e Y para não deixar valores "fantasmas". */
const pickRule = (r: RuleValues): RuleValues =>
  r.contributes
    ? { contributes: true, limit: r.limit, blockSize: r.blockSize, blockAmount: r.blockAmount }
    : { contributes: false, limit: 0, blockSize: 0, blockAmount: 0 };

export async function updateProfile(changes: Partial<Omit<Profile, 'id'>>) {
  await db.profile.update('me', changes);
}

// ---------- lançamentos ----------

export async function saveTransaction(
  data: Omit<Transaction, 'id' | 'createdAt' | 'month'> & { id?: string; month?: Month },
) {
  await assertMonthOpen(data.month ?? monthOf(data.date));
  if (data.id) {
    const old = await db.transactions.get(data.id);
    if (old) await assertMonthOpen(old.month);
  }
  const tx: Transaction = {
    ...data,
    id: data.id ?? uid(),
    month: data.month ?? monthOf(data.date),
    createdAt: data.id ? ((await db.transactions.get(data.id))?.createdAt ?? Date.now()) : Date.now(),
  };
  await db.transactions.put(tx);
}

export async function setTransactionCategory(id: string, categoryId: string) {
  const tx = await db.transactions.get(id);
  if (!tx) return;
  await assertMonthOpen(tx.month);
  await db.transaction('rw', [db.transactions, db.learnedRules, db.closings], async () => {
    await db.transactions.update(id, { categoryId });
    if (tx.learnable && tx.matchKey) await learn(tx.matchKey, categoryId, tx.description);
  });
}

/**
 * Memoriza a categoria de um estabelecimento e já aplica aos lançamentos
 * desse estabelecimento que ainda estão em "A identificar" (em meses abertos).
 */
async function learn(key: string, categoryId: string, example: string) {
  if (categoryId === UNIDENTIFIED_ID || !key) return;
  await db.learnedRules.put({ key, categoryId, example, updatedAt: Date.now() });
  const closed = new Set((await db.closings.toArray()).map((c) => c.month));
  await db.transactions
    .where({ matchKey: key })
    .filter((t) => t.categoryId === UNIDENTIFIED_ID && !!t.learnable && !closed.has(t.month))
    .modify({ categoryId });
}

export async function deleteLearnedRule(key: string) {
  await db.learnedRules.delete(key);
}

// ---------- importação ----------

export interface ImportResult {
  saved: number;
  learned: number;
  caixinha: number;
}

export async function saveImport(
  doc: ParsedDocument,
  review: ReviewItem[],
  choices: Map<number, string>,
  /** Índices dos movimentos da caixinha que o usuário manteve marcados. */
  caixinhaIncluded: Set<number> = new Set(),
): Promise<ImportResult> {
  const now = Date.now();
  const closed = new Set((await db.closings.toArray()).map((c) => c.month));
  const toSave: Transaction[] = [];
  const toLearn = new Map<string, { categoryId: string; example: string }>();
  const movements: CaixinhaMovement[] = [];
  const replacedManual: string[] = [];

  for (const r of review) {
    if (r.status === 'caixinha') {
      const included = caixinhaIncluded.has(r.index);
      movements.push({
        id: uid(),
        date: r.item.date,
        type: r.item.kind === 'caixinha_resgate' ? 'resgate' : 'aplicacao',
        amount: r.item.amount,
        source: 'extrato',
        fingerprint: r.fingerprint,
        // desmarcado: guardado como desconsiderado, para não ser oferecido de novo
        deleted: included ? undefined : true,
      });
      if (included && r.replacesManualId) replacedManual.push(r.replacesManualId);
      continue;
    }
    if (r.status !== 'new') continue;
    if (closed.has(r.item.month)) continue; // fechado durante a revisão
    const categoryId = resolveCategory(review, choices, r.index) || UNIDENTIFIED_ID;
    const it = r.item;
    toSave.push({
      id: uid(),
      date: it.date,
      month: it.month,
      description: it.description,
      amount: it.amount,
      categoryId,
      source: doc.source,
      createdAt: now + r.index,
      fingerprint: r.fingerprint,
      matchKey: r.matchKey || undefined,
      learnable: r.learnable,
      cardLast4: it.card?.last4,
      installment: it.installment ? `${it.installment.n}/${it.installment.total}` : undefined,
    });
    // memoriza só o que o usuário escolheu ou corrigiu (o que a regra automática já acerta não precisa)
    const userChose = choices.has(r.index) && choices.get(r.index) !== r.categoryId;
    if (r.learnable && r.matchKey && categoryId !== UNIDENTIFIED_ID && userChose) {
      toLearn.set(r.matchKey, { categoryId, example: it.matchText });
    }
  }

  await db.transaction('rw', [db.transactions, db.learnedRules, db.closings, db.caixinha], async () => {
    // segurança extra contra duplicidade (ex.: dois imports ao mesmo tempo)
    const existing = new Set(
      (await db.transactions.where('fingerprint').anyOf(toSave.map((t) => t.fingerprint!)).toArray()).map((t) => t.fingerprint),
    );
    await db.transactions.bulkAdd(toSave.filter((t) => !existing.has(t.fingerprint)));
    for (const [key, v] of toLearn) await learn(key, v.categoryId, v.example);

    const existingMov = new Set(
      (await db.caixinha.where('fingerprint').anyOf(movements.map((m) => m.fingerprint!)).toArray()).map((m) => m.fingerprint),
    );
    await db.caixinha.bulkAdd(movements.filter((m) => !existingMov.has(m.fingerprint)));
    await db.caixinha.bulkDelete(replacedManual);
  });
  return { saved: toSave.length, learned: toLearn.size, caixinha: movements.filter((m) => !m.deleted).length };
}

export async function saveCards(cards: KnownCard[]) {
  await db.cards.bulkPut(cards);
}

export async function setCardMine(id: string, mine: boolean) {
  await db.cards.update(id, { mine });
}

export async function setC6Password(password: string | undefined) {
  await db.profile.update('me', { c6Password: password });
}

export async function deleteTransaction(id: string) {
  const tx = await db.transactions.get(id);
  if (!tx) return;
  await assertMonthOpen(tx.month);
  await db.transactions.delete(id);
}

async function assertMonthOpen(month: Month) {
  if (await db.closings.get(month)) {
    throw new Error('Este mês está fechado. Reabra o mês para alterar os lançamentos.');
  }
}

// ---------- categorias ----------

export async function addCategory(name: string, rule: RuleValues, effectiveMonth: Month) {
  const all = await db.categories.toArray();
  const normal = all.filter((c) => c.kind === 'normal');
  const order = normal.reduce((m, c) => Math.max(m, c.order), -1) + 1;
  const color = CATEGORY_COLORS[normal.length % CATEGORY_COLORS.length];
  const id = uid();
  await db.transaction('rw', [db.categories, db.categoryRules], async () => {
    await db.categories.put({ id, name: name.trim(), kind: 'normal', order, color });
    await db.categoryRules.put({ id: uid(), categoryId: id, effectiveMonth, ...pickRule(rule) });
  });
}

export async function updateCategory(id: string, changes: Partial<Pick<Category, 'name' | 'color'>>) {
  await db.categories.update(id, changes);
}

/** Grava a regra a partir de um mês. Se já existe versão naquele mês, substitui. */
export async function setCategoryRule(categoryId: string, effectiveMonth: Month, rule: RuleValues) {
  const existing = await db.categoryRules.where({ categoryId }).filter((r) => r.effectiveMonth === effectiveMonth).first();
  await db.categoryRules.put({ id: existing?.id ?? uid(), categoryId, effectiveMonth, ...pickRule(rule) });
}

export async function deleteRuleVersion(id: string) {
  const rule = await db.categoryRules.get(id);
  if (!rule) return;
  const count = await db.categoryRules.where({ categoryId: rule.categoryId }).count();
  if (count <= 1) throw new Error('A categoria precisa ter pelo menos uma regra.');
  await db.categoryRules.delete(id);
}

/** Exclui a categoria movendo os lançamentos de meses abertos para outra. */
export async function deleteCategory(id: string, moveTo: string = UNIDENTIFIED_ID) {
  const cat = await db.categories.get(id);
  if (!cat || cat.kind !== 'normal') throw new Error('Esta categoria não pode ser excluída.');
  await db.transaction('rw', [db.categories, db.categoryRules, db.transactions], async () => {
    // meses fechados mantêm os valores congelados; os lançamentos só trocam de categoria
    await db.transactions.where({ categoryId: id }).modify({ categoryId: moveTo });
    await db.categoryRules.where({ categoryId: id }).delete();
    await db.categories.delete(id);
  });
}

export async function moveCategory(id: string, direction: -1 | 1) {
  const normal = (await db.categories.orderBy('order').toArray()).filter((c) => c.kind === 'normal');
  const i = normal.findIndex((c) => c.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= normal.length) return;
  await db.transaction('rw', db.categories, async () => {
    await db.categories.update(normal[i].id, { order: normal[j].order });
    await db.categories.update(normal[j].id, { order: normal[i].order });
  });
}

// ---------- aporte fixo ----------

export async function setFixedContribution(effectiveMonth: Month, amount: Cents) {
  const existing = await db.fixedContributions.where({ effectiveMonth }).first();
  await db.fixedContributions.put({ id: existing?.id ?? uid(), effectiveMonth, amount });
}

export async function deleteFixedVersion(id: string) {
  if ((await db.fixedContributions.count()) <= 1) throw new Error('É preciso manter pelo menos um valor.');
  await db.fixedContributions.delete(id);
}

// ---------- caixinha ----------

export async function addCaixinhaMovement(m: Omit<CaixinhaMovement, 'id' | 'source'>) {
  await db.caixinha.put({ ...m, id: uid(), source: 'manual' });
}

/** Manual: apaga de vez. Do extrato: fica como desconsiderado (não volta ao reimportar). */
export async function deleteCaixinhaMovement(id: string) {
  const m = await db.caixinha.get(id);
  if (!m) return;
  if (m.source === 'extrato') await db.caixinha.update(id, { deleted: true });
  else await db.caixinha.delete(id);
}

export async function restoreCaixinhaMovement(id: string) {
  await db.caixinha.update(id, { deleted: undefined });
}

// ---------- fechamento ----------

export async function closeMonth(summary: MonthSummary) {
  await db.closings.put({
    month: summary.month,
    closedAt: todayISO(),
    categories: summary.categories,
    ignoredTotal: summary.ignoredTotal,
    fixed: summary.fixed,
    overflowTotal: summary.overflowTotal,
  });
}

export async function reopenMonth(month: Month) {
  await db.closings.delete(month);
}

// ---------- backup ----------

export async function exportBackup(): Promise<string> {
  const data: Record<string, unknown[]> = {};
  for (const t of BACKUP_TABLES) data[t] = await db.table(t).toArray();
  // a senha da fatura não vai para o arquivo de backup
  data.profile = (data.profile as Profile[]).map(({ c6Password: _omit, ...p }) => p);
  return JSON.stringify({ app: 'controle-gastos-caixinha', version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
}

export async function importBackup(json: string) {
  const parsed = JSON.parse(json);
  if (parsed?.app !== 'controle-gastos-caixinha' || !parsed.data) throw new Error('Arquivo de backup inválido.');
  await db.transaction('rw', BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const t of BACKUP_TABLES) {
      await db.table(t).clear();
      await db.table(t).bulkPut(parsed.data[t] ?? []);
    }
  });
}
