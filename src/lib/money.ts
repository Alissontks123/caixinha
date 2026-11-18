import type { Cents } from '../domain/types';

/**
 * Converte texto digitado em centavos.
 * Aceita "1.234,56", "1234,56", "1234.56", "1234", "R$ 50", "-10,00".
 * Retorna null se o texto não for um valor válido.
 */
export function parseMoney(input: string): Cents | null {
  let s = input.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!s) return null;
  const negative = s.startsWith('-');
  if (negative) s = s.slice(1).replace(/^R\$/i, '');
  if (s.includes(',')) {
    // formato brasileiro: ponto = milhar, vírgula = decimal
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234" ou "1.234.567" = milhar
    s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int, dec = ''] = s.split('.');
  const cents = Number(int) * 100 + Number(dec.padEnd(2, '0'));
  return negative ? -cents : cents;
}

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatMoney(cents: Cents): string {
  return fmt.format(cents / 100);
}

/** Valor para preencher um campo de edição (ex.: 1234,50). */
export function centsToInput(cents: Cents): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  return `${neg ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}
