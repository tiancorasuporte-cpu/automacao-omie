import { createFileRoute } from "@tanstack/react-router";

import { handleMobileFrotaServico } from "@/server/mobile-api";

export const Route = createFileRoute("/api/mobile/frota/servico")({
  server: {
    handlers: {
      POST: async ({ request }) => handleMobileFrotaServico(request),
    },
  },
});
