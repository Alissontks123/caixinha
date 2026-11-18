import type { ISODate, Month } from '../domain/types';

const pad = (n: number) => String(n).padStart(2, '0');

export function todayISO(d = new Date()): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthOf(date: ISODate): Month {
  return date.slice(0, 7);
}

export function currentMonth(): Month {
  return monthOf(todayISO());
}

export function addMonths(month: Month, n: number): Month {
  const [y, m] = month.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

/** Lista de meses de `from` até `to`, inclusive. */
export function monthRange(from: Month, to: Month): Month[] {
  const out: Month[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export function nextDay(date: ISODate): ISODate {
  const [y, m, d] = date.split('-').map(Number);
  return todayISO(new Date(y, m - 1, d + 1));
}

export function firstDay(month: Month): ISODate {
  return `${month}-01`;
}

/** Último dia do mês. */
export function lastDay(month: Month): ISODate {
  const [y, m] = month.split('-').map(Number);
  return todayISO(new Date(y, m, 0));
}

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function monthLabel(month: Month): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
}

export function monthShort(month: Month): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]}/${String(y).slice(2)}`;
}

export function dateLabel(date: ISODate): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}
