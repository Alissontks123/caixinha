import { useState } from 'react';
import { ErrorBox, Field, Modal, MoneyInput, useAction } from '../components/ui';
import {
  addCategory, deleteCategory, deleteFixedVersion, deleteLearnedRule, deleteRuleVersion, exportBackup, importBackup,
  moveCategory, setC6Password, setCardMine, setCategoryRule, setFixedContribution, updateCategory, updateProfile,
} from '../db/repo';
import { parseRuleDraft, RuleFields, type RuleDraft } from '../components/RuleFields';
import { SyncSettings } from '../components/SyncPanel';
import { UNIDENTIFIED_ID } from '../db/db';
import { resolveVersion, ruleContributes, ruleForMonth } from '../domain/rules';
import type { Category, CategoryRuleVersion, Month, Profile } from '../domain/types';
import { centsToInput, formatMoney, parseMoney } from '../lib/money';
import { currentMonth, monthLabel, todayISO } from '../lib/months';
import type { AppData } from '../useAppData';

type Data = AppData & { profile: Profile };

export function Settings({ data, onHelp }: { data: Data; onHelp: () => void }) {
  const [editingCat, setEditingCat] = useState<Category | 'new' | null>(null);
  const [editingFixed, setEditingFixed] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const { error, run } = useAction();
  const month = currentMonth();
  const fixedNow = resolveVersion(data.fixedVersions, month);
  const fixedHistory = [...data.fixedVersions].sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth));
  const normal = data.categories.filter((c) => c.kind === 'normal');

  const download = async () => {
    const json = await exportBackup();
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-caixinha-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const restore = async (file: File | undefined) => {
    if (!file) return;
    if (!window.confirm('Restaurar o backup substitui TODOS os dados deste aparelho. Continuar?')) return;
    await run(async () => importBackup(await file.text()));
  };

  return (
    <div className="stack">
      <section className="card stack-sm">
        <div className="row-between">
          <h2>Perfil e caixinha</h2>
          <button className="btn ghost small" onClick={() => setEditingProfile(true)}>Editar</button>
        </div>
        <dl className="kv">
          <dt>Nome</dt><dd>{data.profile.name}</dd>
          <dt>Saldo inicial</dt><dd>{formatMoney(data.profile.caixinhaStartBalance)} em {data.profile.caixinhaStartDate.split('-').reverse().join('/')}</dd>
          <dt>Alerta de limite</dt><dd>a partir de {data.profile.alertThreshold}% do limite</dd>
        </dl>
      </section>

      <section className="card stack-sm">
        <div className="row-between">
          <h2>Aporte fixo mensal da caixinha</h2>
          <button className="btn ghost small" onClick={() => setEditingFixed(true)}>Alterar</button>
        </div>
        <p className="big-number">{formatMoney(fixedNow?.amount ?? 0)}<span className="muted small"> / mês</span></p>
        {fixedHistory.length > 1 && (
          <ul className="history">
            {fixedHistory.map((v) => (
              <li key={v.id}>
                <span>desde {monthLabel(v.effectiveMonth)}: <b>{formatMoney(v.amount)}</b></span>
                <button className="icon-btn" aria-label="Excluir versão" onClick={() =>
                  window.confirm('Excluir este valor do histórico?') && run(() => deleteFixedVersion(v.id))}>×</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack-sm">
        <div className="row-between">
          <h2 className="section-title">Categorias</h2>
          <button className="btn ghost small" onClick={() => setEditingCat('new')}>+ Nova</button>
        </div>
        <ErrorBox error={error} />
        {normal.map((c, i) => {
          const rule = ruleForMonth(data.rules, c.id, month);
          return (
            <div key={c.id} className="card cat-setting">
              <button className="cat-setting-main" onClick={() => setEditingCat(c)}>
                <span className="cat-name"><span className="dot" style={{ background: c.color }} />{c.name}</span>
                {rule && <span className="muted small">{describeRule(rule)}</span>}
              </button>
              <div className="order-btns">
                <button className="icon-btn" disabled={i === 0} aria-label="Subir" onClick={() => run(() => moveCategory(c.id, -1))}>↑</button>
                <button className="icon-btn" disabled={i === normal.length - 1} aria-label="Descer" onClick={() => run(() => moveCategory(c.id, 1))}>↓</button>
              </div>
            </div>
          );
        })}
        <p className="muted small">"A identificar" e "Não é gasto" são fixas e não têm limite.</p>
      </section>

      <SyncSettings />

      <ImportSettings data={data} />

      <button className="btn ghost" onClick={onHelp}>Ajuda e instalação</button>

      <section className="card stack-sm">
        <h2>Backup</h2>
        <p className="muted small">
          Salve uma cópia dos seus dados. Até a sincronização com o Google Drive ficar pronta, use isto para levar os dados para outro aparelho.
        </p>
        <div className="grid-2">
          <button className="btn ghost" onClick={download}>Exportar backup</button>
          <label className="btn ghost file-btn">
            Restaurar backup
            <input type="file" accept="application/json,.json" onChange={(e) => restore(e.target.files?.[0])} />
          </label>
        </div>
      </section>

      {editingCat && (
        <CategoryForm data={data} category={editingCat === 'new' ? undefined : editingCat} onClose={() => setEditingCat(null)} />
      )}
      {editingFixed && <FixedForm current={fixedNow?.amount ?? 0} onClose={() => setEditingFixed(false)} />}
      {editingProfile && <ProfileForm profile={data.profile} onClose={() => setEditingProfile(false)} />}
    </div>
  );
}

/** Senha da C6, cartões e estabelecimentos memorizados. */
function ImportSettings({ data }: { data: Data }) {
  const { error, run } = useAction();
  const [showAll, setShowAll] = useState(false);
  const catName = new Map(data.categories.map((c) => [c.id, c.name]));
  const rules = [...data.learnedRules].sort((a, b) => a.example.localeCompare(b.example));
  const visible = showAll ? rules : rules.slice(0, 8);

  return (
    <>
      <section className="card stack-sm">
        <h2>Senha da fatura C6</h2>
        <p className="muted small">
          {data.profile.c6Password
            ? 'Salva neste aparelho. Será usada automaticamente ao importar a fatura C6.'
            : 'Nenhuma senha salva. Ela será pedida na primeira importação da fatura C6.'}
        </p>
        {data.profile.c6Password && (
          <button className="btn ghost small" onClick={() => run(() => setC6Password(undefined))}>Esquecer senha</button>
        )}
      </section>

      <section className="card stack-sm">
        <h2>Cartões</h2>
        {data.cards.length === 0 ? (
          <p className="muted small">Os cartões aparecem aqui depois da primeira importação de fatura.</p>
        ) : (
          <>
            <p className="muted small">Só os gastos dos cartões marcados como seus entram no seu controle.</p>
            {data.cards.map((c) => (
              <label key={c.id} className="switch-row card-choice">
                <input type="checkbox" checked={c.mine} onChange={(e) => run(() => setCardMine(c.id, e.target.checked))} />
                <span className="switch" aria-hidden />
                <span>
                  <b>{c.bank === 'c6' ? 'C6' : 'Nubank'} final {c.last4}</b>
                  <span className="muted small block">{c.holder}</span>
                </span>
              </label>
            ))}
          </>
        )}
      </section>

      <section className="card stack-sm">
        <h2>Estabelecimentos memorizados ({rules.length})</h2>
        {rules.length === 0 ? (
          <p className="muted small">Quando você classificar um estabelecimento, ele aparece aqui e é reconhecido sozinho nas próximas vezes.</p>
        ) : (
          <>
            <ul className="history">
              {visible.map((r) => (
                <li key={r.key}>
                  <span>{r.example} → <b>{catName.get(r.categoryId) ?? 'categoria excluída'}</b></span>
                  <button className="icon-btn" aria-label={`Esquecer ${r.example}`} onClick={() => run(() => deleteLearnedRule(r.key))}>×</button>
                </li>
              ))}
            </ul>
            {rules.length > 8 && (
              <button className="btn ghost small" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Mostrar menos' : `Ver todos (${rules.length})`}</button>
            )}
            <p className="muted small">Para mudar a categoria de um estabelecimento, troque a categoria de um lançamento dele em Lançamentos.</p>
          </>
        )}
        <ErrorBox error={error} />
      </section>
    </>
  );
}

function describeRule(r: CategoryRuleVersion): string {
  if (!ruleContributes(r)) return 'Não gera aporte (sem limite)';
  return `Limite ${formatMoney(r.limit)} · a cada ${formatMoney(r.blockSize)} acima, aporta ${formatMoney(r.blockAmount)}`;
}

/** Seletor "a partir de qual mês" usado ao alterar regras. */
function EffectiveMonth({ value, onChange }: { value: Month; onChange: (m: Month) => void }) {
  return (
    <Field label="A partir de qual mês vale?" hint="Meses já fechados não mudam. Meses abertos a partir deste são recalculados.">
      <input type="month" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function CategoryForm({ data, category, onClose }: { data: Data; category?: Category; onClose: () => void }) {
  const month = currentMonth();
  const current = category ? ruleForMonth(data.rules, category.id, month) : undefined;
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState(category?.color ?? '#2f7fc1');
  const currentContributes = !current || ruleContributes(current);
  const [rule, setRule] = useState<RuleDraft>({
    contributes: currentContributes,
    limit: current && currentContributes ? centsToInput(current.limit) : '',
    blockSize: current && currentContributes ? centsToInput(current.blockSize) : '',
    blockAmount: current && currentContributes ? centsToInput(current.blockAmount) : '',
  });
  const [effective, setEffective] = useState(month);
  const [moveTo, setMoveTo] = useState(UNIDENTIFIED_ID);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { error, setError, run } = useAction();
  const history = category
    ? data.rules.filter((r) => r.categoryId === category.id).sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth))
    : [];
  const txCount = category ? data.transactions.filter((t) => t.categoryId === category.id).length : 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Informe o nome.');
    if (data.categories.some((c) => c.id !== category?.id && c.name.toLowerCase() === name.trim().toLowerCase())) {
      return setError('Já existe uma categoria com esse nome.');
    }
    const values = parseRuleDraft(rule);
    if (typeof values === 'string') return setError(values);
    if (!effective) return setError('Escolha a partir de qual mês vale.');
    const ok = await run(async () => {
      if (!category) return addCategory(name, values, effective);
      await updateCategory(category.id, { name: name.trim(), color });
      const changed =
        !current ||
        currentContributes !== values.contributes ||
        (values.contributes &&
          (current.limit !== values.limit || current.blockSize !== values.blockSize || current.blockAmount !== values.blockAmount));
      if (changed) await setCategoryRule(category.id, effective, values);
    });
    if (ok) onClose();
  };

  const remove = async () => {
    if (!category) return;
    if (await run(() => deleteCategory(category.id, moveTo))) onClose();
  };

  return (
    <Modal title={category ? 'Editar categoria' : 'Nova categoria'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="grid-name-color">
          <Field label="Nome"><input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!category} /></Field>
          <Field label="Cor"><input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
        </div>
        <RuleFields value={rule} categoryName={name} onChange={setRule} />
        <EffectiveMonth value={effective} onChange={setEffective} />
        {history.length > 1 && (
          <div>
            <p className="field-label">Histórico de regras</p>
            <ul className="history">
              {history.map((r) => (
                <li key={r.id}>
                  <span>desde {monthLabel(r.effectiveMonth)}: {describeRule(r)}</span>
                  <button type="button" className="icon-btn" aria-label="Excluir versão"
                    onClick={() => window.confirm('Excluir esta versão da regra?') && run(() => deleteRuleVersion(r.id))}>×</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <ErrorBox error={error} />
        <div className="row-end">
          {category && !confirmDelete && (
            <button type="button" className="btn danger-ghost" onClick={() => setConfirmDelete(true)}>Excluir</button>
          )}
          <button type="submit" className="btn primary">Salvar</button>
        </div>
        {category && confirmDelete && (
          <div className="card danger-zone stack-sm">
            <p className="small">
              {txCount > 0
                ? `Esta categoria tem ${txCount} lançamento(s). Para onde eles devem ir?`
                : 'Excluir esta categoria?'}
            </p>
            {txCount > 0 && (
              <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                {data.categories.filter((c) => c.id !== category.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <p className="muted small">Meses já fechados mantêm os valores congelados.</p>
            <div className="row-end">
              <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>Cancelar</button>
              <button type="button" className="btn danger" onClick={remove}>Excluir categoria</button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

function FixedForm({ current, onClose }: { current: number; onClose: () => void }) {
  const [amount, setAmount] = useState(centsToInput(current));
  const [effective, setEffective] = useState(currentMonth());
  const { error, setError, run } = useAction();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseMoney(amount);
    if (cents === null || cents < 0) return setError('Informe um valor válido (pode ser 0).');
    if (!effective) return setError('Escolha a partir de qual mês vale.');
    if (await run(() => setFixedContribution(effective, cents))) onClose();
  };
  return (
    <Modal title="Aporte fixo mensal da caixinha" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Valor por mês" hint="Valor que deverá ser aplicado na caixinha todo mês, independente dos gastos."><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field>
        <EffectiveMonth value={effective} onChange={setEffective} />
        <ErrorBox error={error} />
        <div className="row-end"><button className="btn primary" type="submit">Salvar</button></div>
      </form>
    </Modal>
  );
}

function ProfileForm({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [name, setName] = useState(profile.name);
  const [startDate, setStartDate] = useState(profile.caixinhaStartDate);
  const [startBalance, setStartBalance] = useState(centsToInput(profile.caixinhaStartBalance));
  const [threshold, setThreshold] = useState(String(profile.alertThreshold));
  const { error, setError, run } = useAction();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const balance = parseMoney(startBalance);
    const t = Number(threshold);
    if (!name.trim()) return setError('Informe o nome.');
    if (!startDate) return setError('Informe a data do saldo inicial.');
    if (balance === null || balance < 0) return setError('Informe um saldo válido.');
    if (!Number.isFinite(t) || t < 1 || t > 100) return setError('O alerta deve estar entre 1% e 100%.');
    if (startDate !== profile.caixinhaStartDate &&
      !window.confirm('Mudar a data do saldo inicial muda a partir de quando o aporte fixo é cobrado e quais movimentações contam. Continuar?')) return;
    if (await run(() => updateProfile({ name: name.trim(), caixinhaStartDate: startDate, caixinhaStartBalance: balance, alertThreshold: t }))) onClose();
  };
  return (
    <Modal title="Perfil e caixinha" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Nome"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid-2">
          <Field label="Data do saldo inicial" hint="Saldo ao final deste dia. Dica: use o último dia do mês anterior, pois o sistema contará os aportes da caixinha com base nos extratos a partir dessa data."><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
          <Field label="Saldo inicial da Caixinha Nubank"><MoneyInput value={startBalance} onChange={setStartBalance} /></Field>
        </div>
        <Field label="Alertar quando a categoria atingir (% do limite)">
          <input type="number" min={1} max={100} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </Field>
        <ErrorBox error={error} />
        <div className="row-end"><button className="btn primary" type="submit">Salvar</button></div>
      </form>
    </Modal>
  );
}
