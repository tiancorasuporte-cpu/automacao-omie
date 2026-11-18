import { useState } from "react";
import type { Oportunidade } from "../../codigo/types";
import { Modal, ModalErro, useSubmeter } from "../Modal";

interface Props {
  o: Oportunidade;
  onConfirm: (texto: string) => Promise<void>;
  onCancel: () => void;
}

/** Anotação livre no histórico (não muda etapa) */
export function ModalNota({ o, onConfirm, onCancel }: Props) {
  const [txt, setTxt] = useState("");
  const { erro, ocupado, enviar } = useSubmeter();
  const ok = () =>
    enviar(async (): Promise<string | void> => {
      const t = txt.trim();
      if (!t) return "Preencha o campo.";
      await onConfirm(t);
    });
  return (
    <Modal
      titulo={<>Anotação · {o.cliente}</>}
      onClose={onCancel}
      rodape={
        <>
          <button className="btn" onClick={onCancel} disabled={ocupado}>
            Cancelar
          </button>
          <button className="btn pri" onClick={ok} disabled={ocupado}>
            Confirmar
          </button>
        </>
      }
    >
      <div className="f">
        <label>O que aconteceu? (ex.: cliente ligou pedindo nova visita técnica)</label>
        <textarea rows={3} autoFocus value={txt} onChange={(e) => setTxt(e.target.value)} />
      </div>
      <ModalErro msg={erro} />
    </Modal>
  );
}
