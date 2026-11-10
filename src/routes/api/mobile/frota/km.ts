import { createFileRoute } from "@tanstack/react-router";

import { handleMobileFrotaKm } from "@/server/mobile-api";

export const Route = createFileRoute("/api/mobile/frota/km")({
  server: {
    handlers: {
      POST: async ({ request }) => handleMobileFrotaKm(request),
    },
  },
});
