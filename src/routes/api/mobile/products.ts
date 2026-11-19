import { createFileRoute } from "@tanstack/react-router";

import { handleMobileSearchProducts } from "@/server/mobile-api";

export const Route = createFileRoute("/api/mobile/products")({
  server: {
    handlers: {
      GET: async ({ request }) => handleMobileSearchProducts(request),
    },
  },
});
