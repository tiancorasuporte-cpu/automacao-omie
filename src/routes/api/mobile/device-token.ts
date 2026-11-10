import { createFileRoute } from "@tanstack/react-router";

import { handleMobileDeviceToken } from "@/server/mobile-api";

export const Route = createFileRoute("/api/mobile/device-token")({
  server: {
    handlers: {
      POST: async ({ request }) => handleMobileDeviceToken(request),
    },
  },
});
