import { useState } from 'react';
import { learnRules } from '../db/repo';
import type { Category, LearnedRule } from '../domain/types';
import { downloadBlob } from '../lib/download';
import { formatMoney } from '../lib/money';
import {
  buildProfilePlan, learnableCategories, parseProfileRows, PROFILE_EXAMPLES, PROFILE_HEADERS, PROFILE_SHEET,
  profileInstructions, readProfileFile, type ProfilePlan,
} from '../import/profileSheet';
import { ErrorBox, Modal, useAction } from './ui';

const SKIP = '';

/** Ajustes › Perfil de compra: baixar o modelo, preencher com a IA e importar (o app aprende as categorias). */
export function ProfilePurchaseCard({ categories, rules }: { categories: Category[]; rules: LearnedRule[] }) {
  const { error, run } = useAction();
  const [plan, setPlan] = useState<ProfilePlan | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const downloadModel = () => run(async () => {
    const { writeXlsx } = await import('../export/xlsx');
    const cats = learnableCategories(categories).map((c) => c.name);
    const normal = categories.filter((c) => c.kind === 'normal').map((c) => c.name);
    const bytes = writeXlsx([
      {
        name: PROFILE_SHEET,
        columns: [{ header: PROFILE_HEADERS[0], width: 12 }, { header: PROFILE_HEADERS[1], width: 42 }, { header: PROFILE_HEADERS[2], width: 12 }, { header: PROFILE_HEADERS[3], width: 24 }],
        rows: [
          ['05/10/2026', PROFILE_EXAMPLES[0], 120.5, normal[0] ?? cats[0]],
          ['06/10/2026', PROFILE_EXAMPLES[1], 80, normal[1] ?? cats[0]],
        ],
        validations: [{ sqref: 'D2:D5000', formula: `Categorias!$A$2:$A$${cats.length + 1}` }],
      },
      { name: 'Categorias', columns: [{ header: 'Categoria', width: 30 }], rows: cats.map((c) => [c]) },
      { name: 'Instruções', columns: [{ header: 'Instruções para preencher (você ou a sua IA)', width: 110, type: 'wrap' }], rows: profileInstructions(cats).map((t) => [t]) },
    ]);
    downloadBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'modelo-perfil-de-compra.xlsx');
  });

  const importFile = (file: File | undefined) => run(async () => {
    if (!file) return;
    setDone(null);
    const rows = parseProfileRows(readProfileFile(file.name, new Uint8Array(await file.arrayBuffer())));
    const p = buildProfilePlan(rows, categories, rules);
    if (!p.entries.length) throw new Error('Não encontrei nenhuma linha com Descrição e Categoria preenchidas.');
    setPlan(p);
  });

  return (
    <section className="card stack-sm">
      <h2>Perfil de compra</h2>
      <p className="muted small">
        Ensine de uma vez de qual categoria é cada lugar onde você compra. Baixe o modelo, peça para a sua IA preenchê-lo a partir
        das suas faturas e extratos e importe aqui. O app não cria lançamentos: só aprende, para classificar sozinho nas próximas importações.
      </p>
      <label className="btn primary file-btn" style={{ textAlign: 'center' }}>
        Importar perfil de compra
        <input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      <button type="button" className="btn ghost" onClick={() => void downloadModel()}>Baixar modelo de perfil</button>
      {done && <p className="small ok-box" role="status">{done}</p>}
      <ErrorBox error={error} />
      {plan && (
        <ProfileReview plan={plan} categories={categories} onClose={() => setPlan(null)}
          onSaved={(n) => { setPlan(null); setDone(`Pronto: ${n} ${n === 1 ? 'estabelecimento aprendido' : 'estabelecimentos aprendidos'}.`); }} />
      )}
    </section>
  );
}

/** Revisão antes de salvar: mostra o que vai ser aprendido; categorias desconhecidas pedem uma escolha. */
function ProfileReview({ plan, categories, onClose, onSaved }: {
  plan: ProfilePlan; categories: Category[]; onClose: () => void; onSaved: (n: number) => void;
}) {
  const { error, run } = useAction();
  const options = learnableCategories(categories);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const [choice, setChoice] = useState<Record<string, string>>(() => Object.fromEntries(plan.entries.map((e) => [e.key, e.categoryId ?? SKIP])));
  const unknown = plan.entries.filter((e) => e.categoryId === null);
  const known = plan.entries.filter((e) => e.categoryId !== null);
  const toSave = plan.entries.filter((e) => choice[e.key]);

  const row = (e: ProfilePlan['entries'][number]) => (
    <li key={e.key} className="profile-row">
      <div className="profile-row-text">
        <b>{e.example}</b>
        <span className="muted small block">
          {e.count} {e.count === 1 ? 'lançamento' : 'lançamentos'}{e.total ? ` · ${formatMoney(e.total)}` : ''}
          {e.categoryId === null && <> · planilha: “{e.categoryName}” (não existe no app)</>}
          {e.others.length > 0 && <> · também marcado como {e.others.join(', ')}</>}
          {e.previous && <> · antes: {catName.get(e.previous) ?? 'outra'}</>}
        </span>
      </div>
      <select aria-label={`Categoria de ${e.example}`} value={choice[e.key]} onChange={(ev) => setChoice((c) => ({ ...c, [e.key]: ev.target.value }))}>
        <option value={SKIP}>Pular</option>
        {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </li>
  );

  return (
    <Modal title="Importar perfil de compra" onClose={onClose}>
      <div className="stack-sm">
        <p className="small">
          Li <b>{plan.rows}</b> {plan.rows === 1 ? 'linha' : 'linhas'} e encontrei <b>{plan.entries.length}</b> {plan.entries.length === 1 ? 'estabelecimento' : 'estabelecimentos'}.
          {plan.noCategory > 0 && <> {plan.noCategory} {plan.noCategory === 1 ? 'linha sem categoria foi pulada' : 'linhas sem categoria foram puladas'}.</>}
        </p>
        {unknown.length > 0 && (
          <>
            <h3 className="small">Escolha a categoria ({unknown.length})</h3>
            <p className="muted small">A planilha usou categorias que não existem no app. Escolha uma das suas ou deixe em “Pular”.</p>
            <ul className="profile-list">{unknown.map(row)}</ul>
          </>
        )}
        {known.length > 0 && (
          <>
            <h3 className="small">Vão ser aprendidos ({known.length})</h3>
            <ul className="profile-list">{known.map(row)}</ul>
          </>
        )}
        <p className="muted small">Os lançamentos “A identificar” desses estabelecimentos (em meses abertos) já recebem a categoria.</p>
        <ErrorBox error={error} />
        <div className="row-end">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn primary" disabled={!toSave.length}
            onClick={() => run(async () => {
              await learnRules(toSave.map((e) => ({ key: e.key, categoryId: choice[e.key], example: e.example })));
              onSaved(toSave.length);
            })}>
            Aprender {toSave.length}
          </button>
        </div>
      </div>
    </Modal>
  );
}
