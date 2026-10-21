import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/integgri/webhook")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          ok: true,
          service: "automacao-omie",
          webhook: "integgri",
          hint: "Configure este endpoint na Integgri como webhook de mensagens recebidas. Fluxo: template aviso_de_cobranca → resposta do cliente → PDF automático.",
        }),
      POST: async ({ request }) => {
        try {
          const { handleInteggriInboundWebhook } = await import("@/server/integgri-cobranca");
          const body = await request.json().catch(() => null);
          console.info("[integgri-webhook] POST recebido", {
            keys: body && typeof body === "object" ? Object.keys(body as object) : [],
          });
          const result = await handleInteggriInboundWebhook(body);
          console.info("[integgri-webhook] resultado", result);
          return Response.json(result);
        } catch (error) {
          console.error("[integgri-webhook]", error);
          return Response.json(
            {
              ok: false,
              error: error instanceof Error ? error.message : "Falha no webhook",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
