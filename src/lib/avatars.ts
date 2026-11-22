/**
 * Avatares do usuário (bichinhos). Três níveis:
 * - standard: grátis para todos;
 * - shop: comprados na loja de pontos (em breve);
 * - premium: também da loja, animados e com moldura colorida.
 * O escolhido fica no perfil (sincroniza entre aparelhos).
 */
export type AvatarTier = 'standard' | 'shop' | 'premium';

export interface AvatarInfo {
  id: string;
  name: string;
  tier: AvatarTier;
  /** Frase curta sobre a animação (só premium). */
  detail?: string;
}

export const DEFAULT_AVATAR = 'pintinho';

export const AVATARS: AvatarInfo[] = [
  { id: 'pintinho', name: 'Pintinho', tier: 'standard' },
  { id: 'ratinho', name: 'Ratinho', tier: 'standard' },
  { id: 'coelho', name: 'Coelho', tier: 'standard' },
  { id: 'ursinho', name: 'Ursinho', tier: 'shop' },
  { id: 'raposa', name: 'Raposa', tier: 'shop' },
  { id: 'panda', name: 'Panda', tier: 'shop' },
  { id: 'coala', name: 'Coala', tier: 'shop' },
  { id: 'sapinho', name: 'Sapinho', tier: 'shop' },
  { id: 'pinguim', name: 'Pinguim', tier: 'shop' },
  { id: 'cofrinho', name: 'Cofrinho', tier: 'shop' },
  { id: 'corujinha', name: 'Corujinha', tier: 'shop' },
  { id: 'leaozinho', name: 'Leãozinho', tier: 'shop' },
  { id: 'hamster', name: 'Hamster', tier: 'shop' },
  { id: 'gatinho', name: 'Gatinho', tier: 'premium', detail: 'Pisca, mexe a orelha e solta coraçõezinhos' },
  { id: 'dragaozinho', name: 'Dragãozinho', tier: 'premium', detail: 'Pisca e solta fumacinha' },
  { id: 'unicornio', name: 'Unicórnio', tier: 'premium', detail: 'Crina de arco-íris mudando de cor e brilhos' },
];

export const TIER_LABEL: Record<AvatarTier, string> = { standard: 'Standard', shop: 'Loja', premium: 'Premium' };

export function avatarById(id: string | undefined): AvatarInfo {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}

/** Por enquanto só os Standard estão liberados; os outros virão da loja de pontos. */
export const isAvatarUnlocked = (id: string) => AVATARS.some((a) => a.id === id && a.tier === 'standard');
