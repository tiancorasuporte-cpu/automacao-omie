import { createFileRoute, redirect } from "@tanstack/react-router";

/** Rota mantida só para redirect — módulo Conversas removido do sistema. */
export const Route = createFileRoute("/conversas")({
  beforeLoad: () => {
    throw redirect({ to: "/vencimentos" });
  },
});
