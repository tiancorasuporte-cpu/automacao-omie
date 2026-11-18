import { useState } from "react";
import { MOTIVOS } from "../../codigo/config";
import {
  addDias,
  documentoFechamento,
  fdata,
  hojeISO,
  isRecorrente,
  validarFinal,
} from "../../codigo/regras";
import type { Oportunidade } from "../../codigo/types";
import { Modal, ModalErro, useSubmeter } from "../Modal";
import type { FinalizarDados } from "../tipos-ui";
import { ftam, icDoc } from "../utils";

interface Props {
  o: Oportunidade;
  /** pré-seleciona Fechado (ex.: "Recebido — finalizar como fechado") */
  pre?: "ganho" | "perdido" | undefined;
  onConfirm: (d: FinalizarDados) => Promise<void>;
  onCancel: () => void;
}

export function ModalFinalizar({ o, pre, onConfirm, onCancel }: Props) {
  const rec = isRecorrente(o);
  const doc = documentoFechamento(o); // contrato (recorrente) ou aceite (execução)
  const ja = (o.docs || []).find((d) => d.etiqueta === doc.etiqueta);

  const [st, setSt] = useState<"ganho" | "perdido" | "">(pre ?? "");
  const [motivo, setMotivo] = useState("");
  const [conc, setConc] = useState("");
  const [retomar, setRetomar] = useState(false);
  const [retData, setRetData] = useState(addDias(90));
  const [obs, setObs] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const { erro, ocupado, enviar } = useSubmeter();

  const finalizar = () =>
    enviar(async (): Promise<string | void> => {
      const e = validarFinal(o, { ...(st ? { st } : {}), temArquivoNovo: !!arquivo, motivo, obs });
      if (e || !st) return e || "Escolha Fechado ou Não fechado.";
      await onConfirm({
        st,
        motivo: st === "perdido" ? motivo : "",
        obs: obs.trim(),
        concorrente: conc.trim(),
        retomar: st === "perdido" && retomar ? retData : "",
        arquivo: st === "ganho" ? arquivo : null,
      });
    });

  return (
    <Modal
      titulo={<>Finalizar {o.cod}</>}
      onClose={onCancel}
      rodape={
        <>
          <button className="btn" onClick={onCancel} disabled={ocupado}>
            Cancelar
          </button>
          <button className="btn dark" onClick={finalizar} disabled={ocupado}>
            Finalizar
          </button>
        </>
      }
    >
      <div className="opts">
        <div
          className={`opt w ${st === "ganho" ? "on" : ""}`.trim()}
          onClick={() => setSt("ganho")}
        >
          <b>✔ Fechado</b>
          <span>
            {rec ? "Exige o contrato assinado." : "Exige o aceite do cliente."} Gera OS de
            instalação.
          </span>
        </div>
        <div
          className={`opt l ${st === "perdido" ? "on" : ""}`.trim()}
          onClick={() => setSt("perdido")}
        >
          <b>✖ Não fechado</b>
          <span>Cliente optou por não fazer.</span>
        </div>
      </div>

      {st === "perdido" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="f">
            <label>Motivo principal *</label>
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              <option value="">Selecione…</option>
              {MOTIVOS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
          {motivo === "Fechou com concorrente" ? (
            <div className="f">
              <label>Qual concorrente? Valor oferecido?</label>
              <input
                value={conc}
                onChange={(e) => setConc(e.target.value)}
                placeholder="Ex.: Empresa X — R$ 160/mês"
              />
            </div>
          ) : null}
          <label className="chk">
            <input
              type="checkbox"
              checked={retomar}
              onChange={(e) => setRetomar(e.target.checked)}
            />{" "}
            Retomar contato no futuro
          </label>
          {retomar ? (
            <div className="f">
              <label>Data para retomar</label>
              <input type="date" value={retData} onChange={(e) => setRetData(e.target.value)} />
            </div>
          ) : null}
        </div>
      ) : null}

      {st === "ganho" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="f">
            <label>{doc.etiqueta} *</label>
            {ja ? (
              <div className="lido">
                ✔ Já anexado: <b>{ja.nome}</b> ({fdata(ja.data)}). Se quiser, anexe outra versão
                abaixo.
              </div>
            ) : null}
            <label className="drop" style={{ marginTop: 6 }}>
              <input
                type="file"
                accept=".pdf,.docx,.jpg,.jpeg,.png"
                hidden
                onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              />
              <span>
                {arquivo ? (
                  <>
                    {icDoc(arquivo.name)} <b>{arquivo.name}</b>{" "}
                    <small>({ftam(arquivo.size)})</small>
                  </>
                ) : (
                  <>
                    📎 Toque para anexar {doc.curto} <small>(PDF, Word ou foto)</small>
                  </>
                )}
              </span>
            </label>
            <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 4 }}>{doc.dica}</div>
          </div>
          <div className="note" style={{ marginTop: 0 }}>
            Ao confirmar, o SGO cria a OS “Pedido aprovado (instalação)” no Quadro de OS com os
            itens do levantamento.
          </div>
        </div>
      ) : null}

      <div className="f">
        <label>Observação</label>
        <textarea
          rows={3}
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder={
            o.etapa === "aprovado"
              ? `Ex.: contrato assinado em ${fdata(hojeISO())}; instalação autorizada.`
              : ""
          }
        />
      </div>
      <ModalErro msg={erro} />
    </Modal>
  );
}
