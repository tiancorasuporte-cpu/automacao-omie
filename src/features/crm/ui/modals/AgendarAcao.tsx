import { useState } from "react";
import { TIPOS_ACAO } from "../../codigo/config";
import { dataSugeridaAcao, fcurta, validarAgendamento } from "../../codigo/regras";
import type { Oportunidade, TipoAcaoId } from "../../codigo/types";
import { Modal, ModalErro, useSubmeter } from "../Modal";
import type { AgendarDados } from "../tipos-ui";
import { tipoAcao } from "../utils";

interface Props {
  o: Oportunidade;
  n: 2 | 3;
  /** 'mover' = passando o card de coluna · 'reagendar' = mesma coluna (troca data/tipo) */
  modo: "mover" | "reagendar";
  onConfirm: (d: AgendarDados) => Promise<void>;
  onCancel: () => void;
}

/** Agendar a 2ª ou 3ª ação: tipo, data, hora e objetivo */
export function ModalAgendarAcao({ o, n, modo, onConfirm, onCancel }: Props) {
  const anterior = o.acao; // ação anterior (pode estar pendente)
  const pedeResultado = modo === "mover" && !!anterior && !anterior.feita;
  const reag = modo === "reagendar" && !!anterior && !anterior.feita;

  const [tipo, setTipo] = useState<TipoAcaoId | "">(reag && anterior ? anterior.tipo : "");
  const [data, setData] = useState(reag && anterior ? anterior.data : dataSugeridaAcao(n));
  const [hora, setHora] = useState(reag && anterior ? anterior.hora || "" : "");
  const [obj, setObj] = useState(reag && anterior ? anterior.obj || "" : "");
  const [resAnt, setResAnt] = useState("");
  const [motR, setMotR] = useState("");
  const { erro, ocupado, enviar } = useSubmeter();

  const confirmar = () =>
    enviar(async (): Promise<string | void> => {
      const e = validarAgendamento(o, modo, {
        resultadoAnterior: resAnt,
        tipo,
        data,
        motivoReagendar: motR,
      });
      if (e) return e;
      if (!tipo) return "Escolha a ação.";
      await onConfirm({
        n,
        modo,
        tipo,
        data,
        hora,
        obj: obj.trim(),
        resultadoAnterior: resAnt.trim(),
        motivoReagendar: motR.trim(),
      });
    });

  const tAnt = anterior ? tipoAcao(anterior.tipo) : null;

  return (
    <Modal
      titulo={
        <>
          {reag ? "Reagendar" : "Agendar"} {n}ª ação · {o.cliente}
        </>
      }
      onClose={onCancel}
      rodape={
        <>
          <button className="btn" onClick={onCancel} disabled={ocupado}>
            Cancelar
          </button>
          <button className="btn pri" onClick={confirmar} disabled={ocupado}>
            {reag ? "Reagendar" : "Agendar"}
          </button>
        </>
      }
    >
      {pedeResultado && anterior && tAnt ? (
        <div className="f">
          <label>
            Resultado da {anterior.n}ª ação ({tAnt.ic} {tAnt.nome} de {fcurta(anterior.data)}) *
          </label>
          <textarea
            rows={2}
            value={resAnt}
            onChange={(e) => setResAnt(e.target.value)}
            placeholder="O que aconteceu? Ex.: cliente pediu para apresentar à diretoria."
          />
        </div>
      ) : null}
      <div className="f">
        <label>Qual ação você vai fazer? *</label>
        <div className="tipos">
          {TIPOS_ACAO.map((t) => (
            <div
              key={t.id}
              className={`tipo ${t.id === tipo ? "on" : ""}`.trim()}
              onClick={() => setTipo(t.id)}
            >
              <span>{t.ic}</span>
              {t.nome}
            </div>
          ))}
        </div>
      </div>
      <div className="grid">
        <div className="f">
          <label>Data *</label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="f">
          <label>Hora (opcional)</label>
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </div>
      </div>
      <div className="f">
        <label>Objetivo da ação</label>
        <textarea
          rows={2}
          value={obj}
          onChange={(e) => setObj(e.target.value)}
          placeholder="Ex.: apresentar a solução para o conselho e negociar a implantação."
        />
      </div>
      {reag ? (
        <div className="f">
          <label>Motivo do reagendamento *</label>
          <input
            value={motR}
            onChange={(e) => setMotR(e.target.value)}
            placeholder="Ex.: cliente pediu para remarcar"
          />
        </div>
      ) : null}
      {n === 3 ? (
        <div className="note">
          Esta é a última ação. Se o cliente não decidir, finalize como “Não fechado” com o motivo.
        </div>
      ) : null}
      <ModalErro msg={erro} />
    </Modal>
  );
}
