import { useState } from "react";
import { validarResultado } from "../../codigo/regras";
import type { Oportunidade } from "../../codigo/types";
import { Modal, ModalErro, useSubmeter } from "../Modal";
import type { ResultadoDados } from "../tipos-ui";
import { tipoAcao } from "../utils";

interface Props {
  o: Oportunidade;
  onConfirm: (d: ResultadoDados) => Promise<void>;
  onCancel: () => void;
}

/** Marca a ação agendada como realizada e pergunta o próximo passo */
export function ModalResultadoAcao({ o, onConfirm, onCancel }: Props) {
  const a = o.acao;
  const [resultado, setResultado] = useState("");
  const [prox, setProx] = useState<ResultadoDados["proximo"] | "">("");
  const { erro, ocupado, enviar } = useSubmeter();
  if (!a) return null;
  const t = tipoAcao(a.tipo);

  const salvar = () =>
    enviar(async (): Promise<string | void> => {
      const e = validarResultado({ resultado, proximo: prox });
      if (e) return e;
      if (!prox) return "Escolha o próximo passo.";
      await onConfirm({ resultado: resultado.trim(), proximo: prox });
    });

  const opcao = (id: ResultadoDados["proximo"], ic: string, txt: string) => (
    <div className={`tipo ${prox === id ? "on" : ""}`.trim()} onClick={() => setProx(id)}>
      <span>{ic}</span>
      {txt}
    </div>
  );

  return (
    <Modal
      titulo={
        <>
          Resultado da {a.n}ª ação · {t.ic} {t.nome}
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
      <div className="f">
        <label>O que aconteceu? *</label>
        <textarea
          rows={3}
          value={resultado}
          onChange={(e) => setResultado(e.target.value)}
          placeholder="Ex.: apresentei a solução; pediram desconto de 10% na implantação."
        />
      </div>
      <div className="f">
        <label>Próximo passo *</label>
        <div className="tipos">
          {a.n === 2 ? opcao("acao3", "➡️", "Agendar 3ª ação") : null}
          {opcao("final", "🏁", "Finalizar (fechou / não fechou)")}
          {opcao("aguardar", "⏳", "Só registrar por enquanto")}
        </div>
      </div>
      <ModalErro msg={erro} />
    </Modal>
  );
}
