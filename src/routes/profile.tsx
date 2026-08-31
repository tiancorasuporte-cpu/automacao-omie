import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { updateProfileFn } from "@/lib/accounts";
import { roleLabel, requireAuth } from "@/lib/require-auth";
import { Route as RootRoute } from "@/routes/__root";

export const Route = createFileRoute("/profile")({
  beforeLoad: requireAuth,
  head: () => ({
    meta: [{ title: "Perfil — Automação Omie" }],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = RootRoute.useRouteContext();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fieldClass =
    "mt-base w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-md py-sm text-body-md outline-none focus:border-primary";

  if (!user) return null;

  return (
    <AppShell mobileTitle="Perfil">
      <main className="min-w-0 w-full flex-1 p-margin-mobile md:p-margin-desktop">
        <div className="mx-auto w-full max-w-[36rem] space-y-lg">
          <div>
            <h2 className="text-headline-lg tracking-tight text-primary">Meu perfil</h2>
            <p className="mt-base text-body-md text-on-surface-variant">
              {roleLabel(user.role)} • login {user.username}
            </p>
          </div>
          <form
            className="space-y-md rounded-xl border border-outline-variant bg-surface-container-lowest p-lg"
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              setMessage(null);
              const form = new FormData(event.currentTarget);
              const password = String(form.get("password") ?? "").trim();
              setPending(true);
              try {
                const result = await updateProfileFn({
                  data: {
                    name: String(form.get("name") ?? ""),
                    ...(password ? { password } : {}),
                  },
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setMessage("Perfil atualizado.");
                const passwordInput = event.currentTarget.elements.namedItem("password");
                if (passwordInput instanceof HTMLInputElement) passwordInput.value = "";
                await router.invalidate();
              } catch {
                setError("Não foi possível salvar.");
              } finally {
                setPending(false);
              }
            }}
          >
            <label className="block text-label-md text-on-surface-variant">
              Nome
              <input name="name" required defaultValue={user.name} className={fieldClass} />
            </label>
            <label className="block text-label-md text-on-surface-variant">
              Nova senha (opcional)
              <input name="password" type="password" autoComplete="new-password" className={fieldClass} />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-primary px-md py-sm text-sm font-semibold text-on-primary disabled:opacity-70"
            >
              {pending ? "Salvando…" : "Salvar"}
            </button>
          </form>
          {message ? (
            <p className="rounded-lg bg-surface-container-high px-sm py-sm text-label-md text-primary">{message}</p>
          ) : null}
          {error ? (
            <p className="rounded-lg bg-error-container px-sm py-sm text-label-md text-on-error-container">{error}</p>
          ) : null}
        </div>
      </main>
    </AppShell>
  );
}
