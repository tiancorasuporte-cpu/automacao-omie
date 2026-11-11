import { createFileRoute } from "@tanstack/react-router";

import { handleMobileConfirmMatSaida } from "@/server/mobile-api";

export const Route = createFileRoute("/api/mobile/estoque/confirmar")({
  server: {
    handlers: {
      POST: async ({ request }) => handleMobileConfirmMatSaida(request),
    },
  },
});
