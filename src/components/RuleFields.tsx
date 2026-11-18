import { parseMoney } from '../lib/money';
import { Field, MoneyInput } from './ui';
import type { RuleValues } from '../db/repo';

/** Estado de edição de uma regra (textos digitados). */
export interface RuleDraft {
  contributes: boolean;
  limit: string;
  blockSize: string;
  blockAmount: string;
}

export function RuleFields({ value, onChange }: { value: RuleDraft; onChange: (v: RuleDraft) => void }) {
  const set = (patch: Partial<RuleDraft>) => onChange({ ...value, ...patch });
  return (
    <div className="stack-sm">
      <label className="switch-row">
        <input type="checkbox" checked={value.contributes} onChange={(e) => set({ contributes: e.target.checked })} />
        <span className="switch" aria-hidden />
        <span>Gera aporte na caixinha</span>
      </label>
      {value.contributes ? (
        <div className="grid-3">
          <Field label="Limite"><MoneyInput value={value.limit} onChange={(v) => set({ limit: v })} /></Field>
          <Field label="A cada X"><MoneyInput value={value.blockSize} onChange={(v) => set({ blockSize: v })} /></Field>
          <Field label="Aportar Y"><MoneyInput value={value.blockAmount} onChange={(v) => set({ blockAmount: v })} /></Field>
        </div>
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
  if (blockSize === null || blockSize <= 0) return 'O X precisa ser maior que zero.';
  if (blockAmount === null || blockAmount < 0) return 'Informe o Y (pode ser 0).';
  return { contributes: true, limit, blockSize, blockAmount };
}
