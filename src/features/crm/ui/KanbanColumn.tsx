import type { CSSProperties, DragEvent } from "react";
import { ETAPAS } from "../codigo/config";
import { brl, somaColuna } from "../codigo/regras";
import type { Oportunidade } from "../codigo/types";
import { OpportunityCard } from "./OpportunityCard";

export type FiltroFinal = "30" | "ganho" | "perdido" | "todos";

interface Props {
  etapa: (typeof ETAPAS)[number];
  itens: Oportunidade[];
  /** coluna sob o cursor durante o arraste (.col.over) */
  over: boolean;
  onOpen: (id: number) => void;
  onDragOver: (e: DragEvent<HTMLElement>) => void;
  onDragLeave: (e: DragEvent<HTMLElement>) => void;
  onDrop: (e: DragEvent<HTMLElement>) => void;
  /** só na coluna Finalizado */
  filtroFinal?: FiltroFinal;
  onFiltroFinal?: (f: FiltroFinal) => void;
}

export function KanbanColumn({
  etapa: e,
  itens,
  over,
  onOpen,
  onDragOver,
  onDragLeave,
  onDrop,
  filtroFinal,
  onFiltroFinal,
}: Props) {
  const { exe, rec } = somaColuna(itens);
  return (
    <section
      className={`col ${over ? "over" : ""}`.trim()}
      data-etapa={e.id}
      style={{ "--c": e.cor } as CSSProperties}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="colh">
        <div className="t">
          {e.nome}
          <em>{itens.length}</em>
        </div>
        <div className="d">{e.desc}</div>
        {exe || rec ? (
          <div className="v">
            {exe ? "🔧 " + brl(exe) : ""}
            {exe && rec ? " · " : ""}
            {rec ? "🔁 " + brl(rec) + "/mês" : ""}
          </div>
        ) : null}
        {e.id === "final" ? (
          <select
            value={filtroFinal ?? "30"}
            onChange={(ev) => onFiltroFinal?.(ev.target.value as FiltroFinal)}
          >
            <option value="30">Últimos 30 dias</option>
            <option value="ganho">Só fechados</option>
            <option value="perdido">Só não fechados</option>
            <option value="todos">Todos</option>
          </select>
        ) : null}
      </div>
      <div className="cards">
        {itens.length ? (
          itens.map((o) => <OpportunityCard key={o.id} o={o} onOpen={onOpen} />)
        ) : (
          <div className="empty">Nenhuma oportunidade</div>
        )}
      </div>
    </section>
  );
}
