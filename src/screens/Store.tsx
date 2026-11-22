import { useState } from 'react';
import { BuyDialog, ItemPreview } from '../components/BuyDialog';
import { Icon, ICONS, StarIcon } from '../components/icons';
import { ErrorBox, useAction } from '../components/ui';
import { updateProfile } from '../db/repo';
import { STAR_PRICES, STAR_RULES } from '../domain/stars';
import type { Profile } from '../domain/types';
import { DEFAULT_AVATAR } from '../lib/avatars';
import { dateLabel } from '../lib/months';
import { SHOP_ITEMS, type ShopItem } from '../lib/shop';
import { DEFAULT_THEME } from '../lib/themes';
import type { StarsState } from '../useStars';

type Section = 'avatar' | 'tema';

/** Aba Loja: saldo de estrelas, como ganhar e usar, itens à venda e extrato. */
export function Store({ profile, stars }: { profile: Profile; stars: StarsState }) {
  const [section, setSection] = useState<Section>('avatar');
  const [buying, setBuying] = useState<ShopItem | null>(null);
  const { error, run } = useAction();
  const items = SHOP_ITEMS.filter((i) => i.kind === section);
  const inUse = (i: ShopItem) => (i.kind === 'tema' ? (profile.theme ?? DEFAULT_THEME) : (profile.avatar ?? DEFAULT_AVATAR)) === i.id;
  const use = (i: ShopItem) => run(() => updateProfile(i.kind === 'tema' ? { theme: i.id } : { avatar: i.id }));

  return (
    <div className="stack">
      <section className="hero store-hero" data-tour="store">
        <span className="hero-motif"><StarIcon size={150} /></span>
        <p className="hero-label">Suas estrelas</p>
        <p className="hero-value"><StarIcon size={30} /> {stars.balance}</p>
        <ul className="hero-chips">
          <li>Ganhas <b>{stars.earned}</b></li>
          <li>Usadas <b>{stars.spent}</b></li>
        </ul>
        {stars.balance < 0 && (
          <p className="hero-foot small">Seu saldo ficou negativo porque um mês foi reaberto e mudou. Os itens comprados continuam seus.</p>
        )}
      </section>

      {stars.forecast.length > 0 && (
        <section className="card stack-sm">
          <h2 className="card-title">Para ganhar neste mês</h2>
          <ul className="forecast-list">
            {stars.forecast.map((f, i) => (
              <li key={i} className={f.done ? 'done' : ''}>
                <span className="forecast-mark" aria-hidden="true">{f.done ? <Icon d={ICONS.check} size={14} width={2.6} /> : null}</span>
                <span className="forecast-label">{f.label}</span>
                <b className="forecast-amount">{f.done ? '' : '+'}{f.amount} <StarIcon size={12} /></b>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card stack-sm">
        <h2 className="card-title">Itens</h2>
        <div className="segmented" role="tablist" aria-label="Tipo de item">
          <button type="button" role="tab" aria-selected={section === 'avatar'} className={section === 'avatar' ? 'active' : ''} onClick={() => setSection('avatar')}>Avatares</button>
          <button type="button" role="tab" aria-selected={section === 'tema'} className={section === 'tema' ? 'active' : ''} onClick={() => setSection('tema')}>Temas</button>
        </div>
        <div className="shop-grid">
          {items.map((i) => {
            const owned = stars.owned.has(i.key);
            return (
              <div key={i.key} className={`shop-item ${owned ? 'owned' : ''}`}>
                <ItemPreview item={i} size={64} />
                <b className="shop-name">{i.name}</b>
                {i.premium && <span className="premium-badge">Premium</span>}
                {owned ? (
                  inUse(i)
                    ? <span className="shop-status"><Icon d={ICONS.check} size={12} width={2.4} /> Em uso</span>
                    : <button type="button" className="btn soft small" onClick={() => use(i)}>Usar</button>
                ) : (
                  <button type="button" className={`btn small ${stars.balance >= i.price ? 'primary' : 'ghost'}`} onClick={() => setBuying(i)}
                    aria-label={`Comprar ${i.name} por ${i.price} estrelas`}>
                    <StarIcon size={12} /> {i.price}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="small muted">Os Standard (Pintinho, Ratinho, Coelho) e o tema Lavanda são grátis. Para trocar o que já é seu: toque no avatar do topo ou em Ajustes › Aparência.</p>
        <ErrorBox error={error} />
      </section>

      <section className="card stack-sm">
        <h2 className="card-title">Como ganhar estrelas</h2>
        <ul className="rules-list">
          <li><b>+{STAR_RULES.organizado}</b> por mês fechado até o dia {STAR_RULES.organizadoDia} do mês seguinte (o mês só fecha com tudo classificado).</li>
          <li><b>+{STAR_RULES.categoria}</b> por categoria com limite que fechar o mês sem gerar aporte (sem passar do limite).</li>
          <li><b>+{STAR_RULES.fixo}</b> quando o aporte fixo do mês estiver todo aplicado na caixinha.</li>
          <li><b>+{STAR_RULES.meta}</b> quando a caixinha chega a 25%, 50%, 75% e 100% da sua meta (cada marco vale uma vez só).</li>
          <li><b>+{STAR_RULES.extra}</b> uma vez por mês, se você aplicar além do devido pelo menos {STAR_RULES.extraPct * 100}% do aporte fixo
            (o devido é o fixo, os aportes por gastos excedentes, os resgates e o que faltou de meses anteriores).</li>
          <li><b>+{STAR_RULES.sequencia}</b> a cada {STAR_RULES.sequenciaMeses} meses fechados seguidos sem nenhuma categoria passar do limite.</li>
        </ul>
        <p className="small muted">As estrelas são recalculadas com os seus dados: se um mês for reaberto e mudar, elas acompanham. Os meses desde o início da caixinha contam.</p>
      </section>

      <section className="card stack-sm">
        <h2 className="card-title">Como usar</h2>
        <ul className="rules-list">
          <li>Avatar: <b>{STAR_PRICES.avatarLoja}</b> estrelas</li>
          <li>Tema: <b>{STAR_PRICES.temaComum}</b> estrelas</li>
          <li>Avatar premium (animado): <b>{STAR_PRICES.avatarPremium}</b> estrelas</li>
          <li>Tema premium (animado): <b>{STAR_PRICES.temaPremium}</b> estrelas</li>
        </ul>
        <p className="small muted">O que você compra é seu para sempre e vale em todos os aparelhos conectados ao seu Google Drive.</p>
      </section>

      <details className="card details">
        <summary>Extrato de estrelas ({stars.entries.length})</summary>
        {stars.entries.length === 0
          ? <p className="empty small">Ainda não há estrelas. Feche um mês ou faça o aporte fixo para começar.</p>
          : (
            <ul className="item-list star-history">
              {stars.entries.map((e) => (
                <li key={e.id}>
                  <span>{e.label}<span className="muted small"> · {dateLabel(e.date)}</span></span>
                  <b className={e.amount < 0 ? 'text-danger' : 'text-ok'}>{e.amount > 0 ? '+' : '−'}{Math.abs(e.amount)}</b>
                </li>
              ))}
            </ul>
          )}
      </details>

      {buying && <BuyDialog item={buying} balance={stars.balance} onClose={() => setBuying(null)} />}
    </div>
  );
}
