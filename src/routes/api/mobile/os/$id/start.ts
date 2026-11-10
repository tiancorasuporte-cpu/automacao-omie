import { createFileRoute } from "@tanstack/react-router";

import { handleMobileStartOs } from "@/server/mobile-api";
import { jsonError } from "@/server/mobile-auth";

export const Route = createFileRoute("/api/mobile/os/$id/start")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const osId = Number(params.id);
        if (!Number.isFinite(osId) || osId <= 0) return jsonError("ID inválido.");
        return handleMobileStartOs(request, osId);
      },
    },
  },
});
