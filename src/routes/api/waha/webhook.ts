import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/waha/webhook")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          ok: true,
          service: "automacao-omie",
          webhook: "waha",
          hint: "Configure este endpoint no WAHA como webhook de eventos message / message.any",
        }),
      POST: async ({ request }) => {
        try {
          const { handleWahaIncomingWebhook } = await import("@/server/waha-bot");
          const body = await request.json().catch(() => null);
          const event = String((body as { event?: string } | null)?.event ?? "");
          const session = String((body as { session?: string } | null)?.session ?? "");
          console.info("[waha-webhook] POST recebido", { event, session });
          const result = await handleWahaIncomingWebhook(body);
          console.info("[waha-webhook] resultado", result);
          return Response.json(result);
        } catch (error) {
          console.error("[waha-webhook]", error);
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
