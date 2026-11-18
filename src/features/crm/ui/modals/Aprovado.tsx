import { useState } from "react";
import { AGUARDANDO } from "../../codigo/config";
import { dataSugeridaAprovado, hojeISO, validarAprovado } from "../../codigo/regras";
import type { Oportunidade } from "../../codigo/types";
import { Modal, ModalErro, useSubmeter } from "../Modal";
import type { AprovarDados, PrevisaoDados } from "../tipos-ui";

type Props = {
  o: Oportunidade;
  onCancel: () => void;
} & (
  | { soPrevisao: false; onConfirm: (d: AprovarDados) => Promise<void> }
  | { soPrevisao: true; onConfirm: (d: PrevisaoDados) => Promise<void> }
);

/** Cliente aprovou (vai para "Aprovado · aguardando") ou alterar a previsão */
export function ModalAprovado(props: Props) {
  const { o, onCancel, soPrevisao } = props;
  const ap = o.aprov;
  const [aguardando, setAguardando] = useState(ap?.aguardando ?? AGUARDANDO[0] ?? "");
  const [data, setData] = useState(hojeISO());
  const [prev, setPrev] = useState(ap?.prev || dataSugeridaAprovado());
  const [obs, setObs] = useState("");
  const { erro, ocupado, enviar } = useSubmeter();

  const salvar = () =>
    enviar(async (): Promise<string | void> => {
      const e = validarAprovado({ prev, obs, soPrevisao });
      if (e) return e;
      if (props.soPrevisao) await props.onConfirm({ aguardando, prev, obs: obs.trim() });
      else await props.onConfirm({ aguardando, data: data || hojeISO(), prev, obs: obs.trim() });
    });

  return (
    <Modal
      titulo={
        <>
          {soPrevisao ? "Alterar previsão" : "✍️ Cliente aprovou"} · {o.cliente}
        </>
      }
      onClose={onCancel}
      rodape={
        <>
          <button className="btn" onClick={onCancel} disabled={ocupado}>
            Cancelar
          </button>
          <button className="btn grn" onClick={salvar} disabled={ocupado}>
            Salvar
          </button>
        </>
      }
    >
      {soPrevisao ? null : (
        <div className="note" style={{ marginTop: 0 }}>
          O card vai para “Aprovado · aguardando”. Quando chegar a assinatura/autorização, finalize
          como <b>Fechado</b> — aí a OS de instalação é criada.
        </div>
      )}
      <div className="f">
        <label>Estamos aguardando *</label>
        <select value={aguardando} onChange={(e) => setAguardando(e.target.value)}>
          {AGUARDANDO.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </div>
      <div className="grid">
        {soPrevisao ? null : (
          <div className="f">
            <label>Data do OK do cliente</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        )}
        <div className="f">
          <label>Previsão de recebimento *</label>
          <input type="date" value={prev} onChange={(e) => setPrev(e.target.value)} />
        </div>
      </div>
      <div className="f">
        <label>
          {soPrevisao ? "Motivo da alteração *" : "Observação (como aprovou, com quem falou…)"}
        </label>
        <textarea
          rows={2}
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Ex.: síndico aprovou por WhatsApp; contrato enviado para assinatura digital."
        />
      </div>
      <ModalErro msg={erro} />
    </Modal>
  );
}
