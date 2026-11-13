import { createFileRoute } from "@tanstack/react-router";

import { handleMobileLocation } from "@/server/mobile-api";

export const Route = createFileRoute("/api/mobile/location")({
  server: {
    handlers: {
      POST: async ({ request }) => handleMobileLocation(request),
    },
  },
});
