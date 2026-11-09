import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getEstoqueBootstrapFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireModule } = await import("@/lib/require-auth");
  await requireModule("estoque");
  const { listOrcamentosOmieApps, requireOrcamentosOmieApp } = await import("@/server/omie/client");
  const { countProductStock } = await import("@/db/stock");
  const apps = listOrcamentosOmieApps().map(({ id, name }) => ({ id, name }));
  const app = requireOrcamentosOmieApp();
  const total = await countProductStock({ omieAppId: app.id });
  return {
    apps,
    omieAppId: app.id,
    total,
  };
});

export const listEstoqueFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        omieAppId: z.string().trim().optional(),
        query: z.string().trim().optional(),
        onlyDivergent: z.boolean().optional(),
        onlyBelowMin: z.boolean().optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
        offset: z.coerce.number().int().min(0).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("estoque");
    const { requireOrcamentosOmieApp } = await import("@/server/omie/client");
    const { listProductStock, countProductStock } = await import("@/db/stock");
    const app = requireOrcamentosOmieApp();
    const filters = {
      omieAppId: app.id,
      ...(data.query ? { query: data.query } : {}),
      onlyDivergent: data.onlyDivergent ?? false,
      onlyBelowMin: data.onlyBelowMin ?? false,
    };
    const [items, total] = await Promise.all([
      listProductStock({
        ...filters,
        limit: data.limit ?? 100,
        offset: data.offset ?? 0,
      }),
      countProductStock(filters),
    ]);
    return { items, total };
  });

export const syncEstoqueFiscalFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireModule } = await import("@/lib/require-auth");
  await requireModule("estoque");
  const { syncAllOmieFiscalStock } = await import("@/server/omie/products");
  return syncAllOmieFiscalStock();
});

export const moveEstoqueFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        productId: z.number().int().positive(),
        tipo: z.enum(["entrada", "saida", "ajuste"]),
        quantidade: z.number(),
        motivo: z.string().trim().max(2000).optional().nullable(),
        observacao: z.string().trim().max(2000).optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("estoque");
    const { getOmieProductById } = await import("@/db/products");
    const { requireOrcamentosOmieApp } = await import("@/server/omie/client");
    const { moveProductStock } = await import("@/db/stock");
    const app = requireOrcamentosOmieApp();
    const product = await getOmieProductById(data.productId);
    if (!product || product.omieAppId !== app.id) {
      return { ok: false as const, error: "Produto não pertence à empresa sincronizada." };
    }
    try {
      const result = await moveProductStock({
        productId: data.productId,
        tipo: data.tipo,
        quantidade: data.quantidade,
        motivo: data.motivo ?? null,
        observacao: data.observacao ?? null,
        userId: user.id,
      });
      return { ok: true as const, saldo: result.saldo };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao movimentar estoque.",
      };
    }
  });

export const updateEstoqueMinimoFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        productId: z.number().int().positive(),
        estoqueMinimo: z.number().min(0),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("estoque");
    const { getOmieProductById } = await import("@/db/products");
    const { requireOrcamentosOmieApp } = await import("@/server/omie/client");
    const { updateProductStockMinimo } = await import("@/db/stock");
    const app = requireOrcamentosOmieApp();
    const product = await getOmieProductById(data.productId);
    if (!product || product.omieAppId !== app.id) {
      return { ok: false as const, error: "Produto não pertence à empresa sincronizada." };
    }
    try {
      const result = await updateProductStockMinimo(data.productId, data.estoqueMinimo);
      return { ok: true as const, estoqueMinimo: result.estoqueMinimo };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao salvar estoque mínimo.",
      };
    }
  });

export const listEstoqueHistoricoFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        productId: z.number().int().positive(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("estoque");
    const { getOmieProductById } = await import("@/db/products");
    const { requireOrcamentosOmieApp } = await import("@/server/omie/client");
    const { listProductStockMoves } = await import("@/db/stock");
    const app = requireOrcamentosOmieApp();
    const product = await getOmieProductById(data.productId);
    if (!product || product.omieAppId !== app.id) {
      return { items: [] as const };
    }
    const items = await listProductStockMoves(data.productId, data.limit ?? 100);
    return { items };
  });
