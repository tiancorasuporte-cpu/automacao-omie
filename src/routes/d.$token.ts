import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/d/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { ensureSchema } = await import("@/db/schema");
          await ensureSchema();
          const { resolveDocLink } = await import("@/db/doc-links");
          const target = await resolveDocLink(params.token);
          if (!target) {
            return new Response("Documento não encontrado ou expirado.", {
              status: 404,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
          }
          return Response.redirect(target, 302);
        } catch (error) {
          console.error("[doc-link]", error);
          return new Response("Falha ao abrir documento.", {
            status: 500,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      },
    },
  },
});
