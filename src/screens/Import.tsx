import { useMemo, useRef, useState } from 'react';
import { ErrorBox, Field } from '../components/ui';
import { saveCards, saveImport, setC6Password, type ImportResult } from '../db/repo';
import { UNIDENTIFIED_ID } from '../db/db';
import { alertsForChange, describeAlert, type ChangeAlert } from '../domain/alerts';
import type { Category, KnownCard, Month, Transaction } from '../domain/types';
import { readPdfInBrowser } from '../import/pdfBrowser';
import { parseDocument } from '../import/parse';
import { cardsInDocument, prepareReview, resolveCategory, type ReviewItem, type ReviewStatus } from '../import/prepare';
import { PdfPasswordError, type ParsedDocument } from '../import/types';
import { formatMoney } from '../lib/money';
import { dateLabel, monthLabel } from '../lib/months';
import { MerchantHint } from '../components/MerchantHint';
import { shareOf } from '../domain/share';
import { summaryInput, type ReadyData } from '../useAppData';

type Phase =
  | { step: 'pick' }
  | { step: 'password'; bytes: Uint8Array; incorrect: boolean }
  | { step: 'cards'; doc: ParsedDocument; cards: KnownCard[] }
  | { step: 'review'; doc: ParsedDocument; review: ReviewItem[] }
  | { step: 'done'; doc: ParsedDocument; result: ImportResult; month?: Month; alerts: ChangeAlert[] };

interface Props {
  data: ReadyData;
  goToTransactions: (month?: Month) => void;
}

/** Resultado de cada arquivo numa importação de vários PDFs. */
interface FileResult { name: string; label?: string; result?: ImportResult; error?: string; skipped?: boolean }

export function Import({ data, goToTransactions }: Props) {
  const [phase, setPhase] = useState<Phase>({ step: 'pick' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // vários arquivos: fila dos que faltam, posição atual e o resultado de cada um
  const queue = useRef<File[]>([]);
  const [batch, setBatch] = useState<{ total: number; index: number; name: string; results: FileResult[]; alerts: ChangeAlert[]; months: Month[] } | null>(null);
  const batchRef = useRef(batch);
  batchRef.current = batch;

  const startReview = (doc: ParsedDocument, cards: KnownCard[]) => {
    const review = prepareReview(doc, {
      categories: data.categories,
      learned: new Map(data.learnedRules.map((r) => [r.key, r.categoryId])),
      existingFingerprints: new Set(data.transactions.map((t) => t.fingerprint).filter((f): f is string => !!f)),
      closedMonths: new Set(data.closings.map((c) => c.month)),
      cards,
      transactions: data.transactions,
      movements: data.movements,
      caixinhaStartDate: data.profile.caixinhaStartDate,
    });
    setPhase({ step: 'review', doc, review });
  };

  const continueWith = (doc: ParsedDocument) => {
    const known = new Set(data.cards.map((c) => c.id));
    const unknown = cardsInDocument(doc).filter((c) => !known.has(c.id));
    if (unknown.length) setPhase({ step: 'cards', doc, cards: unknown.map((c) => ({ ...c, mine: false })) });
    else startReview(doc, data.cards);
  };

  /** Termina o arquivo atual (importado, pulado ou com erro) e passa para o próximo da fila. */
  const finishFile = (r: Omit<FileResult, 'name'>, alerts: ChangeAlert[] = [], month?: Month) => {
    const b = batchRef.current;
    if (!b) return;
    const updated = {
      ...b,
      results: [...b.results, { name: b.name, ...r }],
      alerts: [...b.alerts, ...alerts],
      months: month ? [...b.months, month] : b.months,
    };
    const next = queue.current.shift();
    if (next) {
      setBatch({ ...updated, index: b.index + 1, name: next.name });
      batchRef.current = { ...updated, index: b.index + 1, name: next.name };
      void readFile(next);
    } else {
      setBatch(updated);
      batchRef.current = updated;
      const last = [...updated.results].reverse().find((x) => x.result);
      setPhase({
        step: 'done',
        doc: { label: last?.label ?? '' } as ParsedDocument,
        result: {
          saved: updated.results.reduce((s, x) => s + (x.result?.saved ?? 0), 0),
          caixinha: updated.results.reduce((s, x) => s + (x.result?.caixinha ?? 0), 0),
          learned: updated.results.reduce((s, x) => s + (x.result?.learned ?? 0), 0),
        },
        month: mostCommon(updated.months),
        alerts: updated.alerts,
      });
    }
  };

  const read = async (bytes: Uint8Array, password: string | undefined, typedByUser: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const pages = await readPdfInBrowser(bytes, password);
      const doc = parseDocument(pages);
      if (typedByUser && password && doc.source === 'fatura-c6') await setC6Password(password);
      continueWith(doc);
    } catch (e) {
      if (e instanceof PdfPasswordError) {
        setPhase({ step: 'password', bytes, incorrect: e.incorrect });
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        if (batchRef.current && batchRef.current.total > 1) finishFile({ error: msg });
        else { setError(msg); setPhase({ step: 'pick' }); }
      }
    } finally {
      setBusy(false);
    }
  };

  const readFile = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await read(bytes, data.profile.c6Password, false);
  };

  const onFiles = async (files: File[]) => {
    if (!files.length) return;
    queue.current = files.slice(1);
    const b = { total: files.length, index: 1, name: files[0].name, results: [], alerts: [], months: [] };
    setBatch(b);
    batchRef.current = b;
    await readFile(files[0]);
  };

  /** Pular o arquivo atual (vários arquivos) ou cancelar (um arquivo só). */
  const cancelCurrent = () => {
    if (batchRef.current && batchRef.current.total > 1) finishFile({ skipped: true });
    else { setBatch(null); setPhase({ step: 'pick' }); }
  };
  const stopAll = () => { queue.current = []; setBatch(null); setPhase({ step: 'pick' }); };
  const multi = !!batch && batch.total > 1;

  return (
    <div className="stack">
      {multi && phase.step !== 'done' && phase.step !== 'pick' && (
        <div className="batch-bar">
          <span className="small">Arquivo <b>{batch.index} de {batch.total}</b> · <span className="muted break">{batch.name}</span></span>
          <button type="button" className="link-btn small" onClick={stopAll}>Parar a importação</button>
        </div>
      )}

      {phase.step === 'pick' && (
        <section className="card stack" data-tour="import">
          <h2>Importar PDF</h2>
          <p className="muted small">
            Aceita <b>fatura do cartão C6</b>, <b>fatura do cartão Nubank</b> e <b>extrato da conta Nubank</b>.
            Dá para escolher vários arquivos de uma vez: o app mostra a revisão de um depois do outro.
            Os arquivos são lidos só neste aparelho e não são enviados para lugar nenhum.
          </p>
          <label className={`btn primary big file-btn ${busy ? 'disabled' : ''}`}>
            {busy ? 'Lendo o PDF…' : 'Escolher arquivo(s) PDF'}
            <input type="file" accept="application/pdf,.pdf" multiple disabled={busy}
              onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
          </label>
          <ErrorBox error={error} />
        </section>
      )}

      {phase.step === 'password' && (
        <PasswordStep
          incorrect={phase.incorrect}
          busy={busy}
          onCancel={cancelCurrent}
          onSubmit={(pw) => read(phase.bytes, pw, true)}
        />
      )}

      {phase.step === 'cards' && (
        <CardsStep
          cards={phase.cards}
          onCancel={cancelCurrent}
          onConfirm={async (cards) => {
            await saveCards(cards);
            startReview(phase.doc, [...data.cards, ...cards]);
          }}
        />
      )}

      {phase.step === 'review' && (
        <ReviewStep
          key={batch ? `${batch.index}` : 'single'}
          doc={phase.doc}
          review={phase.review}
          categories={data.categories}
          cancelLabel={multi ? 'Pular arquivo' : 'Cancelar'}
          onCancel={cancelCurrent}
          onConfirm={async (choices, caixinhaIncluded, avistaChosen) => {
            // simula o "depois" para avisar sobre limites e novos blocos de aporte
            const newTx: Transaction[] = phase.review.filter((r) => r.status === 'new').map((r) => ({
              id: `__import_${r.index}`, date: r.item.date, month: r.item.month, description: r.item.description,
              amount: shareOf(reviewAmount(r, avistaChosen), r.share), categoryId: resolveCategory(phase.review, choices, r.index) || UNIDENTIFIED_ID,
              source: phase.doc.source, createdAt: 0,
            }));
            const alerts = alertsForChange(summaryInput(data), [...data.transactions, ...newTx], newTx.map((t) => t.month), data.profile.alertThreshold);
            const result = await saveImport(phase.doc, phase.review, choices, caixinhaIncluded, avistaChosen);
            const month = mostCommon(newTx.map((t) => t.month));
            if (multi) finishFile({ label: phase.doc.label, result }, alerts, month);
            else setPhase({ step: 'done', doc: phase.doc, result, month, alerts });
          }}
        />
      )}

      {phase.step === 'done' && (
        <section className="card stack">
          <h2>Importação concluída</h2>
          {multi ? (
            <ul className="item-list">
              {batch.results.map((r, i) => (
                <li key={i}>
                  <span>{r.label ? <>{r.label}<span className="muted small break"> · {r.name}</span></> : <span className="break">{r.name}</span>}</span>
                  <b className={r.error ? 'text-danger' : r.skipped ? 'muted' : ''}>
                    {r.error ? 'não lido' : r.skipped ? 'pulado' : `${r.result?.saved ?? 0} lanç.`}
                  </b>
                </li>
              ))}
            </ul>
          ) : <p>{phase.doc.label}</p>}
          {multi && batch.results.some((r) => r.error) && (
            <p className="error-box small">
              {batch.results.filter((r) => r.error).map((r) => `${r.name}: ${r.error}`).join(' · ')}
            </p>
          )}
          <ul className="plain-list">
            <li><b>{phase.result.saved}</b> lançamento(s) importado(s)</li>
            {phase.result.caixinha > 0 && <li><b>{phase.result.caixinha}</b> movimento(s) da caixinha registrado(s)</li>}
            {phase.result.learned > 0 && <li><b>{phase.result.learned}</b> estabelecimento(s) memorizado(s) para as próximas vezes</li>}
          </ul>
          {phase.alerts.length > 0 && (
            <div className="alert-banner warn-surface">
              <h3>Efeito desta importação</h3>
              {phase.alerts.map((a, i) => (
                <div key={`${a.month}${a.categoryId}${i}`} className="alert-line">
                  <span className={`alert-icon ${a.type === 'new-block' ? 'over' : 'near'}`} aria-hidden>{a.type === 'new-block' ? '+' : '!'}</span>
                  <span>{describeAlert(a)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="grid-2">
            <button className="btn primary" onClick={() => goToTransactions(phase.month)}>Ver lançamentos</button>
            <button className="btn ghost" onClick={() => { setBatch(null); setPhase({ step: 'pick' }); }}>Importar outro PDF</button>
          </div>
        </section>
      )}
    </div>
  );
}

function mostCommon(values: string[]): string | undefined {
  const count = new Map<string, number>();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function PasswordStep({ incorrect, busy, onSubmit, onCancel }: {
  incorrect: boolean; busy: boolean; onSubmit: (pw: string) => void; onCancel: () => void;
}) {
  const [pw, setPw] = useState('');
  return (
    <form className="card stack" onSubmit={(e) => { e.preventDefault(); if (pw.trim()) onSubmit(pw.trim()); }}>
      <h2>PDF com senha</h2>
      <p className="muted small">
        A fatura da C6 usa como senha os <b>6 primeiros dígitos do CPF</b> do titular. A senha fica salva neste aparelho para as próximas importações.
      </p>
      {incorrect && <p className="error-box">Senha incorreta. Tente de novo.</p>}
      <Field label="Senha do PDF">
        <input type="password" inputMode="numeric" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
      </Field>
      <div className="row-end">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Abrindo…' : 'Abrir'}</button>
      </div>
    </form>
  );
}

function CardsStep({ cards, onConfirm, onCancel }: {
  cards: KnownCard[]; onConfirm: (cards: KnownCard[]) => void; onCancel: () => void;
}) {
  const [list, setList] = useState(cards);
  return (
    <section className="card stack">
      <h2>De quem são estes cartões?</h2>
      <p className="muted small">
        Encontrei cartões que ainda não conheço. Marque os que são <b>seus</b>: só os gastos deles entram no seu controle.
        O app memoriza a resposta (dá para mudar em Ajustes).
      </p>
      {list.map((c) => (
        <label key={c.id} className="switch-row card-choice">
          <input type="checkbox" checked={c.mine} onChange={(e) => setList((l) => l.map((x) => (x.id === c.id ? { ...x, mine: e.target.checked } : x)))} />
          <span className="switch" aria-hidden />
          <span>
            <b>{c.bank === 'c6' ? 'C6' : 'Nubank'} final {c.last4}</b>
            <span className="muted small block">{c.holder}</span>
          </span>
        </label>
      ))}
      <div className="row-end">
        <button className="btn ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn primary" onClick={() => onConfirm(list)}>Continuar</button>
      </div>
    </section>
  );
}

const STATUS_INFO: Record<Exclude<ReviewStatus, 'new' | 'caixinha'>, string> = {
  'before-start': 'Caixinha: antes da data do saldo inicial (já incluídos nele)',
  duplicate: 'Já importados antes',
  'closed-month': 'De meses já fechados (não serão importados)',
  'not-mine': 'De cartões de outras pessoas',
  ignored: 'Não são gastos (ignorados)',
};

function ReviewStep({ doc, review, categories, onConfirm, onCancel, cancelLabel = 'Cancelar' }: {
  doc: ParsedDocument;
  cancelLabel?: string;
  review: ReviewItem[];
  categories: Category[];
  onConfirm: (choices: Map<number, string>, caixinhaIncluded: Set<number>, avista: Set<number>) => Promise<void>;
  onCancel: () => void;
}) {
  const [choices, setChoices] = useState(() => new Map<number, string>());
  const caixinha = review.filter((r) => r.status === 'caixinha');
  const [included, setIncluded] = useState(() => new Set(caixinha.map((r) => r.index)));
  const toggleIncluded = (index: number, on: boolean) =>
    setIncluded((prev) => {
      const next = new Set(prev);
      if (on) next.add(index); else next.delete(index);
      return next;
    });
  const [saving, setSaving] = useState(false);
  // compras parceladas novas que o usuário escolheu considerar à vista
  const [avista, setAvista] = useState(() => new Set<number>());
  const setMode = (index: number, on: boolean) => setAvista((prev) => {
    const next = new Set(prev);
    if (on) next.add(index); else next.delete(index);
    return next;
  });
  const [error, setError] = useState<string | null>(null);
  const fresh = review.filter((r) => r.status === 'new');
  // a lista "precisa escolher" é fixada ao abrir, para os itens não pularem de seção enquanto o usuário escolhe
  const askIndexes = useMemo(() => new Set(fresh.filter((r) => !resolveCategory(review, new Map(), r.index)).map((r) => r.index)), [review]);
  const pending = fresh.filter((r) => !resolveCategory(review, choices, r.index));
  const failedChecks = doc.checks.filter((c) => c.expected !== c.found);
  const total = fresh.reduce((s, r) => s + r.item.amount, 0);

  const choose = (r: ReviewItem, categoryId: string) => {
    setChoices((prev) => {
      const next = new Map(prev);
      next.set(r.index, categoryId);
      // mesmo estabelecimento ainda sem categoria → aplica a mesma escolha
      if (r.learnable && r.matchKey) {
        for (const o of fresh) {
          if (o.index !== r.index && o.learnable && o.matchKey === r.matchKey && !next.has(o.index) && !o.categoryId) {
            next.set(o.index, categoryId);
          }
        }
      }
      return next;
    });
  };

  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      await onConfirm(choices, included, avista);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const row = (r: ReviewItem, editable: boolean) => {
    const value = resolveCategory(review, choices, r.index);
    const it = r.item;
    const meta = [
      dateLabel(it.date),
      it.installment && `parcela ${it.installment.n}/${it.installment.total}`,
      it.card && `final ${it.card.last4}`,
      it.month !== it.date.slice(0, 7) && `conta em ${monthLabel(it.month)}`,
      r.share && `total ${formatMoney(it.amount)}`,
    ].filter(Boolean).join(' · ');
    return (
      <div key={r.index} className={`tx-row ${editable && !value ? 'needs' : ''}`}>
        <div className="tx-main static">
          <span className="tx-desc">{it.description}</span>
          <span className="tx-meta muted small">{meta}</span>
          {(r.reason || it.ignoreReason) && <span className="tx-meta muted small">{it.ignoreReason ?? r.reason}</span>}
        </div>
        <span className={`tx-amount ${it.amount < 0 ? 'refund' : ''}`}>{formatMoney(shareOf(reviewAmount(r, avista), r.share))}</span>
        {editable && (
          <select className="cat-select" aria-label={`Categoria de ${it.description}`} value={value} onChange={(e) => choose(r, e.target.value)}>
            {!value && <option value="">Escolha a categoria…</option>}
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {editable && askIndexes.has(r.index) && <MerchantHint text={it.matchText || it.description} />}
        {editable && r.askInstallment && it.installment && (
          <div className="installment-choice">
            <span className="small muted">Compra parcelada ({it.installment.n}/{it.installment.total}):</span>
            <div className="segmented">
              <button type="button" className={!avista.has(r.index) ? 'active' : ''} onClick={() => setMode(r.index, false)}>Parcela por mês</button>
              <button type="button" className={avista.has(r.index) ? 'active' : ''} onClick={() => setMode(r.index, true)}>
                {it.installment.n === 1 ? `À vista (${formatMoney(it.amount * it.installment.total)})` : 'À vista (desconsiderar)'}
              </button>
            </div>
            {avista.has(r.index) && (
              <span className="small muted">
                {it.installment.n === 1
                  ? `O total de ${it.installment.total} × ${formatMoney(it.amount)} conta em ${monthLabel(it.month)}; as próximas parcelas não contam.`
                  : 'Esta parcela e as próximas não contam (a compra já foi considerada antes).'}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  const ask = fresh.filter((r) => askIndexes.has(r.index));
  const auto = fresh.filter((r) => !askIndexes.has(r.index));
  const others = (['closed-month', 'duplicate', 'not-mine', 'before-start', 'ignored'] as const)
    .map((s) => ({ status: s, items: review.filter((r) => r.status === s) }))
    .filter((g) => g.items.length);

  return (
    <div className="stack">
      <section className="card stack-sm">
        <h2>{doc.label}</h2>
        {failedChecks.length === 0 ? (
          <p className="ok-box">✓ Conferido: tudo o que foi lido bate com os totais do documento.</p>
        ) : (
          <div className="warn-box">
            <b>Atenção: a soma lida não bate com o documento.</b>
            {failedChecks.map((c) => (
              <span key={c.label}>{c.label}: documento {formatMoney(c.expected)}, lido {formatMoney(c.found)}</span>
            ))}
            <span>Confira os lançamentos abaixo antes de importar.</span>
          </div>
        )}
        <p className="small">
          <b>{fresh.length}</b> lançamento(s) novo(s) · total {formatMoney(total)}
          {caixinha.length > 0 && <> · <b>{caixinha.length}</b> movimento(s) da caixinha</>}
        </p>
      </section>

      {fresh.length === 0 && caixinha.length === 0 && <p className="empty">Nada novo para importar neste documento.</p>}

      {caixinha.length > 0 && (
        <section className="stack-sm">
          <h3 className="section-title">Movimentos da caixinha ({caixinha.length})</h3>
          <p className="muted small">
            O extrato não diz de qual caixinha é cada "RDB". Desmarque os que <b>não</b> forem da caixinha de aportes.
            Resgates voltam a ser devidos.
          </p>
          <div className="card tx-list">
            {caixinha.map((r) => (
              <label key={r.index} className="tx-row switch-row caixinha-row">
                <input type="checkbox" checked={included.has(r.index)} onChange={(e) => toggleIncluded(r.index, e.target.checked)} />
                <span className="switch" aria-hidden />
                <span className="tx-main static">
                  <span className="tx-desc">{r.item.description}</span>
                  <span className="tx-meta muted small">
                    {dateLabel(r.item.date)} · {r.item.matchText}{r.reason ? ` · ${r.reason}` : ''}
                  </span>
                </span>
                <span className={`tx-amount ${r.item.kind === 'caixinha_resgate' ? 'text-danger' : 'refund'}`}>
                  {r.item.kind === 'caixinha_resgate' ? '−' : '+'}{formatMoney(r.item.amount)}
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      {ask.length > 0 && (
        <section className="stack-sm">
          <h3 className="section-title">Precisam da sua escolha ({ask.length})</h3>
          <div className="card tx-list">{ask.map((r) => row(r, true))}</div>
        </section>
      )}
      {auto.length > 0 && (
        <section className="stack-sm">
          <h3 className="section-title">Reconhecidos automaticamente ({auto.length})</h3>
          <p className="muted small">Confira e troque a categoria se precisar.</p>
          <div className="card tx-list">{auto.map((r) => row(r, true))}</div>
        </section>
      )}
      {others.map((g) => (
        <details key={g.status} className="card details">
          <summary>{STATUS_INFO[g.status]} ({g.items.length})</summary>
          <div className="tx-list">{g.items.map((r) => row(r, false))}</div>
        </details>
      ))}

      <ErrorBox error={error} />
      <div className="sticky-footer">
        <button className="btn ghost" onClick={onCancel} disabled={saving}>{cancelLabel}</button>
        <button className="btn primary" disabled={saving || pending.length > 0 || fresh.length + caixinha.length === 0} onClick={confirm}>
          {saving
            ? 'Importando…'
            : pending.length > 0
              ? `Faltam ${pending.length} para escolher`
              : fresh.length > 0
                ? `Importar ${fresh.length} lançamento(s)`
                : 'Importar movimentos da caixinha'}
        </button>
      </div>
    </div>
  );
}

/** Valor que conta do item na revisão, considerando a escolha "à vista" para compras parceladas. */
function reviewAmount(r: ReviewItem, avista: Set<number>): number {
  const inst = r.item.installment;
  if (r.avista === 'skip') return 0;
  if (r.askInstallment && inst && avista.has(r.index)) return inst.n === 1 ? r.item.amount * inst.total : 0;
  return r.item.amount;
}
