import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/d/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { ensureSchema } = await import("@/db/schema");
          await ensureSchema();
          const {
            getDocLinkRow,
            looksLikeEphemeralOmieUrl,
            touchDocLink,
          } = await import("@/db/doc-links");
          const row = await getDocLinkRow(params.token);
          if (!row) {
            return new Response("Documento não encontrado ou expirado.", {
              status: 404,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
          }

          // Com due_item_id: pede PDF/link fresco na Omie (URLs assinadas expiram).
          if (row.dueItemId) {
            try {
              const { getDueItemById } = await import("@/db/due-items");
              const { listOmieApps } = await import("@/server/omie/client");
              const { resolveDueItemPdfWithStatus } = await import("@/server/omie/documents");
              const item = await getDueItemById(row.dueItemId);
              const app = item ? listOmieApps().find((entry) => entry.id === item.omieAppId) : null;
              if (item && app) {
                const fresh = await resolveDueItemPdfWithStatus(app, item);
                const freshUrl =
                  fresh.link?.trim() ||
                  (fresh.document?.url ? fresh.document.url.trim() : "") ||
                  "";
                if (freshUrl && /^https?:\/\//i.test(freshUrl)) {
                  await touchDocLink(row.token, freshUrl);
                  return Response.redirect(freshUrl, 302);
                }
                if (fresh.document?.base64) {
                  const raw = fresh.document.base64.includes(",")
                    ? fresh.document.base64.slice(fresh.document.base64.indexOf(",") + 1)
                    : fresh.document.base64;
                  const bytes = Buffer.from(raw, "base64");
                  const filename =
                    fresh.document.filename?.replace(/[^\w.\-]+/g, "_") ||
                    `documento-${row.dueItemId}.pdf`;
                  await touchDocLink(row.token);
                  return new Response(bytes, {
                    status: 200,
                    headers: {
                      "Content-Type": fresh.document.mimetype || "application/pdf",
                      "Content-Disposition": `inline; filename="${filename}"`,
                      "Cache-Control": "private, no-store",
                    },
                  });
                }
              }
            } catch (error) {
              console.warn("[doc-link] refresh Omie falhou, usando URL salva", error);
            }
          }

          // Sem refresh: se a URL salva já é Omie efêmera, avisa em vez de 302 morto.
          if (looksLikeEphemeralOmieUrl(row.targetUrl) && row.dueItemId) {
            await touchDocLink(row.token);
            return new Response(
              "Não foi possível renovar o PDF na Omie agora. Tente de novo em instantes ou baixe pelo painel Vencimentos.",
              {
                status: 502,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
              },
            );
          }

          await touchDocLink(row.token);
          return Response.redirect(row.targetUrl, 302);
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
