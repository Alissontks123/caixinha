import { useId, useState, type ReactNode } from 'react';
import { updateProfile } from '../db/repo';
import { AVATARS, avatarById, DEFAULT_AVATAR, TIER_LABEL, type AvatarTier } from '../lib/avatars';
import { useDaySlot } from '../lib/daySlot';
import { avatarOwned, itemForAvatar, type ShopItem } from '../lib/shop';
import type { StarsState } from '../useStars';
import { BuyDialog } from './BuyDialog';
import { Icon, ICONS, StarIcon } from './icons';
import { ErrorBox, Modal, useAction } from './ui';

/** Desenho de cada avatar (caixa 100×100). */
const ART: Record<string, ReactNode> = {
  pintinho: (
    <>
      <circle cx="50" cy="50" r="50" fill="#fff3c4" /><path d="M46 26 Q50 16 54 26" fill="none" stroke="#f0b93a" strokeWidth="3" strokeLinecap="round" />
      <circle cx="50" cy="56" r="27" fill="#ffd75e" /><circle cx="40" cy="52" r="3.6" fill="#3a2f20" /><circle cx="60" cy="52" r="3.6" fill="#3a2f20" />
      <path d="M44 60 L56 60 L50 68 Z" fill="#f28c3b" />
    </>
  ),
  ratinho: (
    <>
      <circle cx="50" cy="50" r="50" fill="#ece8f6" /><circle cx="27" cy="34" r="14" fill="#b9b3c9" /><circle cx="73" cy="34" r="14" fill="#b9b3c9" />
      <circle cx="27" cy="34" r="8" fill="#f3c3d2" /><circle cx="73" cy="34" r="8" fill="#f3c3d2" /><circle cx="50" cy="57" r="26" fill="#d2cde0" />
      <circle cx="41" cy="54" r="3.4" fill="#2a2738" /><circle cx="59" cy="54" r="3.4" fill="#2a2738" /><circle cx="50" cy="63" r="3.4" fill="#e98da5" />
    </>
  ),
  coelho: (
    <>
      <circle cx="50" cy="50" r="50" fill="#fde4ec" /><ellipse cx="38" cy="26" rx="8" ry="19" fill="#ffffff" /><ellipse cx="62" cy="26" rx="8" ry="19" fill="#ffffff" />
      <ellipse cx="38" cy="27" rx="4" ry="13" fill="#f7b5cc" /><ellipse cx="62" cy="27" rx="4" ry="13" fill="#f7b5cc" /><circle cx="50" cy="60" r="25" fill="#ffffff" />
      <circle cx="41" cy="57" r="3.4" fill="#3a2430" /><circle cx="59" cy="57" r="3.4" fill="#3a2430" /><path d="M47 64 L53 64 L50 67 Z" fill="#e98da5" />
    </>
  ),
  ursinho: (
    <>
      <circle cx="50" cy="50" r="50" fill="#f3e3d3" /><circle cx="28" cy="32" r="12" fill="#b07a52" /><circle cx="72" cy="32" r="12" fill="#b07a52" />
      <circle cx="28" cy="32" r="6" fill="#e0b894" /><circle cx="72" cy="32" r="6" fill="#e0b894" /><circle cx="50" cy="56" r="28" fill="#c08a60" />
      <ellipse cx="50" cy="65" rx="13" ry="10" fill="#efd6bd" /><ellipse cx="50" cy="61" rx="5" ry="3.6" fill="#3a2a22" />
      <path d="M50 65 Q46 70 43 67 M50 65 Q54 70 57 67" fill="none" stroke="#3a2a22" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="39" cy="50" r="3.6" fill="#3a2a22" /><circle cx="61" cy="50" r="3.6" fill="#3a2a22" />
    </>
  ),
  raposa: (
    <>
      <circle cx="50" cy="50" r="50" fill="#ffe6d4" /><path d="M20 42 L26 14 L44 32 L56 32 L74 14 L80 42 Q82 72 50 84 Q18 72 20 42 Z" fill="#f28c4b" />
      <path d="M30 24 L33 18 L39 28 Z M70 24 L67 18 L61 28 Z" fill="#5a2e1a" /><path d="M24 54 Q38 60 50 82 Q62 60 76 54 Q70 78 50 84 Q30 78 24 54 Z" fill="#ffffff" />
      <circle cx="39" cy="50" r="3.6" fill="#2b1a12" /><circle cx="61" cy="50" r="3.6" fill="#2b1a12" /><ellipse cx="50" cy="66" rx="4.5" ry="3.4" fill="#2b1a12" />
    </>
  ),
  panda: (
    <>
      <circle cx="50" cy="50" r="50" fill="#e3f2e6" /><circle cx="27" cy="32" r="12" fill="#2f2f36" /><circle cx="73" cy="32" r="12" fill="#2f2f36" />
      <circle cx="50" cy="56" r="28" fill="#ffffff" /><ellipse cx="38" cy="52" rx="8" ry="10" transform="rotate(-25 38 52)" fill="#2f2f36" />
      <ellipse cx="62" cy="52" rx="8" ry="10" transform="rotate(25 62 52)" fill="#2f2f36" /><circle cx="39" cy="51" r="3" fill="#ffffff" /><circle cx="61" cy="51" r="3" fill="#ffffff" />
      <ellipse cx="50" cy="64" rx="5" ry="3.6" fill="#2f2f36" />
      <path d="M50 67 Q47 71 44 69 M50 67 Q53 71 56 69" fill="none" stroke="#2f2f36" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  coala: (
    <>
      <circle cx="50" cy="50" r="50" fill="#e2e8ef" /><circle cx="24" cy="42" r="16" fill="#9aa5b4" /><circle cx="76" cy="42" r="16" fill="#9aa5b4" />
      <circle cx="24" cy="42" r="9" fill="#dde3ea" /><circle cx="76" cy="42" r="9" fill="#dde3ea" /><circle cx="50" cy="57" r="26" fill="#b3bdca" />
      <ellipse cx="50" cy="61" rx="7.5" ry="10" fill="#3b4250" /><circle cx="38" cy="52" r="3.4" fill="#2a2f38" /><circle cx="62" cy="52" r="3.4" fill="#2a2f38" />
    </>
  ),
  sapinho: (
    <>
      <circle cx="50" cy="50" r="50" fill="#e3f5d9" /><circle cx="33" cy="38" r="12" fill="#7fc663" /><circle cx="67" cy="38" r="12" fill="#7fc663" />
      <ellipse cx="50" cy="62" rx="31" ry="22" fill="#8ccf6e" /><circle cx="33" cy="37" r="7.5" fill="#ffffff" /><circle cx="67" cy="37" r="7.5" fill="#ffffff" />
      <circle cx="34" cy="38" r="3.8" fill="#1f2a18" /><circle cx="66" cy="38" r="3.8" fill="#1f2a18" />
      <path d="M34 64 Q50 76 66 64" fill="none" stroke="#2f5a22" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="28" cy="62" r="4" fill="#f4a9b8" opacity=".7" /><circle cx="72" cy="62" r="4" fill="#f4a9b8" opacity=".7" />
    </>
  ),
  pinguim: (
    <>
      <circle cx="50" cy="50" r="50" fill="#dff0fb" /><circle cx="50" cy="55" r="30" fill="#3d4a63" />
      <ellipse cx="41" cy="60" rx="13" ry="17" fill="#ffffff" /><ellipse cx="59" cy="60" rx="13" ry="17" fill="#ffffff" />
      <circle cx="41" cy="53" r="3.4" fill="#1d2433" /><circle cx="59" cy="53" r="3.4" fill="#1d2433" /><path d="M44 61 L56 61 L50 68 Z" fill="#f2a33b" />
      <circle cx="35" cy="64" r="3.6" fill="#f7b5c4" opacity=".75" /><circle cx="65" cy="64" r="3.6" fill="#f7b5c4" opacity=".75" />
    </>
  ),
  cofrinho: (
    <>
      <circle cx="50" cy="50" r="50" fill="#ffe6ee" /><path d="M26 36 L28 20 L40 30 Z M74 36 L72 20 L60 30 Z" fill="#f294b0" />
      <circle cx="50" cy="56" r="28" fill="#f7b6c9" /><rect x="43" y="30" width="14" height="3.4" rx="1.7" fill="#c9657f" />
      <ellipse cx="50" cy="64" rx="11" ry="8" fill="#f294b0" /><ellipse cx="46" cy="64" rx="2" ry="3" fill="#a94a66" /><ellipse cx="54" cy="64" rx="2" ry="3" fill="#a94a66" />
      <circle cx="39" cy="50" r="3.4" fill="#3a2430" /><circle cx="61" cy="50" r="3.4" fill="#3a2430" />
    </>
  ),
  corujinha: (
    <>
      <circle cx="50" cy="50" r="50" fill="#efe6dc" /><path d="M24 30 L30 18 L38 28 Z M76 30 L70 18 L62 28 Z" fill="#8a6a4c" />
      <ellipse cx="50" cy="56" rx="28" ry="30" fill="#a7835f" /><ellipse cx="50" cy="70" rx="15" ry="14" fill="#e6d3bc" />
      <circle cx="38" cy="48" r="11" fill="#ffffff" /><circle cx="62" cy="48" r="11" fill="#ffffff" /><circle cx="38" cy="48" r="5" fill="#2b2018" /><circle cx="62" cy="48" r="5" fill="#2b2018" />
      <path d="M46 56 L54 56 L50 63 Z" fill="#f2a33b" />
    </>
  ),
  leaozinho: (
    <>
      <circle cx="50" cy="50" r="50" fill="#fff0d4" /><circle cx="50" cy="54" r="35" fill="#e59a3c" /><circle cx="28" cy="34" r="8" fill="#f6c36b" /><circle cx="72" cy="34" r="8" fill="#f6c36b" />
      <circle cx="50" cy="56" r="24" fill="#f6c36b" /><ellipse cx="50" cy="64" rx="11" ry="8" fill="#fde3b0" /><path d="M46 60 L54 60 L50 64 Z" fill="#6b3d1e" />
      <circle cx="41" cy="51" r="3.4" fill="#3a2410" /><circle cx="59" cy="51" r="3.4" fill="#3a2410" />
    </>
  ),
  hamster: (
    <>
      <circle cx="50" cy="50" r="50" fill="#fdeedd" /><circle cx="30" cy="34" r="8" fill="#e0a66d" /><circle cx="70" cy="34" r="8" fill="#e0a66d" />
      <circle cx="30" cy="34" r="4" fill="#f7c0b0" /><circle cx="70" cy="34" r="4" fill="#f7c0b0" /><ellipse cx="50" cy="58" rx="31" ry="26" fill="#f0c08e" />
      <ellipse cx="32" cy="64" rx="11" ry="9" fill="#fff3e3" /><ellipse cx="68" cy="64" rx="11" ry="9" fill="#fff3e3" /><ellipse cx="50" cy="66" rx="9" ry="8" fill="#fff3e3" />
      <circle cx="41" cy="52" r="3.4" fill="#3a2410" /><circle cx="59" cy="52" r="3.4" fill="#3a2410" /><circle cx="50" cy="61" r="2.6" fill="#e98da5" />
    </>
  ),
  gatinho: (
    <>
      <circle cx="50" cy="50" r="50" fill="#fff1e2" />
      <g className="av-ear"><path d="M24 42 L22 14 L44 30 Z" fill="#f2a764" /><path d="M27 36 L26 22 L37 30 Z" fill="#f7a8bd" /></g>
      <path d="M76 42 L78 14 L56 30 Z" fill="#f2a764" /><path d="M73 36 L74 22 L63 30 Z" fill="#f7a8bd" /><circle cx="50" cy="57" r="28" fill="#f6c28f" />
      <path d="M40 33 C44 30 48 30 50 34 M50 34 C52 30 56 30 60 33" fill="none" stroke="#d98c55" strokeWidth="3" strokeLinecap="round" />
      <ellipse className="av-blink" cx="39" cy="55" rx="3.8" ry="5.4" fill="#3a2a22" /><ellipse className="av-blink" cx="61" cy="55" rx="3.8" ry="5.4" fill="#3a2a22" />
      <path d="M47 64 L53 64 L50 67 Z" fill="#e98da5" />
      <path d="M50 67 Q47 71 44 69 M50 67 Q53 71 56 69" fill="none" stroke="#3a2a22" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M30 62 L18 60 M30 66 L18 68 M70 62 L82 60 M70 66 L82 68" stroke="#d98c55" strokeWidth="1.4" strokeLinecap="round" />
      <path className="av-heart" d="M76 26 c-2-3-6-1-4 2 l4 4 l4-4 c2-3-2-5-4-2z" fill="#f48fb1" />
    </>
  ),
  dragaozinho: (
    <>
      <circle cx="50" cy="50" r="50" fill="#e4f5ec" /><path d="M32 30 L26 12 L40 26 Z M68 30 L74 12 L60 26 Z" fill="#f2d16b" />
      <path d="M44 26 L50 16 L56 26 Z" fill="#5fb98a" /><circle cx="50" cy="56" r="28" fill="#7fd0a3" /><ellipse cx="50" cy="67" rx="15" ry="10" fill="#bfeccf" />
      <circle cx="45" cy="66" r="1.8" fill="#2f6b4b" /><circle cx="55" cy="66" r="1.8" fill="#2f6b4b" />
      <circle cx="39" cy="51" r="4.4" fill="#ffffff" /><circle cx="61" cy="51" r="4.4" fill="#ffffff" />
      <circle className="av-blink" cx="40" cy="52" r="2.6" fill="#1e3a2a" /><circle className="av-blink" cx="62" cy="52" r="2.6" fill="#1e3a2a" />
      <circle className="av-puff" cx="70" cy="66" r="4" fill="#dfe6e3" />
      <circle className="av-puff" cx="74" cy="62" r="3" fill="#dfe6e3" style={{ animationDelay: '.8s' }} />
      <circle className="av-puff" cx="72" cy="68" r="3.4" fill="#dfe6e3" style={{ animationDelay: '1.6s' }} />
    </>
  ),
  unicornio: (
    <>
      <circle cx="50" cy="50" r="50" fill="#f4ecff" />
      <g className="av-hue">
        <path d="M66 30 C82 34 84 54 76 70 C74 56 70 46 62 40 Z" fill="#f48fb1" />
        <path d="M62 28 C74 26 80 40 76 52 C72 44 66 38 58 36 Z" fill="#b4aaf3" />
        <path d="M56 26 C66 20 74 28 72 38 C66 32 60 30 54 31 Z" fill="#8ccbe8" />
      </g>
      <path d="M28 36 L26 20 L38 30 Z" fill="#ffffff" stroke="#e8def8" strokeWidth="1.5" /><circle cx="48" cy="58" r="26" fill="#ffffff" />
      <path className="av-wiggle" d="M44 34 L50 6 L56 34 Z" fill="#f7d77a" /><path d="M46 26 L54 24 M45 20 L53 18" stroke="#e0b44a" strokeWidth="1.6" />
      <ellipse className="av-blink" cx="39" cy="56" rx="3.4" ry="4.6" fill="#3a2a4a" /><ellipse className="av-blink" cx="57" cy="56" rx="3.4" ry="4.6" fill="#3a2a4a" />
      <circle cx="33" cy="64" r="4" fill="#f7b5cc" opacity=".8" /><circle cx="62" cy="64" r="4" fill="#f7b5cc" opacity=".8" />
      <path d="M44 68 Q48 71 52 68" fill="none" stroke="#3a2a4a" strokeWidth="1.6" strokeLinecap="round" />
      <path className="av-twinkle" d="M20 56 l2 5 l5 2 l-5 2 l-2 5 l-2-5 l-5-2 l5-2z" fill="#f7d77a" />
      <path className="av-twinkle" d="M80 80 l1.4 3.4 l3.4 1.4 l-3.4 1.4 l-1.4 3.4 l-1.4-3.4 l-3.4-1.4 l3.4-1.4z" fill="#f7d77a" style={{ animationDelay: '1s' }} />
    </>
  ),
};

/** Nuvem (lendário): muda com o horário do dia — sol nascendo, óculos escuros, pôr do sol e lua. */
function NuvemArt() {
  const slot = useDaySlot();
  const uid = useId().replace(/:/g, '');
  const cloud = (fill: string) => (
    <g fill={fill}><circle cx="34" cy="58" r="15" /><circle cx="52" cy="48" r="20" /><circle cx="69" cy="58" r="14" /><rect x="26" y="56" width="50" height="17" rx="8.5" /></g>
  );
  const cheeks = <><circle cx="40" cy="64" r="2.6" fill="#ff9bb0" opacity=".6" /><circle cx="64" cy="64" r="2.6" fill="#ff9bb0" opacity=".6" /></>;
  const smile = (c: string) => <path d="M47 65q5 4 10 0" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" />;
  if (slot === 'manha') {
    return (
      <>
        <circle cx="50" cy="50" r="50" fill="#ffe9c4" />
        <circle className="lg-rise" cx="72" cy="38" r="13" fill="#ffc44d" />
        <g className="lg-bob">
          {cloud('#ffffff')}
          <circle cx="45" cy="59" r="2.3" fill="#2d3550" /><circle cx="59" cy="59" r="2.3" fill="#2d3550" />
          <circle cx="45.8" cy="58.2" r=".8" fill="#fff" /><circle cx="59.8" cy="58.2" r=".8" fill="#fff" />
          {cheeks}{smile('#2d3550')}
        </g>
      </>
    );
  }
  if (slot === 'tarde') {
    return (
      <>
        <circle cx="50" cy="50" r="50" fill="#7cc6ff" />
        <g className="lg-spin">
          <circle cx="25" cy="27" r="9" fill="#ffd34d" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <rect key={a} x="24" y="11" width="2" height="5" rx="1" fill="#ffd34d" transform={`rotate(${a} 25 27)`} />)}
        </g>
        <g className="lg-bob">
          {cloud('#ffffff')}
          <rect x="39" y="55" width="11" height="7" rx="3" fill="#1d1d26" /><rect x="54" y="55" width="11" height="7" rx="3" fill="#1d1d26" />
          <path d="M50 57.5h4" stroke="#1d1d26" strokeWidth="1.6" />
          <path d="M41 57.5l3 -1.5M56 57.5l3 -1.5" stroke="#fff" strokeWidth="1" opacity=".75" />
          <path d="M45 66q7 6 14 0" stroke="#2d3550" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </g>
      </>
    );
  }
  if (slot === 'entardecer') {
    return (
      <>
        <defs>
          <linearGradient id={`${uid}a`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffb0c8" /><stop offset="1" stopColor="#a98ae6" /></linearGradient>
          <linearGradient id={`${uid}b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe3ee" /><stop offset="1" stopColor="#f4a9c9" /></linearGradient>
        </defs>
        <circle cx="50" cy="50" r="50" fill={`url(#${uid}a)`} />
        <g className="lg-bob">
          {cloud(`url(#${uid}b)`)}
          <path d="M42 60q3 -3 6 0M56 60q3 -3 6 0" stroke="#5a2d55" strokeWidth="2" fill="none" strokeLinecap="round" />
          {cheeks}{smile('#5a2d55')}
        </g>
      </>
    );
  }
  return (
    <>
      <circle cx="50" cy="50" r="50" fill="#121a40" />
      {[[20, 22, 1.2], [80, 18, 1], [86, 40, 1.4], [30, 86, 1], [76, 82, 1.2], [60, 13, 0.9]].map(([x, y, r], i) => (
        <circle key={i} className="lg-tw" style={{ animationDelay: `${i * 0.37}s` }} cx={x} cy={y} r={r} fill="#ffffff" />
      ))}
      <g className="lg-bob2"><circle cx="27" cy="44" r="11" fill="#ffe27a" /><circle cx="32" cy="40" r="9.5" fill="#121a40" /></g>
      <g className="lg-bob">
        {cloud('#5f6ba3')}
        <path d="M42 59q3 3 6 0M56 59q3 3 6 0" stroke="#e6e9ff" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M50 65.5h4" stroke="#e6e9ff" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g className="lg-zzz" fill="#cfd8ff" fontWeight="800" fontFamily="system-ui, sans-serif">
        <text x="72" y="40" fontSize="9">z</text><text x="79" y="32" fontSize="7">z</text><text x="84" y="25" fontSize="5">z</text>
      </g>
    </>
  );
}

/** Avatar desenhado; os premium ganham a moldura colorida girando. */
export function AvatarImage({ id, size = 40 }: { id?: string; size?: number }) {
  const a = avatarById(id ?? DEFAULT_AVATAR);
  const framed = a.tier === 'premium' || a.tier === 'lendario';
  const inner = framed ? size - 6 : size;
  return (
    <span className={`avatar ${a.tier === 'premium' ? 'avatar-premium' : ''} ${a.tier === 'lendario' ? 'avatar-lendario' : ''}`} style={{ width: size, height: size }}>
      <svg className="avatar-svg" width={inner} height={inner} viewBox="0 0 100 100" aria-hidden="true" focusable="false">{a.id === 'nuvem' ? <NuvemArt /> : ART[a.id]}</svg>
    </span>
  );
}

const TIERS: { tier: AvatarTier; hint: string }[] = [
  { tier: 'standard', hint: 'grátis para todos' },
  { tier: 'shop', hint: 'compre com estrelas' },
  { tier: 'premium', hint: 'compre com estrelas · animados' },
  { tier: 'lendario', hint: 'vem no Céu de Bolso · muda com o horário' },
];

/** Botão do topo com o avatar; abre a escolha. */
export function AvatarButton({ current, stars }: { current?: string; stars: StarsState }) {
  const [open, setOpen] = useState(false);
  const a = avatarById(current ?? DEFAULT_AVATAR);
  return (
    <>
      <button type="button" className="avatar-btn" aria-label={`Seu avatar: ${a.name}. Toque para trocar`} title="Trocar avatar" onClick={() => setOpen(true)}>
        <AvatarImage id={a.id} size={40} />
      </button>
      {open && <AvatarPicker current={a.id} stars={stars} onClose={() => setOpen(false)} />}
    </>
  );
}

function AvatarPicker({ current, stars, onClose }: { current: string; stars: StarsState; onClose: () => void }) {
  const { error, run } = useAction();
  const [buying, setBuying] = useState<ShopItem | null>(null);
  const pick = (id: string) => {
    if (!avatarOwned(id, stars.owned)) { setBuying(itemForAvatar(id) ?? null); return; }
    void run(async () => { await updateProfile({ avatar: id }); onClose(); });
  };
  return (
    <Modal title="Escolha seu avatar" onClose={onClose}>
      <div className="stack-sm">
        <p className="small muted">O avatar aparece no topo e vale em todos os seus aparelhos. Você tem <b>{stars.balance}</b> estrelas.</p>
        {TIERS.map(({ tier, hint }) => (
          <section key={tier} className="stack-sm">
            <h3 className="avatar-tier">{TIER_LABEL[tier]} <span className="small muted">{hint}</span></h3>
            <div className="avatar-grid">
              {AVATARS.filter((a) => a.tier === tier).map((a) => {
                const unlocked = avatarOwned(a.id, stars.owned);
                const price = itemForAvatar(a.id)?.price;
                const inUse = a.id === current;
                return (
                  <button key={a.id} type="button" className={`avatar-option ${inUse ? 'selected' : ''} ${unlocked ? '' : 'locked'}`}
                    aria-pressed={inUse} aria-label={`${a.name}${inUse ? ', em uso' : unlocked ? '' : `, comprar por ${price} estrelas`}`} onClick={() => pick(a.id)}>
                    <AvatarImage id={a.id} size={60} />
                    <span className="avatar-name">{a.name}</span>
                    <span className="avatar-status">
                      {inUse ? <><Icon d={ICONS.check} size={12} width={2.4} /> Em uso</> : unlocked ? 'Usar' : <><StarIcon size={11} /> {price}</>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        <ErrorBox error={error} />
      </div>
      {buying && <BuyDialog item={buying} balance={stars.balance} onClose={() => setBuying(null)} />}
    </Modal>
  );
}
