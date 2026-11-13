import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  acceptConference,
  addOsItem,
  advanceOs,
  checkInOs,
  checkOutOs,
  createOs,
  deleteOs,
  finishVisita,
  getCompanyLocation,
  pauseOs,
  resumeOs,
  getOsById,
  linkOsTicketCom,
  listAssistTeams,
  listMaterialPendencias,
  listOs,
  saveCompanyLocation,
  syncOsClientLocation,
  markExecutedManual,
  markMaterialDivergence,
  moveOsOnKanban,
  receivePurchaseItem,
  requestMaterialFromField,
  reopenOs,
  requestReturnOs,
  resolveOsMaterialBaixa,
  resolveReturnOs,
  saveAssistTeam,
  saveAssistTeamMember,
  saveOsLev,
  saveOsMaterialDisposition,
  saveOsResolucao,
  scheduleOs,
  searchQuotesLocal,
  startExecOs,
  submitConference,
  updateOsItemStatus,
} from "@/db/assistencia";
import { createTicket } from "@/db/tickets";
import { ensureSchema } from "@/db/schema";
import {
  OS_ITEM_STATUS,
  OS_PERIODOS,
  OS_STAGES,
  OS_SUBTIPOS_MANUT,
  OS_SUBTIPOS_MONIT,
  OS_TIPOS,
  type OsItemStatus,
  type OsTipo,
} from "@/lib/assistencia-domain";
import { listTecnicos } from "@/db/users";
import {
  canAccessModule,
  canDeleteOs,
  canOsWorkflow,
  firstAccessiblePath,
  isAdmin,
  requireAuth,
  requireModule,
  type OsWorkflowRole,
} from "@/lib/require-auth";
import { redirect } from "@tanstack/react-router";

async function auth() {
  return requireModule("assistencia");
}

function canManageEquipes(user: Parameters<typeof canOsWorkflow>[0]) {
  return (
    isAdmin(user) ||
    canAccessModule(user, "equipes") ||
    canAccessModule(user, "assistencia") ||
    canOsWorkflow(user, "assistencia")
  );
}

async function authEquipes() {
  const { user } = await requireAuth();
  if (!canManageEquipes(user)) {
    throw redirect({ to: firstAccessiblePath(user) });
  }
  return { user };
}

async function boot() {
  await ensureSchema();
}

function roleFns(user: Parameters<typeof canOsWorkflow>[0]) {
  const admin = isAdmin(user);
  return {
    isAdmin: admin,
    canRole: (role: OsWorkflowRole) => canOsWorkflow(user, role),
  };
}

export const getAssistenciaBootstrapFn = createServerFn({ method: "GET" }).handler(async () => {
  const { user } = await auth();
  await boot();
  const { listProblemTypes, listChecklists } = await import("@/db/assistencia-checklists");
  const [osList, teams, materialPendencias, problemTypes, checklists, companyLocation] =
    await Promise.all([
      listOs(),
      listAssistTeams(true),
      listMaterialPendencias(),
      listProblemTypes(),
      listChecklists(),
      getCompanyLocation(),
    ]);
  const roles = roleFns(user);
  const { listOmieApps, requireOrcamentosOmieApp } = await import("@/server/omie/client");
  const apps = listOmieApps().map((a) => ({ id: a.id, name: a.name }));
  let omieAppId = apps[0]?.id ?? "";
  try {
    omieAppId = requireOrcamentosOmieApp().id;
  } catch {
    // primeiro app
  }
  return {
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      isAdmin: roles.isAdmin,
      canAssistencia: roles.canRole("assistencia"),
      canEstoque: roles.canRole("estoque"),
      canCompras: roles.canRole("compras"),
      canDeleteOs: canDeleteOs(user),
    },
    omieAppId,
    apps,
    catalogs: {
      tipos: OS_TIPOS.map((t) => ({ ...t })),
      stages: OS_STAGES.map((s) => ({ ...s })),
      subtiposManut: [...OS_SUBTIPOS_MANUT],
      subtiposMonit: [...OS_SUBTIPOS_MONIT],
      periodos: [...OS_PERIODOS],
      itemStatus: [...OS_ITEM_STATUS],
    },
    teams,
    osList,
    materialPendencias,
    problemTypes,
    checklists,
    companyLocation,
  };
});

export const searchAssistClientsFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        omieAppId: z.string().trim().optional(),
        query: z.string().trim().min(2),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    await auth();
    await boot();
    const { listOmieApps, requireOrcamentosOmieApp } = await import("@/server/omie/client");
    const { searchOmieClients } = await import("@/server/omie/quotes");
    let app;
    try {
      app = data.omieAppId
        ? listOmieApps().find((a) => a.id === data.omieAppId) ?? requireOrcamentosOmieApp()
        : requireOrcamentosOmieApp();
    } catch {
      app = listOmieApps()[0];
    }
    if (!app) return [];
    try {
      return await searchOmieClients(app, data.query);
    } catch {
      return [];
    }
  });

/** Busca produtos do catálogo Omie sincronizado (para adicionar item na OS). */
export const searchAssistProductsFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        omieAppId: z.string().trim().optional().nullable(),
        query: z.string().trim().min(2),
        limit: z.coerce.number().int().min(1).max(80).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    await auth();
    await boot();
    const { listOmieApps, requireOrcamentosOmieApp } = await import("@/server/omie/client");
    const { listOmieProducts } = await import("@/db/products");
    let omieAppId = data.omieAppId?.trim() || "";
    if (!omieAppId) {
      try {
        omieAppId = requireOrcamentosOmieApp().id;
      } catch {
        omieAppId = listOmieApps()[0]?.id ?? "";
      }
    }
    if (!omieAppId) return [];
    return listOmieProducts({
      omieAppId,
      query: data.query,
      limit: data.limit ?? 40,
      activeOnly: true,
    });
  });

export const listOsFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        query: z.string().optional(),
        stage: z.number().int().min(0).max(7).nullable().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    await auth();
    await boot();
    return listOs({ query: data.query, stage: data.stage ?? null });
  });

export const getOsFn = createServerFn({ method: "GET" })
  .validator((input) => z.object({ id: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    await auth();
    await boot();
    return getOsById(data.id);
  });

export const createOsFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        tipo: z.enum(["pedido", "manut", "monit", "visita"]),
        subtipo: z.string().optional().nullable(),
        problemTypeId: z.number().int().positive().optional().nullable(),
        checklistIds: z.array(z.number().int().positive()).optional(),
        clientName: z.string().min(1),
        clientCity: z.string().optional().nullable(),
        clientAddress: z.string().optional().nullable(),
        clientUf: z.string().optional().nullable(),
        clientCep: z.string().optional().nullable(),
        omieAppId: z.string().optional().nullable(),
        clientCode: z.number().optional().nullable(),
        servico: z.string().optional(),
        quoteId: z.number().int().positive().optional().nullable(),
        quoteNumero: z.string().optional().nullable(),
        ticketId: z.number().int().positive().optional().nullable(),
        items: z
          .array(
            z.object({
              qtd: z.number().positive(),
              nome: z.string().min(1),
              productId: z.number().int().positive().optional().nullable(),
            }),
          )
          .optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    if (!isAdmin(user) && !canOsWorkflow(user, "assistencia")) {
      throw new Error("Sem permissão OS · Assistência.");
    }
    return createOs({
      tipo: data.tipo as OsTipo,
      subtipo: data.subtipo,
      problemTypeId: data.problemTypeId,
      checklistIds: data.checklistIds,
      clientName: data.clientName,
      clientCity: data.clientCity,
      clientAddress: data.clientAddress,
      clientUf: data.clientUf,
      clientCep: data.clientCep,
      omieAppId: data.omieAppId,
      clientCode: data.clientCode,
      servico: data.servico,
      quoteId: data.quoteId,
      quoteNumero: data.quoteNumero,
      ticketId: data.ticketId,
      items: data.items,
      createdBy: user.id,
      createdByName: user.name,
    });
  });

export const getCompanyLocationFn = createServerFn({ method: "GET" }).handler(async () => {
  await auth();
  await boot();
  return getCompanyLocation();
});

export const saveCompanyLocationFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        label: z.string().trim().max(120).optional(),
        address: z.string().trim().max(400).optional(),
        city: z.string().trim().max(120).optional(),
        uf: z.string().trim().max(2).optional(),
        cep: z.string().trim().max(12).optional(),
        lat: z.number().nullable().optional(),
        lng: z.number().nullable().optional(),
        geocode: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    if (!isAdmin(user)) {
      throw new Error("Somente administradores podem salvar a base da empresa.");
    }
    return saveCompanyLocation(data);
  });

export const syncOsClientLocationFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        osId: z.number().int().positive(),
        fromOmie: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    if (!isAdmin(user) && !canOsWorkflow(user, "assistencia")) {
      throw new Error("Sem permissão.");
    }
    const os = await syncOsClientLocation(data.osId, { fromOmie: data.fromOmie !== false });
    if (!os) throw new Error("OS não encontrada.");
    return os;
  });

export const advanceOsFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ osId: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const roles = roleFns(user);
    return advanceOs({
      osId: data.osId,
      quem: user.name,
      userId: user.id,
      isAdmin: roles.isAdmin,
      canRole: roles.canRole,
    });
  });

export const deleteOsFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ osId: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    if (!canDeleteOs(user)) {
      throw new Error("Sem permissão para excluir OS.");
    }
    return deleteOs({
      osId: data.osId,
      quem: user.name,
      userId: user.id,
    });
  });

export const moveOsKanbanFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        osId: z.number().int().positive(),
        toStage: z.number().int().min(0).max(7),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const roles = roleFns(user);
    return moveOsOnKanban({
      osId: data.osId,
      toStage: data.toStage,
      quem: user.name,
      userId: user.id,
      isAdmin: roles.isAdmin,
      canRole: roles.canRole,
    });
  });

export const scheduleOsFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        osId: z.number().int().positive(),
        agDate: z.string().min(8),
        periodo: z.string().optional().nullable(),
        hora: z.string().optional().nullable(),
        teamId: z.number().int().positive().optional().nullable(),
        tecnicoNome: z.string().optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const roles = roleFns(user);
    const os = await scheduleOs({
      ...data,
      quem: user.name,
      userId: user.id,
      isAdmin: roles.isAdmin,
      canRole: roles.canRole,
    });
    if (os && data.tecnicoNome?.trim()) {
      try {
        const { notifyTecnicoOsAssigned } = await import("@/server/mobile-push");
        await notifyTecnicoOsAssigned({
          tecnicoNome: data.tecnicoNome,
          osId: os.id,
          osNum: os.num,
          clientName: os.clientName,
          agDate: os.agDate,
          periodo: os.periodo,
        });
      } catch (error) {
        console.error("[scheduleOs] push falhou", error);
      }
    }
    return os;
  });

export const startExecOsFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        osId: z.number().int().positive(),
        materialOk: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const roles = roleFns(user);
    return startExecOs({
      osId: data.osId,
      materialOk: data.materialOk ?? true,
      quem: user.name,
      userId: user.id,
      isAdmin: roles.isAdmin,
      canRole: roles.canRole,
    });
  });

export const materialDivergenceFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        osId: z.number().int().positive(),
        texto: z.string().min(1),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    return markMaterialDivergence({
      osId: data.osId,
      texto: data.texto,
      quem: user.name,
      userId: user.id,
    });
  });

export const checkInOsFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ osId: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const roles = roleFns(user);
    return checkInOs({
      osId: data.osId,
      quem: user.name,
      userId: user.id,
      isAdmin: roles.isAdmin,
      canRole: roles.canRole,
    });
  });

export const pauseOsFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        osId: z.number().int().positive(),
        motivo: z.string().trim().min(1).max(2000),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const roles = roleFns(user);
    return pauseOs({
      osId: data.osId,
      motivo: data.motivo,
      quem: user.name,
      userId: user.id,
      isAdmin: roles.isAdmin,
      canRole: roles.canRole,
    });
  });

export const resumeOsFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ osId: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const roles = roleFns(user);
    return resumeOs({
      osId: data.osId,
      quem: user.name,
      userId: user.id,
      isAdmin: roles.isAdmin,
      canRole: roles.canRole,
    });
  });

const osAnexoSchema = z.object({
  name: z.string().min(1),
  mime: z.string().min(1),
  data: z.string().min(16),
});

export const checkOutOsFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        osId: z.number().int().positive(),
        resolucao: z.string().min(1),
        fotos: z.array(z.string().min(16)).optional(),
        anexos: z.array(osAnexoSchema).optional(),
        assinatura: z.string().min(16).nullable().optional(),
        finalizar: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const roles = roleFns(user);
    return checkOutOs({
      osId: data.osId,
      resolucao: data.resolucao,
      fotos: data.fotos,
      anexos: data.anexos,
      assinatura: data.assinatura,
      finalizar: data.finalizar,
      quem: user.name,
      userId: user.id,
      isAdmin: roles.isAdmin,
      canRole: roles.canRole,
    });
  });

export const saveOsResolucaoFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        osId: z.number().int().positive(),
        resolucao: z.string(),
        fotos: z.array(z.string().min(16)).optional(),
        anexos: z.array(osAnexoSchema).optional(),
        assinatura: z.string().min(16).nullable().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const roles = roleFns(user);
    return saveOsResolucao({
      osId: data.osId,
      resolucao: data.resolucao,
      fotos: data.fotos,
      anexos: data.anexos,
      assinatura: data.assinatura,
      quem: user.name,
      userId: user.id,
      isAdmin: roles.isAdmin,
      canRole: roles.canRole,
    });
  });

export const updateOsItemFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        itemId: z.number().int().positive(),
        status: z.string().min(1),
        previsao: z.string().optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    if (!(OS_ITEM_STATUS as readonly string[]).includes(data.status)) {
      throw new Error("Status de item inválido.");
    }
    return updateOsItemStatus({
      itemId: data.itemId,
      status: data.status as OsItemStatus,
      previsao: data.previsao,
      quem: user.name,
      userId: user.id,
    });
  });

export const addOsItemFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        osId: z.number().int().positive(),
        qtd: z.number().positive(),
        nome: z.string().min(1),
        status: z.string().optional(),
        origem: z.string().optional().nullable(),
        productId: z.number().int().positive().optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    if (
      data.status &&
      !(OS_ITEM_STATUS as readonly string[]).includes(data.status)
    ) {
      throw new Error("Status de item inválido.");
    }
    return addOsItem({
      osId: data.osId,
      qtd: data.qtd,
      nome: data.nome,
      status: data.status as OsItemStatus | undefined,
      origem: data.origem,
      productId: data.productId,
      quem: user.name,
      userId: user.id,
    });
  });

export const receivePurchaseFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ itemId: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    return receivePurchaseItem({
      itemId: data.itemId,
      quem: user.name,
      userId: user.id,
    });
  });

export const submitConferenceFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        osId: z.number().int().positive(),
        rows: z.array(
          z.object({
            id: z.number().int().positive(),
            usou: z.number().min(0),
          }),
        ),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const roles = roleFns(user);
    return submitConference({
      osId: data.osId,
      rows: data.rows,
      quem: user.name,
      userId: user.id,
      isAdmin: roles.isAdmin,
      canRole: roles.canRole,
    });
  });

export const acceptConferenceFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        osId: z.number().int().positive(),
        contest: z.string().optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const roles = roleFns(user);
    return acceptConference({
      osId: data.osId,
      contest: data.contest,
      quem: user.name,
      userId: user.id,
      isAdmin: roles.isAdmin,
      canRole: roles.canRole,
    });
  });

export const markExecutedFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ osId: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const roles = roleFns(user);
    return markExecutedManual({
      osId: data.osId,
      quem: user.name,
      userId: user.id,
      isAdmin: roles.isAdmin,
      canRole: roles.canRole,
    });
  });

export const finishVisitaFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ osId: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const roles = roleFns(user);
    const os = await finishVisita({
      osId: data.osId,
      quem: user.name,
      userId: user.id,
      isAdmin: roles.isAdmin,
      canRole: roles.canRole,
    });
    if (!os) throw new Error("OS não encontrada.");
    if (os.lev && !os.ticketComId) {
      const ticket = await createTicket({
        cat: "levorc",
        clientName: os.clientName,
        omieAppId: os.omieAppId,
        clientCode: os.clientCode,
        descricao: `Levantamento da visita OS ${os.num}`,
        setores: ["com"],
        openedBy: user.id,
        openedByName: user.name,
        lev: {
          origem: os.num,
          obs: os.lev.obs,
          itens: os.lev.itens.map((it) => ({
            qtd: it.qtd,
            nome: it.nome,
            obs: it.obs,
          })),
        },
        codigoRef: os.num,
      });
      if (ticket) {
        await linkOsTicketCom(os.id, ticket.id);
        return getOsById(os.id);
      }
    }
    return os;
  });

export const saveOsLevFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        osId: z.number().int().positive(),
        itens: z.array(
          z.object({
            qtd: z.number().positive(),
            nome: z.string().min(1),
            obs: z.string().optional(),
          }),
        ),
        obs: z.string().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    return saveOsLev({
      osId: data.osId,
      lev: {
        itens: data.itens.map((it) => ({
          qtd: it.qtd,
          nome: it.nome,
          obs: it.obs ?? null,
        })),
        obs: data.obs ?? null,
      },
      quem: user.name,
      userId: user.id,
    });
  });

export const requestReturnFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        osId: z.number().int().positive(),
        toStage: z.number().int().min(0).max(6),
        motivo: z.string().min(1),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const roles = roleFns(user);
    return requestReturnOs({
      osId: data.osId,
      toStage: data.toStage,
      motivo: data.motivo,
      quem: user.name,
      userId: user.id,
      // Admin ou Assistência aplica na hora para o app refletir; demais solicitam.
      applyNow: roles.isAdmin || roles.canRole("assistencia"),
    });
  });

export const resolveReturnFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        osId: z.number().int().positive(),
        approve: z.boolean(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    if (!isAdmin(user)) throw new Error("Somente administrador aprova retorno.");
    return resolveReturnOs({
      osId: data.osId,
      approve: data.approve,
      quem: user.name,
      userId: user.id,
    });
  });

export const reopenOsFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        osId: z.number().int().positive(),
        motivo: z.string().min(1),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const roles = roleFns(user);
    if (!roles.isAdmin && !roles.canRole("assistencia")) {
      throw new Error("Sem permissão para reabrir OS.");
    }
    return reopenOs({
      osId: data.osId,
      motivo: data.motivo,
      quem: user.name,
      userId: user.id,
    });
  });

export const requestMaterialFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        osId: z.number().int().positive(),
        items: z.array(z.object({ qtd: z.number().positive(), nome: z.string().min(1) })).min(1),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const roles = roleFns(user);
    return requestMaterialFromField({
      osId: data.osId,
      items: data.items,
      quem: user.name,
      userId: user.id,
      isAdmin: roles.isAdmin,
      canRole: roles.canRole,
    });
  });

export const searchQuotesFn = createServerFn({ method: "GET" })
  .validator((input) => z.object({ query: z.string() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    await auth();
    await boot();
    return searchQuotesLocal(data.query);
  });

export const getEquipesBootstrapFn = createServerFn({ method: "GET" }).handler(async () => {
  const { user } = await authEquipes();
  await boot();
  if (!canManageEquipes(user)) throw new Error("Sem permissão.");
  const [teams, tecnicos] = await Promise.all([
    listAssistTeams(false),
    listTecnicos(true),
  ]);
  return {
    user: { id: user.id, name: user.name, isAdmin: isAdmin(user) },
    teams,
    tecnicos: tecnicos.map((t) => ({ id: t.id, name: t.name, username: t.username })),
  };
});

export const saveTeamFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive().optional().nullable(),
        name: z.string().min(1),
        active: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await authEquipes();
    await boot();
    if (!canManageEquipes(user)) throw new Error("Sem permissão.");
    await saveAssistTeam(data);
    return listAssistTeams(false);
  });

export const saveTeamMemberFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive().optional().nullable(),
        teamId: z.number().int().positive(),
        name: z.string().min(1),
        userId: z.number().int().positive().optional().nullable(),
        active: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await authEquipes();
    await boot();
    if (!canManageEquipes(user)) throw new Error("Sem permissão.");
    let name = data.name.trim();
    let userId = data.userId ?? null;
    if (userId) {
      const tecnicos = await listTecnicos(false);
      const tech = tecnicos.find((t) => t.id === userId);
      if (!tech) throw new Error("Selecione um usuário marcado como técnico.");
      if (!tech.active) throw new Error("Técnico inativo.");
      name = tech.name;
    }
    await saveAssistTeamMember({
      id: data.id,
      teamId: data.teamId,
      name,
      userId,
      active: data.active,
    });
    return listAssistTeams(false);
  });

export const saveOsMaterialDispositionFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        osId: z.number().int().positive(),
        rows: z
          .array(
            z.object({
              id: z.number().int().positive(),
              usado: z.number().min(0),
              sobraDestino: z.enum(["devolver", "equipe"]).optional().nullable(),
            }),
          )
          .min(1),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const roles = roleFns(user);
    if (!roles.isAdmin && !roles.canRole("assistencia") && !roles.canRole("estoque")) {
      throw new Error("Sem permissão para informar materiais.");
    }
    return saveOsMaterialDisposition({
      osId: data.osId,
      rows: data.rows.map((row) => ({
        id: row.id,
        usado: row.usado,
        sobraDestino: row.sobraDestino ?? null,
      })),
      quem: user.name,
      userId: user.id,
    });
  });

export const resolveOsMaterialBaixaFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        osId: z.number().int().positive(),
        itemIds: z.array(z.number().int().positive()).min(1),
        action: z.enum(["baixar", "ignorar"]),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const roles = roleFns(user);
    if (!roles.isAdmin && !roles.canRole("estoque")) {
      throw new Error("Somente Estoque confirma a baixa.");
    }
    return resolveOsMaterialBaixa({
      osId: data.osId,
      itemIds: data.itemIds,
      action: data.action,
      quem: user.name,
      userId: user.id,
    });
  });

export const listMaterialPendenciasFn = createServerFn({ method: "GET" }).handler(async () => {
  await auth();
  await boot();
  return listMaterialPendencias();
});

export const listAssistProblemTypesFn = createServerFn({ method: "GET" }).handler(async () => {
  await auth();
  await boot();
  const { listProblemTypes } = await import("@/db/assistencia-checklists");
  return listProblemTypes();
});

export const saveAssistProblemTypeFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive().optional().nullable(),
        name: z.string().trim().min(1).max(160),
        active: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    if (!isAdmin(user) && !canOsWorkflow(user, "assistencia")) {
      throw new Error("Sem permissão para configurar problemas.");
    }
    const { saveProblemType, listProblemTypes } = await import("@/db/assistencia-checklists");
    await saveProblemType(data);
    return listProblemTypes();
  });

export const listAssistChecklistsFn = createServerFn({ method: "GET" }).handler(async () => {
  await auth();
  await boot();
  const { listChecklists } = await import("@/db/assistencia-checklists");
  return listChecklists();
});

export const saveAssistChecklistFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive().optional().nullable(),
        name: z.string().trim().min(1).max(160),
        active: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
        problemTypeIds: z.array(z.number().int().positive()).optional(),
        items: z
          .array(
            z.object({
              id: z.number().int().positive().optional().nullable(),
              label: z.string().trim().min(1).max(240),
              required: z.boolean().optional(),
              sortOrder: z.number().int().optional(),
            }),
          )
          .optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    if (!isAdmin(user) && !canOsWorkflow(user, "assistencia")) {
      throw new Error("Sem permissão para configurar checklists.");
    }
    const { saveChecklist, listChecklists } = await import("@/db/assistencia-checklists");
    await saveChecklist(data);
    return listChecklists();
  });

export const deleteAssistChecklistFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z.object({ id: z.number().int().positive() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    if (!isAdmin(user) && !canOsWorkflow(user, "assistencia")) {
      throw new Error("Sem permissão para configurar checklists.");
    }
    const { deleteChecklist, listChecklists } = await import("@/db/assistencia-checklists");
    await deleteChecklist(data.id);
    return listChecklists();
  });

export const listOsChecklistsFn = createServerFn({ method: "GET" })
  .validator((input) => z.object({ osId: z.coerce.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    await auth();
    await boot();
    const { listOsChecklists } = await import("@/db/assistencia-checklists");
    return listOsChecklists(data.osId);
  });

export const setOsProblemTypeFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        osId: z.number().int().positive(),
        problemTypeId: z.number().int().positive().nullable(),
        attachSuggested: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const { setOsProblemType, listOsChecklists } = await import("@/db/assistencia-checklists");
    await setOsProblemType({
      osId: data.osId,
      problemTypeId: data.problemTypeId,
      attachSuggested: data.attachSuggested,
      quem: user.name,
      userId: user.id,
    });
    return {
      os: await getOsById(data.osId),
      checklists: await listOsChecklists(data.osId),
    };
  });

export const attachOsChecklistFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        osId: z.number().int().positive(),
        checklistId: z.number().int().positive(),
        problemTypeId: z.number().int().positive().optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const { attachOsChecklist, listOsChecklists } = await import("@/db/assistencia-checklists");
    await attachOsChecklist({
      osId: data.osId,
      checklistId: data.checklistId,
      problemTypeId: data.problemTypeId,
      quem: user.name,
      userId: user.id,
    });
    return listOsChecklists(data.osId);
  });

export const detachOsChecklistFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z.object({ osChecklistId: z.number().int().positive() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const { detachOsChecklist, listOsChecklists } = await import("@/db/assistencia-checklists");
    const { getDb } = await import("@/db/schema");
    const db = await getDb();
    const rows = (await db`
      select os_id from assist_os_checklists where id = ${data.osChecklistId} limit 1
    `) as Array<{ os_id: number }>;
    await detachOsChecklist({
      osChecklistId: data.osChecklistId,
      quem: user.name,
      userId: user.id,
    });
    const osId = Number(rows[0]?.os_id);
    return osId > 0 ? listOsChecklists(osId) : [];
  });

export const saveOsChecklistAnswersFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        osChecklistId: z.number().int().positive(),
        answers: z
          .array(
            z.object({
              itemId: z.number().int().positive(),
              result: z.enum(["ok", "nok"]),
              note: z.string().max(2000).optional().nullable(),
            }),
          )
          .min(1),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const { saveOsChecklistAnswers } = await import("@/db/assistencia-checklists");
    return saveOsChecklistAnswers({
      osChecklistId: data.osChecklistId,
      answers: data.answers,
      quem: user.name,
      userId: user.id,
    });
  });
