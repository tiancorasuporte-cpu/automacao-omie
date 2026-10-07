export const UNIFORM_MOVEMENT_TYPES = [
  {
    id: "entrega",
    label: "Entrega",
    hint: "Peças saem do estoque para o colaborador",
    icon: "outbox",
  },
  {
    id: "troca",
    label: "Troca",
    hint: "Colaborador devolve a peça antiga e recebe uma nova",
    icon: "sync_alt",
  },
  {
    id: "devolucao",
    label: "Devolução",
    hint: "Peças voltam do colaborador (desligamento, sobra, etc.)",
    icon: "move_to_inbox",
  },
] as const;

export const UNIFORM_CONDITIONS = [
  { id: "reaproveitavel", label: "Reaproveitável (volta ao estoque)" },
  { id: "descarte", label: "Descarte (não volta ao estoque)" },
] as const;

export const UNIFORM_CATEGORIES = [
  "Camisa",
  "Calça",
  "Jaqueta",
  "Calçado",
  "Boné",
  "Cinto",
  "EPI",
  "Acessório",
  "Outro",
] as const;

export const UNIFORM_STOCK_MOVE_TYPES = [
  { id: "inicial", label: "Saldo inicial" },
  { id: "entrada", label: "Entrada (compra)" },
  { id: "ajuste", label: "Ajuste de inventário" },
  { id: "saida", label: "Saída para colaborador" },
  { id: "devolucao", label: "Devolução" },
  { id: "estorno", label: "Estorno de movimentação" },
] as const;

export type UniformMovementType = (typeof UNIFORM_MOVEMENT_TYPES)[number]["id"];
export type UniformCondition = (typeof UNIFORM_CONDITIONS)[number]["id"];
export type UniformStockMoveType = (typeof UNIFORM_STOCK_MOVE_TYPES)[number]["id"];
export type UniformDirection = "saida" | "entrada";

export function uniformMovementLabel(id: string) {
  return UNIFORM_MOVEMENT_TYPES.find((t) => t.id === id)?.label ?? id;
}

export function uniformConditionLabel(id: string | null | undefined) {
  if (!id) return "";
  return id === "descarte" ? "Descarte" : "Reaproveitável";
}

export function uniformStockMoveLabel(id: string) {
  return UNIFORM_STOCK_MOVE_TYPES.find((t) => t.id === id)?.label ?? id;
}

export function isUniformMovementType(value: string): value is UniformMovementType {
  return UNIFORM_MOVEMENT_TYPES.some((t) => t.id === value);
}

/** Dias de antecedência para avisar que a troca de uma peça está chegando. */
export const UNIFORM_REPLACEMENT_WARNING_DAYS = 30;

export function itemLabel(nome: string, tamanho: string | null | undefined) {
  return tamanho ? `${nome} · ${tamanho}` : nome;
}

export function formatBRL(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
