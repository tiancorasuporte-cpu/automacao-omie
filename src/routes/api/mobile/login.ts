import { createFileRoute } from "@tanstack/react-router";

import { handleMobileLogin } from "@/server/mobile-api";

export const Route = createFileRoute("/api/mobile/login")({
  server: {
    handlers: {
      POST: async ({ request }) => handleMobileLogin(request),
    },
  },
});
