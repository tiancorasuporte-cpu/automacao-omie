import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { DEFAULT_PRODUCT_MARKUP } from "@/lib/product-pricing";

export const getProdutosBootstrapFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireModule } = await import("@/lib/require-auth");
  await requireModule("produtos");
  const { listOrcamentosOmieApps, requireOrcamentosOmieApp } = await import("@/server/omie/client");
  const { countOmieProducts } = await import("@/db/products");
  const apps = listOrcamentosOmieApps().map(({ id, name }) => ({ id, name }));
  const app = requireOrcamentosOmieApp();
  const productCount = await countOmieProducts(app.id);
  return {
    apps,
    productCount,
    defaultMarkup: DEFAULT_PRODUCT_MARKUP,
    omieAppId: app.id,
  };
});

export const listProdutosFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        omieAppId: z.string().trim().optional(),
        query: z.string().trim().optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
        offset: z.coerce.number().int().min(0).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("produtos");
    const { requireOrcamentosOmieApp } = await import("@/server/omie/client");
    const { listOmieProducts, countOmieProducts } = await import("@/db/products");
    const app = requireOrcamentosOmieApp();
    const [items, total] = await Promise.all([
      listOmieProducts({
        omieAppId: app.id,
        ...(data.query ? { query: data.query } : {}),
        limit: data.limit ?? 100,
        offset: data.offset ?? 0,
        activeOnly: true,
      }),
      countOmieProducts(app.id, data.query),
    ]);
    return { items, total };
  });

export const updateProdutoFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        cmcInterno: z.number().min(0).nullable(),
        markup: z.number().positive().max(100),
        valorUnitario: z.number().min(0).nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("produtos");
    const { requireOrcamentosOmieApp } = await import("@/server/omie/client");
    const { getOmieProductById, updateLocalProduct } = await import("@/db/products");
    const app = requireOrcamentosOmieApp();
    const existing = await getOmieProductById(data.id);
    if (!existing || existing.omieAppId !== app.id) {
      return { ok: false as const, error: "Produto não pertence à empresa Belfer." };
    }
    try {
      const product = await updateLocalProduct(data);
      return { ok: true as const, product };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao salvar produto.",
      };
    }
  });

export const syncProdutosFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireModule } = await import("@/lib/require-auth");
  await requireModule("produtos");
  const { syncAllOmieProducts } = await import("@/server/omie/products");
  return syncAllOmieProducts();
});
