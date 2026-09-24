export const APP_MODULES = [
  { id: "dashboard", label: "Painel", path: "/dashboard" },
  { id: "conversas", label: "Conversas", path: "/conversas" },
  { id: "vencimentos", label: "Vencimentos", path: "/vencimentos" },
  { id: "orcamentos", label: "Orçamentos", path: "/orcamentos" },
  { id: "produtos", label: "Produtos", path: "/produtos" },
  { id: "notificacoes", label: "Notificações", path: "/notificacoes" },
] as const;

/** Permissões finas (não aparecem no menu). */
export const APP_PERMISSIONS = [
  {
    id: "orcamentos_excluir",
    label: "Excluir orçamentos",
    hint: "Permite apagar orçamentos salvos (e na Omie, se marcado).",
  },
  {
    id: "orcamentos_servicos_mensais",
    label: "Cadastrar serviços mensais",
    hint: "Permite criar e remover serviços mensais no catálogo de orçamentos.",
  },
] as const;

export type AppNavModuleId = (typeof APP_MODULES)[number]["id"];
export type AppPermissionId = (typeof APP_PERMISSIONS)[number]["id"];
export type AppModuleId = AppNavModuleId | AppPermissionId;

export const ALL_MODULE_IDS: AppModuleId[] = [
  ...APP_MODULES.map((module) => module.id),
  ...APP_PERMISSIONS.map((permission) => permission.id),
];

const MODULE_SET = new Set<string>(ALL_MODULE_IDS);

export function isAppModuleId(value: string): value is AppModuleId {
  return MODULE_SET.has(value);
}

export function isAppNavModuleId(value: string): value is AppNavModuleId {
  return APP_MODULES.some((module) => module.id === value);
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

export function modulesForRole(role: string, raw: unknown): AppModuleId[] {
  if (role === "admin" || role === "superadmin") return [...ALL_MODULE_IDS];
  const parsed = parseModules(raw);
  if (parsed == null) return [...ALL_MODULE_IDS];
  return parsed;
}

export function serializeModules(modules: AppModuleId[]): string {
  return JSON.stringify(modules.filter(isAppModuleId));
}

export function moduleLabel(id: AppModuleId) {
  return (
    APP_MODULES.find((module) => module.id === id)?.label ??
    APP_PERMISSIONS.find((permission) => permission.id === id)?.label ??
    id
  );
}

export function pathForModule(id: AppModuleId) {
  if (!isAppNavModuleId(id)) return "/profile";
  return APP_MODULES.find((module) => module.id === id)?.path ?? "/profile";
}

export function hasPermission(
  modules: AppModuleId[] | null | undefined,
  permission: AppPermissionId,
) {
  return (modules ?? []).includes(permission);
}
