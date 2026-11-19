import { createFileRoute } from "@tanstack/react-router";

import { handleMobileFinalizeLt, handleMobileSaveLt } from "@/server/mobile-api";
import { jsonError } from "@/server/mobile-auth";

export const Route = createFileRoute("/api/mobile/os/$id/lt")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const osId = Number(params.id);
        if (!Number.isFinite(osId) || osId <= 0) return jsonError("ID inválido.");
        const url = new URL(request.url);
        if (url.searchParams.get("finalize") === "1") {
          return handleMobileFinalizeLt(request, osId);
        }
        return handleMobileSaveLt(request, osId);
      },
    },
  },
});
