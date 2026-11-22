import { useState } from 'react';
import { StarIcon } from './icons';
import { Modal } from './ui';

/** Selo de pontos do topo. Os pontos ainda não contam: o sistema de recompensas vem depois. */
export function PointsButton() {
  const [open, setOpen] = useState(false);
  const points = 0;
  return (
    <>
      <button type="button" className="points-chip" aria-label={`Seus pontos: ${points}. Toque para saber mais`} onClick={() => setOpen(true)}>
        <StarIcon size={14} /><span>{points}</span>
      </button>
      {open && (
        <Modal title="Pontos: em breve" onClose={() => setOpen(false)}>
          <div className="help-modal small">
            <p>Em breve você vai ganhar pontos cuidando do seu mês: classificando os gastos, ficando dentro dos limites e fazendo os aportes na caixinha.</p>
            <p>Com os pontos, dá para trocar por novos temas na loja. Veja os temas em <b>Ajustes › Aparência</b>.</p>
          </div>
          <div className="row-end"><button type="button" className="btn primary" onClick={() => setOpen(false)}>Entendi</button></div>
        </Modal>
      )}
    </>
  );
}
