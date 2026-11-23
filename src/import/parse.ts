import { isBBExtrato, parseBBExtrato } from './bbExtrato';
import { isC6Fatura, parseC6 } from './c6';
import { isItauFatura, parseItauFatura } from './itauFatura';
import { isNubankExtrato, parseNubankExtrato } from './nubankExtrato';
import { isNubankFatura, parseNubankFatura } from './nubankFatura';
import { UnknownDocumentError, type Line, type ParsedDocument } from './types';

/** Descobre o tipo do documento e chama o leitor certo. */
export function parseDocument(pages: Line[][]): ParsedDocument {
  const text = pages.flat().map((l) => l.text).join('\n');
  if (isC6Fatura(text)) return parseC6(pages);
  if (isNubankFatura(text)) return parseNubankFatura(pages);
  if (isNubankExtrato(text)) return parseNubankExtrato(pages);
  if (isItauFatura(text)) return parseItauFatura(pages);
  if (isBBExtrato(text)) return parseBBExtrato(pages);
  throw new UnknownDocumentError();
}
