import { useState } from 'react';
import { updateProfile } from '../db/repo';
import type { Profile } from '../domain/types';
import { shopItem, themeOwned } from '../lib/shop';
import { DEFAULT_THEME, themeById } from '../lib/themes';
import type { StarsState } from '../useStars';
import { BuyDialog } from './BuyDialog';
import { Icon, ICONS, StarIcon } from './icons';
import { ErrorBox, useAction } from './ui';

/**
 * Faixa fixa no topo durante a prévia de um tema no Painel: troca claro/escuro, compra ou usa, e fecha.
 * Nada é salvo enquanto a pessoa só olha.
 */
export function ThemePreviewBar({ themeId, dark, profile, stars, onToggleDark, onClose }: {
  themeId: string;
  dark: boolean;
  profile: Profile;
  stars: StarsState;
  onToggleDark: () => void;
  onClose: () => void;
}) {
  const t = themeById(themeId);
  const item = shopItem(`tema:${t.id}`);
  const owned = themeOwned(t.id, stars.owned);
  const inUse = (profile.theme ?? DEFAULT_THEME) === t.id;
  const [buying, setBuying] = useState(false);
  const { error, run } = useAction();
  return (
    <div className="preview-bar-top" role="region" aria-label={`Prévia do tema ${t.name}`}>
      <div className="preview-bar-inner">
        <div className="preview-bar-title">
          <span className="small muted">Prévia do tema</span>
          <b>{t.name}{t.premium && <span className="premium-badge">Premium</span>}</b>
        </div>
        <button type="button" className="help-btn" onClick={onToggleDark}
          aria-label={dark ? 'Ver no modo claro' : 'Ver no modo escuro'} title={dark ? 'Ver no modo claro' : 'Ver no modo escuro'}>
          <Icon d={dark ? ICONS.sun : ICONS.moon} size={17} width={1.9} />
        </button>
        {inUse ? (
          <span className="preview-bar-status"><Icon d={ICONS.check} size={14} width={2.4} /> Em uso</span>
        ) : owned ? (
          <button type="button" className="btn primary small" onClick={() => run(async () => { await updateProfile({ theme: t.id }); onClose(); })}>Usar</button>
        ) : item ? (
          <button type="button" className="btn primary small preview-buy" onClick={() => setBuying(true)} aria-label={`Comprar ${t.name} por ${item.price} estrelas`}>
            <StarIcon size={13} /> {item.price}
          </button>
        ) : null}
        <button type="button" className="icon-btn" aria-label="Fechar a prévia" onClick={onClose}>×</button>
      </div>
      <ErrorBox error={error} />
      {buying && item && <BuyDialog item={item} balance={stars.balance} onClose={() => setBuying(false)} />}
    </div>
  );
}
