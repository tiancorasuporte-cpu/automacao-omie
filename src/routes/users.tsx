import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell, useShellSearch } from "@/components/AppShell";
import { FilterChips, MobileSearch } from "@/components/FilterBar";
import { createUserFn, listUsersFn, setUserActiveFn, updateUserModulesFn } from "@/lib/accounts";
import { APP_NAME } from "@/lib/brand";
import { APP_MODULES, moduleLabel, type AppModuleId } from "@/lib/modules";
import { roleLabel, requireAdmin } from "@/lib/require-auth";
import { matchesQuery } from "@/lib/text-search";

export const Route = createFileRoute("/users")({
  beforeLoad: requireAdmin,
  loader: () => listUsersFn(),
  head: () => ({
    meta: [{ title: `Usuários — ${APP_NAME}` }],
  }),
  component: UsersPage,
});

function ModulesPicker({
  value,
  onChange,
}: {
  value: AppModuleId[];
  onChange: (next: AppModuleId[]) => void;
}) {
  return (
    <div className="mt-base grid gap-sm sm:grid-cols-2">
      {APP_MODULES.map((module) => {
        const checked = value.includes(module.id);
        return (
          <label
            key={module.id}
            className="flex items-center gap-sm rounded-lg border border-outline-variant px-sm py-sm text-body-md text-on-surface"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => {
                if (event.target.checked) onChange([...value, module.id]);
                else onChange(value.filter((id) => id !== module.id));
              }}
            />
            {module.label}
          </label>
        );
      })}
    </div>
  );
}

function UsersPage() {
  const loaded = Route.useLoaderData();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "operator">("operator");
  const [modules, setModules] = useState<AppModuleId[]>(APP_MODULES.map((m) => m.id));
  const [editingModulesId, setEditingModulesId] = useState<number | null>(null);
  const [draftModules, setDraftModules] = useState<AppModuleId[]>([]);
  const users = loaded.ok ? loaded.users : [];
  const { query } = useShellSearch();
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "operator" | "superadmin">("all");

  const visible = useMemo(() => {
    return users.filter((user) => {
      if (roleFilter !== "all" && user.role !== roleFilter) return false;
      return matchesQuery(query, [
        user.name,
        user.username,
        user.role,
        roleLabel(user.role),
        ...user.modules.map(moduleLabel),
      ]);
    });
  }, [users, query, roleFilter]);

  const fieldClass =
    "mt-base w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-md py-sm text-body-md outline-none focus:border-primary";

  return (
    <AppShell mobileTitle="Usuários" searchPlaceholder="Buscar nome ou login...">
      <main className="flex-1 p-margin-mobile md:p-margin-desktop">
        <div className="mx-auto max-w-5xl space-y-lg">
          <div>
            <h2 className="text-headline-lg tracking-tight text-primary">Usuários</h2>
            <p className="mt-base text-body-lg text-on-surface-variant">
              Crie administradores ou operadores e defina quais módulos cada operador pode acessar.
            </p>
          </div>

          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
            <h3 className="mb-md text-title-lg text-primary">Novo usuário</h3>
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
                <input name="password" type="password" required autoComplete="new-password" className={fieldClass} />
              </label>
              <fieldset className="block text-label-md text-on-surface-variant">
                <legend>Perfil</legend>
                <div className="mt-base grid grid-cols-2 gap-sm">
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
                      className={`rounded-lg border px-md py-sm text-left text-body-md ${
                        role === option.id
                          ? "border-secondary-container bg-secondary-fixed/30 font-bold text-primary"
                          : "border-outline-variant text-on-surface"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {role === "operator" ? (
                <fieldset className="md:col-span-2 block text-label-md text-on-surface-variant">
                  <legend>Acessos do operador</legend>
                  <p className="mt-xs text-body-md text-on-surface-variant">
                    Marque os módulos que este operador poderá ver no menu.
                  </p>
                  <ModulesPicker value={modules} onChange={setModules} />
                </fieldset>
              ) : (
                <p className="md:col-span-2 text-body-md text-on-surface-variant">
                  Administradores têm acesso a todos os módulos, configurações e usuários.
                </p>
              )}

              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-primary px-md py-sm text-sm font-semibold text-on-primary disabled:opacity-70"
                >
                  {pending ? "Salvando…" : "Criar usuário"}
                </button>
              </div>
            </form>
          </section>

          {message ? (
            <p className="rounded-lg bg-surface-container-high px-sm py-sm text-label-md text-primary">{message}</p>
          ) : null}
          {error ? (
            <p className="rounded-lg bg-error-container px-sm py-sm text-label-md text-on-error-container">{error}</p>
          ) : null}

          <section className="space-y-sm">
            <MobileSearch placeholder="Buscar nome ou login..." />
            <FilterChips
              value={roleFilter}
              onChange={setRoleFilter}
              options={[
                { id: "all", label: "Todos" },
                { id: "admin", label: "Administradores" },
                { id: "operator", label: "Operadores" },
                { id: "superadmin", label: "Superadmin" },
              ]}
            />
            {visible.length === 0 ? (
              <div className="rounded-xl border border-dashed border-outline-variant p-lg text-center text-on-surface-variant">
                Nenhum usuário com esses filtros.
              </div>
            ) : (
              visible.map((user) => (
                <article
                  key={user.id}
                  className="space-y-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-md"
                >
                  <div className="flex flex-col gap-sm sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-title-lg text-primary">{user.name}</h3>
                      <p className="text-body-md text-on-surface-variant">
                        {user.username} • {roleLabel(user.role)}
                        {user.active ? "" : " • inativo"}
                      </p>
                      {user.role === "operator" ? (
                        <p className="mt-xs text-label-md text-on-surface-variant">
                          Acessos:{" "}
                          {user.modules.length
                            ? user.modules.map(moduleLabel).join(", ")
                            : "nenhum"}
                        </p>
                      ) : (
                        <p className="mt-xs text-label-md text-on-surface-variant">Acesso completo</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-sm">
                      {user.role === "operator" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingModulesId(user.id);
                            setDraftModules([...user.modules]);
                            setError(null);
                            setMessage(null);
                          }}
                          className="rounded-lg border border-outline-variant px-sm py-sm text-label-md text-primary"
                        >
                          Editar acessos
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
                          className="rounded-lg border border-outline-variant px-sm py-sm text-label-md text-primary disabled:opacity-60"
                        >
                          {user.active ? "Desativar" : "Reativar"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {editingModulesId === user.id ? (
                    <div className="rounded-lg border border-outline-variant bg-surface px-md py-sm">
                      <p className="text-label-md text-on-surface-variant">Acessos de {user.name}</p>
                      <ModulesPicker value={draftModules} onChange={setDraftModules} />
                      <div className="mt-sm flex flex-wrap gap-sm">
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
                          className="rounded-lg bg-primary px-sm py-sm text-label-md text-on-primary disabled:opacity-60"
                        >
                          Salvar acessos
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingModulesId(null)}
                          className="rounded-lg border border-outline-variant px-sm py-sm text-label-md text-primary"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
