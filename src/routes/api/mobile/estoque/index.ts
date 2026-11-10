import { createFileRoute } from "@tanstack/react-router";

import { handleMobileEstoque } from "@/server/mobile-api";

export const Route = createFileRoute("/api/mobile/estoque/")({
  server: {
    handlers: {
      GET: async ({ request }) => handleMobileEstoque(request),
    },
  },
});
