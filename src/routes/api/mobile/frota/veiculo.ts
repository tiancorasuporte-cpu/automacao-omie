import { createFileRoute } from "@tanstack/react-router";

import { handleMobileFrotaVeiculo } from "@/server/mobile-api";

export const Route = createFileRoute("/api/mobile/frota/veiculo")({
  server: {
    handlers: {
      GET: async ({ request }) => handleMobileFrotaVeiculo(request),
    },
  },
});
