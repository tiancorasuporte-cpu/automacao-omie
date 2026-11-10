export const OS_TIPOS = [
  { id: "pedido", label: "Pedido aprovado (instalação)", entryStage: 0 },
  { id: "manut", label: "Manutenção", entryStage: 3 },
  { id: "monit", label: "Monitoramento", entryStage: 3 },
  { id: "visita", label: "Orçamento · visita técnica", entryStage: 3 },
] as const;

export type OsTipo = (typeof OS_TIPOS)[number]["id"];

export const OS_SUBTIPOS_MANUT = [
  "CFTV",
  "Alarme",
  "Controle de acesso",
  "Portão / automatizador",
  "Interfonia",
  "Outros",
] as const;

export const OS_SUBTIPOS_MONIT = ["Conectar", "Desconectar"] as const;

export const OS_STAGES = [
  { idx: 0, name: "OS aberta · pedido aprovado", mover: "assistencia" as const },
  { idx: 1, name: "Em separação", mover: "estoque" as const },
  { idx: 2, name: "Compras", mover: "compras" as const },
  { idx: 3, name: "Aguardando agendamento", mover: "assistencia" as const },
  { idx: 4, name: "Agendado", mover: "assistencia" as const },
  { idx: 5, name: "Em execução", mover: "assistencia" as const },
  { idx: 6, name: "Executado", mover: "assistencia" as const },
  { idx: 7, name: "Finalizado", mover: null },
] as const;

/** Visual Soft10: amarelo = setor do usuário; cinza = fora do setor. */
export function osKanbanColumnStyle(mine: boolean) {
  if (mine) {
    return {
      column: "border-amber-200/90 bg-[#F6E7A1]",
      header: "text-on-surface",
      card: "border-black/5 bg-white shadow-sm hover:border-amber-400",
      pill: "bg-neutral-900 text-white",
      count: "bg-black/10 text-on-surface",
      empty: "border-amber-700/25 text-amber-950/55",
    };
  }
  return {
    column: "border-slate-200 bg-slate-100",
    header: "text-slate-700",
    card: "border-slate-200 bg-white shadow-sm hover:border-slate-400",
    pill: "bg-neutral-900 text-white",
    count: "bg-slate-300/80 text-slate-800",
    empty: "border-slate-300 text-slate-500",
  };
}

/** @deprecated Use osKanbanColumnStyle(mine) no Kanban. */
export function osStageStyle(_stage: number) {
  return osKanbanColumnStyle(false);
}

export function osStageMoverLabel(mover: string | null | undefined) {
  if (!mover) return "Encerrada";
  if (mover === "assistencia") return "Quem move: Assistência";
  if (mover === "estoque") return "Quem move: Estoque";
  if (mover === "compras") return "Quem move: Estoque dá entrada";
  return `Quem move: ${mover}`;
}

export const OS_LAST_STAGE = 7;

export const OS_ITEM_STATUS = [
  "pendente",
  "separado",
  "comprar",
  "comprado",
  "recebido",
  "campo",
  "extra",
  "aplicado",
  "chegou",
] as const;

export type OsItemStatus = (typeof OS_ITEM_STATUS)[number];

export const OS_ITEM_STATUS_LABEL: Record<OsItemStatus, string> = {
  pendente: "Pendente",
  separado: "Separado",
  comprar: "A comprar",
  comprado: "Comprado",
  recebido: "Recebido",
  campo: "Em campo",
  extra: "Extra",
  aplicado: "Aplicado",
  chegou: "Chegou",
};

/** Classes Tailwind para badge/pill do status do item. */
export const OS_ITEM_STATUS_CLASS: Record<OsItemStatus, string> = {
  pendente: "bg-surface-container text-on-surface-variant",
  separado: "bg-emerald-100 text-emerald-800",
  comprar: "bg-amber-100 text-amber-900",
  comprado: "bg-sky-100 text-sky-900",
  recebido: "bg-teal-100 text-teal-900",
  campo: "bg-indigo-100 text-indigo-900",
  extra: "bg-violet-100 text-violet-900",
  aplicado: "bg-emerald-100 text-emerald-800",
  chegou: "bg-teal-100 text-teal-900",
};

export const OS_PERIODOS = ["Manhã", "Tarde", "Noite", "Dia inteiro"] as const;

export function osTipoLabel(tipo: string) {
  return OS_TIPOS.find((t) => t.id === tipo)?.label ?? tipo;
}

/** Badge curto no cartão Soft10. */
export function osTipoBadgeLabel(tipo: string) {
  if (tipo === "pedido") return "PEDIDO";
  if (tipo === "manut") return "MANUTENÇÃO";
  if (tipo === "monit") return "MONITORAMENTO";
  if (tipo === "visita") return "ORÇAMENTO";
  return tipo.toUpperCase();
}

export function osStageName(stage: number) {
  return OS_STAGES.find((s) => s.idx === stage)?.name ?? `Etapa ${stage}`;
}

export function isDirectOsTipo(tipo: string) {
  return tipo !== "pedido";
}

export function entryStageForTipo(tipo: OsTipo) {
  return OS_TIPOS.find((t) => t.id === tipo)?.entryStage ?? 3;
}
