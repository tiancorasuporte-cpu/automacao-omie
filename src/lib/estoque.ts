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

export const getEstoquePdvBootstrapFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireModule } = await import("@/lib/require-auth");
  await requireModule("estoque");
  const { ensureSchema } = await import("@/db/schema");
  await ensureSchema();
  const { listAssistTeams } = await import("@/db/assistencia");
  const { listOsForMatSaida } = await import("@/db/assistencia");
  const { listTeamStock, listTeamStockMoves } = await import("@/db/team-stock");
  const { listMatSaidas } = await import("@/db/mat-saidas");
  const [teams, osOptions, teamStock, teamMoves, saidas] = await Promise.all([
    listAssistTeams(true),
    listOsForMatSaida(),
    listTeamStock(),
    listTeamStockMoves({ limit: 80 }),
    listMatSaidas(40),
  ]);
  return { teams, osOptions, teamStock, teamMoves, saidas };
});

export const listTeamStockFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        teamId: z.number().int().positive().optional().nullable(),
        query: z.string().trim().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("estoque");
    const { listTeamStock } = await import("@/db/team-stock");
    return listTeamStock({
      teamId: data.teamId ?? null,
      query: data.query ?? null,
    });
  });

export const listTeamStockMovesFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        teamId: z.number().int().positive().optional().nullable(),
        limit: z.coerce.number().int().min(1).max(300).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("estoque");
    const { listTeamStockMoves } = await import("@/db/team-stock");
    return listTeamStockMoves({
      teamId: data.teamId ?? null,
      limit: data.limit ?? 100,
    });
  });

export const emitMatSaidaFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        destino: z.enum(["os", "equipe"]),
        teamId: z.number().int().positive(),
        tecnicoNome: z.string().trim().max(120).optional().nullable(),
        osId: z.number().int().positive().optional().nullable(),
        itens: z
          .array(
            z.object({
              productId: z.number().int().positive(),
              nome: z.string().trim().min(1).max(240),
              qtd: z.number().positive(),
            }),
          )
          .min(1)
          .max(50),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("estoque");
    const { ensureSchema } = await import("@/db/schema");
    await ensureSchema();
    const { emitMatSaida } = await import("@/db/mat-saidas");
    return emitMatSaida({
      destino: data.destino,
      teamId: data.teamId,
      tecnicoNome: data.tecnicoNome ?? null,
      osId: data.osId ?? null,
      itens: data.itens,
      userId: user.id,
      userName: user.name,
    });
  });

export const searchEstoqueProductsFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        query: z.string().trim().optional(),
        limit: z.coerce.number().int().min(1).max(50).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("estoque");
    const { requireOrcamentosOmieApp } = await import("@/server/omie/client");
    const { listProductStock } = await import("@/db/stock");
    const app = requireOrcamentosOmieApp();
    const q = data.query?.trim();
    const items = await listProductStock({
      omieAppId: app.id,
      ...(q ? { query: q } : {}),
      limit: data.limit ?? 20,
      offset: 0,
    });
    return items.map((p) => ({
      productId: p.productId,
      descricao: p.descricao,
      codigoInterno: p.codigoInterno,
      codigoProduto: p.codigoProduto,
      unidade: p.unidade,
      quantidadeFisica: p.quantidadeFisica,
    }));
  });

export const returnTeamProductFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        teamId: z.number().int().positive(),
        productId: z.number().int().positive(),
        quantidade: z.number().positive(),
        motivo: z.string().trim().max(2000).optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("estoque");
    const { ensureSchema } = await import("@/db/schema");
    await ensureSchema();
    const { returnTeamProductToCompany } = await import("@/db/team-stock");
    return returnTeamProductToCompany({
      teamId: data.teamId,
      productId: data.productId,
      quantidade: data.quantidade,
      userId: user.id,
      userName: user.name,
      motivo: data.motivo ?? null,
    });
  });
