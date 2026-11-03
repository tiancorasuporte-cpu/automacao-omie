import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function markBillingChange(
  terceiroId: number,
  user: { id: number; name: string },
  summary: string,
) {
  const { markTerceiroChanged } = await import("@/db/terceiros");
  return markTerceiroChanged(terceiroId, { id: user.id, name: user.name }, summary);
}

export const getTerceirosBootstrapFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireModule, canChecarTerceiros } = await import("@/lib/require-auth");
  const { user } = await requireModule("terceiros");
  const { listTerceiros } = await import("@/db/terceiros");
  const items = await listTerceiros(false);
  return { items, canChecar: canChecarTerceiros(user) };
});

export const getTerceiroDetailFn = createServerFn({ method: "GET" })
  .validator((input) => z.object({ id: z.coerce.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireModule, canChecarTerceiros } = await import("@/lib/require-auth");
    const { user } = await requireModule("terceiros");
    const { getTerceiroDetail } = await import("@/db/terceiros");
    const { listMonthlyServices } = await import("@/db/monthly-services");
    const detail = await getTerceiroDetail(data.id);
    if (!detail) return { ok: false as const, error: "Terceiro não encontrado." };
    const priceTable = await listMonthlyServices({ activeOnly: true });
    return {
      ok: true as const,
      detail,
      canChecar: canChecarTerceiros(user),
      priceTable: priceTable.map((s) => ({
        id: s.id,
        nome: s.nome,
        descricao: s.descricao,
        valor: s.valor,
      })),
    };
  });

export const markTerceiroReviewedFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ id: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireModule, canChecarTerceiros } = await import("@/lib/require-auth");
    const { user } = await requireModule("terceiros");
    if (!canChecarTerceiros(user)) {
      return { ok: false as const, error: "Sem permissão para checar alterações." };
    }
    const { markTerceiroReviewed } = await import("@/db/terceiros");
    try {
      const detail = await markTerceiroReviewed(data.id, { id: user.id, name: user.name });
      return { ok: true as const, detail };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao marcar como visto.",
      };
    }
  });

export const markServicoReviewedFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ id: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireModule, canChecarTerceiros } = await import("@/lib/require-auth");
    const { user } = await requireModule("terceiros");
    if (!canChecarTerceiros(user)) {
      return { ok: false as const, error: "Sem permissão para checar alterações." };
    }
    const { markServicoReviewed } = await import("@/db/terceiros");
    try {
      const detail = await markServicoReviewed(data.id, { id: user.id, name: user.name });
      return { ok: true as const, detail };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao marcar serviço como visto.",
      };
    }
  });

export const searchTerceirosOmieClientsFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z.object({ query: z.string().trim().min(2) }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("terceiros");
    const { getOrcamentosOmieApp } = await import("@/server/omie/client");
    const app = getOrcamentosOmieApp();
    if (!app) return { ok: true as const, appId: null as string | null, items: [] };
    const { searchOmieClients } = await import("@/server/omie/quotes");
    try {
      const items = await searchOmieClients(app, data.query);
      return { ok: true as const, appId: app.id, items };
    } catch {
      return { ok: true as const, appId: app.id, items: [] };
    }
  });

export const createTerceiroFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        nome: z.string().trim().min(1).max(200),
        documento: z.string().trim().max(32).nullable().optional(),
        contato: z.string().trim().max(200).nullable().optional(),
        observacao: z.string().trim().max(4000).optional(),
        omieClientCode: z.number().int().positive().nullable().optional(),
        omieAppId: z.string().trim().max(64).nullable().optional(),
        qtdContas: z.number().int().min(0).optional(),
        precoUnitario: z.number().min(0).optional(),
        monitoramentoObs: z.string().trim().max(2000).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("terceiros");
    const { createTerceiro } = await import("@/db/terceiros");
    try {
      const created = await createTerceiro({
        nome: data.nome,
        documento: data.documento ?? null,
        contato: data.contato ?? null,
        observacao: data.observacao ?? "",
        omieClientCode: data.omieClientCode ?? null,
        omieAppId: data.omieAppId ?? null,
        qtdContas: data.qtdContas ?? 0,
        precoUnitario: data.precoUnitario ?? 0,
        monitoramentoObs: data.monitoramentoObs ?? "",
      });
      const detail = await markBillingChange(created.id, user, "Cadastro / monitoramento");
      return { ok: true as const, detail };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao cadastrar terceiro.",
      };
    }
  });

export const updateTerceiroFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        nome: z.string().trim().min(1).max(200),
        documento: z.string().trim().max(32).nullable().optional(),
        contato: z.string().trim().max(200).nullable().optional(),
        observacao: z.string().trim().max(4000).optional(),
        omieClientCode: z.number().int().positive().nullable().optional(),
        omieAppId: z.string().trim().max(64).nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("terceiros");
    const { updateTerceiro } = await import("@/db/terceiros");
    try {
      const detail = await updateTerceiro({
        id: data.id,
        nome: data.nome,
        documento: data.documento ?? null,
        contato: data.contato ?? null,
        observacao: data.observacao ?? "",
        omieClientCode: data.omieClientCode ?? null,
        omieAppId: data.omieAppId ?? null,
        active: data.active !== false,
      });
      return { ok: true as const, detail };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao atualizar terceiro.",
      };
    }
  });

export const deleteTerceiroFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ id: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("terceiros");
    const { deleteTerceiro } = await import("@/db/terceiros");
    try {
      await deleteTerceiro(data.id);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao apagar terceiro.",
      };
    }
  });

export const updateMonitoramentoFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        terceiroId: z.number().int().positive(),
        qtdContas: z.number().int().min(0),
        precoUnitario: z.number().min(0),
        observacao: z.string().trim().max(2000).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("terceiros");
    const { updateMonitoramento } = await import("@/db/terceiros");
    try {
      await updateMonitoramento({
        terceiroId: data.terceiroId,
        qtdContas: data.qtdContas,
        precoUnitario: data.precoUnitario,
        observacao: data.observacao ?? "",
      });
      const detail = await markBillingChange(
        data.terceiroId,
        user,
        "Monitoramento (preço comum)",
      );
      return { ok: true as const, detail };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao salvar monitoramento.",
      };
    }
  });

export const createContaExcecaoFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        terceiroId: z.number().int().positive(),
        identificador: z.string().trim().min(1).max(200),
        valor: z.number().min(0),
        observacao: z.string().trim().max(2000).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("terceiros");
    const { createContaExcecao } = await import("@/db/terceiros");
    try {
      const result = await createContaExcecao({
        terceiroId: data.terceiroId,
        identificador: data.identificador,
        valor: data.valor,
        observacao: data.observacao ?? "",
      });
      const detail = await markBillingChange(data.terceiroId, user, "Particularidade");
      return { ok: true as const, conta: result.conta, detail };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao cadastrar conta.",
      };
    }
  });

export const updateContaExcecaoFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        identificador: z.string().trim().min(1).max(200),
        valor: z.number().min(0),
        observacao: z.string().trim().max(2000).optional(),
        active: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("terceiros");
    const { updateContaExcecao } = await import("@/db/terceiros");
    try {
      const result = await updateContaExcecao({
        id: data.id,
        identificador: data.identificador,
        valor: data.valor,
        observacao: data.observacao ?? "",
        active: data.active !== false,
      });
      const detail = await markBillingChange(
        result.detail.id,
        user,
        "Particularidade",
      );
      return { ok: true as const, conta: result.conta, detail };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao atualizar conta.",
      };
    }
  });

export const deleteContaExcecaoFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ id: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("terceiros");
    const { deleteContaExcecao } = await import("@/db/terceiros");
    try {
      const deleted = await deleteContaExcecao(data.id);
      const detail = await markBillingChange(deleted.id, user, "Particularidade removida");
      return { ok: true as const, detail };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao apagar conta.",
      };
    }
  });

export const createTerceiroServicoFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        terceiroId: z.number().int().positive(),
        nome: z.string().trim().min(1).max(200),
        quantidade: z.number().positive().optional(),
        valor: z.number().min(0),
        observacao: z.string().trim().max(2000).optional(),
        monthlyServiceId: z.number().int().positive().nullable().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("terceiros");
    const { createServico, markServicoChanged } = await import("@/db/terceiros");
    try {
      const result = await createServico({
        terceiroId: data.terceiroId,
        nome: data.nome,
        quantidade: data.quantidade ?? 1,
        valor: data.valor,
        observacao: data.observacao ?? "",
        monthlyServiceId: data.monthlyServiceId ?? null,
      });
      const detail = await markServicoChanged(result.servico.id, user, "Incluído");
      return { ok: true as const, servico: result.servico, detail };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao cadastrar serviço.",
      };
    }
  });

export const updateTerceiroServicoFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        nome: z.string().trim().min(1).max(200),
        quantidade: z.number().positive().optional(),
        valor: z.number().min(0),
        observacao: z.string().trim().max(2000).optional(),
        active: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("terceiros");
    const { updateServico, markServicoChanged } = await import("@/db/terceiros");
    try {
      const result = await updateServico({
        id: data.id,
        nome: data.nome,
        quantidade: data.quantidade ?? 1,
        valor: data.valor,
        observacao: data.observacao ?? "",
        active: data.active !== false,
      });
      const action = data.active === false ? "Desativado" : "Atualizado";
      const detail = await markServicoChanged(result.servico.id, user, action);
      return { ok: true as const, servico: result.servico, detail };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao atualizar serviço.",
      };
    }
  });

export const deleteTerceiroServicoFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ id: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("terceiros");
    const { deleteServico, markTerceiroChanged } = await import("@/db/terceiros");
    try {
      const deleted = await deleteServico(data.id);
      const detail = await markTerceiroChanged(
        deleted.terceiroId,
        user,
        `Serviço removido: ${deleted.nome}`.slice(0, 200),
      );
      return { ok: true as const, detail };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao apagar serviço.",
      };
    }
  });

export const createContaProporcionalFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        terceiroId: z.number().int().positive(),
        identificador: z.string().trim().min(1).max(200),
        valorBaseTipo: z.enum(["padrao", "particularidade"]),
        valorMensal: z.number().min(0).optional(),
        dataInicio: z.string().trim().min(8).max(10),
        dataFim: z.string().trim().min(8).max(10),
        observacao: z.string().trim().max(2000).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("terceiros");
    const { createContaProporcional } = await import("@/db/terceiros");
    try {
      const result = await createContaProporcional({
        terceiroId: data.terceiroId,
        identificador: data.identificador,
        valorBaseTipo: data.valorBaseTipo,
        valorMensal: data.valorMensal,
        dataInicio: data.dataInicio,
        dataFim: data.dataFim,
        observacao: data.observacao ?? "",
      });
      const detail = await markBillingChange(data.terceiroId, user, "Conta proporcional");
      return { ok: true as const, conta: result.conta, detail };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao cadastrar proporcional.",
      };
    }
  });

export const updateContaProporcionalFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        identificador: z.string().trim().min(1).max(200),
        valorBaseTipo: z.enum(["padrao", "particularidade"]),
        valorMensal: z.number().min(0).optional(),
        dataInicio: z.string().trim().min(8).max(10),
        dataFim: z.string().trim().min(8).max(10),
        observacao: z.string().trim().max(2000).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("terceiros");
    const { updateContaProporcional } = await import("@/db/terceiros");
    try {
      const result = await updateContaProporcional({
        id: data.id,
        identificador: data.identificador,
        valorBaseTipo: data.valorBaseTipo,
        valorMensal: data.valorMensal,
        dataInicio: data.dataInicio,
        dataFim: data.dataFim,
        observacao: data.observacao ?? "",
      });
      const detail = await markBillingChange(
        result.detail.id,
        user,
        "Conta proporcional",
      );
      return { ok: true as const, conta: result.conta, detail };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao atualizar proporcional.",
      };
    }
  });

export const deleteContaProporcionalFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ id: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("terceiros");
    const { deleteContaProporcional } = await import("@/db/terceiros");
    try {
      const deleted = await deleteContaProporcional(data.id);
      const detail = await markBillingChange(
        deleted.id,
        user,
        "Proporcional removida",
      );
      return { ok: true as const, detail };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao apagar proporcional.",
      };
    }
  });

export const lancarContaProporcionalFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ id: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("terceiros");
    const { lancarContaProporcional } = await import("@/db/terceiros");
    try {
      const launched = await lancarContaProporcional(data.id);
      const detail = await markBillingChange(
        launched.id,
        user,
        "Proporcional lançada na cobrança",
      );
      return { ok: true as const, detail };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao lançar proporcional.",
      };
    }
  });
