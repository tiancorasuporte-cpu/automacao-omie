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
  comServicoMensal: z.boolean().optional(),
  servicosMensais: z
    .array(
      z.object({
        monthlyServiceId: z.number().int().positive().nullable().optional(),
        nome: z.string().trim().min(1).max(200),
        valor: z.number().min(0),
        quantidade: z.number().positive().optional(),
      }),
    )
    .optional(),
});

export const getOrcamentosBootstrapFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireModule, canDeleteOrcamento, canManageMonthlyServices } = await import(
    "@/lib/require-auth"
  );
  const { user } = await requireModule("orcamentos");
  const { listOrcamentosOmieApps, requireOrcamentosOmieApp } = await import("@/server/omie/client");
  const { countOmieProducts } = await import("@/db/products");
  const { countOmieClients } = await import("@/db/clients");
  const { listQuotes } = await import("@/db/quotes");
  const { listMonthlyServices } = await import("@/db/monthly-services");
  const { getOmieEmpresaInfo } = await import("@/server/omie/quotes");
  const apps = listOrcamentosOmieApps().map(({ id, name }) => ({ id, name }));
  const app = requireOrcamentosOmieApp();
  const [productCount, clientCount, quotes, empresa, monthlyServices] = await Promise.all([
    countOmieProducts(app.id),
    countOmieClients(app.id),
    listQuotes(40, app.id),
    getOmieEmpresaInfo(app),
    listMonthlyServices(true),
  ]);
  return {
    apps,
    productCount,
    clientCount,
    quotes,
    monthlyServices,
    omieAppId: app.id,
    empresaRazaoSocial: empresa.razaoSocial,
    empresaCnpj: empresa.cnpj,
    canDeleteQuotes: canDeleteOrcamento(user),
    canManageMonthlyServices: canManageMonthlyServices(user),
  };
});

export const getOrcamentoEmpresaFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireModule } = await import("@/lib/require-auth");
  await requireModule("orcamentos");
  const { requireOrcamentosOmieApp } = await import("@/server/omie/client");
  const { getOmieEmpresaInfo } = await import("@/server/omie/quotes");
  const app = requireOrcamentosOmieApp();
  const empresa = await getOmieEmpresaInfo(app);
  return {
    razaoSocial: empresa.razaoSocial,
    cnpj: empresa.cnpj,
    nomeFantasia: empresa.nomeFantasia,
  };
});

export const syncOmieProductsFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireModule } = await import("@/lib/require-auth");
  await requireModule("orcamentos");
  const { syncAllOmieProducts } = await import("@/server/omie/products");
  return syncAllOmieProducts();
});

export const syncOmieClientsFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireModule } = await import("@/lib/require-auth");
  await requireModule("orcamentos");
  const { syncAllOmieClients } = await import("@/server/omie/clients");
  return syncAllOmieClients();
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

export const listMonthlyServicesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireModule } = await import("@/lib/require-auth");
  await requireModule("orcamentos");
  const { listMonthlyServices } = await import("@/db/monthly-services");
  return listMonthlyServices(true);
});

export const createMonthlyServiceFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        nome: z.string().trim().min(1).max(200),
        valor: z.number().min(0),
        custo: z.number().min(0).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule, canManageMonthlyServices } = await import("@/lib/require-auth");
    const { user } = await requireModule("orcamentos");
    if (!canManageMonthlyServices(user)) {
      return {
        ok: false as const,
        error: "Seu usuário não tem permissão para cadastrar serviços mensais.",
      };
    }
    const { createMonthlyService } = await import("@/db/monthly-services");
    try {
      const service = await createMonthlyService({
        nome: data.nome,
        valor: data.valor,
        custo: data.custo ?? 0,
      });
      return { ok: true as const, service };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao cadastrar serviço mensal.",
      };
    }
  });

export const updateMonthlyServiceFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        nome: z.string().trim().min(1).max(200),
        valor: z.number().min(0),
        custo: z.number().min(0).optional(),
        active: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule, canManageMonthlyServices } = await import("@/lib/require-auth");
    const { user } = await requireModule("orcamentos");
    if (!canManageMonthlyServices(user)) {
      return {
        ok: false as const,
        error: "Seu usuário não tem permissão para alterar serviços mensais.",
      };
    }
    const { updateMonthlyService } = await import("@/db/monthly-services");
    try {
      const service = await updateMonthlyService({
        id: data.id,
        nome: data.nome,
        valor: data.valor,
        ...(data.custo !== undefined ? { custo: data.custo } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      });
      return { ok: true as const, service };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao atualizar serviço mensal.",
      };
    }
  });

export const deactivateMonthlyServiceFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ id: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireModule, canManageMonthlyServices } = await import("@/lib/require-auth");
    const { user } = await requireModule("orcamentos");
    if (!canManageMonthlyServices(user)) {
      return {
        ok: false as const,
        error: "Seu usuário não tem permissão para remover serviços mensais.",
      };
    }
    const { deactivateMonthlyService } = await import("@/db/monthly-services");
    try {
      await deactivateMonthlyService(data.id);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao remover serviço mensal.",
      };
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

function resolveServicosMensais(data: z.infer<typeof draftSchema>) {
  if (!data.comServicoMensal) return [];
  const list = (data.servicosMensais ?? [])
    .map((service) => ({
      monthlyServiceId: service.monthlyServiceId ?? null,
      nome: service.nome.trim(),
      valor: service.valor,
      quantidade:
        service.quantidade != null && Number.isFinite(service.quantidade) && service.quantidade > 0
          ? service.quantidade
          : 1,
    }))
    .filter((service) => service.nome.length > 0);
  if (list.length === 0) {
    throw new Error("Adicione ao menos um serviço mensal ou desmarque a opção.");
  }
  return list;
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
    servicosMensais: resolveServicosMensais(data),
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
    const { getQuoteById, getQuoteItems, getQuoteMonthlyServices } = await import("@/db/quotes");
    const { listOmieProducts } = await import("@/db/products");
    const app = requireOrcamentosOmieApp();
    const quote = await getQuoteById(data.quoteId);
    if (!quote) return { ok: false as const, error: "Orçamento não encontrado." };
    if (quote.omieAppId !== app.id) {
      return { ok: false as const, error: "Orçamento não pertence à empresa Belfer." };
    }
    const { getCliente } = await import("@/server/omie/clients");
    const clienteOmie = await getCliente(app, quote.clientCode).catch(() => null);
    const [items, servicosMensais] = await Promise.all([
      getQuoteItems(data.quoteId),
      getQuoteMonthlyServices(data.quoteId),
    ]);
    const catalog = await listOmieProducts({
      omieAppId: app.id,
      activeOnly: false,
      limit: 500,
    });
    const byCode = new Map(catalog.map((product) => [product.codigoProduto, product]));
    return {
      ok: true as const,
      quote,
      servicosMensais,
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
