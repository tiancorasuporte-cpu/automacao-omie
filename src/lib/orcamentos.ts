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
  const { requireModule, canDeleteOrcamento } = await import("@/lib/require-auth");
  const { user } = await requireModule("orcamentos");
  const { listOrcamentosOmieApps, requireOrcamentosOmieApp } = await import("@/server/omie/client");
  const { countOmieProducts } = await import("@/db/products");
  const { listQuotes } = await import("@/db/quotes");
  const { getOmieEmpresaInfo } = await import("@/server/omie/quotes");
  const apps = listOrcamentosOmieApps().map(({ id, name }) => ({ id, name }));
  const app = requireOrcamentosOmieApp();
  const [productCount, quotes, empresa] = await Promise.all([
    countOmieProducts(app.id),
    listQuotes(40, app.id),
    getOmieEmpresaInfo(app),
  ]);
  return {
    apps,
    productCount,
    quotes,
    omieAppId: app.id,
    empresaRazaoSocial: empresa.razaoSocial,
    empresaCnpj: empresa.cnpj,
    canDeleteQuotes: canDeleteOrcamento(user),
  };
});

export const syncOmieProductsFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireModule } = await import("@/lib/require-auth");
  await requireModule("orcamentos");
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
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("orcamentos");
    const { requireOrcamentosOmieApp } = await import("@/server/omie/client");
    const { listOmieProducts } = await import("@/db/products");
    const app = requireOrcamentosOmieApp();
    return listOmieProducts({
      omieAppId: app.id,
      ...(data.query ? { query: data.query } : {}),
      limit: data.limit ?? 60,
      activeOnly: true,
    });
  });

export const searchOmieClientsFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        omieAppId: z.string().trim().optional(),
        query: z.string().trim().min(2),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("orcamentos");
    const { requireOrcamentosOmieApp } = await import("@/server/omie/client");
    const { searchOmieClients } = await import("@/server/omie/quotes");
    const app = requireOrcamentosOmieApp();
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

function toSaveInput(data: z.infer<typeof draftSchema>, createdBy: number, omieAppId: string) {
  return {
    omieAppId,
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
    const { requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("orcamentos");
    const { requireOrcamentosOmieApp } = await import("@/server/omie/client");
    const { saveLocalOrcamento } = await import("@/server/omie/quotes");
    const app = requireOrcamentosOmieApp();
    try {
      const result = await saveLocalOrcamento(toSaveInput(data, user.id, app.id));
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
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("orcamentos");
    const { requireOrcamentosOmieApp } = await import("@/server/omie/client");
    const { getQuoteById, getQuoteItems } = await import("@/db/quotes");
    const { listOmieProducts } = await import("@/db/products");
    const app = requireOrcamentosOmieApp();
    const quote = await getQuoteById(data.quoteId);
    if (!quote) return { ok: false as const, error: "Orçamento não encontrado." };
    if (quote.omieAppId !== app.id) {
      return { ok: false as const, error: "Orçamento não pertence à empresa Belfer." };
    }
    const { getCliente } = await import("@/server/omie/clients");
    const clienteOmie = await getCliente(app, quote.clientCode).catch(() => null);
    const items = await getQuoteItems(data.quoteId);
    const catalog = await listOmieProducts({
      omieAppId: app.id,
      activeOnly: false,
      limit: 500,
    });
    const byCode = new Map(catalog.map((product) => [product.codigoProduto, product]));
    return {
      ok: true as const,
      quote,
      clienteCnpj: clienteOmie?.cnpj_cpf ?? null,
      clienteNomeCompleto:
        clienteOmie?.razao_social ||
        clienteOmie?.nome_fantasia ||
        quote.clientName ||
        null,
      items: items.map((item) => {
        const product = byCode.get(item.codigoProduto);
        return {
          ...item,
          cmc: product?.cmc ?? null,
          cmcInterno: product?.cmcInterno ?? null,
          cmcEfetivo: product?.cmcEfetivo ?? null,
          markup: product?.markup ?? null,
        };
      }),
    };
  });

export const sendOrcamentoToOmieFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ quoteId: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("orcamentos");
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
    const { requireModule, canDeleteOrcamento } = await import("@/lib/require-auth");
    const { user } = await requireModule("orcamentos");
    if (!canDeleteOrcamento(user)) {
      return {
        ok: false as const,
        error: "Seu usuário não tem permissão para excluir orçamentos.",
      };
    }
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
    const { requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("orcamentos");
    const { requireOrcamentosOmieApp } = await import("@/server/omie/client");
    const { createOmieOrcamento } = await import("@/server/omie/quotes");
    const app = requireOrcamentosOmieApp();
    try {
      const result = await createOmieOrcamento(toSaveInput(data, user.id, app.id));
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
