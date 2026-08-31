import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell, useShellSearch } from "@/components/AppShell";
import { FilterChips, MobileSearch } from "@/components/FilterBar";
import { createUserFn, listUsersFn, setUserActiveFn } from "@/lib/accounts";
import { roleLabel, requireAdmin } from "@/lib/require-auth";
import { matchesQuery } from "@/lib/text-search";

export const Route = createFileRoute("/users")({
  beforeLoad: requireAdmin,
  loader: () => listUsersFn(),
  head: () => ({
    meta: [{ title: "Usuários — Automação Omie" }],
  }),
  component: UsersPage,
});

function UsersPage() {
  const loaded = Route.useLoaderData();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "operator">("operator");
  const users = loaded.ok ? loaded.users : [];
  const { query } = useShellSearch();
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "operator" | "superadmin">("all");

  const visible = useMemo(() => {
    return users.filter((user) => {
      if (roleFilter !== "all" && user.role !== roleFilter) return false;
      return matchesQuery(query, [user.name, user.username, user.role, roleLabel(user.role)]);
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
              Crie logins de administrador ou operador para acessar vencimentos e configurações.
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
                    },
                  });
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setMessage(`${result.user.name} criado como ${roleLabel(result.user.role)}.`);
                  form.reset();
                  setRole("operator");
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
                  className="flex flex-col gap-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-md sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <h3 className="text-title-lg text-primary">{user.name}</h3>
                    <p className="text-body-md text-on-surface-variant">
                      {user.username} • {roleLabel(user.role)}
                      {user.active ? "" : " • inativo"}
                    </p>
                  </div>
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
                          else setMessage(user.active ? `${user.name} desativado.` : `${user.name} reativado.`);
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
                </article>
              ))
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
