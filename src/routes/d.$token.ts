import { createFileRoute } from "@tanstack/react-router";

const OMIE_REFRESH_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} excedeu ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function plainResponse(body: string, status: number, extraHeaders?: HeadersInit) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      ...extraHeaders,
    },
  });
}

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
          const { closedReceivablePublicMessage } = await import("@/server/omie/status");
          const row = await getDocLinkRow(params.token);
          if (!row) {
            return plainResponse("Documento não encontrado ou expirado.", 404);
          }

          let dueItemStatus: string | null = null;
          let dueItemType: string | null = null;
          let dueItemDoc: string | null = null;
          let omieStatus: string | null = null;

          // Com due_item_id: tenta PDF/link fresco na Omie (URLs assinadas expiram).
          // Timeout curto — retries longos da Omie estouram o Cloudflare (502).
          if (row.dueItemId) {
            const { getDueItemById } = await import("@/db/due-items");
            const dueItem = await getDueItemById(row.dueItemId);
            if (dueItem) {
              dueItemStatus = dueItem.status;
              dueItemType = dueItem.itemType;
              dueItemDoc = dueItem.documentNumber;
            }

            // Se já sabemos que está pago/cancelado e a URL salva é efêmera, responde na hora
            // (Omie não regenera PDF de título liquidado — evita timeout inútil).
            if (looksLikeEphemeralOmieUrl(row.targetUrl)) {
              const earlyClosed = closedReceivablePublicMessage({
                itemType: dueItemType,
                status: dueItemStatus,
                documentNumber: dueItemDoc,
              });
              if (earlyClosed) {
                await touchDocLink(row.token);
                return plainResponse(earlyClosed, 410);
              }
            }

            try {
              const refreshed = await withTimeout(
                (async () => {
                  const { listOmieApps } = await import("@/server/omie/client");
                  const { resolveDueItemPdfWithStatus } = await import("@/server/omie/documents");
                  if (!dueItem) return null;
                  const app = listOmieApps().find((entry) => entry.id === dueItem.omieAppId);
                  if (!app) return null;
                  return resolveDueItemPdfWithStatus(app, dueItem);
                })(),
                OMIE_REFRESH_MS,
                "Renovação Omie",
              );

              if (refreshed) {
                omieStatus = refreshed.status;
                const freshUrl =
                  refreshed.link?.trim() ||
                  (refreshed.document?.url ? refreshed.document.url.trim() : "") ||
                  "";
                if (freshUrl && /^https?:\/\//i.test(freshUrl)) {
                  await touchDocLink(row.token, freshUrl);
                  return Response.redirect(freshUrl, 302);
                }
                if (refreshed.document?.base64) {
                  const raw = refreshed.document.base64.includes(",")
                    ? refreshed.document.base64.slice(refreshed.document.base64.indexOf(",") + 1)
                    : refreshed.document.base64;
                  const bytes = Buffer.from(raw, "base64");
                  const filename =
                    refreshed.document.filename?.replace(/[^\w.\-]+/g, "_") ||
                    `documento-${row.dueItemId}.pdf`;
                  await touchDocLink(row.token);
                  return new Response(bytes, {
                    status: 200,
                    headers: {
                      "Content-Type": refreshed.document.mimetype || "application/pdf",
                      "Content-Disposition": `inline; filename="${filename}"`,
                      "Cache-Control": "private, no-store",
                    },
                  });
                }

                const closedMsg = closedReceivablePublicMessage({
                  itemType: dueItemType,
                  status: dueItemStatus,
                  omieStatus: refreshed.status,
                  documentNumber: refreshed.documentNumber ?? dueItemDoc,
                });
                if (closedMsg) {
                  await touchDocLink(row.token);
                  return plainResponse(closedMsg, 410);
                }
              }
            } catch (error) {
              console.warn("[doc-link] refresh Omie falhou/timeout, usando URL salva", error);
            }
          }

          // Sem refresh: se a URL salva já é Omie efêmera, avisa em vez de 302 morto.
          if (looksLikeEphemeralOmieUrl(row.targetUrl) && row.dueItemId) {
            await touchDocLink(row.token);

            const closedMsg = closedReceivablePublicMessage({
              itemType: dueItemType,
              status: dueItemStatus,
              omieStatus,
              documentNumber: dueItemDoc,
            });
            if (closedMsg) {
              return plainResponse(closedMsg, 410);
            }

            return plainResponse(
              "Não foi possível renovar o PDF na Omie agora. Tente de novo em instantes ou baixe pelo painel Vencimentos.",
              503,
              { "Retry-After": "30" },
            );
          }

          await touchDocLink(row.token);
          return Response.redirect(row.targetUrl, 302);
        } catch (error) {
          console.error("[doc-link]", error);
          return plainResponse("Falha ao abrir documento.", 500);
        }
      },
    },
  },
});
