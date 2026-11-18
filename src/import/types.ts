import type { Cents, ISODate, Month, TransactionSource } from '../domain/types';

/** Um pedaço de texto do PDF com sua posição horizontal. */
export interface TextPiece {
  x: number;
  s: string;
}

/** Uma linha visual do PDF (pedaços com a mesma altura). */
export interface Line {
  y: number;
  items: TextPiece[];
  text: string;
}

export type ItemKind =
  | 'compra'
  | 'estorno'
  | 'iof'
  | 'pix_pessoa'
  | 'pix_empresa'
  | 'boleto'
  | 'debito_automatico'
  | 'debito'
  | 'outro'
  | 'caixinha_aplicacao'
  | 'caixinha_resgate'
  | 'ignorado';

export interface ParsedItem {
  /** Data mostrada no documento (na C6, parcelas mostram a data da compra original). */
  date: ISODate;
  /** Mês em que o lançamento conta. */
  month: Month;
  /** Texto para exibir. */
  description: string;
  /** Texto usado para reconhecer a categoria (nome do estabelecimento ou favorecido). */
  matchText: string;
  /** Positivo = gasto; negativo = estorno/crédito. */
  amount: Cents;
  kind: ItemKind;
  /** Motivo, quando kind = 'ignorado'. */
  ignoreReason?: string;
  card?: { last4: string; holder: string };
  installment?: { n: number; total: number };
  /** Para IOF: nome da compra a que se refere. */
  iofOf?: string;
}

export interface DocCheck {
  label: string;
  expected: Cents;
  found: Cents;
}

export interface ParsedDocument {
  source: Exclude<TransactionSource, 'manual'>;
  label: string;
  holderName?: string;
  /** Data de fechamento da fatura ou fim do período do extrato. */
  periodEnd: ISODate;
  periodStart?: ISODate;
  items: ParsedItem[];
  checks: DocCheck[];
}

export class PdfPasswordError extends Error {
  constructor(public readonly incorrect: boolean) {
    super(incorrect ? 'Senha incorreta.' : 'Este PDF tem senha.');
  }
}

export class UnknownDocumentError extends Error {
  constructor() {
    super('Não reconheci este PDF. São aceitos: fatura C6, fatura Nubank e extrato da conta Nubank.');
  }
}
