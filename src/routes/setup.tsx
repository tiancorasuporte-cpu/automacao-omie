import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { getSetupStatusFn, setupDatabaseFn } from "@/lib/setup";
import { APP_NAME } from "@/lib/brand";

export const Route = createFileRoute("/setup")({
  beforeLoad: async () => {
    const { configured } = await getSetupStatusFn();
    if (configured) {
      throw redirect({ to: "/" });
    }
  },
  head: () => ({
    meta: [
      { title: `Configurar banco — ${APP_NAME}` },
      {
        name: "description",
        content: "Informe a conexão PostgreSQL na primeira execução da suíte Âncora Access.",
      },
    ],
  }),
  component: Setup,
});

function Setup() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-margin-mobile md:p-margin-desktop">
      <main className="flex w-full max-w-[480px] flex-col items-center rounded-lg border border-surface-variant bg-surface-container-lowest p-xl">
        <header className="mb-xl flex w-full flex-col items-center border-b border-surface-variant pb-lg">
          <Icon name="database" className="mb-md text-[40px] text-primary" />
          <h1 className="text-center text-headline-md tracking-tight text-primary">
            Primeira configuração
          </h1>
          <p className="mt-base text-center text-body-md text-on-surface-variant">
            Informe o PostgreSQL. As tabelas e o usuário <strong>superadmin</strong> (senha padrão{" "}
            <strong>ancora</strong>) serão criados automaticamente.
          </p>
        </header>

        <form
          className="flex w-full flex-col gap-lg"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setPending(true);
            const form = new FormData(event.currentTarget);
            try {
              const result = await setupDatabaseFn({
                data: {
                  host: String(form.get("host") ?? ""),
                  port: Number(form.get("port") ?? 5432),
                  username: String(form.get("username") ?? ""),
                  password: String(form.get("password") ?? ""),
                  database: String(form.get("database") ?? "postgres"),
                },
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              await navigate({ to: "/" });
            } catch {
              setError("Não foi possível salvar a configuração. Tente novamente.");
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="flex flex-col gap-base">
            <label className="text-label-md text-primary" htmlFor="host">
              Host
            </label>
            <input
              id="host"
              name="host"
              type="text"
              required
              autoComplete="off"
              placeholder="192.168.10.106"
              className="input-glow w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-sm text-body-md text-on-surface outline-none transition-all placeholder:text-outline focus:border-primary"
            />
          </div>

          <div className="flex flex-col gap-base">
            <label className="text-label-md text-primary" htmlFor="port">
              Porta
            </label>
            <input
              id="port"
              name="port"
              type="number"
              required
              min={1}
              max={65535}
              defaultValue={5432}
              className="input-glow w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-sm text-body-md text-on-surface outline-none transition-all focus:border-primary"
            />
          </div>

          <div className="flex flex-col gap-base">
            <label className="text-label-md text-primary" htmlFor="username">
              Usuário do banco
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              autoComplete="off"
              placeholder="postgres"
              className="input-glow w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-sm text-body-md text-on-surface outline-none transition-all placeholder:text-outline focus:border-primary"
            />
          </div>

          <div className="flex flex-col gap-base">
            <label className="text-label-md text-primary" htmlFor="password">
              Senha do banco
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                className="input-glow w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-sm pl-sm pr-xl text-body-md text-on-surface outline-none transition-all focus:border-primary"
              />
              <button
                type="button"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-sm top-1/2 -translate-y-1/2 text-on-surface-variant transition-colors hover:text-primary"
              >
                <Icon name={showPassword ? "visibility_off" : "visibility"} className="text-[20px]" />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-base">
            <label className="text-label-md text-primary" htmlFor="database">
              Banco
            </label>
            <input
              id="database"
              name="database"
              type="text"
              required
              defaultValue="postgres"
              className="input-glow w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-sm text-body-md text-on-surface outline-none transition-all focus:border-primary"
            />
          </div>

          {error ? (
            <p className="rounded-lg bg-error-container px-sm py-sm text-label-md text-on-error-container">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="flex w-full items-center justify-center gap-xs rounded-lg bg-secondary-container px-lg py-sm text-body-lg font-semibold text-primary shadow-elevation-1 transition-colors hover:bg-secondary-fixed disabled:cursor-not-allowed disabled:opacity-70"
          >
            {pending ? "Conectando..." : "Salvar e criar tabelas"}
            <Icon name="arrow_forward" className="text-[20px]" />
          </button>
        </form>
      </main>
    </div>
  );
}
