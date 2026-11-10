import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { hasPermission } from "@/lib/modules";

const origemSchema = z.enum(["manual", "orcamento", "os"]);
const statusSchema = z.enum(["aberta", "em_cotacao", "comprada", "cancelada"]);

function canActAsComprador(user: {
  role: string;
  isComprador?: boolean;
  modules?: string[] | null;
}) {
  if (user.role === "admin" || user.role === "superadmin") return true;
  if (user.isComprador) return true;
  return hasPermission(user.modules as never, "os_compras");
}

export const getComprasBootstrapFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireModule } = await import("@/lib/require-auth");
  const { user } = await requireModule("compras");
  const { ensureSchema } = await import("@/db/schema");
  await ensureSchema();
  const {
    listCompraSolicitacoes,
    listOsCompraQueue,
    getComprasUnreadSummary,
  } = await import("@/db/compras");
  const { listOmieSuppliers } = await import("@/db/suppliers");

  const [abertas, historico, osQueue, suppliers, unread] = await Promise.all([
    listCompraSolicitacoes({ status: ["aberta", "em_cotacao"], limit: 300 }),
    listCompraSolicitacoes({ status: ["comprada", "cancelada"], limit: 500 }),
    listOsCompraQueue(),
    listOmieSuppliers({ activeOnly: true, limit: 400 }),
    getComprasUnreadSummary(),
  ]);

  return {
    user: {
      id: user.id,
      name: user.name,
      isComprador: Boolean(user.isComprador),
      canComprar: canActAsComprador(user),
    },
    abertas,
    historico,
    osQueue,
    unread,
    suppliers: suppliers.map((s) => ({
      id: s.id,
      name: s.nomeFantasia || s.razaoSocial || `Fornecedor ${s.codigoOmie}`,
      codigoOmie: s.codigoOmie,
    })),
  };
});

export const getComprasUnreadFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireModule } = await import("@/lib/require-auth");
  try {
    await requireModule("compras");
  } catch {
    return { cotacoes: 0, kanban: 0, total: 0 };
  }
  const { ensureSchema } = await import("@/db/schema");
  await ensureSchema();
  const { getComprasUnreadSummary } = await import("@/db/compras");
  return getComprasUnreadSummary();
});

export const markComprasSeenFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        cotacoes: z.boolean().optional(),
        kanban: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("compras");
    const { ensureSchema } = await import("@/db/schema");
    await ensureSchema();
    const { markComprasAsSeen } = await import("@/db/compras");
    return markComprasAsSeen({
      cotacoes: data.cotacoes,
      kanban: data.kanban,
    });
  });

export const listCotacoesOrcamentoFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        quoteId: z.number().int().positive().optional().nullable(),
        quoteNumero: z.string().trim().max(40).optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    try {
      await requireModule("orcamentos");
    } catch {
      await requireModule("compras");
    }
    const { ensureSchema } = await import("@/db/schema");
    await ensureSchema();
    const { listCompraSolicitacoesForQuote } = await import("@/db/compras");
    return listCompraSolicitacoesForQuote({
      quoteId: data.quoteId ?? null,
      quoteNumero: data.quoteNumero ?? null,
    });
  });

export const searchComprasProductsFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        query: z.string().trim().min(2),
        limit: z.coerce.number().int().min(1).max(80).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    try {
      await requireModule("compras");
    } catch {
      await requireModule("orcamentos");
    }
    const { ensureSchema } = await import("@/db/schema");
    await ensureSchema();
    const { listOmieApps, requireOrcamentosOmieApp } = await import("@/server/omie/client");
    const { listOmieProducts } = await import("@/db/products");
    let omieAppId = "";
    try {
      omieAppId = requireOrcamentosOmieApp().id;
    } catch {
      omieAppId = listOmieApps()[0]?.id ?? "";
    }
    if (!omieAppId) return [];
    return listOmieProducts({
      omieAppId,
      query: data.query,
      limit: data.limit ?? 40,
      activeOnly: true,
    });
  });

export const createCompraSolicitacaoFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        origem: origemSchema.default("manual"),
        descricao: z.string().trim().min(1).max(400).optional(),
        unidade: z.string().trim().max(40).optional().nullable(),
        qtd: z.number().positive(),
        productId: z.number().int().positive().optional().nullable(),
        omieAppId: z.string().trim().min(1).optional().nullable(),
        codigoProduto: z.number().int().positive().optional().nullable(),
        quoteId: z.number().int().positive().optional().nullable(),
        quoteNumero: z.string().trim().max(40).optional().nullable(),
        motivo: z.string().trim().max(2000).optional().nullable(),
        links: z.array(z.string().trim().max(500)).max(10).optional().nullable(),
        observacao: z.string().trim().max(2000).optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    // Orçamentos e Compras podem abrir cotação
    let user;
    try {
      ({ user } = await requireModule("compras"));
    } catch {
      ({ user } = await requireModule("orcamentos"));
    }
    const { ensureSchema } = await import("@/db/schema");
    await ensureSchema();
    const { createCompraSolicitacao } = await import("@/db/compras");
    try {
      const row = await createCompraSolicitacao({
        origem: data.origem,
        ...(data.descricao != null ? { descricao: data.descricao } : {}),
        unidade: data.unidade ?? null,
        qtd: data.qtd,
        productId: data.productId ?? null,
        omieAppId: data.omieAppId ?? null,
        codigoProduto: data.codigoProduto ?? null,
        quoteId: data.quoteId ?? null,
        quoteNumero: data.quoteNumero ?? null,
        motivo: data.motivo ?? null,
        links: data.links ?? null,
        observacao: data.observacao ?? null,
        solicitadoPor: user.id,
        solicitadoPorNome: user.name,
      });
      return { ok: true as const, solicitacao: row };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao criar solicitação.",
      };
    }
  });

export const setCompraStatusFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        status: statusSchema,
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("compras");
    if (!canActAsComprador(user) && data.status !== "cancelada") {
      return { ok: false as const, error: "Somente compradores podem alterar esta cotação." };
    }
    const { ensureSchema } = await import("@/db/schema");
    await ensureSchema();
    const { setCompraSolicitacaoStatus } = await import("@/db/compras");
    const row = await setCompraSolicitacaoStatus(data);
    if (!row) return { ok: false as const, error: "Solicitação não encontrada." };
    return { ok: true as const, solicitacao: row };
  });

export const concluirCompraFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        fornecedorNome: z.string().trim().max(200).optional().nullable(),
        fornecedorId: z.number().int().positive().optional().nullable(),
        valorCompra: z.number().nonnegative().optional().nullable(),
        cmcNovo: z.number().nonnegative().optional().nullable(),
        previsao: z.string().trim().max(10).optional().nullable(),
        notasCompra: z.string().trim().max(2000).optional().nullable(),
        updateCmcInterno: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("compras");
    if (!canActAsComprador(user)) {
      return { ok: false as const, error: "Somente compradores podem concluir a compra." };
    }
    const { ensureSchema } = await import("@/db/schema");
    await ensureSchema();
    const { concluirCompraSolicitacao } = await import("@/db/compras");
    try {
      const row = await concluirCompraSolicitacao({
        id: data.id,
        fornecedorNome: data.fornecedorNome ?? null,
        fornecedorId: data.fornecedorId ?? null,
        valorCompra: data.valorCompra ?? null,
        cmcNovo: data.cmcNovo ?? null,
        previsao: data.previsao ?? null,
        notasCompra: data.notasCompra ?? null,
        updateCmcInterno: data.updateCmcInterno ?? true,
        compradoPor: user.id,
        compradoPorNome: user.name,
      });
      if (!row) return { ok: false as const, error: "Solicitação não encontrada." };
      return { ok: true as const, solicitacao: row };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao concluir compra.",
      };
    }
  });

export const markOsItemCompradoFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        itemId: z.number().int().positive(),
        previsao: z.string().trim().max(10).optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("compras");
    if (!canActAsComprador(user)) {
      return { ok: false as const, error: "Somente compradores podem marcar item comprado." };
    }
    const { ensureSchema } = await import("@/db/schema");
    await ensureSchema();
    const { markOsItemComprado, listOsCompraQueue } = await import("@/db/compras");
    try {
      await markOsItemComprado({
        itemId: data.itemId,
        previsao: data.previsao ?? null,
        quem: user.name,
        userId: user.id,
      });
      const osQueue = await listOsCompraQueue();
      return { ok: true as const, osQueue };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao marcar comprado.",
      };
    }
  });

export const refreshComprasFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireModule } = await import("@/lib/require-auth");
  await requireModule("compras");
  const { ensureSchema } = await import("@/db/schema");
  await ensureSchema();
  const {
    listCompraSolicitacoes,
    listOsCompraQueue,
    getComprasUnreadSummary,
  } = await import("@/db/compras");
  const [abertas, historico, osQueue, unread] = await Promise.all([
    listCompraSolicitacoes({ status: ["aberta", "em_cotacao"], limit: 300 }),
    listCompraSolicitacoes({ status: ["comprada", "cancelada"], limit: 500 }),
    listOsCompraQueue(),
    getComprasUnreadSummary(),
  ]);
  return { abertas, historico, osQueue, unread };
});

export function notifyComprasUnreadChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("compras-unread-changed"));
}
