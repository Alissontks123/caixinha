import { parseMoney } from '../lib/money';
import { MoneyInput } from './ui';
import type { RuleValues } from '../db/repo';

/** Estado de edição de uma regra (textos digitados). */
export interface RuleDraft {
  contributes: boolean;
  limit: string;
  blockSize: string;
  blockAmount: string;
}

export function RuleFields({ value, onChange, categoryName }: {
  value: RuleDraft; onChange: (v: RuleDraft) => void; categoryName?: string;
}) {
  const name = categoryName?.trim() || 'esta categoria';
  const set = (patch: Partial<RuleDraft>) => onChange({ ...value, ...patch });
  return (
    <div className="stack-sm">
      <label className="switch-row">
        <input type="checkbox" checked={value.contributes} onChange={(e) => set({ contributes: e.target.checked })} />
        <span className="switch" aria-hidden />
        <span>Gera aporte na caixinha</span>
      </label>
      {value.contributes ? (
        <p className="rule-sentence">
          O limite de gastos mensal com <b>{name}</b> será de{' '}
          <MoneyInput value={value.limit} onChange={(v) => set({ limit: v })} ariaLabel={`Limite mensal de ${name}`} />.
          {' '}Quando ultrapassado, a cada{' '}
          <MoneyInput value={value.blockSize} onChange={(v) => set({ blockSize: v })} ariaLabel="Valor de cada bloco de gastos excedentes" />
          {' '}gastos, deverá ser aportado{' '}
          <MoneyInput value={value.blockAmount} onChange={(v) => set({ blockAmount: v })} ariaLabel="Valor do aporte por bloco" />
          {' '}na caixinha.
        </p>
      ) : (
        <p className="muted small">Sem limite: só mostra o total gasto no mês, nunca gera aporte.</p>
      )}
    </div>
  );
}

/** Converte o rascunho em valores. Retorna mensagem de erro (string) se algo estiver inválido. */
export function parseRuleDraft(d: RuleDraft): RuleValues | string {
  if (!d.contributes) return { contributes: false, limit: 0, blockSize: 0, blockAmount: 0 };
  const limit = parseMoney(d.limit), blockSize = parseMoney(d.blockSize), blockAmount = parseMoney(d.blockAmount);
  if (limit === null || limit < 0) return 'Informe o limite (pode ser 0).';
  if (blockSize === null || blockSize <= 0) return 'O valor de "a cada" precisa ser maior que zero.';
  if (blockAmount === null || blockAmount < 0) return 'Informe o valor a ser aportado (pode ser 0).';
  return { contributes: true, limit, blockSize, blockAmount };
}
