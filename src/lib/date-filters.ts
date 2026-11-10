export type DatePreset = "todos" | "hoje" | "semana" | "mes" | "personalizado";

export const DATE_PRESET_OPTIONS: Array<{ id: DatePreset; label: string }> = [
  { id: "todos", label: "Todas as datas" },
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Esta semana" },
  { id: "mes", label: "Este mês" },
  { id: "personalizado", label: "Personalizado" },
];

function toYmdLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Semana começando na segunda (padrão BR). */
function startOfWeekMon(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function resolveDatePreset(
  preset: DatePreset,
  customFrom = "",
  customTo = "",
): { from: string; to: string } {
  const today = new Date();
  if (preset === "hoje") {
    const t = toYmdLocal(today);
    return { from: t, to: t };
  }
  if (preset === "semana") {
    const start = startOfWeekMon(today);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: toYmdLocal(start), to: toYmdLocal(end) };
  }
  if (preset === "mes") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { from: toYmdLocal(start), to: toYmdLocal(end) };
  }
  if (preset === "personalizado") {
    return { from: customFrom.trim(), to: customTo.trim() };
  }
  return { from: "", to: "" };
}

export function inDateRange(value: string, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}
