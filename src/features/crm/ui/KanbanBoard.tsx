import { useState, type DragEvent } from "react";
import { ETAPAS } from "../codigo/config";
import { filtrarFinalizados, ordenarColuna } from "../codigo/regras";
import type { EtapaId, Oportunidade } from "../codigo/types";
import { KanbanColumn, type FiltroFinal } from "./KanbanColumn";

interface Props {
  /** oportunidades já filtradas (busca, vendedor, tipo, serviço, atrasados) */
  oportunidades: Oportunidade[];
  onOpen: (id: number) => void;
  /** soltou o card numa coluna — quem decide o que fazer (modal, erro) é `movimento()` em quem chama */
  onMove: (id: number, etapa: EtapaId) => void;
}

/** Quadro Kanban com arrastar-e-soltar HTML5 (igual ao protótipo) */
export function KanbanBoard({ oportunidades, onOpen, onMove }: Props) {
  const [filtroFinal, setFiltroFinal] = useState<FiltroFinal>("30");
  const [over, setOver] = useState<EtapaId | null>(null);

  const soltar = (e: DragEvent<HTMLElement>, etapa: EtapaId) => {
    e.preventDefault();
    setOver(null);
    const id = Number(e.dataTransfer.getData("text/plain"));
    if (id) onMove(id, etapa);
  };

  return (
    <div className="board">
      {ETAPAS.map((et) => {
        const itens =
          et.id === "final"
            ? filtrarFinalizados(oportunidades, filtroFinal)
            : ordenarColuna(oportunidades.filter((o) => o.etapa === et.id));
        return (
          <KanbanColumn
            key={et.id}
            etapa={et}
            itens={itens}
            over={over === et.id}
            onOpen={onOpen}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (over !== et.id) setOver(et.id);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                setOver((cur) => (cur === et.id ? null : cur));
            }}
            onDrop={(e) => soltar(e, et.id)}
            {...(et.id === "final" ? { filtroFinal, onFiltroFinal: setFiltroFinal } : {})}
          />
        );
      })}
    </div>
  );
}
