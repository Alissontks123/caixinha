/**
 * Horários do dia usados pelos itens Lendários (o avatar e o tema mudam sozinhos):
 * manhã 5h–12h, tarde 12h–18h, entardecer 18h–20h e noite 20h–5h (hora do aparelho).
 */
import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from 'react';

export type DaySlot = 'manha' | 'tarde' | 'entardecer' | 'noite';

export const DAY_SLOTS: { id: DaySlot; name: string; hours: string }[] = [
  { id: 'manha', name: 'Manhã', hours: '5h–12h' },
  { id: 'tarde', name: 'Tarde', hours: '12h–18h' },
  { id: 'entardecer', name: 'Entardecer', hours: '18h–20h' },
  { id: 'noite', name: 'Noite', hours: '20h–5h' },
];

export function daySlotAt(d: Date = new Date()): DaySlot {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'manha';
  if (h >= 12 && h < 18) return 'tarde';
  if (h >= 18 && h < 20) return 'entardecer';
  return 'noite';
}

export const daySlotName = (s: DaySlot) => DAY_SLOTS.find((x) => x.id === s)!.name;
export const nextDaySlot = (s: DaySlot): DaySlot => DAY_SLOTS[(DAY_SLOTS.findIndex((x) => x.id === s) + 1) % DAY_SLOTS.length].id;

// um único relógio para o app todo (confere a cada 30 s e quando o app volta a aparecer na tela)
const listeners = new Set<() => void>();
let current: DaySlot = daySlotAt();
let timer: number | undefined;
function check() {
  const s = daySlotAt();
  if (s !== current) { current = s; listeners.forEach((l) => l()); }
}
function subscribe(l: () => void) {
  listeners.add(l);
  if (listeners.size === 1) {
    timer = window.setInterval(check, 30_000);
    document.addEventListener('visibilitychange', check);
  }
  check();
  return () => {
    listeners.delete(l);
    if (!listeners.size) { window.clearInterval(timer); document.removeEventListener('visibilitychange', check); }
  };
}

/** Prévia de um horário (Temas, prévia no Painel): os itens lendários dentro dela mostram esse horário. */
const Override = createContext<DaySlot | undefined>(undefined);
export function DaySlotPreview({ slot, children }: { slot?: DaySlot; children: ReactNode }) {
  return createElement(Override.Provider, { value: slot }, children);
}

/** Horário atual (muda sozinho), ou o da prévia em volta. */
export function useDaySlot(): DaySlot {
  const live = useSyncExternalStore(subscribe, () => current, () => current);
  return useContext(Override) ?? live;
}
