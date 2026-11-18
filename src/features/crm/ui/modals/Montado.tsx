import { useState } from "react";
import { validarMontado } from "../../codigo/regras";
import type { Oportunidade, RegrasComissao } from "../../codigo/types";
import { Modal, ModalErro, useSubmeter } from "../Modal";
import type { MontadoDados } from "../tipos-ui";
import { BlocoDocumento, formParaDados, useFormDoc } from "./BlocoDocumento";

interface Props {
  o: Oportunidade;
  regras: RegrasComissao;
  onConfirm: (d: MontadoDados) => Promise<void>;
  onCancel: () => void;
}

export function ModalMontado({ o, regras, onConfirm, onCancel }: Props) {
  const [form, setForm] = useFormDoc(o, regras, true);
  const [obs, setObs] = useState("");
  const { erro, ocupado, enviar } = useSubmeter();

  const salvar = () =>
    enviar(async (): Promise<string | void> => {
      const e = validarMontado({ orc: form.orc, temArquivo: !!form.arquivo });
      if (e) return e;
      await onConfirm({ ...formParaDados(form, o), obs: obs.trim() });
    });

  return (
    <Modal
      titulo={<>Orçamento montado · {o.cliente}</>}
      onClose={onCancel}
      rodape={
        <>
          <button className="btn" onClick={onCancel} disabled={ocupado}>
            Cancelar
          </button>
          <button className="btn pri" onClick={salvar} disabled={ocupado}>
            Salvar
          </button>
        </>
      }
    >
      <BlocoDocumento
        o={o}
        regras={regras}
        titulo="Anexar o orçamento padrão (opcional agora, obrigatório no envio)"
        form={form}
        setForm={setForm}
      />
      <div className="f">
        <label>Observação</label>
        <input
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Ex.: incluído kit de nobreak a pedido do síndico"
        />
      </div>
      <ModalErro msg={erro} />
    </Modal>
  );
}
