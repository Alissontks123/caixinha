import { StarIcon } from './icons';

/** Selo de estrelas do topo: mostra o saldo e abre a Loja. */
export function PointsButton({ balance, onClick }: { balance: number; onClick: () => void }) {
  return (
    <button type="button" className="points-chip" aria-label={`Suas estrelas: ${balance}. Toque para abrir a Loja`} title="Abrir a Loja" onClick={onClick}>
      <StarIcon size={14} /><span>{balance}</span>
    </button>
  );
}
