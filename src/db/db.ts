import Dexie, { type Table } from 'dexie';
import { SERIES_LIGHT } from '../lib/colors';
import type {
  CaixinhaMovement, Category, CategoryRuleVersion, FixedContributionVersion,
  KnownCard, LearnedRule, MonthClosing, Profile, Transaction,
} from '../domain/types';

/** Banco local do aparelho (IndexedDB). */
export class AppDB extends Dexie {
  profile!: Table<Profile, string>;
  categories!: Table<Category, string>;
  categoryRules!: Table<CategoryRuleVersion, string>;
  fixedContributions!: Table<FixedContributionVersion, string>;
  transactions!: Table<Transaction, string>;
  closings!: Table<MonthClosing, string>;
  caixinha!: Table<CaixinhaMovement, string>;
  learnedRules!: Table<LearnedRule, string>;
  cards!: Table<KnownCard, string>;
  declare meta: Table<{ id: string; [k: string]: unknown }, string>;

  constructor() {
    super('controle-gastos');
    this.version(1).stores({
      profile: 'id',
      categories: 'id, order',
      categoryRules: 'id, categoryId, effectiveMonth',
      fixedContributions: 'id, effectiveMonth',
      transactions: 'id, month, date, categoryId',
      closings: 'month',
      caixinha: 'id, date',
    });
    this.version(2).stores({
      transactions: 'id, month, date, categoryId, fingerprint, matchKey',
      learnedRules: 'key, categoryId',
      cards: 'id',
    });
    this.version(3).stores({
      caixinha: 'id, date, fingerprint',
    });
    // estado da sincronização com o Drive (não é sincronizado nem vai para o backup)
    this.version(4).stores({
      meta: 'id',
    });
  }
}

export const db = new AppDB();

// ---------- marcação de alterações (para a sincronização) ----------

let applyingSync = false;
const changeListeners = new Set<() => void>();

/** Enquanto a sincronização grava dados vindos do Drive, preserva o updatedAt original e não dispara nova sincronização. */
export async function withSyncApply<T>(fn: () => Promise<T>): Promise<T> {
  applyingSync = true;
  try {
    return await fn();
  } finally {
    applyingSync = false;
  }
}

export function onLocalChange(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

const notify = () => {
  if (!applyingSync) changeListeners.forEach((fn) => fn());
};

for (const name of ['profile', 'categories', 'categoryRules', 'fixedContributions', 'transactions', 'closings', 'caixinha', 'learnedRules', 'cards']) {
  const table = db.table(name);
  table.hook('creating', function (_pk, obj: { updatedAt?: number }) {
    if (!applyingSync || obj.updatedAt == null) obj.updatedAt = Date.now();
    notify();
  });
  table.hook('updating', function () {
    notify();
    return applyingSync ? undefined : { updatedAt: Date.now() };
  });
  table.hook('deleting', function () {
    notify();
  });
}

export const UNIDENTIFIED_ID = 'a-identificar';
export const IGNORED_ID = 'nao-e-gasto';

// cores = paleta validada (src/lib/colors.ts), na ordem fixa
export const DEFAULT_CATEGORIES = [
  { name: 'Alimentação', color: SERIES_LIGHT[0], contributes: true, limit: 100000, blockSize: 10000, blockAmount: 5000 },
  { name: 'Hobbys', color: SERIES_LIGHT[1], contributes: true, limit: 50000, blockSize: 10000, blockAmount: 5000 },
  { name: 'Assinaturas', color: SERIES_LIGHT[2], contributes: true, limit: 15000, blockSize: 5000, blockAmount: 2500 },
  { name: 'Viagem', color: SERIES_LIGHT[3], contributes: true, limit: 50000, blockSize: 10000, blockAmount: 5000 },
  { name: 'Gastos desnecessários', color: SERIES_LIGHT[4], contributes: true, limit: 30000, blockSize: 5000, blockAmount: 5000 },
  { name: 'Gastos necessários', color: SERIES_LIGHT[5], contributes: false, limit: 0, blockSize: 0, blockAmount: 0 },
];

export const SPECIAL_CATEGORIES: Category[] = [
  { id: UNIDENTIFIED_ID, name: 'A identificar', kind: 'unidentified', order: 1000, color: '#8a8f98' },
  { id: IGNORED_ID, name: 'Não é gasto', kind: 'ignored', order: 1001, color: '#b0b4ba' },
];

export const CATEGORY_COLORS = SERIES_LIGHT;

export const BACKUP_TABLES = [
  'profile', 'categories', 'categoryRules', 'fixedContributions', 'transactions', 'closings', 'caixinha', 'learnedRules', 'cards',
] as const;
