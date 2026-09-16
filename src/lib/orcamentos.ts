import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const lineSchema = z.object({
  codigoProduto: z.number().int().positive(),
  descricao: z.string().trim().min(1),
  unidade: z.string().trim().nullable().optional(),
  quantidade: z.number().positive(),
  valorUnitario: z.number().min(0),
  ncm: z.string().trim().nullable().optional(),
});

const draftSchema = z.object({
  quoteId: z.number().int().positive().nullable().optional(),
  omieAppId: z.string().trim().min(1),
  clientCode: z.number().int().positive(),
  clientName: z.string().trim().nullable().optional(),
  observacao: z.string().trim().nullable().optional(),
  dataPrevisao: z.string().trim().nullable().optional(),
  items: z.array(lineSchema).min(1),
});

export const getOrcamentosBootstrapFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAuth } = await import("@/lib/require-auth");
  await requireAuth();
  const { listOmieApps } = await import("@/server/omie/client");
  const { countOmieProducts } = await import("@/db/products");
  const { listQuotes } = await import("@/db/quotes");
  const apps = listOmieApps().map(({ id, name }) => ({ id, name }));
  const [productCount, quotes] = await Promise.all([countOmieProducts(), listQuotes(40)]);
  return { apps, productCount, quotes };
});

export const syncOmieProductsFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireAuth } = await import("@/lib/require-auth");
  await requireAuth();
  const { syncAllOmieProducts } = await import("@/server/omie/products");
  return syncAllOmieProducts();
});

export const searchOmieProductsFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        omieAppId: z.string().trim().optional(),
        query: z.string().trim().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireAuth } = await import("@/lib/require-auth");
    await requireAuth();
    const { listOmieProducts } = await import("@/db/products");
    return listOmieProducts({
      ...(data.omieAppId ? { omieAppId: data.omieAppId } : {}),
      ...(data.query ? { query: data.query } : {}),
      limit: data.limit ?? 60,
      activeOnly: true,
    });
  });

export const searchOmieClientsFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        omieAppId: z.string().trim().min(1),
        query: z.string().trim().min(2),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireAuth } = await import("@/lib/require-auth");
    await requireAuth();
    const { listOmieApps } = await import("@/server/omie/client");
    const { searchOmieClients } = await import("@/server/omie/quotes");
    const app = listOmieApps().find((entry) => entry.id === data.omieAppId);
    if (!app) return [];
    try {
      return await searchOmieClients(app, data.query);
    } catch {
      return [];
    }
  });

function normalizeItems(items: z.infer<typeof lineSchema>[]) {
  return items.map((item) => ({
    codigoProduto: item.codigoProduto,
    descricao: item.descricao,
    quantidade: item.quantidade,
    valorUnitario: item.valorUnitario,
    unidade: item.unidade ?? null,
    ncm: item.ncm ?? null,
  }));
}

function toSaveInput(data: z.infer<typeof draftSchema>, createdBy: number) {
  return {
    omieAppId: data.omieAppId,
    clientCode: data.clientCode,
    clientName: data.clientName ?? null,
    observacao: data.observacao ?? null,
    dataPrevisao: data.dataPrevisao ?? null,
    quoteId: data.quoteId ?? null,
    createdBy,
    items: normalizeItems(data.items),
  };
}

export const saveOrcamentoFn = createServerFn({ method: "POST" })
  .validator(draftSchema)
  .handler(async ({ data }) => {
    const { requireAuth } = await import("@/lib/require-auth");
    const { user } = await requireAuth();
    const { saveLocalOrcamento } = await import("@/server/omie/quotes");
    try {
      const result = await saveLocalOrcamento(toSaveInput(data, user.id));
      return { ok: true as const, ...result };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao salvar orçamento.",
      };
    }
  });

export const getOrcamentoFn = createServerFn({ method: "GET" })
  .validator((input) => z.object({ quoteId: z.coerce.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireAuth } = await import("@/lib/require-auth");
    await requireAuth();
    const { getQuoteById, getQuoteItems } = await import("@/db/quotes");
    const quote = await getQuoteById(data.quoteId);
    if (!quote) return { ok: false as const, error: "Orçamento não encontrado." };
    const items = await getQuoteItems(data.quoteId);
    return { ok: true as const, quote, items };
  });

export const sendOrcamentoToOmieFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ quoteId: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireAuth } = await import("@/lib/require-auth");
    await requireAuth();
    const { sendSavedOrcamentoToOmie } = await import("@/server/omie/quotes");
    try {
      const result = await sendSavedOrcamentoToOmie(data.quoteId);
      return { ok: true as const, quoteId: result.quoteId, numeroInterno: result.numeroInterno, omiePedidoCode: result.omiePedidoCode, numeroPedido: result.numeroPedido, total: result.total };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao enviar orçamento à Omie.",
      };
    }
  });

export const deleteOrcamentoFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        quoteId: z.number().int().positive(),
        alsoDeleteOmie: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireAuth } = await import("@/lib/require-auth");
    await requireAuth();
    const { deleteOrcamento } = await import("@/server/omie/quotes");
    try {
      const result = await deleteOrcamento({
        quoteId: data.quoteId,
        alsoDeleteOmie: data.alsoDeleteOmie === true,
      });
      return { ok: true as const, ...result };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao excluir orçamento.",
      };
    }
  });

export const createOrcamentoFn = createServerFn({ method: "POST" })
  .validator(draftSchema)
  .handler(async ({ data }) => {
    const { requireAuth } = await import("@/lib/require-auth");
    const { user } = await requireAuth();
    const { createOmieOrcamento } = await import("@/server/omie/quotes");
    try {
      const result = await createOmieOrcamento(toSaveInput(data, user.id));
      return {
        ok: true as const,
        quoteId: result.quoteId,
        numeroInterno: result.numeroInterno,
        omiePedidoCode: result.omiePedidoCode,
        numeroPedido: result.numeroPedido,
        total: result.total,
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao criar orçamento.",
      };
    }
  });
