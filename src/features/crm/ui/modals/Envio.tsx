import { useState } from "react";
import { CANAIS, SLA } from "../../codigo/config";
import { addUteis, fdata, hojeISO, validarEnvio } from "../../codigo/regras";
import type { Oportunidade, RegrasComissao } from "../../codigo/types";
import { Modal, ModalErro, useSubmeter } from "../Modal";
import type { EnvioDados } from "../tipos-ui";
import { BlocoDocumento, formParaDados, useFormDoc } from "./BlocoDocumento";

interface Props {
  o: Oportunidade;
  regras: RegrasComissao;
  onConfirm: (d: EnvioDados) => Promise<void>;
  onCancel: () => void;
}

/** 1ª ação: registrar como a proposta foi enviada + anexo */
export function ModalEnvio({ o, regras, onConfirm, onCancel }: Props) {
  const [form, setForm] = useFormDoc(o, regras, true);
  const [canal, setCanal] = useState<string>(CANAIS[0] ?? "");
  const [data, setData] = useState(hojeISO());
  const [obs, setObs] = useState("");
  const { erro, ocupado, enviar } = useSubmeter();

  const salvar = () =>
    enviar(async (): Promise<string | void> => {
      const e = validarEnvio(o, {
        temArquivoNovo: !!form.arquivo,
        tv: form.tv,
        mensal: +form.mensal || 0,
        total: +form.total || 0,
        obs,
      });
      if (e) return e;
      await onConfirm({
        ...formParaDados(form, o),
        canal,
        data: data || hojeISO(),
        obs: obs.trim(),
      });
    });

  return (
    <Modal
      titulo="Registrar envio ao cliente (1ª ação)"
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
      <div className="grid">
        <div className="f">
          <label>Como foi enviada</label>
          <select value={canal} onChange={(e) => setCanal(e.target.value)}>
            {CANAIS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="f">
          <label>Data do envio</label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
      </div>
      <BlocoDocumento
        o={o}
        regras={regras}
        form={form}
        setForm={setForm}
        titulo={
          o.docs?.length
            ? "Anexar a proposta enviada (se for diferente do que já está anexado)"
            : "Anexar o orçamento / proposta enviada *"
        }
      />
      <div className="f">
        <label>Observação *</label>
        <textarea
          rows={2}
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Ex.: proposta enviada por e-mail para a síndica; vai apresentar ao conselho."
        />
      </div>
      <div className="note">
        Depois do envio, o card fica em “Enviado ao cliente”. Agende a 2ª ação até{" "}
        {fdata(addUteis(SLA.enviado))} ({SLA.enviado} dias úteis).
      </div>
      <ModalErro msg={erro} />
    </Modal>
  );
}
