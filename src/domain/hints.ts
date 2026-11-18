/**
 * Dicas do que provavelmente é uma despesa, pelo nome do estabelecimento (100% offline).
 * Só mostra um texto de sugestão: nunca escolhe a categoria sozinho.
 */
import { normalizeText } from './categorize';

/** Lista (padrão, dica). A primeira que casar vence, então os padrões mais específicos vêm antes. */
const HINTS: [RegExp, string][] = [
  [/SHOPEE|MERCADO ?LIVRE|MERCADOLIVRE|MERCADOPAGO|AMAZON|MAGALU|MAGAZINE ?LUIZA|AMERICANAS|SUBMARINO|SHEIN|ALIEXPRESS|TEMU\b|CASAS BAHIA|KABUM/,
    'loja que vende de tudo: confira no app da loja o que foi comprado'],
  [/CACAU ?SHOW|KOPENHAGEN|CHOCOLAT|BOMBONIERE|CONFEITARIA|DOCERIA|\bDOCES?\b|BRIGADEIR|BOLOS?\b/, 'doces, chocolates ou confeitaria'],
  [/ACADEMIA|SMART ?FIT|BLUE ?FIT|BIO ?RITMO|SELFIT|CROSSFIT|\bFIT\b|FITNESS|\bGYM\b|PILATES|\bYOGA\b|NATACAO|FUNCIONAL|TOTAL ?PASS|GYMPASS|WELLHUB|\bPERSONAL\b/,
    'academia ou atividade física'],
  [/CENTAURO|DECATHLON|NETSHOES|ESPORTE|ESPORTIV/, 'artigos esportivos'],
  [/PETSHOP|PET ?SHOP|\bPETZ\b|COBASI|\bPET\b|VETERIN|AGROPET|RACAO|BANHO E TOSA/, 'pet shop ou veterinário'],
  [/SALAO|CABELEIR|BARBEAR|BARBEARIA|BARBER|ESTETICA|MANICURE|\bNAILS?\b|\bSPA\b|DEPILA|SOBRANCELHA|CILIOS/, 'salão de beleza, barbearia ou estética'],
  [/BOTICARIO|EUDORA|NATURA|AVON|PERFUM|COSMETIC|\bMAKE\b|MAQUIAGEM|SEPHORA/, 'perfumaria ou cosméticos'],
  [/ESCOLA|COLEGIO|FACULDADE|UNIVERSIDADE|CURSO|IDIOMA|INGLES|UDEMY|ALURA|COURSERA|EDUCA|ENSINO/, 'escola, faculdade ou curso'],
  [/LIVRARIA|PAPELARIA|LIVROS?\b/, 'livraria ou papelaria'],
  [/MEDIC|PSICOLOG|FISIOTERAP|NUTRI|OTICA|OCULOS|EXAME|SAUDE|VACINA|CONSULTORIO|ODONTO/, 'saúde: consulta, exame, ótica ou similar'],
  [/CINEMA|CINEMARK|CINEPOLIS|INGRESSO|SYMPLA|EVENTIM|TEATRO|\bSHOWS?\b|PARQUE|BOLICHE|\bCLUBE\b|BOATE|BALADA/, 'lazer: cinema, show, evento ou passeio'],
  [/\bBAR\b|\bBARES\b|CHOPP|CHOPERIA|CERVEJ|BOTECO|PUB\b|ADEGA|BEBIDAS|TABACARIA|CONVENIENCIA/, 'bar, bebidas ou conveniência'],
  [/STEAM|PLAYSTATION|\bPSN\b|XBOX|NINTENDO|\bGAMES?\b|JOGOS/, 'jogos ou videogame'],
  [/HAMBURG|LANCHONETE|ESPETO|TAPIOCA|EMPORIO|QUITANDA|FRUTAS|CARNES|FRIGORIFIC|PEIXARIA|ROTISSERIA|MARMITA|SALGADOS|CREPE|CHURROS|PASTELARIA/,
    'comida: lanche, restaurante ou mercado'],
  [/CONSTRU|MATERIAIS|LEROY|TELHA NORTE|FERRAGEM|FERRAGENS|TINTAS|ELETRICA|HIDRAULICA|MADEIRA|VIDRACARIA/, 'material de construção ou reforma'],
  [/MOVEIS|DECORA|TOK ?STOK|CAMICADO|UTILIDADES|ELETRO|COLCHO|ENXOVAL|CAMA MESA/, 'casa: móveis, decoração ou eletrodomésticos'],
  [/LAVANDERIA|CHAVEIRO|DEDETIZ|DIARISTA|LIMPEZA|COSTURA|SAPATEIRO|CONSERTO|ASSISTENCIA TECNICA/, 'serviço para a casa ou conserto'],
  [/\bMODA\b|CALCADOS|SAPATARIA|ROUPAS|BOUTIQUE|CONFECC|VESTUARIO|HERING|AREZZO|LINGERIE|\bTNG\b|MARISA|(^|\s)C&A(\s|$)/, 'roupas, calçados ou acessórios'],
  [/FLORICULTURA|\bFLORES\b|PRESENTE|BRINQUED|RI HAPPY|PB ?KIDS|JOALHERIA|BIJUTERIA|RELOJOARIA/, 'presentes, flores, brinquedos ou joias'],
  [/AUTO ?PECAS|OFICINA|MECANICA|\bPNEUS?\b|BORRACHARIA|LAVA ?CAR|LAVA ?JATO|LAVACAO|DETRAN|IPVA|LICENCIAMENTO|AUTO ?CENTER/, 'carro: oficina, peças, lavação ou taxas'],
  [/SEGURO|SEGURADORA|PORTO SEGURO|\bAPOLICE\b/, 'seguro'],
  [/GOOGLE|MICROSOFT|ICLOUD|DROPBOX|CANVA|ADOBE|ANTIVIRUS|\bAPP\b|\bAPPS\b/, 'serviço digital, app ou assinatura'],
  [/PREFEITURA|RECEITA|\bDARF\b|\bGOV\b|CARTORIO|TAXA|IMPOSTO|\bIPTU\b/, 'taxa, imposto ou cartório'],
  [/IGREJA|PAROQUIA|DOACAO|DIZIMO|\bONG\b|VAKINHA/, 'doação ou igreja'],
  [/^PAG ?\*|PAGSEGURO|PICPAY|SUMUP|INFINITEPAY|\bPIX\b|\bTON\b/, 'pagamento por maquininha ou app: pode ser uma pessoa ou um pequeno comércio'],
];

/** Dica do que provavelmente é a despesa, ou `undefined` se o nome não der nenhuma pista. */
export function merchantHint(text: string): string | undefined {
  const norm = normalizeText(text);
  for (const [re, hint] of HINTS) if (re.test(norm)) return hint;
  return undefined;
}

/** Link de pesquisa no Google com o nome do estabelecimento (sem "Parcela n/m"). */
export function searchUrl(text: string): string {
  const q = text.replace(/-?\s*parcela\s*\d+\s*\/\s*\d+/gi, ' ').replace(/\s+/g, ' ').trim();
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
