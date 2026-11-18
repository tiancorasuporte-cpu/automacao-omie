import { useState, type ReactNode } from "react";
import { Modal, ModalErro, useSubmeter } from "../Modal";

interface Props {
  titulo: ReactNode;
  rotulo: string;
  onConfirm: (texto: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Modal simples de justificativa (modalSimples do protótipo): voltar etapa, reabrir oportunidade,
 * trocar responsável. O texto é obrigatório.
 */
export function ModalVoltarReabrir({ titulo, rotulo, onConfirm, onCancel }: Props) {
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
      titulo={titulo}
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
        <label>{rotulo}</label>
        <textarea rows={3} autoFocus value={txt} onChange={(e) => setTxt(e.target.value)} />
      </div>
      <ModalErro msg={erro} />
    </Modal>
  );
}
