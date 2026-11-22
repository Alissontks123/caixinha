import { useState } from 'react';
import { buyItem, updateProfile } from '../db/repo';
import type { ShopItem } from '../lib/shop';
import { themeById } from '../lib/themes';
import { AvatarImage } from './Avatar';
import { Icon, StarIcon } from './icons';
import { ErrorBox, Modal, useAction } from './ui';

/** Miniatura do item (avatar desenhado ou amostra do tema). */
export function ItemPreview({ item, size = 64 }: { item: ShopItem; size?: number }) {
  if (item.kind === 'avatar') return <AvatarImage id={item.id} size={size} />;
  const t = themeById(item.id);
  return (
    <span className="theme-mini" style={{ width: size, height: size }} aria-hidden="true">
      <span style={{ background: t.light.hero, color: t.light.primary }}><Icon d={t.motif} size={size * 0.42} width={1.8} /></span>
      <span style={{ background: t.dark.hero, color: t.dark.primary }}><Icon d={t.motif} size={size * 0.42} width={1.8} /></span>
    </span>
  );
}

/** Confirmação de compra com estrelas; depois de comprar, oferece usar na hora. */
export function BuyDialog({ item, balance, onClose }: { item: ShopItem; balance: number; onClose: () => void }) {
  const { error, run } = useAction();
  const [bought, setBought] = useState(false);
  const missing = item.price - balance;
  const what = item.kind === 'tema' ? 'o tema' : 'o avatar';
  return (
    <Modal title={bought ? 'Comprado!' : 'Comprar com estrelas'} onClose={onClose}>
      <div className="stack-sm buy-dialog">
        <div className="buy-item">
          <ItemPreview item={item} size={72} />
          <div>
            <b>{item.name}</b>{item.premium && <span className="premium-badge">Premium</span>}
            <p className="small muted">{item.kind === 'tema' ? 'Tema' : 'Avatar'} · <StarIcon size={12} /> {item.price}</p>
          </div>
        </div>
        {bought ? (
          <>
            <p>{item.name} agora é seu, para sempre e em todos os seus aparelhos.</p>
            <div className="row-end">
              <button type="button" className="btn ghost" onClick={onClose}>Fechar</button>
              <button type="button" className="btn primary" onClick={() => run(async () => {
                await updateProfile(item.kind === 'tema' ? { theme: item.id } : { avatar: item.id });
                onClose();
              })}>Usar agora</button>
            </div>
          </>
        ) : missing > 0 ? (
          <>
            <p>Você tem <b>{balance}</b> estrelas. Faltam <b>{missing}</b> para comprar {what} {item.name}.</p>
            <p className="small muted">Veja na Loja como ganhar mais estrelas.</p>
            <div className="row-end"><button type="button" className="btn primary" onClick={onClose}>Entendi</button></div>
          </>
        ) : (
          <>
            <p>Comprar {what} <b>{item.name}</b> por <b>{item.price}</b> estrelas?</p>
            <p className="small muted">Você tem {balance} estrelas; depois da compra ficam {balance - item.price}.</p>
            <div className="row-end">
              <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
              <button type="button" className="btn primary" onClick={() => run(async () => { await buyItem(item, balance); setBought(true); })}>
                Comprar por {item.price} <StarIcon size={14} />
              </button>
            </div>
          </>
        )}
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}
