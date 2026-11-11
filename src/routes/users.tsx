import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";

import { AppShell, useShellSearch } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import {
  btnDanger,
  btnMuted,
  btnOutline,
  btnPrimary,
  feedbackErrClass,
  feedbackOkClass,
  fieldClass,
  filterControlClass,
  mobileCardClass,
  PageSection,
  PageTitle,
  SectionHeader,
  tableHeadCellClass,
  tableHeadClass,
} from "@/components/PageChrome";
import {
  createUserFn,
  getUsersAdminBootstrapFn,
  setUserActiveFn,
  setUserPasswordFn,
  updateUserModulesFn,
  updateUserStaffFn,
} from "@/lib/accounts";
import { APP_NAME } from "@/lib/brand";
import {
  APP_MODULES,
  APP_PERMISSIONS,
  moduleLabel,
  type AppModuleId,
} from "@/lib/modules";
import { isSuperadmin, roleLabel, requireAdmin } from "@/lib/require-auth";
import { matchesQuery } from "@/lib/text-search";
import { cn } from "@/lib/utils";
import { Route as RootRoute } from "@/routes/__root";

export const Route = createFileRoute("/users")({
  beforeLoad: requireAdmin,
  loader: () => getUsersAdminBootstrapFn(),
  head: () => ({
    meta: [{ title: `Usuários — ${APP_NAME}` }],
  }),
  component: UsersPage,
});

function vehicleOptionLabel(v: { name: string; plate: string | null }) {
  return v.plate ? `${v.name} · ${v.plate}` : v.name;
}

function sanitizeOperatorModules(next: AppModuleId[]): AppModuleId[] {
  let out = next;
  if (!out.includes("orcamentos") && out.includes("orcamentos_excluir")) {
    out = out.filter((id) => id !== "orcamentos_excluir");
  }
  if (!out.includes("orcamentos") && out.includes("orcamentos_servicos_mensais")) {
    out = out.filter((id) => id !== "orcamentos_servicos_mensais");
  }
  if (!out.includes("terceiros") && out.includes("terceiros_checar")) {
    out = out.filter((id) => id !== "terceiros_checar");
  }
  if (!out.includes("assistencia") && out.includes("os_excluir")) {
    out = out.filter((id) => id !== "os_excluir");
  }
  return out;
}

function ModulesPicker({
  value,
  onChange,
}: {
  value: AppModuleId[];
  onChange: (next: AppModuleId[]) => void;
}) {
  function toggle(id: AppModuleId, checked: boolean) {
    if (checked) onChange([...value, id]);
    else onChange(value.filter((item) => item !== id));
  }

  const menuMods = APP_MODULES;
  const osPerms = APP_PERMISSIONS.filter((p) => p.id.startsWith("os_"));
  const ticketPerms = APP_PERMISSIONS.filter((p) => p.id.startsWith("ticket_"));
  const otherPerms = APP_PERMISSIONS.filter(
    (p) => !p.id.startsWith("os_") && !p.id.startsWith("ticket_"),
  );

  function Chip({
    id,
    label,
    hint,
    disabled,
  }: {
    id: AppModuleId;
    label: string;
    hint?: string;
    disabled?: boolean;
  }) {
    const checked = value.includes(id);
    return (
      <label
        title={hint}
        className={cn(
          "inline-flex cursor-pointer items-center gap-xs rounded-full px-md py-xs text-label-md transition",
          disabled && "cursor-not-allowed opacity-50",
          checked
            ? "bg-primary text-on-primary"
            : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high",
        )}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(event) => toggle(id, event.target.checked)}
        />
        {label}
      </label>
    );
  }

  return (
    <div className="mt-md space-y-lg">
      <div>
        <p className="mb-sm text-label-md font-semibold text-on-surface">Módulos do menu</p>
        <div className="flex flex-wrap gap-sm">
          {menuMods.map((module) => (
            <Chip key={module.id} id={module.id} label={module.label} />
          ))}
        </div>
      </div>
      {osPerms.length ? (
        <div>
          <p className="mb-sm text-label-md font-semibold text-on-surface">OS · funções</p>
          <div className="flex flex-wrap gap-sm">
            {osPerms.map((p) => (
              <Chip key={p.id} id={p.id} label={p.label} hint={p.hint} />
            ))}
          </div>
        </div>
      ) : null}
      {ticketPerms.length ? (
        <div>
          <p className="mb-sm text-label-md font-semibold text-on-surface">Tickets · setores</p>
          <div className="flex flex-wrap gap-sm">
            {ticketPerms.map((p) => (
              <Chip key={p.id} id={p.id} label={p.label} hint={p.hint} />
            ))}
          </div>
        </div>
      ) : null}
      {otherPerms.length ? (
        <div>
          <p className="mb-sm text-label-md font-semibold text-on-surface">Outras permissões</p>
          <div className="flex flex-wrap gap-sm">
            {otherPerms.map((p) => {
              const needsParent =
                ((p.id === "orcamentos_excluir" || p.id === "orcamentos_servicos_mensais") &&
                  !value.includes("orcamentos")) ||
                (p.id === "terceiros_checar" && !value.includes("terceiros")) ||
                (p.id === "os_excluir" && !value.includes("assistencia"));
              return (
                <Chip
                  key={p.id}
                  id={p.id}
                  label={p.label}
                  hint={p.hint}
                  disabled={needsParent}
                />
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function roleBadgeClass(role: string) {
  if (role === "superadmin") return "bg-violet-100 text-violet-900";
  if (role === "admin") return "bg-sky-100 text-sky-900";
  return "bg-surface-container text-on-surface-variant";
}

function UsersPage() {
  const loaded = Route.useLoaderData();
  const { user: currentUser } = RootRoute.useRouteContext();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "operator">("operator");
  const [modules, setModules] = useState<AppModuleId[]>(APP_MODULES.map((m) => m.id));
  const [editingModulesId, setEditingModulesId] = useState<number | null>(null);
  const [draftModules, setDraftModules] = useState<AppModuleId[]>([]);
  const [passwordUserId, setPasswordUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createIsTecnico, setCreateIsTecnico] = useState(false);
  const [createIsComprador, setCreateIsComprador] = useState(false);
  const [createVehicleId, setCreateVehicleId] = useState<number | "">("");
  const users = loaded.ok ? loaded.users : [];
  const vehicles = loaded.ok ? loaded.vehicles : [];
  const activeVehicles = useMemo(
    () => vehicles.filter((v) => v.active),
    [vehicles],
  );
  const { query } = useShellSearch();
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "operator" | "superadmin">(
    "all",
  );
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [userSearch, setUserSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  function canResetPassword(target: (typeof users)[number]) {
    if (!currentUser) return false;
    if (isSuperadmin(currentUser)) return true;
    return target.role === "operator";
  }

  const visible = useMemo(() => {
    const search = userSearch.trim() || query;
    return users.filter((user) => {
      if (roleFilter !== "all" && user.role !== roleFilter) return false;
      if (statusFilter === "active" && !user.active) return false;
      if (statusFilter === "inactive" && user.active) return false;
      return matchesQuery(search, [
        user.name,
        user.username,
        user.role,
        roleLabel(user.role),
        ...user.modules.map(moduleLabel),
      ]);
    });
  }, [users, query, userSearch, roleFilter, statusFilter]);

  const menuAccess = (userMods: AppModuleId[]) =>
    APP_MODULES.filter((m) => userMods.includes(m.id));
  const extraAccess = (userMods: AppModuleId[]) =>
    APP_PERMISSIONS.filter((p) => userMods.includes(p.id));

  function toggleExpand(userId: number) {
    const closing = expandedId === userId;
    setExpandedId(closing ? null : userId);
    if (closing) {
      setEditingModulesId(null);
      setPasswordUserId(null);
    }
  }

  function UserDetails({ user }: { user: (typeof users)[number] }) {
    const menus = menuAccess(user.modules);
    const extras = extraAccess(user.modules);

    return (
      <div className="space-y-md">
        {user.role === "operator" ? (
          <div className="space-y-sm rounded-lg border border-outline-variant bg-surface p-md">
            <p className="text-label-md font-semibold text-on-surface-variant">Menu</p>
            <div className="flex flex-wrap gap-xs">
              {menus.length ? (
                menus.map((m) => (
                  <span
                    key={m.id}
                    className="rounded-full bg-surface-container px-sm py-2xs text-label-sm text-on-surface"
                  >
                    {m.label}
                  </span>
                ))
              ) : (
                <span className="text-label-md text-on-surface-variant">Nenhum módulo</span>
              )}
            </div>
            {extras.length ? (
              <>
                <p className="pt-xs text-label-md font-semibold text-on-surface-variant">
                  Permissões
                </p>
                <div className="flex flex-wrap gap-xs">
                  {extras.map((p) => (
                    <span
                      key={p.id}
                      className="rounded-full bg-amber-50 px-sm py-2xs text-label-sm text-amber-900"
                      title={p.hint}
                    >
                      {p.label}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-label-md text-on-surface-variant">Sem permissões extras</p>
            )}
          </div>
        ) : (
          <p className="rounded-lg border border-outline-variant bg-surface px-md py-md text-body-md text-on-surface-variant">
            Acesso completo a todos os módulos.
          </p>
        )}

        <div className="space-y-sm rounded-lg border border-outline-variant bg-surface p-md">
          <p className="text-label-md font-semibold text-on-surface-variant">
            Funções e veículo
          </p>
          <label className="flex items-center gap-sm text-body-md text-on-surface">
            <input
              type="checkbox"
              checked={Boolean(user.isTecnico)}
              disabled={busyId === user.id}
              onChange={async (e) => {
                setBusyId(user.id);
                setError(null);
                setMessage(null);
                try {
                  const result = await updateUserStaffFn({
                    data: {
                      id: user.id,
                      isTecnico: e.target.checked,
                      isComprador: Boolean(user.isComprador),
                      defaultVehicleId: user.defaultVehicleId,
                    },
                  });
                  if (!result.ok) setError(result.error);
                  else {
                    setMessage(
                      e.target.checked
                        ? `${user.name} marcado como técnico.`
                        : `${user.name} removido de técnico.`,
                    );
                    await router.invalidate();
                  }
                } finally {
                  setBusyId(null);
                }
              }}
            />
            É técnico (para equipes e app futuro)
          </label>
          <label className="flex items-center gap-sm text-body-md text-on-surface">
            <input
              type="checkbox"
              checked={Boolean(user.isComprador)}
              disabled={busyId === user.id}
              onChange={async (e) => {
                setBusyId(user.id);
                setError(null);
                setMessage(null);
                try {
                  const result = await updateUserStaffFn({
                    data: {
                      id: user.id,
                      isTecnico: Boolean(user.isTecnico),
                      isComprador: e.target.checked,
                      defaultVehicleId: user.defaultVehicleId,
                    },
                  });
                  if (!result.ok) setError(result.error);
                  else {
                    setMessage(
                      e.target.checked
                        ? `${user.name} marcado como comprador.`
                        : `${user.name} removido de comprador.`,
                    );
                    await router.invalidate();
                  }
                } finally {
                  setBusyId(null);
                }
              }}
            />
            É comprador (cotações, CMC e Kanban de compras)
          </label>
          <label className="block text-label-md text-on-surface-variant">
            Veículo padrão
            <select
              value={user.defaultVehicleId ?? ""}
              disabled={busyId === user.id}
              className={fieldClass}
              onChange={async (e) => {
                const raw = e.target.value;
                const nextId = raw ? Number(raw) : null;
                setBusyId(user.id);
                setError(null);
                setMessage(null);
                try {
                  const result = await updateUserStaffFn({
                    data: {
                      id: user.id,
                      isTecnico: Boolean(user.isTecnico),
                      isComprador: Boolean(user.isComprador),
                      defaultVehicleId: nextId,
                    },
                  });
                  if (!result.ok) setError(result.error);
                  else {
                    setMessage(`Veículo padrão de ${user.name} atualizado.`);
                    await router.invalidate();
                  }
                } finally {
                  setBusyId(null);
                }
              }}
            >
              <option value="">Nenhum</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id} disabled={!v.active && v.id !== user.defaultVehicleId}>
                  {vehicleOptionLabel(v)}
                  {!v.active ? " (inativo)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-xs">
          {user.role === "operator" ? (
            <button
              type="button"
              onClick={() => {
                setEditingModulesId(editingModulesId === user.id ? null : user.id);
                setDraftModules([...user.modules]);
                setPasswordUserId(null);
                setError(null);
                setMessage(null);
              }}
              className={btnOutline}
            >
              <Icon name="tune" className="text-[16px]" />
              {editingModulesId === user.id ? "Fechar edição" : "Editar acessos"}
            </button>
          ) : null}
          {canResetPassword(user) ? (
            <button
              type="button"
              onClick={() => {
                setPasswordUserId(passwordUserId === user.id ? null : user.id);
                setNewPassword("");
                setEditingModulesId(null);
                setError(null);
                setMessage(null);
              }}
              className={btnOutline}
            >
              <Icon name="lock_reset" className="text-[16px]" />
              {passwordUserId === user.id ? "Fechar senha" : "Alterar senha"}
            </button>
          ) : null}
          {user.role !== "superadmin" ? (
            <button
              type="button"
              disabled={busyId === user.id}
              onClick={async () => {
                setBusyId(user.id);
                setError(null);
                setMessage(null);
                try {
                  const result = await setUserActiveFn({
                    data: { id: user.id, active: !user.active },
                  });
                  if (!result.ok) setError(result.error);
                  else
                    setMessage(
                      user.active ? `${user.name} desativado.` : `${user.name} reativado.`,
                    );
                  await router.invalidate();
                } finally {
                  setBusyId(null);
                }
              }}
              className={user.active ? btnDanger : btnMuted}
            >
              <Icon name={user.active ? "person_off" : "person"} className="text-[16px]" />
              {user.active ? "Desativar" : "Reativar"}
            </button>
          ) : null}
        </div>

        {passwordUserId === user.id ? (
          <div className="rounded-lg border border-outline-variant bg-surface p-md">
            <label className="block text-label-md text-on-surface-variant">
              Nova senha para {user.name}
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Mínimo 4 caracteres"
                className={fieldClass}
              />
            </label>
            <div className="mt-md flex flex-wrap gap-xs">
              <button
                type="button"
                disabled={busyId === user.id || newPassword.trim().length < 4}
                onClick={async () => {
                  setBusyId(user.id);
                  setError(null);
                  setMessage(null);
                  try {
                    const result = await setUserPasswordFn({
                      data: { id: user.id, password: newPassword.trim() },
                    });
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setMessage(`Senha de ${user.name} atualizada.`);
                    setPasswordUserId(null);
                    setNewPassword("");
                  } finally {
                    setBusyId(null);
                  }
                }}
                className={btnPrimary}
              >
                Salvar senha
              </button>
              <button
                type="button"
                onClick={() => {
                  setPasswordUserId(null);
                  setNewPassword("");
                }}
                className={btnMuted}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        {editingModulesId === user.id ? (
          <div className="rounded-lg border border-outline-variant bg-surface p-md">
            <p className="text-label-md font-semibold text-on-surface">Acessos de {user.name}</p>
            <ModulesPicker
              value={draftModules}
              onChange={(next) => setDraftModules(sanitizeOperatorModules(next))}
            />
            <div className="mt-md flex flex-wrap gap-xs">
              <button
                type="button"
                disabled={busyId === user.id}
                onClick={async () => {
                  setBusyId(user.id);
                  setError(null);
                  setMessage(null);
                  try {
                    const result = await updateUserModulesFn({
                      data: { id: user.id, modules: draftModules },
                    });
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setMessage(`Acessos de ${user.name} atualizados.`);
                    setEditingModulesId(null);
                    await router.invalidate();
                  } finally {
                    setBusyId(null);
                  }
                }}
                className={btnPrimary}
              >
                Salvar acessos
              </button>
              <button
                type="button"
                onClick={() => setEditingModulesId(null)}
                className={btnMuted}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <AppShell mobileTitle="Usuários" searchPlaceholder="Buscar nome, login ou módulo...">
      <main className="flex-1 px-margin-mobile py-md md:px-margin-desktop md:py-lg">
        <div className="@container mx-auto max-w-6xl space-y-md">
          <PageTitle
            title="Usuários"
            subtitle="Perfis, módulos do menu e permissões por pessoa."
          >
            <button type="button" onClick={() => setCreateOpen((v) => !v)} className={btnPrimary}>
              <Icon name={createOpen ? "close" : "person_add"} className="text-[16px]" />
              {createOpen ? "Fechar" : "Novo usuário"}
            </button>
          </PageTitle>

          {createOpen ? (
            <PageSection className="space-y-sm">
              <div>
                <p className="text-title-md text-on-surface">Novo usuário</p>
                <p className="text-label-md text-on-surface-variant">
                  Operadores recebem módulos e permissões; administradores têm acesso completo.
                </p>
              </div>
              <form
                className="grid grid-cols-1 gap-md md:grid-cols-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setError(null);
                  setMessage(null);
                  const form = event.currentTarget;
                  const data = new FormData(form);
                  setPending(true);
                  try {
                    const result = await createUserFn({
                      data: {
                        name: String(data.get("name") ?? ""),
                        username: String(data.get("username") ?? ""),
                        password: String(data.get("password") ?? ""),
                        role,
                        isTecnico: createIsTecnico,
                        isComprador: createIsComprador,
                        defaultVehicleId: createVehicleId === "" ? null : Number(createVehicleId),
                        ...(role === "operator" ? { modules } : {}),
                      },
                    });
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setMessage(`${result.user.name} criado como ${roleLabel(result.user.role)}.`);
                    form.reset();
                    setRole("operator");
                    setModules(APP_MODULES.map((m) => m.id));
                    setCreateIsTecnico(false);
                    setCreateIsComprador(false);
                    setCreateVehicleId("");
                    setCreateOpen(false);
                    await router.invalidate();
                  } finally {
                    setPending(false);
                  }
                }}
              >
                <label className="block text-label-md text-on-surface-variant">
                  Nome
                  <input name="name" required className={fieldClass} />
                </label>
                <label className="block text-label-md text-on-surface-variant">
                  Usuário (login)
                  <input name="username" required autoComplete="off" className={fieldClass} />
                </label>
                <label className="block text-label-md text-on-surface-variant">
                  Senha
                  <input
                    name="password"
                    type="password"
                    required
                    autoComplete="new-password"
                    className={fieldClass}
                  />
                </label>
                <fieldset className="block text-label-md text-on-surface-variant">
                  <legend>Perfil</legend>
                  <div className="mt-xs flex flex-wrap gap-xs">
                    {(
                      [
                        { id: "operator", label: "Operador" },
                        { id: "admin", label: "Administrador" },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setRole(option.id)}
                        className={cn(
                          "rounded-lg border px-sm py-xs text-label-md font-semibold",
                          role === option.id
                            ? "border-primary bg-primary text-on-primary"
                            : "border-outline-variant bg-surface text-on-surface-variant",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {role === "operator" ? (
                  <fieldset className="md:col-span-2">
                    <legend className="text-label-md font-semibold text-on-surface">
                      Acessos do operador
                    </legend>
                    <ModulesPicker
                      value={modules}
                      onChange={(next) => setModules(sanitizeOperatorModules(next))}
                    />
                  </fieldset>
                ) : (
                  <p className="md:col-span-2 text-body-md text-on-surface-variant">
                    Administradores têm acesso a todos os módulos, configurações e usuários.
                  </p>
                )}

                <label className="flex items-center gap-sm text-body-md text-on-surface md:col-span-2">
                  <input
                    type="checkbox"
                    checked={createIsTecnico}
                    onChange={(e) => setCreateIsTecnico(e.target.checked)}
                  />
                  É técnico
                </label>
                <label className="flex items-center gap-sm text-body-md text-on-surface md:col-span-2">
                  <input
                    type="checkbox"
                    checked={createIsComprador}
                    onChange={(e) => setCreateIsComprador(e.target.checked)}
                  />
                  É comprador
                </label>
                <label className="block text-label-md text-on-surface-variant md:col-span-2">
                  Veículo padrão
                  <select
                    value={createVehicleId}
                    onChange={(e) =>
                      setCreateVehicleId(e.target.value ? Number(e.target.value) : "")
                    }
                    className={fieldClass}
                  >
                    <option value="">Nenhum</option>
                    {activeVehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {vehicleOptionLabel(v)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="md:col-span-2 flex flex-wrap justify-end gap-xs">
                  <button type="button" onClick={() => setCreateOpen(false)} className={btnMuted}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={pending} className={btnPrimary}>
                    {pending ? "Salvando…" : "Criar usuário"}
                  </button>
                </div>
              </form>
            </PageSection>
          ) : null}

          {message ? <p className={feedbackOkClass}>{message}</p> : null}
          {error ? <p className={feedbackErrClass}>{error}</p> : null}

          <PageSection>
            <SectionHeader
              title="Usuários cadastrados"
              subtitle={
                userSearch.trim() || query || roleFilter !== "all" || statusFilter !== "all"
                  ? `${visible.length} encontrado(s)`
                  : `${users.length} registro(s)`
              }
            >
              <input
                type="search"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Buscar nome, login..."
                className={cn(filterControlClass, "min-w-[16rem] flex-1 sm:flex-none")}
              />
              <select
                value={roleFilter}
                onChange={(e) =>
                  setRoleFilter(e.target.value as "all" | "admin" | "operator" | "superadmin")
                }
                className={filterControlClass}
              >
                <option value="all">Todos os perfis</option>
                <option value="admin">Administradores</option>
                <option value="operator">Operadores</option>
                <option value="superadmin">Superadmin</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as "all" | "active" | "inactive")
                }
                className={filterControlClass}
              >
                <option value="all">Todos os status</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </select>
            </SectionHeader>

            {visible.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">
                Nenhum usuário encontrado com esse filtro.
              </p>
            ) : (
              <>
                <div className="space-y-sm @[56rem]:hidden">
                  {visible.map((user) => {
                    const expanded = expandedId === user.id;
                    return (
                      <article
                        key={user.id}
                        className={cn(mobileCardClass, !user.active && "opacity-75")}
                      >
                        <div className="flex items-start justify-between gap-sm">
                          <div className="min-w-0">
                            <p className="truncate text-title-md text-on-surface">{user.name}</p>
                            <p className="text-label-md text-on-surface-variant">
                              @{user.username}
                            </p>
                            <div className="mt-xs flex flex-wrap gap-xs">
                              <span
                                className={cn(
                                  "rounded-full px-sm py-2xs text-label-sm font-semibold",
                                  roleBadgeClass(user.role),
                                )}
                              >
                                {roleLabel(user.role)}
                              </span>
                              <span
                                className={cn(
                                  "rounded-full px-sm py-2xs text-label-sm font-semibold",
                                  user.active
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-rose-100 text-rose-800",
                                )}
                              >
                                {user.active ? "Ativo" : "Inativo"}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleExpand(user.id)}
                            className={btnOutline}
                          >
                            <Icon
                              name={expanded ? "expand_less" : "visibility"}
                              className="text-[16px]"
                            />
                            {expanded ? "Ocultar" : "Ver"}
                          </button>
                        </div>
                        {expanded ? (
                          <div className="mt-md border-t border-outline-variant pt-md">
                            <UserDetails user={user} />
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>

                <div className="hidden overflow-x-auto @[56rem]:block">
                  <table className="min-w-full text-left text-body-md">
                    <thead className={tableHeadClass}>
                      <tr>
                        <th className={tableHeadCellClass}>Nome</th>
                        <th className={tableHeadCellClass}>Login</th>
                        <th className={tableHeadCellClass}>Perfil</th>
                        <th className={tableHeadCellClass}>Status</th>
                        <th className={tableHeadCellClass}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((user) => {
                        const expanded = expandedId === user.id;
                        return (
                          <Fragment key={user.id}>
                            <tr
                              className={cn(
                                "border-t border-outline-variant",
                                !user.active && "opacity-75",
                              )}
                            >
                              <td className="px-sm py-xs font-medium">{user.name}</td>
                              <td className="px-sm py-xs text-on-surface-variant">
                                @{user.username}
                              </td>
                              <td className="px-sm py-xs">
                                <span
                                  className={cn(
                                    "rounded-full px-sm py-2xs text-label-sm font-semibold",
                                    roleBadgeClass(user.role),
                                  )}
                                >
                                  {roleLabel(user.role)}
                                </span>
                              </td>
                              <td className="px-sm py-xs">
                                <span
                                  className={cn(
                                    "rounded-full px-sm py-2xs text-label-sm font-semibold",
                                    user.active
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-rose-100 text-rose-800",
                                  )}
                                >
                                  {user.active ? "Ativo" : "Inativo"}
                                </span>
                              </td>
                              <td className="px-sm py-xs">
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(user.id)}
                                  className={btnOutline}
                                >
                                  <Icon
                                    name={expanded ? "expand_less" : "visibility"}
                                    className="text-[16px]"
                                  />
                                  {expanded ? "Ocultar" : "Ver"}
                                </button>
                              </td>
                            </tr>
                            {expanded ? (
                              <tr className="border-t border-outline-variant/60 bg-surface/50">
                                <td colSpan={5} className="px-sm py-md">
                                  <UserDetails user={user} />
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </PageSection>
        </div>
      </main>
    </AppShell>
  );
}
