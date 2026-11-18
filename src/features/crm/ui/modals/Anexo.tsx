import { useState } from "react";
import { TIPOS_DOCUMENTO, VALIDADE_PADRAO } from "../../codigo/config";
import { addDias } from "../../codigo/regras";
import type { Oportunidade, RegrasComissao } from "../../codigo/types";
import { Modal, ModalErro, useSubmeter } from "../Modal";
import type { UploadDocDados } from "../tipos-ui";
import { BlocoDocumento, formParaDados, useFormDoc } from "./BlocoDocumento";

interface Props {
  o: Oportunidade;
  regras: RegrasComissao;
  onConfirm: (d: UploadDocDados) => Promise<void>;
  onCancel: () => void;
}

export function ModalAnexo({ o, regras, onConfirm, onCancel }: Props) {
  const [form, setForm] = useFormDoc(o, regras, true);
  const [etiqueta, setEtiqueta] = useState<string>(TIPOS_DOCUMENTO[0] ?? "Outro");
  const { erro, ocupado, enviar } = useSubmeter();

  const mudaTipo = (v: string) => {
    setEtiqueta(v);
    if (/Proposta|Orçamento/.test(v))
      setForm((p) => ({
        ...p,
        validade: addDias(VALIDADE_PADRAO),
        auto: { ...p.auto, validade: false },
      }));
  };

  const salvar = () =>
    enviar(async (): Promise<string | void> => {
      if (!form.arquivo) return "Escolha o arquivo.";
      await onConfirm({ ...formParaDados(form, o), etiqueta });
    });

  return (
    <Modal
      titulo="Anexar orçamento / proposta"
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
      <div className="f">
        <label>Tipo do documento</label>
        <select value={etiqueta} onChange={(e) => mudaTipo(e.target.value)}>
          {TIPOS_DOCUMENTO.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <BlocoDocumento o={o} regras={regras} titulo="Arquivo *" form={form} setForm={setForm} />
      <ModalErro msg={erro} />
    </Modal>
  );
}
