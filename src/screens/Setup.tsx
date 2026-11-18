import { useState } from 'react';
import { parseRuleDraft, RuleFields, type RuleDraft } from '../components/RuleFields';
import { statusText } from '../components/SyncPanel';
import { connect, useSyncState } from '../sync/engine';
import { ErrorBox, Field, MoneyInput, useAction } from '../components/ui';
import { CATEGORY_COLORS, SPECIAL_CATEGORIES } from '../db/db';
import { defaultSetupCategories, importBackup, initialize, type SetupInput } from '../db/repo';
import { startMonthOf } from '../domain/ledger';
import { centsToInput, parseMoney } from '../lib/money';
import { monthLabel, todayISO } from '../lib/months';

interface CatDraft {
  key: string;
  name: string;
  color: string;
  rule: RuleDraft;
}

const draftFromDefault = (c: ReturnType<typeof defaultSetupCategories>[number]): CatDraft => ({
  key: crypto.randomUUID(),
  name: c.name,
  color: c.color,
  rule: {
    contributes: c.contributes,
    limit: c.contributes ? centsToInput(c.limit) : '',
    blockSize: c.contributes ? centsToInput(c.blockSize) : '',
    blockAmount: c.contributes ? centsToInput(c.blockAmount) : '',
  },
});

export function Setup({ onHelp }: { onHelp: () => void }) {
  const sync = useSyncState();
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [startBalance, setStartBalance] = useState('');
  const [fixed, setFixed] = useState('');
  const [cats, setCats] = useState<CatDraft[]>(() => defaultSetupCategories().map(draftFromDefault));
  const { error, setError, run } = useAction();
  const startMonth = startMonthOf({ caixinhaStartDate: startDate || todayISO() });

  const updateCat = (key: string, patch: Partial<CatDraft>) =>
    setCats((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const removeCat = (key: string) => setCats((cs) => cs.filter((c) => c.key !== key));
  const addCat = () =>
    setCats((cs) => [
      ...cs,
      {
        key: crypto.randomUUID(),
        name: '',
        color: CATEGORY_COLORS[cs.length % CATEGORY_COLORS.length],
        rule: { contributes: true, limit: '', blockSize: '', blockAmount: '' },
      },
    ]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const balance = parseMoney(startBalance);
    const fixedAmount = parseMoney(fixed);
    if (!name.trim()) return setError('Informe seu nome.');
    if (!startDate) return setError('Informe a data do saldo da caixinha.');
    if (balance === null || balance < 0) return setError('Informe o saldo da caixinha (pode ser 0).');
    if (fixedAmount === null || fixedAmount < 0) return setError('Informe o aporte fixo mensal (pode ser 0).');
    if (cats.length === 0) return setError('Crie pelo menos uma categoria.');
    const reserved = SPECIAL_CATEGORIES.map((c) => c.name.toLowerCase());
    const seen = new Set<string>();
    const categories: SetupInput['categories'] = [];
    for (const c of cats) {
      const n = c.name.trim();
      if (!n) return setError('Toda categoria precisa de um nome.');
      if (reserved.includes(n.toLowerCase())) return setError(`"${n}" é uma categoria automática. Escolha outro nome.`);
      if (seen.has(n.toLowerCase())) return setError(`A categoria "${n}" está repetida.`);
      seen.add(n.toLowerCase());
      const rule = parseRuleDraft(c.rule);
      if (typeof rule === 'string') return setError(`${n}: ${rule}`);
      categories.push({ name: n, color: c.color, ...rule });
    }
    await run(() => initialize({ name, caixinhaStartDate: startDate, caixinhaStartBalance: balance, fixedAmount, categories }, startMonth));
  };

  const restore = async (file: File | undefined) => {
    if (!file) return;
    await run(async () => importBackup(await file.text()));
  };

  return (
    <div className="setup">
      <header className="setup-head">
        <h1>Bem-vindo(a)!</h1>
        <p>Vamos configurar seu controle de gastos. Tudo pode ser alterado depois em <b>Ajustes</b>.</p>
        <button type="button" className="link-btn" onClick={onHelp}>Como instalar e usar o app</button>
      </header>
      {sync.status !== 'unconfigured' && (
        <section className="card stack-sm setup-sync">
          <h2>Já usa em outro aparelho?</h2>
          <p className="muted small">Entre com a mesma conta Google para trazer seus dados do Drive, sem configurar de novo.</p>
          {sync.status === 'syncing'
            ? <p className="small">Buscando seus dados…</p>
            : <button type="button" className="btn primary" onClick={connect}>Já uso em outro aparelho: entrar com Google</button>}
          {sync.notice && <p className="ok-box">{sync.notice}</p>}
          {sync.status === 'error' && <p className="error-box">{statusText(sync)}</p>}
        </section>
      )}
      <form onSubmit={submit} className="stack">
        <section className="card stack">
          <h2>Você</h2>
          <Field label="Seu nome">
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
          </Field>
        </section>

        <section className="card stack">
          <h2>Caixinha Nubank</h2>
          <div className="grid-2">
            <Field label="Data do saldo" hint="Saldo ao final deste dia. Dica: use o último dia do mês anterior.">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="Saldo total da caixinha nessa data">
              <MoneyInput value={startBalance} onChange={setStartBalance} />
            </Field>
          </div>
          <Field label="Aporte fixo mensal" hint={`Devido todo mês, a partir de ${monthLabel(startMonth)}, independente dos gastos.`}>
            <MoneyInput value={fixed} onChange={setFixed} />
          </Field>
        </section>

        <section className="card stack">
          <h2>Categorias</h2>
          <p className="muted small">
            Acima do <b>limite</b>, a cada <b>X</b> reais gastos a mais, você aporta <b>Y</b> na caixinha.
            Bloco incompleto conta como inteiro.
          </p>
          {cats.map((c) => (
            <div key={c.key} className="rule-row">
              <div className="rule-name-edit">
                <input
                  type="color"
                  className="color-dot"
                  value={c.color}
                  aria-label="Cor"
                  onChange={(e) => updateCat(c.key, { color: e.target.value })}
                />
                <input
                  value={c.name}
                  placeholder="Nome da categoria"
                  aria-label="Nome da categoria"
                  onChange={(e) => updateCat(c.key, { name: e.target.value })}
                />
                <button type="button" className="icon-btn" aria-label={`Remover ${c.name || 'categoria'}`} onClick={() => removeCat(c.key)}>×</button>
              </div>
              <RuleFields value={c.rule} onChange={(rule) => updateCat(c.key, { rule })} />
            </div>
          ))}
          <button type="button" className="btn ghost" onClick={addCat}>+ Adicionar categoria</button>
          <p className="muted small">"A identificar" e "Não é gasto" são criadas automaticamente e não têm limite.</p>
        </section>

        <ErrorBox error={error} />
        <button className="btn primary big" type="submit">Começar</button>
        <label className="btn ghost file-btn">
          Restaurar de um backup
          <input type="file" accept="application/json,.json" onChange={(e) => restore(e.target.files?.[0])} />
        </label>
      </form>
    </div>
  );
}
