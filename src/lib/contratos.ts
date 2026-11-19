import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type {
  ClienteContratoGrupo,
  ContratoDetalhesJson,
  OmieContrato,
} from "@/db/contracts";

function redactClienteValores(
  item: ClienteContratoGrupo,
  canSee: boolean,
): ClienteContratoGrupo {
  if (canSee) return item;
  return { ...item, valorMensalAtivos: 0 };
}

function redactContratoValores(contrato: OmieContrato, canSee: boolean): OmieContrato {
  if (canSee) return contrato;
  const detalhes: ContratoDetalhesJson | null = contrato.detalhes
    ? {
        ...contrato.detalhes,
        itens: (contrato.detalhes.itens ?? []).map((item) => ({
          ...item,
          valorUnit: null,
          valorTotal: null,
        })),
      }
    : null;
  return { ...contrato, valorMensal: null, detalhes };
}

export const getContratosBootstrapFn = createServerFn({ method: "GET" }).handler(async () => {
  const { canSeeContratoValores, requireModule } = await import("@/lib/require-auth");
  const { user } = await requireModule("contratos");
  const canSeeValores = canSeeContratoValores(user);
  const { getDb } = await import("@/db/schema");
  await getDb();
  const { listOmieApps } = await import("@/server/omie/client");
  const { getDefaultMoniEmpresa, getMoniConfig } = await import("@/server/moni/client");
  const { countOmieContratos, listClientesComContratoAtivo } = await import("@/db/contracts");
  const { countMoniContas, listMoniEmpresasLocal } = await import("@/db/moni");
  const apps = listOmieApps().map(({ id, name }) => ({ id, name }));
  const [contratoCount, clientesPage, moniCount, moniEmpresas] = await Promise.all([
    countOmieContratos(),
    listClientesComContratoAtivo({ limit: 20, offset: 0 }),
    countMoniContas().catch(() => 0),
    listMoniEmpresasLocal().catch(() => [] as number[]),
  ]);
  const defaultMoniEmpresa = getDefaultMoniEmpresa(1);
  const empresas =
    moniEmpresas.length > 0
      ? moniEmpresas
      : defaultMoniEmpresa > 0
        ? [defaultMoniEmpresa]
        : [1];
  return {
    apps,
    contratoCount,
    clientes: clientesPage.items.map((c) => redactClienteValores(c, canSeeValores)),
    clientesTotal: clientesPage.total,
    moniConfigured: Boolean(getMoniConfig()),
    moniContaCount: moniCount,
    defaultMoniEmpresa,
    moniEmpresas: empresas,
    canSeeValores,
  };
});

export const listContratosClientesFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        omieAppId: z.string().trim().optional().nullable(),
        query: z.string().trim().optional().nullable(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        offset: z.coerce.number().int().min(0).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { canSeeContratoValores, requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("contratos");
    const canSeeValores = canSeeContratoValores(user);
    const { listClientesComContratoAtivo } = await import("@/db/contracts");
    const page = await listClientesComContratoAtivo({
      omieAppId: data.omieAppId || null,
      query: data.query || null,
      limit: data.limit ?? 20,
      offset: data.offset ?? 0,
    });
    return {
      ...page,
      items: page.items.map((c) => redactClienteValores(c, canSeeValores)),
      canSeeValores,
    };
  });

export const listContratosClienteFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        groupKey: z.string().trim().min(1),
        omieAppId: z.string().trim().optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { canSeeContratoValores, requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("contratos");
    const canSeeValores = canSeeContratoValores(user);
    const { listContratosDoCliente } = await import("@/db/contracts");
    const rows = await listContratosDoCliente({
      groupKey: data.groupKey,
      omieAppId: data.omieAppId || null,
    });
    return rows.map((row) => redactContratoValores(row, canSeeValores));
  });

export const getContratoDetalheFn = createServerFn({ method: "GET" })
  .validator((input) => z.object({ id: z.coerce.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { canSeeContratoValores, requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("contratos");
    const canSeeValores = canSeeContratoValores(user);
    const { getContratoById, listMoniContasDoContrato } = await import("@/db/contracts");
    const { getMoniContaByCodigo } = await import("@/db/moni");
    const { getDefaultMoniEmpresa, getMoniConfig } = await import("@/server/moni/client");
    const contratoRaw = await getContratoById(data.id);
    if (!contratoRaw) return null;
    const contrato = redactContratoValores(contratoRaw, canSeeValores);
    const moniContas = await listMoniContasDoContrato(contrato.id);
    const moniConfigured = Boolean(getMoniConfig());
    const defaultMoniEmpresa = getDefaultMoniEmpresa(1);

    const moniDetalhes = await Promise.all(
      moniContas.map(async (link) => {
        const codigo = Number(link.moniContaCodigo);
        let conta =
          Number.isFinite(codigo) && codigo > 0
            ? await getMoniContaByCodigo(codigo, link.moniEmpresa)
            : null;
        if (moniConfigured && codigo > 0) {
          try {
            const { getMoniContaLive } = await import("@/server/moni/contas");
            conta = (await getMoniContaLive(codigo, link.moniEmpresa)) ?? conta;
          } catch {
            // mantém cache local
          }
        }
        return { link, conta };
      }),
    );

    return {
      contrato,
      moniContas,
      moniDetalhes,
      moniConfigured,
      defaultMoniEmpresa,
      canSeeValores,
    };
  });

export const searchMoniContasFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        query: z.string().trim().min(1),
        empresa: z.coerce.number().int().positive().optional().nullable(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("contratos");
    const { getDefaultMoniEmpresa } = await import("@/server/moni/client");
    const { searchMoniContasLocal, countMoniContas } = await import("@/db/moni");
    const empresa = data.empresa && data.empresa > 0 ? data.empresa : getDefaultMoniEmpresa(1);
    const local = await searchMoniContasLocal({
      query: data.query,
      empresa,
      limit: data.limit ?? 40,
    });
    if (local.length > 0) return { items: local, source: "local" as const, empresa };

    const { getMoniConfig } = await import("@/server/moni/client");
    if (!getMoniConfig()) {
      return { items: [] as typeof local, source: "local" as const, empresa };
    }

    const count = await countMoniContas();
    try {
      const { searchMoniContasLive } = await import("@/server/moni/contas");
      const items = await searchMoniContasLive(data.query, {
        empresa,
        limit: data.limit ?? 40,
      });
      return { items, source: count > 0 ? ("local" as const) : ("live" as const), empresa };
    } catch {
      return { items: [] as typeof local, source: "local" as const, empresa };
    }
  });

export const listMoniEmpresasFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireModule } = await import("@/lib/require-auth");
  await requireModule("contratos");
  const { getDefaultMoniEmpresa, getMoniConfig } = await import("@/server/moni/client");
  const { listMoniEmpresasLocal } = await import("@/db/moni");
  let empresas = await listMoniEmpresasLocal();
  if (empresas.length === 0 && getMoniConfig()) {
    try {
      const { listMoniEmpresasLive } = await import("@/server/moni/contas");
      empresas = await listMoniEmpresasLive();
    } catch {
      // ignore
    }
  }
  const defaultEmpresa = getDefaultMoniEmpresa(1);
  if (empresas.length === 0) empresas = [defaultEmpresa];
  else if (!empresas.includes(defaultEmpresa)) empresas = [...empresas, defaultEmpresa].sort((a, b) => a - b);
  return { empresas, defaultEmpresa };
});

export const syncMoniContasFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireModule } = await import("@/lib/require-auth");
  await requireModule("contratos");
  const { syncMoniContas } = await import("@/server/moni/contas");
  return syncMoniContas();
});

export const addContratoMoniContaFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        omieContratoId: z.number().int().positive(),
        moniEmpresa: z.coerce.number().int().positive(),
        moniContaCodigo: z.string().trim().min(1),
        moniContaNome: z.string().trim().optional().nullable(),
        moniContaIdExt: z.string().trim().optional().nullable(),
        observacao: z.string().trim().optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("contratos");
    const { addMoniContaAoContrato, getContratoById } = await import("@/db/contracts");
    const { getMoniContaByCodigo } = await import("@/db/moni");
    const contrato = await getContratoById(data.omieContratoId);
    if (!contrato) throw new Error("Contrato não encontrado.");

    const codigoNum = Number(data.moniContaCodigo.replace(/\D/g, ""));
    let nome = data.moniContaNome?.trim() || null;
    let idExt = data.moniContaIdExt?.trim() || null;
    if (codigoNum > 0) {
      const local = await getMoniContaByCodigo(codigoNum, data.moniEmpresa);
      if (local) {
        nome = nome || local.nome;
        idExt = idExt || local.segundoCodigo;
      }
    }

    return addMoniContaAoContrato({
      omieContratoId: data.omieContratoId,
      moniEmpresa: data.moniEmpresa,
      moniContaCodigo: String(codigoNum || data.moniContaCodigo.trim()),
      moniContaNome: nome,
      moniContaIdExt: idExt,
      observacao: data.observacao,
    });
  });

export const removeContratoMoniContaFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ id: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("contratos");
    const { removeMoniContaDoContrato } = await import("@/db/contracts");
    await removeMoniContaDoContrato(data.id);
    return { ok: true as const };
  });

export const syncOmieContratosFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireModule } = await import("@/lib/require-auth");
  await requireModule("contratos");
  const { syncAllOmieContratos } = await import("@/server/omie/contracts");
  return syncAllOmieContratos();
});
