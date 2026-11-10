import { createFileRoute } from "@tanstack/react-router";

import { handleMobileFrotaAbastecimento } from "@/server/mobile-api";

export const Route = createFileRoute("/api/mobile/frota/abastecimento")({
  server: {
    handlers: {
      POST: async ({ request }) => handleMobileFrotaAbastecimento(request),
    },
  },
});
