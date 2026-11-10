export const TICKET_SETORES = [
  { id: "assist", nome: "Assistência Técnica" },
  { id: "eng", nome: "Engenharia" },
  { id: "ti", nome: "TI" },
  { id: "sup", nome: "Suporte Técnico" },
  { id: "supmon", nome: "Suporte Técnico Monitoramento" },
  { id: "procmon", nome: "Procedimentos Monitoramento" },
  { id: "com", nome: "Comercial" },
] as const;

export type TicketSetorId = (typeof TICKET_SETORES)[number]["id"];

export const TICKET_CATS = [
  { id: "orc", label: "Orçamento / proposta", setores: ["assist"] as TicketSetorId[] },
  { id: "levorc", label: "Levantamento para orçamento", setores: ["com"] as TicketSetorId[] },
  { id: "proj", label: "Projeto / engenharia", setores: ["eng"] as TicketSetorId[] },
  {
    id: "con",
    label: "Conexão / procedimento monitoramento",
    setores: ["procmon", "supmon"] as TicketSetorId[],
  },
  { id: "desc", label: "Desconexão monitoramento", setores: ["procmon"] as TicketSetorId[] },
  { id: "cam", label: "Câmeras / CFTV", setores: ["supmon"] as TicketSetorId[] },
  { id: "gprs", label: "GPRS / comunicação", setores: ["supmon"] as TicketSetorId[] },
  { id: "osc", label: "OS de campo / monitoramento", setores: ["supmon"] as TicketSetorId[] },
  { id: "def", label: "Defeito / suporte técnico", setores: ["sup"] as TicketSetorId[] },
  { id: "ti", label: "TI / sistemas", setores: ["ti"] as TicketSetorId[] },
  { id: "out", label: "Outros", setores: [] as TicketSetorId[] },
] as const;

export type TicketCatId = (typeof TICKET_CATS)[number]["id"];

export const TICKET_STATUS = [
  { id: "aberto", label: "Aberto" },
  { id: "andamento", label: "Em atendimento" },
  { id: "encaminhado", label: "Encaminhado" },
  { id: "resolvido", label: "Resolvido" },
  { id: "os", label: "OS aberta" },
] as const;

export type TicketStatusId = (typeof TICKET_STATUS)[number]["id"];

export const TICKET_ATIVOS: TicketStatusId[] = ["aberto", "andamento", "encaminhado"];

export const TICKET_PRIOS = ["Baixa", "Normal", "Alta", "Urgente"] as const;
export type TicketPrio = (typeof TICKET_PRIOS)[number];

export const TICKET_PRIO_ORD: Record<TicketPrio, number> = {
  Urgente: 0,
  Alta: 1,
  Normal: 2,
  Baixa: 3,
};

export function ticketSetorNome(id: string) {
  return TICKET_SETORES.find((s) => s.id === id)?.nome ?? id;
}

export function ticketCatLabel(id: string) {
  return TICKET_CATS.find((c) => c.id === id)?.label ?? id;
}

export function ticketStatusLabel(id: string) {
  return TICKET_STATUS.find((s) => s.id === id)?.label ?? id;
}

export function defaultSetoresForCat(cat: string): TicketSetorId[] {
  const found = TICKET_CATS.find((c) => c.id === cat);
  return found ? [...found.setores] : [];
}
