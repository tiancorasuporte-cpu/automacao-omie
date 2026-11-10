import { createFileRoute } from "@tanstack/react-router";

import { handleMobileListOs } from "@/server/mobile-api";

export const Route = createFileRoute("/api/mobile/os/")({
  server: {
    handlers: {
      GET: async ({ request }) => handleMobileListOs(request),
    },
  },
});
