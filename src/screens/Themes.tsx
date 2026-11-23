import { useState } from 'react';
import { Icon, ICONS, StarIcon } from '../components/icons';
import { HeroDecor, ThemeBackdrop } from '../components/ThemeEffects';
import { ErrorBox, useAction } from '../components/ui';
import { updateProfile } from '../db/repo';
import type { Profile } from '../domain/types';
import { DEFAULT_THEME, themeById, THEMES, type Palette, type Theme } from '../lib/themes';
import { itemForTheme, themeOwned } from '../lib/shop';
import { DAY_SLOTS, DaySlotPreview } from '../lib/daySlot';
import { BuyDialog } from '../components/BuyDialog';
import type { StarsState } from '../useStars';

/** Ajustes › Temas: todos os temas, com prévia; os que não são seus podem ser comprados com estrelas. */
export function Themes({ profile, stars, onBack }: { profile: Profile; stars: StarsState; onBack: () => void }) {
  const current = themeById(profile.theme ?? DEFAULT_THEME);
  const [selected, setSelected] = useState<Theme>(current);
  const { error, run } = useAction();
  const inUse = selected.id === current.id;
  const unlocked = themeOwned(selected.id, stars.owned);
  const forSale = itemForTheme(selected.id);
  const [buying, setBuying] = useState(false);

  return (
    <div className="stack">
      <div className="page-head">
        <button type="button" className="icon-btn" aria-label="Voltar para Ajustes" onClick={onBack}><Icon d={ICONS.left} size={22} width={2} /></button>
        <h1>Temas</h1>
      </div>

      <section className="card points-card">
        <span className="points-badge"><StarIcon size={22} /></span>
        <div>
          <b>Você tem {stars.balance} estrelas</b>
          <p className="small muted">Ganhe estrelas cuidando do seu mês e troque por temas: comuns por 200, premium por 500 e o lendário Céu de Bolso (vem com o avatar Nuvem) por 1000. As regras estão na aba Loja.</p>
        </div>
      </section>

      <section className="card stack-sm" aria-label={`Prévia do tema ${selected.name}`}>
        <div className="row-between">
          <h2>{selected.name}{selected.premium && <span className="premium-badge">Premium</span>}{selected.legendary && <span className="premium-badge lendario-badge">Lendário</span>}</h2>
          <span className="small muted">{selected.tagline}</span>
        </div>
        <div className="grid-2 theme-preview">
          {selected.daySlots ? DAY_SLOTS.map((s) => (
            <DaySlotPreview key={`${selected.id}-${s.id}`} slot={s.id}>
              <PreviewSide theme={selected} palette={selected.daySlots![s.id]} label={`${s.name} · ${s.hours}`} dark={s.id === 'noite'} />
            </DaySlotPreview>
          )) : (
            <>
              <PreviewSide key={`${selected.id}-c`} theme={selected} palette={selected.light} label="Claro" />
              <PreviewSide key={`${selected.id}-e`} theme={selected} palette={selected.dark} label="Escuro" dark />
            </>
          )}
        </div>
        {inUse ? (
          <button type="button" className="btn soft" disabled><Icon d={ICONS.check} size={18} width={2.2} /> Em uso</button>
        ) : unlocked ? (
          <button type="button" className="btn primary" onClick={() => run(() => updateProfile({ theme: selected.id }))}>Usar este tema</button>
        ) : (
          <button type="button" className="btn primary" onClick={() => setBuying(true)}><StarIcon size={16} /> Comprar por {forSale?.price}</button>
        )}
        <ErrorBox error={error} />
        {buying && forSale && <BuyDialog item={forSale} balance={stars.balance} onClose={() => setBuying(false)} />}
      </section>

      <h2 className="section-title">Todos os temas</h2>
      <div className="theme-grid">
        {THEMES.map((t) => {
          const isCurrent = t.id === current.id;
          const status = isCurrent ? 'Em uso' : themeOwned(t.id, stars.owned) ? 'Seu' : `${itemForTheme(t.id)?.price ?? ''} estrelas`;
          return (
            <button key={t.id} type="button" className={`theme-card ${t.id === selected.id ? 'selected' : ''}`}
              aria-pressed={t.id === selected.id} aria-label={`Ver prévia do tema ${t.name}, ${status}`} onClick={() => setSelected(t)}>
              <span className="theme-swatch" aria-hidden="true">
                <span style={{ background: t.light.hero, color: t.light.primary }}><Icon d={t.motif} size={34} width={1.7} /></span>
                <span style={{ background: t.dark.hero, color: t.dark.primary }}><Icon d={t.motif} size={34} width={1.7} /></span>
              </span>
              <span className="theme-info">
                <b>{t.name}{t.premium && <span className="premium-badge">Premium</span>}{t.legendary && <span className="premium-badge lendario-badge">Lendário</span>}</b>
                <span className="theme-dots" aria-hidden="true">
                  <i style={{ background: t.light.primary }} /><i style={{ background: t.light.accent }} /><i style={{ background: t.dark.primary }} />
                </span>
                <span className={`theme-status ${isCurrent ? 'on' : ''}`}>
                  {isCurrent || themeOwned(t.id, stars.owned) ? <Icon d={ICONS.check} size={13} width={2.2} /> : <StarIcon size={12} />}
                  {isCurrent && t.id === DEFAULT_THEME ? 'Em uso · padrão' : status}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Miniatura do Painel nas cores do tema (claro ou escuro). */
function PreviewSide({ theme, palette: p, label, dark }: { theme: Theme; palette: Palette; label: string; dark?: boolean }) {
  return (
    <div className="preview-side" style={{ background: p.bg, color: p.text, borderColor: p.border }}>
      <ThemeBackdrop effect={theme.effect} contained dark={!!dark} />
      <span className="small" style={{ color: p.muted }}>{label}</span>
      <div className="preview-hero" style={{ background: p.heroBg ?? p.primary, color: p.heroInk ?? p.ink, borderRadius: Math.round(theme.radius * 0.6) }}>
        {theme.effect ? <HeroDecor effect={theme.effect} /> : <span className="preview-motif"><Icon d={theme.motif} size={52} width={1.2} /></span>}
        <span className="preview-label">Aportes do mês</span>
        <b>R$ 440,00</b>
      </div>
      <div className="preview-bar" style={{ background: p.surface2 }}><i style={{ background: p.primary }} /></div>
      <span className="preview-chip" style={{ background: p.soft, color: p.primary }}>Categoria</span>
    </div>
  );
}
