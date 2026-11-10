import { createFileRoute } from "@tanstack/react-router";

import { handleMobileGetOs } from "@/server/mobile-api";
import { jsonError } from "@/server/mobile-auth";

export const Route = createFileRoute("/api/mobile/os/$id/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const osId = Number(params.id);
        if (!Number.isFinite(osId) || osId <= 0) {
          return jsonError("ID inválido.");
        }
        return handleMobileGetOs(request, osId);
      },
    },
  },
});
