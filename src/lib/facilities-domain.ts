export const FACILITIES_EMPRESAS = [
  { id: "angela", label: "Angela" },
  { id: "ancora", label: "Âncora" },
  { id: "belfer", label: "Belfer" },
] as const;

export const FACILITIES_FUNCOES = [
  { id: "vigilante", label: "Vigilante" },
  { id: "porteiro", label: "Porteiro" },
  { id: "recepcionista", label: "Recepcionista" },
] as const;

export const FACILITIES_ESCALAS = [
  {
    id: "12x36_diurno",
    label: "12x36 Diurno",
    hint: "Turno de 12h (ex.: 07h–19h)",
    defaultHours: 12,
  },
  {
    id: "12x36_noturno",
    label: "12x36 Noturno",
    hint: "Turno de 12h (ex.: 19h–07h)",
    defaultHours: 12,
  },
  {
    id: "comercial",
    label: "Horário comercial",
    hint: "Recepcionistas e jornadas de escritório",
    defaultHours: 8,
  },
] as const;

export const FACILITIES_MOTIVOS = [
  { id: "falta", label: "Falta", pagaHoras: true },
  { id: "atestado", label: "Atestado", pagaHoras: true },
  { id: "folga", label: "Folga trabalhada", pagaHoras: true },
  {
    id: "troca",
    label: "Solicitação de troca",
    pagaHoras: false,
    hint: "Permuta entre colegas — um faz o dia do outro, sem horas a pagar",
  },
  { id: "outro", label: "Outro", pagaHoras: true },
] as const;

export type FacilitiesEmpresaId = (typeof FACILITIES_EMPRESAS)[number]["id"];
export type FacilitiesFuncaoId = (typeof FACILITIES_FUNCOES)[number]["id"];
export type FacilitiesEscalaId = (typeof FACILITIES_ESCALAS)[number]["id"];
export type FacilitiesMotivoId = (typeof FACILITIES_MOTIVOS)[number]["id"];

export function facilitiesEmpresaLabel(id: string) {
  return FACILITIES_EMPRESAS.find((e) => e.id === id)?.label ?? id;
}

export function facilitiesFuncaoLabel(id: string) {
  return FACILITIES_FUNCOES.find((e) => e.id === id)?.label ?? id;
}

export function facilitiesEscalaLabel(id: string) {
  return FACILITIES_ESCALAS.find((e) => e.id === id)?.label ?? id;
}

export function facilitiesMotivoLabel(id: string) {
  return FACILITIES_MOTIVOS.find((e) => e.id === id)?.label ?? id;
}

export function facilitiesMotivoPagaHoras(id: string) {
  return FACILITIES_MOTIVOS.find((e) => e.id === id)?.pagaHoras ?? true;
}

export function defaultHoursForEscala(escalaId: string) {
  return FACILITIES_ESCALAS.find((e) => e.id === escalaId)?.defaultHours ?? 12;
}

export function isFacilitiesEmpresaId(value: string): value is FacilitiesEmpresaId {
  return FACILITIES_EMPRESAS.some((e) => e.id === value);
}

export function isFacilitiesFuncaoId(value: string): value is FacilitiesFuncaoId {
  return FACILITIES_FUNCOES.some((e) => e.id === value);
}

export function isFacilitiesEscalaId(value: string): value is FacilitiesEscalaId {
  return FACILITIES_ESCALAS.some((e) => e.id === value);
}

export function isFacilitiesMotivoId(value: string): value is FacilitiesMotivoId {
  return FACILITIES_MOTIVOS.some((e) => e.id === value);
}

export function currentMonthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function monthRange(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!match) {
    const now = currentMonthKey();
    return monthRange(now);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end, year, month };
}
