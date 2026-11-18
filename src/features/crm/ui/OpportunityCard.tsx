import type { DragEvent } from "react";
import { TIPOS_VENDA } from "../codigo/config";
import {
  alerta,
  brl,
  fcurta,
  fdata,
  iniciais,
  isRecorrente,
  tipoVenda,
  valorPrincipal,
} from "../codigo/regras";
import type { Oportunidade } from "../codigo/types";
import { tipoAcao } from "./utils";

interface Props {
  o: Oportunidade;
  onOpen: (id: number) => void;
  /** arrastar (HTML5) — opcional */
  draggable?: boolean;
  onDragStart?: (e: DragEvent<HTMLDivElement>, id: number) => void;
}

/** Card do Kanban — mesma estrutura do cardHTML() do protótipo */
export function OpportunityCard({ o, onOpen, draggable = true, onDragStart }: Props) {
  const a = alerta(o);
  const final = o.etapa === "final" && !!o.res;
  const t = TIPOS_VENDA[tipoVenda(o)];
  const rec = isRecorrente(o);
  const ac = o.acao;
  const ta = ac ? tipoAcao(ac.tipo) : null;

  return (
    <div
      className={`card ${a.late ? "late" : ""}`.trim()}
      draggable={draggable}
      data-id={o.id}
      onClick={() => onOpen(o.id)}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(o.id));
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.(e, o.id);
      }}
    >
      <div className="r1">
        <span>
          {o.cod}
          {o.os ? " · " + o.os : ""}
          {o.docs?.length ? " · 📎" + o.docs.length : ""}
        </span>
        <span className={`tv ${t.cls}`}>
          {t.ic} {t.curto}
        </span>
      </div>
      <div className="cli">{o.cliente}</div>
      <div className="sub">
        {o.servico} · {o.cidade}
      </div>

      {!valorPrincipal(o) ? (
        <div className="val no">Valor a definir</div>
      ) : rec ? (
        <div className="val">
          {brl(+o.valor)} /mês{" "}
          <span className="vs">
            · {o.prazo} meses{o.total ? " · + " + brl(+o.total) + " implantação" : ""}
          </span>
        </div>
      ) : (
        <div className="val">
          {brl(+(o.total || 0))} <span className="vs">venda</span>
        </div>
      )}

      {o.etapa === "aprovado" && o.aprov ? (
        <div className="acao-mini apr">
          <span>✍️</span>
          <div>
            <b>Aguardando: {o.aprov.aguardando}</b>
            <br />
            Aprovado em {fdata(o.aprov.data)}
            {o.aprov.prev ? " · previsão " + fcurta(o.aprov.prev) : ""}
          </div>
        </div>
      ) : null}

      {ac && ta && !final && o.etapa !== "aprovado" ? (
        <div className={`acao-mini ${ac.feita ? "ok" : ""}`.trim()}>
          <span>{ta.ic}</span>
          <div>
            <b>
              {ac.n}ª ação: {ta.nome}
            </b>
            <br />
            {ac.feita ? "✔ Realizada" : fdata(ac.data) + (ac.hora ? " às " + ac.hora : "")}
          </div>
        </div>
      ) : null}

      {final && o.res?.st === "perdido" ? (
        <div className="sub" style={{ marginTop: 4, color: "var(--red)" }}>
          Motivo: {o.res.motivo}
        </div>
      ) : null}

      <div className="r3">
        <div className="avs">
          <div className="av" title={`Responsável: ${o.vendedor}`}>
            {iniciais(o.vendedor)}
          </div>
          {(o.aux || []).map((n) => (
            <div key={"x" + n} className="av aux" title={`Vendedor auxiliar: ${n}`}>
              {iniciais(n)}
            </div>
          ))}
          {(o.apoio || []).map((n) => (
            <div key={"t" + n} className="av tec" title={`Apoio técnico: ${n}`}>
              {iniciais(n)}
            </div>
          ))}
        </div>
        {a.txt ? <span className={`tag ${a.cls}`.trim()}>{a.txt}</span> : null}
      </div>
    </div>
  );
}
