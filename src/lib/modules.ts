export const APP_MODULES = [
  { id: "dashboard", label: "Painel", path: "/dashboard" },
  { id: "vencimentos", label: "Vencimentos", path: "/vencimentos" },
  { id: "orcamentos", label: "Orçamentos", path: "/orcamentos" },
  { id: "produtos", label: "Produtos", path: "/produtos" },
  { id: "facilities", label: "Facilities", path: "/facilities" },
  { id: "terceiros", label: "Terceiros", path: "/terceiros" },
  { id: "uniformes", label: "Uniformes", path: "/uniformes" },
  { id: "estoque", label: "Estoque", path: "/estoque" },
  { id: "compras", label: "Compras", path: "/compras" },
  { id: "frota", label: "Frota", path: "/frota" },
  { id: "assistencia", label: "Assistência", path: "/assistencia" },
  { id: "equipes", label: "Equipes", path: "/equipes" },
  { id: "tickets", label: "Tickets", path: "/tickets" },
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
    label: "Cadastrar serviços / tabela de preços",
    hint: "Permite cadastrar, editar e desativar serviços na Tabela de preços e nos orçamentos.",
  },
  {
    id: "terceiros_checar",
    label: "Checar alterações de terceiros",
    hint:
      "Para faturamento: ver alterações pendentes em contas/serviços/particularidades e marcar como visto.",
  },
  {
    id: "os_assistencia",
    label: "OS · Assistência",
    hint: "Criar/mover OS nas etapas da Assistência, agendar e finalizar.",
  },
  {
    id: "os_estoque",
    label: "OS · Estoque",
    hint: "Separação de material e conferência de OS.",
  },
  {
    id: "os_compras",
    label: "OS · Compras",
    hint: "Etapa de compras da OS (marcar comprado / previsão).",
  },
  {
    id: "os_excluir",
    label: "OS · Excluir",
    hint: "Permite excluir ordens de serviço do kanban da Assistência.",
  },
  {
    id: "ticket_assist",
    label: "Ticket · Assistência Técnica",
    hint: "Atender tickets do setor Assistência Técnica.",
  },
  {
    id: "ticket_eng",
    label: "Ticket · Engenharia",
    hint: "Atender tickets do setor Engenharia.",
  },
  {
    id: "ticket_ti",
    label: "Ticket · TI",
    hint: "Atender tickets do setor TI.",
  },
  {
    id: "ticket_sup",
    label: "Ticket · Suporte Técnico",
    hint: "Atender tickets do setor Suporte Técnico.",
  },
  {
    id: "ticket_supmon",
    label: "Ticket · Suporte Monitoramento",
    hint: "Atender tickets do setor Suporte Técnico Monitoramento.",
  },
  {
    id: "ticket_procmon",
    label: "Ticket · Procedimentos Monitoramento",
    hint: "Atender tickets do setor Procedimentos Monitoramento.",
  },
  {
    id: "ticket_com",
    label: "Ticket · Comercial",
    hint: "Atender tickets do setor Comercial.",
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
