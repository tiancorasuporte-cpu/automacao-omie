import { createFileRoute } from "@tanstack/react-router";

import { handleMobileSyncBatch } from "@/server/mobile-api";

export const Route = createFileRoute("/api/mobile/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => handleMobileSyncBatch(request),
    },
  },
});
