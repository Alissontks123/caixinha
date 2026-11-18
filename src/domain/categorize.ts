/**
 * Reconhecimento automático de categorias (100% offline).
 * Ordem: regra aprendida do usuário → lojas "sempre perguntar" → regras de base → perguntar.
 */

export const normalizeText = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

/**
 * Chave usada para memorizar um estabelecimento: sem acentos, sem números e sem "Parcela n/m".
 * Ex.: "RAIA2766" e "Raia362" → "RAIA"; "IFD*B4 PIZZAS LTDA" → "IFD B PIZZAS LTDA".
 */
export function matchKeyOf(text: string): string {
  return normalizeText(text)
    .replace(/-?\s*PARCELA\s*\d+\s*\/\s*\d+/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/[^A-Z&]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lojas onde se compra de tudo: sempre perguntar e nunca memorizar. */
const ALWAYS_ASK = /SHOPEE|MERCADO ?LIVRE|MERCADOLIVRE|MERCADOPAGO|AMAZON|MAGALU|MAGAZINE ?LUIZA|NATURA|\bNAT\*|SEPHORA|INDITEX|\bZARA\b|RENNER|RIACHUELO|\bC&A\b|SHEIN|ALIEXPRESS|AMERICANAS|SUBMARINO|KABUM|CASAS BAHIA|TEMU\b/;

/** Regras de base (nome da categoria, padrão). A ordem importa: a primeira que casar vence. */
const BASE_RULES: [string, RegExp][] = [
  ['Assinaturas', /SPOTIFY|NETFLIX|DISNEY|HBO ?MAX|HELPHBOMAX|GLOBOPLAY|GLOBO PLAY|AMAZON PRIME|PRIME ?VIDEO|APPLE\.COM|YOUTUBE ?PREMIUM|DEEZER|PARAMOUNT|CRUNCHYROLL|IFOOD CLUB|TELECINE|AUDIBLE|KINDLE UNLIMITED|CHATGPT|OPENAI|STAR ?\+/],
  ['ask', ALWAYS_ASK],
  ['Viagem', /LATAM|\bGOL\b|GOL LINHAS|AZUL LINHAS|VOEAZUL|AIRBNB|SMILES|BOOKING|HOTEL|HOTEIS|POUSADA|DECOLAR|123 ?MILHAS|MAXMILHAS|HURB/],
  ['Alimentação', /UBER ?\*? ?EATS/],
  // contas da casa
  ['Gastos necessários', /CELESC|COPEL|CEMIG|\bENEL\b|\bLIGHT\b|SABESP|CASAN|SANEAMENTO|AGUAS DE|\bCLARO\b|\bTIM\b|\bVIVO\b|\bOI\b|TELECOM|INTERNET|FIBRA|\bSKY\b|COMGAS|SCGAS|SULGAS|CONDOMINIO|ALUGUEL/],
  // farmácia e saúde
  ['Gastos necessários', /(^|[^A-Z])RAIA|DROGASIL|DROGARIA|FARMACIA|PANVEL|PAGUE MENOS|HOSPITAL|CLINICA|LABORATORIO|UNIMED|ODONTO|DENTIST/],
  // transporte
  ['Gastos necessários', /POSTO|\bSHELL\b|IPIRANGA|PETROBRAS|UBER|\b99 ?(APP|POP|TAXI)|CLICKBUS|BUSER|ESTACIONAMENTO|ESTAPAR|SEM PARAR|CONECTCAR|VELOE|PEDAGIO|COMBUSTIV/],
  // tarifas e encargos
  ['Gastos necessários', /ANUIDADE|TARIFA|\bIOF\b|JUROS|ENCARGO|MULTA/],
  ['Alimentação', /\bIFD\b|IFOOD|RESTAURA|PIZZA|SUSHI|BURGER|BK BRASIL|MCDONALD|MC DONALD|LANCHE|PADARIA|PANIFICADORA|\bCAFE\b|CAFETERIA|PASTEL|SORVETE|ACAI|BISTRO|CHURRASC|COZINHA|ALIMENTOS|SUPERMERCADO|\bMERCADO\b|MERCEARIA|ATACAD|ASSAI|BISTEK|ANGELONI|GIASSI|HORTIFRUT|ACOUGUE|DELIVERY|RAPPI|CHINA ?IN ?BOX|CHINAINBOX/],
];

export type Suggestion =
  | { type: 'learned'; categoryId: string }
  | { type: 'base'; categoryName: string }
  | { type: 'ask'; learnable: boolean };

/**
 * Sugere a categoria para um texto (nome do estabelecimento/favorecido).
 * `learned` é o mapa chave → categoria memorizado pelo usuário.
 */
export function suggestCategory(text: string, learned: Map<string, string>): Suggestion {
  const norm = normalizeText(text);
  if (ALWAYS_ASK.test(norm) && !BASE_RULES[0][1].test(norm)) return { type: 'ask', learnable: false };
  const key = matchKeyOf(text);
  const learnedId = key ? learned.get(key) : undefined;
  if (learnedId) return { type: 'learned', categoryId: learnedId };
  for (const [name, re] of BASE_RULES) {
    if (!re.test(norm)) continue;
    if (name === 'ask') return { type: 'ask', learnable: false };
    return { type: 'base', categoryName: name };
  }
  return { type: 'ask', learnable: key.length > 0 };
}
