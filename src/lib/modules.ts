export const APP_MODULES = [
  { id: "dashboard", label: "Painel", path: "/dashboard" },
  { id: "conversas", label: "Conversas", path: "/conversas" },
  { id: "vencimentos", label: "Vencimentos", path: "/vencimentos" },
  { id: "orcamentos", label: "Orçamentos", path: "/orcamentos" },
  { id: "notificacoes", label: "Notificações", path: "/notificacoes" },
] as const;

export type AppModuleId = (typeof APP_MODULES)[number]["id"];

export const ALL_MODULE_IDS: AppModuleId[] = APP_MODULES.map((module) => module.id);

const MODULE_SET = new Set<string>(ALL_MODULE_IDS);

export function isAppModuleId(value: string): value is AppModuleId {
  return MODULE_SET.has(value);
}

/** Parse DB value. `null` = legado (todos). Array vazio = nenhum acesso. */
export function parseModules(raw: unknown): AppModuleId[] | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      return parseModules(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }
  if (!Array.isArray(raw)) return null;
  const out: AppModuleId[] = [];
  for (const item of raw) {
    if (typeof item === "string" && isAppModuleId(item) && !out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

export function modulesForRole(
  role: string,
  raw: unknown,
): AppModuleId[] {
  if (role === "admin" || role === "superadmin") return [...ALL_MODULE_IDS];
  const parsed = parseModules(raw);
  if (parsed == null) return [...ALL_MODULE_IDS];
  return parsed;
}

export function serializeModules(modules: AppModuleId[]): string {
  return JSON.stringify(modules.filter(isAppModuleId));
}

export function moduleLabel(id: AppModuleId) {
  return APP_MODULES.find((module) => module.id === id)?.label ?? id;
}

export function pathForModule(id: AppModuleId) {
  return APP_MODULES.find((module) => module.id === id)?.path ?? "/profile";
}
