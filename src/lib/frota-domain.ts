/** Domínio do módulo Frota (catálogos Âncora + paridade Drivvo). */

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
  reading: "KM do dia",
  checklist: "Checklist",
  reminder: "Lembrete",
};

export const KM_PROFILES = ["monitoramento", "assistencia"] as const;
export type KmProfile = (typeof KM_PROFILES)[number];

export const KM_PROFILE_LABELS: Record<KmProfile, string> = {
  monitoramento: "Monitoramento",
  assistencia: "Assistência / Supervisão RH",
};

/** Combustíveis — documento Categorias Frota */
export const DEFAULT_FUEL_TYPES = [
  "Diesel",
  "Etanol",
  "Gasolina Aditivada",
  "Gasolina Comum",
] as const;

/** Postos de combustível */
export const DEFAULT_STATIONS = [
  "Auto Posto Monte Alto",
  "Externo",
  "Posto RAF (Fernando Prestes)",
] as const;

/** Fornecedores */
export const DEFAULT_SUPPLIERS = [
  "Allianz Seguros",
  "Atlas",
  "Auto Peças Mecânica do Waguinho",
  "Auto Posto Monte Alto",
  "Avenida Auto Center (Taquaritinga)",
  "Barros",
  "Cândido e Aleixo Vistoria",
  "Oficina do Cardoso",
  "Carlinhos Auto Peças",
  "Detran",
  "Fiat",
  "Forte Pneus",
  "Injetec",
  "João Socorro Pneus",
  "Borracharia Limão",
  "Morita",
  "Rh Seguros",
  "Ocrinho",
  "Yellow Mountain Distribuidora",
  "Zezé Pneus",
] as const;

/** Tipos de despesa */
export const DEFAULT_EXPENSE_TYPES = [
  "Impostos (IPVA/DPVAT)",
  "Licenciamento",
  "Multa",
  "Seguro",
  "Transferência",
  "Vistoria",
] as const;

/** Tipos de serviço */
export const DEFAULT_SERVICE_TYPES = [
  "Air Bag",
  "Alarme",
  "Alinhamento/Balanceamento",
  "Ar Condicionado",
  "Bateria",
  "Bicos",
  "Bloco do Farol",
  "Bomba De Combustível",
  "Cabo Acelerador",
  "Cabo de Freio",
  "Cabo do velocímetro",
  "Cabo Embreagem",
  "Caixa De Direção",
  "Câmara de ar",
  "Câmera De Ar (Remendo)",
  "Capa Para Banco Comum",
  "Capa para Banco Térmica",
  "Carcaça Interna Do Painel",
  "Corrente",
  "Disco de freio",
  "Embreagem Completa",
  "Engrenagem",
  "Esticador De Corrente",
  "Filtro de Ar",
  "Filtro de Combustível",
  "Filtro de óleo",
  "Guarda Pó Bengala",
  "Guarnição Tampa Válvula",
  "Interruptor De Freio",
  "Kit Partida",
  "Lava-rápido",
  "Luzes",
  "Manete",
  "Motor",
  "Outros",
  "Painel",
  "Pastilha Freio (D)",
  "Pastilha Freio (T)",
  "Patim Freio (Dianteiro)",
  "Patim Freio (Traseiro)",
  "Patim Freio/Pastilha",
  "Pedal De Partida",
  "Pneu (Dianteiro)",
  "Pneu (Traseiro)",
  "Pneus",
  "Relação",
  "Retentor Da Bengala",
  "Retrovisor",
  "Revisão",
  "Serviço - Frete",
  "Serviços (Mão de Obra)",
  "Suspensão",
  "Troca de Óleo",
  "Vela",
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
