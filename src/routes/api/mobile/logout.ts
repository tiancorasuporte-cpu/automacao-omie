import { createFileRoute } from "@tanstack/react-router";

import { handleMobileLogout } from "@/server/mobile-api";

export const Route = createFileRoute("/api/mobile/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => handleMobileLogout(request),
    },
  },
});
