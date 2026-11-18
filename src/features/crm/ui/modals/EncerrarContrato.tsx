import { useState } from "react";
import { hojeISO } from "../../codigo/regras";
import type { Oportunidade } from "../../codigo/types";
import { Modal, ModalErro, useSubmeter } from "../Modal";

interface Props {
  o: Oportunidade;
  onConfirm: (d: { fim: string; motivo: string }) => Promise<void>;
  onCancel: () => void;
}

/** Encerramento antecipado do contrato recorrente (as parcelas de comissão param) */
export function ModalEncerrarContrato({ o, onConfirm, onCancel }: Props) {
  const [fim, setFim] = useState(hojeISO());
  const [motivo, setMotivo] = useState("");
  const { erro, ocupado, enviar } = useSubmeter();
  const ok = () =>
    enviar(async (): Promise<string | void> => {
      if (!fim || !motivo.trim()) return "Informe a data e o motivo.";
      await onConfirm({ fim, motivo: motivo.trim() });
    });
  return (
    <Modal
      titulo={<>Encerramento do contrato · {o.cliente}</>}
      onClose={onCancel}
      rodape={
        <>
          <button className="btn" onClick={onCancel} disabled={ocupado}>
            Cancelar
          </button>
          <button className="btn pri" onClick={ok} disabled={ocupado}>
            Registrar
          </button>
        </>
      }
    >
      <div className="note" style={{ marginTop: 0 }}>
        A comissão recorrente é paga até o mês do encerramento. Depois disso, as parcelas param.
      </div>
      <div className="grid">
        <div className="f">
          <label>Data do encerramento *</label>
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
        </div>
      </div>
      <div className="f">
        <label>Motivo *</label>
        <textarea
          rows={2}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: cliente cancelou o contrato; troca de empresa"
        />
      </div>
      <ModalErro msg={erro} />
    </Modal>
  );
}
