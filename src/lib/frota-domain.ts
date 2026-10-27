/** Domínio do módulo Frota (paridade funcional com Drivvo). */

export const FLEET_ENTRY_TYPES = [
  "refueling",
  "expense",
  "income",
  "service",
  "route",
  "reading",
  "checklist",
  "reminder",
] as const;

export type FleetEntryType = (typeof FLEET_ENTRY_TYPES)[number];

export const FLEET_ENTRY_LABELS: Record<FleetEntryType, string> = {
  refueling: "Abastecimento",
  expense: "Despesa",
  income: "Receita",
  service: "Serviço",
  route: "Percurso",
  reading: "Leitura",
  checklist: "Checklist",
  reminder: "Lembrete",
};

export const DEFAULT_FUEL_TYPES = [
  "Gas. Comum",
  "Gas. Aditivada",
  "Etanol",
  "Diesel",
  "Diesel S10",
  "GNV",
] as const;

export const DEFAULT_EXPENSE_TYPES = [
  "Seguro",
  "Licenciamento",
  "Impostos (IPVA/DPVAT)",
  "Lava-rápido",
  "Estacionamento",
  "Pedágio",
  "Multa",
  "Outros",
] as const;

export const DEFAULT_SERVICE_TYPES = [
  "Troca de Óleo",
  "Filtro de óleo",
  "Alinhamento/Balanceamento",
  "Pneu (Dianteiro)",
  "Pneu (Traseiro)",
  "Freios",
  "Revisão",
  "Outros",
] as const;

export const DEFAULT_PAYMENT_METHODS = [
  "Dinheiro",
  "Cartão de crédito",
  "Cartão de débito",
  "PIX",
  "Boleto",
  "Vale combustível",
] as const;

export const REMINDER_TRIGGERS = ["date", "odometer", "both"] as const;
export type ReminderTrigger = (typeof REMINDER_TRIGGERS)[number];

export function formatBRL(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatKm(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${Number(value).toLocaleString("pt-BR")} km`;
}

export function formatKmPerLiter(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) <= 0) return "—";
  return `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km/L`;
}

export function parseMoney(raw: string | number | null | undefined) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const cleaned = String(raw ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/R\$/i, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function monthKey(dateIso: string) {
  return dateIso.slice(0, 7);
}

export function monthLabelPt(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}
