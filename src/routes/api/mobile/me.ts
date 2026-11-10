import { createFileRoute } from "@tanstack/react-router";

import { handleMobileMe } from "@/server/mobile-api";

export const Route = createFileRoute("/api/mobile/me")({
  server: {
    handlers: {
      GET: async ({ request }) => handleMobileMe(request),
    },
  },
});
