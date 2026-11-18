import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';
import { startMonthOf } from './domain/ledger';
import type { SummaryInput } from './domain/summary';
import type {
  CaixinhaMovement, Category, CategoryRuleVersion, FixedContributionVersion,
  KnownCard, LearnedRule, MonthClosing, Profile, Transaction,
} from './domain/types';

export interface AppData {
  profile?: Profile;
  categories: Category[];
  rules: CategoryRuleVersion[];
  fixedVersions: FixedContributionVersion[];
  transactions: Transaction[];
  closings: MonthClosing[];
  movements: CaixinhaMovement[];
  learnedRules: LearnedRule[];
  cards: KnownCard[];
}

export type ReadyData = AppData & { profile: Profile };

/** Carrega tudo do banco local e atualiza a tela sozinho quando algo muda. */
export function useAppData(): AppData | undefined {
  return useLiveQuery(async () => ({
    profile: await db.profile.get('me'),
    categories: await db.categories.orderBy('order').toArray(),
    rules: await db.categoryRules.toArray(),
    fixedVersions: await db.fixedContributions.toArray(),
    transactions: await db.transactions.toArray(),
    closings: await db.closings.toArray(),
    movements: await db.caixinha.toArray(),
    learnedRules: await db.learnedRules.toArray(),
    cards: await db.cards.toArray(),
  }), []);
}

export function summaryInput(data: ReadyData): SummaryInput {
  return {
    categories: data.categories,
    rules: data.rules,
    fixedVersions: data.fixedVersions,
    transactions: data.transactions,
    closings: data.closings,
    startMonth: startMonthOf(data.profile),
  };
}
