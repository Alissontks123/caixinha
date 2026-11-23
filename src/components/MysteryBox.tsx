import { useState } from 'react';
import { openBox, updateProfile } from '../db/repo';
import { BOX, boxOdds, rarityName, rarityOf, type Rarity } from '../lib/mysteryBox';
import { profilePatch, type ShopItem } from '../lib/shop';
import type { StarsState } from '../useStars';
import { ItemPreview } from './BuyDialog';
import { StarIcon } from './icons';
import { ErrorBox, Modal, useAction } from './ui';

const pct = (x: number) => `${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Desenho da caixa de presente com "?". */
export function BoxArt({ size = 72, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={`box-art ${className}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <g className="box-lid">
        <path d="M32 14c-4-8-14-8-13-2 1 4 8 4 13 2zm0 0c4-8 14-8 13-2-1 4-8 4-13 2z" fill="none" stroke="var(--accent)" strokeWidth="3.5" strokeLinejoin="round" />
        <rect x="8" y="14" width="48" height="12" rx="3" fill="var(--primary)" />
        <rect x="28" y="14" width="8" height="12" fill="var(--accent)" />
      </g>
      <rect x="11" y="26" width="42" height="30" rx="3" fill="var(--primary)" opacity="0.88" />
      <rect x="28" y="26" width="8" height="30" fill="var(--accent)" />
      <text x="20" y="47" fontSize="15" fontWeight="800" fill="var(--primary-ink)" fontFamily="system-ui, sans-serif">?</text>
      <text x="40" y="47" fontSize="15" fontWeight="800" fill="var(--primary-ink)" fontFamily="system-ui, sans-serif">?</text>
    </svg>
  );
}

export function RarityTag({ rarity }: { rarity: Rarity }) {
  return <span className={`rarity-tag rarity-${rarity}`}>{rarityName(rarity)}</span>;
}

/** Cartão da Caixa surpresa na Loja (antes da lista de itens). */
export function MysteryBoxCard({ stars }: { stars: StarsState }) {
  const [open, setOpen] = useState(false);
  const odds = boxOdds(stars.owned);
  return (
    <section className="card stack-sm box-card" data-tour="box">
      <div className="box-head">
        <BoxArt size={76} className="box-idle" />
        <div className="box-text">
          <h2 className="card-title">Caixa surpresa</h2>
          <p className="small muted">
            {odds.length ? 'Um item aleatório da Loja que você ainda não tem. Nunca repete.' : 'Você já tem todos os itens da Loja!'}
          </p>
        </div>
      </div>
      {odds.length > 0 && (
        <>
          <button type="button" className={`btn ${stars.balance >= BOX.price ? 'primary' : 'ghost'} box-open-btn`} onClick={() => setOpen(true)}>
            Abrir por <StarIcon size={14} /> {BOX.price}
          </button>
          <details className="box-odds">
            <summary className="small">Ver as chances</summary>
            <ul>
              {odds.map((o) => (
                <li key={o.group}>
                  <RarityTag rarity={o.rarity} />
                  <span className="small muted">{o.items.length} {o.what}</span>
                  <b>{pct(o.chance)}</b>
                </li>
              ))}
            </ul>
            <p className="small muted">
              Dentro de cada grupo, todos os itens têm a mesma chance. Itens que você já tem saem do sorteio, e a chance deles passa
              para os outros.
            </p>
          </details>
        </>
      )}
      {open && <BoxDialog balance={stars.balance} owned={stars.owned} onClose={() => setOpen(false)} />}
    </section>
  );
}

type Stage = 'confirm' | 'opening' | 'revealed';

/** Abrir a caixa: confirma, balança a caixa e revela o item. */
function BoxDialog({ balance, owned, onClose }: { balance: number; owned: Set<string>; onClose: () => void }) {
  const { error, run } = useAction();
  const [stage, setStage] = useState<Stage>('confirm');
  const [item, setItem] = useState<ShopItem | null>(null);
  // o saldo chega atualizado (as estrelas são recalculadas a cada mudança no banco)
  const left = balance;
  const moreItems = boxOdds(item ? new Set([...owned, item.key]) : owned).length > 0;

  const open = () => run(async () => {
    setStage('opening');
    try {
      // o sorteio é gravado só no fim da animação (o cartão atrás não entrega o resultado antes)
      await wait(reducedMotion() ? 0 : 1500);
      const won = await openBox(left);
      setItem(won);
      setStage('revealed');
    } catch (e) {
      setStage('confirm');
      throw e;
    }
  });

  const rarity = item ? rarityOf(item) : null;
  return (
    <Modal title={stage === 'revealed' ? 'Você ganhou!' : 'Caixa surpresa'} onClose={onClose}>
      <div className="stack-sm box-dialog">
        {stage === 'confirm' && (
          left < BOX.price ? (
            <>
              <div className="box-stage"><BoxArt size={110} /></div>
              <p>Você tem <b>{left}</b> estrelas. Faltam <b>{BOX.price - left}</b> para abrir a Caixa surpresa.</p>
              <div className="row-end"><button type="button" className="btn primary" onClick={onClose}>Entendi</button></div>
            </>
          ) : (
            <>
              <div className="box-stage"><BoxArt size={110} className="box-idle" /></div>
              <p>Abrir a Caixa surpresa por <b>{BOX.price}</b> estrelas? Sai um item que você ainda não tem.</p>
              <p className="small muted">Você tem {left} estrelas; depois ficam {left - BOX.price}.</p>
              <div className="row-end">
                <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
                <button type="button" className="btn primary" onClick={open}>Abrir por {BOX.price} <StarIcon size={14} /></button>
              </div>
            </>
          )
        )}
        {stage === 'opening' && (
          <div className="box-stage" role="status" aria-label="Abrindo a caixa">
            <BoxArt size={120} className="box-shake" />
            <p className="small muted">Abrindo…</p>
          </div>
        )}
        {stage === 'revealed' && item && rarity && (
          <>
            <div className={`box-reveal rarity-glow-${rarity}`}>
              <span className="box-rays" aria-hidden="true" />
              <span className="box-prize"><ItemPreview item={item} size={104} /></span>
            </div>
            <div className="box-won">
              <RarityTag rarity={rarity} />
              <b className="box-won-name">{item.name}</b>
              <span className="small muted">{item.kind === 'tema' ? 'Tema' : 'Avatar'} · agora é seu, em todos os aparelhos</span>
            </div>
            <div className="row-end box-actions">
              {moreItems && left >= BOX.price && (
                <button type="button" className="btn ghost" onClick={open}>Abrir outra ({BOX.price} <StarIcon size={12} />)</button>
              )}
              <button type="button" className="btn primary" onClick={() => run(async () => {
                await updateProfile(profilePatch(item));
                onClose();
              })}>Usar agora</button>
            </div>
          </>
        )}
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}
