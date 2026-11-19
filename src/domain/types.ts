/** Valores monetários sempre em centavos (inteiros) para evitar erros de arredondamento. */
export type Cents = number;
/** Mês no formato 'AAAA-MM'. */
export type Month = string;
/** Data no formato 'AAAA-MM-DD'. */
export type ISODate = string;

export type CategoryKind = 'normal' | 'unidentified' | 'ignored';

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  order: number;
  color: string;
}

/** Regra de uma categoria (limite, X e Y), válida a partir de um mês. */
export interface CategoryRuleVersion {
  id: string;
  categoryId: string;
  effectiveMonth: Month;
  /** Limite mensal da categoria. */
  limit: Cents;
  /** X: tamanho de cada bloco de excedente. */
  blockSize: Cents;
  /** Y: valor a aportar por bloco (bloco incompleto conta como inteiro). */
  blockAmount: Cents;
  /**
   * Se a categoria gera aporte na caixinha. false = sem limite, só soma o total gasto
   * (ex.: Gastos necessários). Ausente = true (dados antigos).
   */
  contributes?: boolean;
}

/** Aporte fixo mensal, válido a partir de um mês. */
export interface FixedContributionVersion {
  id: string;
  effectiveMonth: Month;
  amount: Cents;
}

export type TransactionSource = 'manual' | 'fatura-c6' | 'fatura-nubank' | 'extrato-nubank';

export interface Transaction {
  id: string;
  /** Data da compra/lançamento. */
  date: ISODate;
  /** Mês em que o lançamento conta (normalmente o mês da data; parcelas podem diferir). */
  month: Month;
  description: string;
  /** Positivo = gasto; negativo = estorno (abate o gasto). */
  amount: Cents;
  categoryId: string;
  source: TransactionSource;
  note?: string;
  createdAt: number;
  /** Identificador do item no documento importado (evita importar duas vezes). */
  fingerprint?: string;
  /** Chave do estabelecimento/favorecido para memorizar a categoria. */
  matchKey?: string;
  /** Se a categoria escolhida deve ser memorizada para esse estabelecimento. */
  learnable?: boolean;
  cardLast4?: string;
  /** Ex.: "5/12". */
  installment?: string;
  /** Gasto dividido com outras pessoas: só a parte do usuário conta (ver `myAmount`). */
  share?: Share;
  /** Gasto que se repete todo mês (assinatura, conta fixa…). Vale para o estabelecimento (ver `recurringKey`). */
  recurring?: boolean;
}

/** Como o gasto foi dividido. Os valores sempre descrevem a parte do usuário. */
export type Share =
  | { mode: 'fixed'; cents: Cents }
  | { mode: 'percent'; percent: number }
  | { mode: 'people'; people: number };

/** Categoria memorizada para um estabelecimento. */
export interface LearnedRule {
  key: string;
  categoryId: string;
  /** Exemplo de texto original, para mostrar ao usuário. */
  example: string;
  updatedAt: number;
}

/** Cartão encontrado em faturas; `mine` diz se os gastos dele são deste usuário. */
export interface KnownCard {
  /** `${bank}:${last4}` */
  id: string;
  bank: 'c6' | 'nubank';
  last4: string;
  holder: string;
  mine: boolean;
}

export interface ClosedCategory {
  categoryId: string;
  name: string;
  color: string;
  spent: Cents;
  limit: Cents;
  blockSize: Cents;
  blockAmount: Cents;
  contribution: Cents;
  /** false = categoria sem limite e sem aporte. Ausente = true. */
  contributes?: boolean;
}

/** Fotografia congelada de um mês fechado. */
export interface MonthClosing {
  month: Month;
  closedAt: ISODate;
  categories: ClosedCategory[];
  ignoredTotal: Cents;
  fixed: Cents;
  overflowTotal: Cents;
}

export type CaixinhaMovementType = 'aplicacao' | 'resgate' | 'saldo_informado';

export interface CaixinhaMovement {
  id: string;
  date: ISODate;
  type: CaixinhaMovementType;
  /** Sempre positivo. Em 'saldo_informado' é o saldo real informado. */
  amount: Cents;
  source: 'manual' | 'extrato';
  note?: string;
  /** Identificador do item no extrato (evita importar duas vezes). */
  fingerprint?: string;
  /** Desconsiderado pelo usuário (excluído ou desmarcado na importação). Não volta ao reimportar. */
  deleted?: boolean;
}

export interface Profile {
  id: 'me';
  name: string;
  /** Data do saldo inicial da caixinha (saldo ao FINAL desse dia). */
  caixinhaStartDate: ISODate;
  caixinhaStartBalance: Cents;
  /** Percentual do limite a partir do qual a categoria fica em alerta. */
  alertThreshold: number;
  createdAt: number;
  /** Meta da caixinha: juntar este valor (saldo estimado) até o mês indicado. */
  goalAmount?: Cents;
  goalMonth?: Month;
  /** Senha da fatura C6 (6 primeiros dígitos do CPF), salva só neste aparelho/conta. */
  c6Password?: string;
}
