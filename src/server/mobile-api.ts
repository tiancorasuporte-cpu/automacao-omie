import { authenticateUser } from "@/db/users";
import {
  createMobileSession,
  revokeMobileSession,
  upsertMobileDeviceToken,
} from "@/db/mobile";
import {
  assertOsOwnedByTecnico,
  listOsForTecnico,
} from "@/db/mobile-os";
import {
  checkInOs,
  checkOutOs,
  markMaterialDivergence,
  osNeedsMaterialConfirm,
  pauseOs,
  resumeOs,
  startExecOs,
} from "@/db/assistencia";
import { osExecStatus } from "@/lib/assistencia-domain";
import {
  createReading,
  createRefueling,
  createService,
  ensureFleetCatalogDefaults,
  ensureFleetDriverForUser,
  getFleetVehicleById,
  listFleetCatalog,
  listVehicleHistory,
} from "@/db/frota";
import { ensureSchema, type AppUser } from "@/db/schema";
import {
  jsonError,
  jsonOk,
  mobileOsRoles,
  readJsonBody,
  requireMobileTecnico,
} from "@/server/mobile-auth";

function publicUser(user: AppUser) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    isTecnico: user.isTecnico,
    defaultVehicleId: user.defaultVehicleId,
  };
}

function serializeOs(
  os: Awaited<ReturnType<typeof assertOsOwnedByTecnico>> extends {
    ok: true;
    os: infer O;
  }
    ? O
    : never,
  options: { includeRel?: boolean } = {},
) {
  const needsMaterialConfirm = osNeedsMaterialConfirm(os);
  const exec = osExecStatus({
    stage: os.stage,
    ciAt: os.ciAt,
    coAt: os.coAt,
    pausedAt: os.pausedAt,
    needsMaterialConfirm,
  });
  const base = {
    id: os.id,
    num: os.num,
    tipo: os.tipo,
    subtipo: os.subtipo,
    stage: os.stage,
    clientName: os.clientName,
    clientCity: os.clientCity,
    clientAddress: os.clientAddress,
    servico: os.servico,
    teamId: os.teamId,
    teamName: os.teamName ?? null,
    tecnicoNome: os.tecnicoNome,
    agDate: os.agDate,
    periodo: os.periodo,
    hora: os.hora,
    ciAt: os.ciAt,
    coAt: os.coAt,
    pausedAt: os.pausedAt,
    pauseMotivo: os.pauseMotivo,
    resolucao: os.resolucao,
    problemTypeId: os.problemTypeId ?? null,
    problemTypeName: os.problemTypeName ?? null,
    fotosCount: os.rel?.fotos.length ?? 0,
    anexosCount: os.rel?.anexos.length ?? 0,
    hasAssinatura: Boolean(os.rel?.assinatura),
    needsMaterialConfirm,
    execStatus: exec.key,
    execStatusLabel: exec.label,
    envio: os.envio
      ? {
          equipe: os.envio.equipe,
          quando: os.envio.quando,
          div: os.envio.div ?? null,
        }
      : null,
    items: os.items.map((i) => ({
      id: i.id,
      qtd: i.qtd,
      nome: i.nome,
      status: i.status,
      productId: i.productId,
      usado: i.usado,
      sobraDestino: i.sobraDestino,
    })),
    events: (os.events ?? []).map((e) => ({
      id: e.id,
      quem: e.quem,
      acao: e.acao,
      quando: e.quando,
    })),
    updatedAt: os.updatedAt,
  };
  if (!options.includeRel) return base;
  return {
    ...base,
    rel: os.rel
      ? {
          texto: os.rel.texto,
          fotos: os.rel.fotos,
          anexos: os.rel.anexos,
          assinatura: os.rel.assinatura,
        }
      : null,
  };
}

export async function handleMobileLogin(request: Request) {
  await ensureSchema();
  const body = await readJsonBody<{ username?: string; password?: string }>(request);
  const username = body?.username?.trim() ?? "";
  const password = body?.password ?? "";
  if (!username || !password) {
    return jsonError("Informe usuário e senha.");
  }
  const user = await authenticateUser(username, password);
  if (!user) return jsonError("Usuário ou senha inválidos.", 401);
  if (!user.isTecnico) {
    return jsonError("Acesso restrito a técnicos.", 403);
  }
  const session = await createMobileSession(user.id);
  return jsonOk({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    user: publicUser(user),
  });
}

export async function handleMobileLogout(request: Request) {
  const auth = await requireMobileTecnico(request);
  if (!auth.ok) {
    // ainda assim tenta limpar se houver bearer inválido
    return jsonOk({ ok: true });
  }
  await revokeMobileSession(auth.token);
  return jsonOk({ ok: true });
}

async function listTeamsForTecnico(userId: number) {
  const { getDb } = await import("@/db/schema");
  const db = await getDb();
  const rows = await db<{ id: number; name: string }[]>`
    select distinct t.id, t.name
    from assist_teams t
    join assist_team_members m on m.team_id = t.id
    where m.user_id = ${userId}
      and coalesce(m.active, true) = true
      and coalesce(t.active, true) = true
    order by t.name asc
  `;
  return rows.map((r) => ({ id: Number(r.id), name: String(r.name) }));
}

export async function handleMobileMe(request: Request) {
  await ensureSchema();
  const auth = await requireMobileTecnico(request);
  if (!auth.ok) return auth.response;
  let vehicle = null;
  if (auth.user.defaultVehicleId) {
    vehicle = await getFleetVehicleById(auth.user.defaultVehicleId);
  }
  const teams = await listTeamsForTecnico(auth.user.id);
  return jsonOk({
    ok: true,
    user: publicUser(auth.user),
    vehicle,
    teams,
  });
}

export async function handleMobileEstoque(request: Request) {
  await ensureSchema();
  const auth = await requireMobileTecnico(request);
  if (!auth.ok) return auth.response;
  const teams = await listTeamsForTecnico(auth.user.id);
  if (!teams.length) {
    return jsonOk({ ok: true, teams: [], items: [], pendentes: [] });
  }
  const { listTeamStock } = await import("@/db/team-stock");
  const { listPendingMatSaidasForTeams } = await import("@/db/mat-saidas");
  const [items, pendentes] = await Promise.all([
    Promise.all(teams.map((t) => listTeamStock({ teamId: t.id }))).then((rows) =>
      rows.flat(),
    ),
    listPendingMatSaidasForTeams(teams.map((t) => t.id)),
  ]);
  return jsonOk({
    ok: true,
    teams,
    items,
    pendentes: pendentes.map((s) => ({
      id: s.id,
      num: s.num,
      destino: s.destino,
      teamId: s.teamId,
      teamName: s.teamName,
      tecnicoNome: s.tecnicoNome,
      osId: s.osId,
      osNum: s.osNum,
      status: s.status,
      createdAt: s.createdAt,
      itens: s.itens.map((i) => ({
        id: i.id,
        productId: i.productId,
        nome: i.nome,
        qtd: i.qtd,
      })),
    })),
  });
}

export async function handleMobileConfirmMatSaida(request: Request) {
  await ensureSchema();
  const auth = await requireMobileTecnico(request);
  if (!auth.ok) return auth.response;
  const body = await readJsonBody<{ saidaId?: number }>(request);
  const saidaId = Number(body?.saidaId);
  if (!Number.isFinite(saidaId) || saidaId <= 0) {
    return jsonError("Saída inválida.");
  }
  const teams = await listTeamsForTecnico(auth.user.id);
  if (!teams.length) return jsonError("Técnico sem equipe vinculada.");
  try {
    const { confirmMatSaida } = await import("@/db/mat-saidas");
    const saida = await confirmMatSaida({
      saidaId,
      userId: auth.user.id,
      userName: auth.user.name,
      allowedTeamIds: teams.map((t) => t.id),
    });
    return jsonOk({
      ok: true,
      saida: {
        id: saida.id,
        num: saida.num,
        status: saida.status,
        confirmedAt: saida.confirmedAt,
        confirmedByName: saida.confirmedByName,
      },
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Falha ao confirmar recebimento.",
    );
  }
}

export async function handleMobileUsarEstoque(
  request: Request,
  osId: number,
) {
  return withOwnedOs(request, osId, async (user, ownedOs) => {
    const body = await readJsonBody<{
      productId?: number;
      quantidade?: number;
      teamId?: number;
    }>(request);
    const productId = Number(body?.productId);
    const quantidade = Number(body?.quantidade ?? 1);
    if (!Number.isFinite(productId) || productId <= 0) {
      return jsonError("Produto inválido.");
    }
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      return jsonError("Quantidade inválida.");
    }
    if (ownedOs.stage !== 5) {
      return jsonError("Só é possível usar estoque com a O.S. em execução.");
    }

    const teams = await listTeamsForTecnico(user.id);
    const teamId =
      Number(body?.teamId) ||
      ownedOs.teamId ||
      teams[0]?.id ||
      null;
    if (!teamId) return jsonError("Técnico sem equipe vinculada.");
    if (!teams.some((t) => t.id === teamId) && ownedOs.teamId !== teamId) {
      return jsonError("Equipe não autorizada.");
    }

    const { getDb } = await import("@/db/schema");
    const { creditTeamStock, debitTeamStock, teamStockTransaction } =
      await import("@/db/team-stock");
    const { addOsItem } = await import("@/db/assistencia");
    const db = await getDb();

    const [stockRow] = (await db`
      select nome from team_stock
      where team_id = ${teamId} and product_id = ${productId}
      limit 1
    `) as { nome: string }[];
    if (!stockRow) throw new Error("Produto sem saldo no estoque da equipe.");
    const productName = String(stockRow.nome);

    await teamStockTransaction(db, async (tx) => {
      await debitTeamStock(tx, {
        teamId,
        productId,
        quantidade,
        tipo: "aplicado_os",
        tecnicoNome: user.name,
        osId,
        motivo: `Usado na OS ${ownedOs.num} (app técnico)`,
        userId: user.id,
        userName: user.name,
      });
    });

    try {
      const os = await addOsItem({
        osId,
        qtd: quantidade,
        nome: productName,
        status: "extra",
        origem: "estoque_equipe",
        productId,
        quem: user.name,
        userId: user.id,
      });
      return jsonOk({ ok: true, os: serializeOs(os!) });
    } catch (error) {
      await teamStockTransaction(db, async (tx) => {
        await creditTeamStock(tx, {
          teamId,
          productId,
          nome: productName,
          quantidade,
          tipo: "ajuste",
          tecnicoNome: user.name,
          osId,
          motivo: `Rollback uso estoque · OS ${ownedOs.num}`,
          userId: user.id,
          userName: user.name,
        });
      }).catch(() => undefined);
      throw error;
    }
  });
}

export async function handleMobileDeviceToken(request: Request) {
  await ensureSchema();
  const auth = await requireMobileTecnico(request);
  if (!auth.ok) return auth.response;
  const body = await readJsonBody<{
    expoPushToken?: string;
    platform?: string;
  }>(request);
  if (!body?.expoPushToken?.trim()) {
    return jsonError("expoPushToken obrigatório.");
  }
  await upsertMobileDeviceToken({
    userId: auth.user.id,
    expoPushToken: body.expoPushToken,
    platform: body.platform,
  });
  return jsonOk({ ok: true });
}

export async function handleMobileListOs(request: Request) {
  await ensureSchema();
  const auth = await requireMobileTecnico(request);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const stageRaw = url.searchParams.get("stage");
  const stage = stageRaw ? Number(stageRaw) : null;
  const list = await listOsForTecnico({
    userId: auth.user.id,
    userName: auth.user.name,
    stage: Number.isFinite(stage as number) ? stage : null,
  });
  return jsonOk({
    ok: true,
    items: list.map((os) => serializeOs(os)),
  });
}

export async function handleMobileGetOs(request: Request, osId: number) {
  await ensureSchema();
  const auth = await requireMobileTecnico(request);
  if (!auth.ok) return auth.response;
  const owned = await assertOsOwnedByTecnico(osId, auth.user);
  if (!owned.ok) return jsonError(owned.error, 404);
  const { listOsChecklists } = await import("@/db/assistencia-checklists");
  const checklists = await listOsChecklists(osId);
  return jsonOk({
    ok: true,
    os: serializeOs(owned.os, { includeRel: true }),
    checklists,
  });
}

export async function handleMobileSaveOsChecklist(request: Request, osId: number) {
  return withOwnedOs(request, osId, async (user) => {
    const body = await readJsonBody<{
      osChecklistId?: number;
      answers?: Array<{ itemId: number; result: "ok" | "nok"; note?: string | null }>;
    }>(request);
    const osChecklistId = Number(body?.osChecklistId);
    if (!Number.isFinite(osChecklistId) || osChecklistId <= 0) {
      return jsonError("Checklist inválido.");
    }
    const answers = Array.isArray(body?.answers) ? body!.answers! : [];
    if (!answers.length) return jsonError("Informe as respostas do checklist.");
    const { getDb } = await import("@/db/schema");
    const db = await getDb();
    const ownedCl = (await db`
      select id from assist_os_checklists
      where id = ${osChecklistId} and os_id = ${osId}
      limit 1
    `) as Array<{ id: number }>;
    if (!ownedCl[0]) return jsonError("Checklist não pertence a esta OS.");

    const { saveOsChecklistAnswers } = await import("@/db/assistencia-checklists");
    const checklists = await saveOsChecklistAnswers({
      osChecklistId,
      answers: answers.map((a) => ({
        itemId: Number(a.itemId),
        result: a.result,
        note: a.note,
      })),
      quem: user.name,
      userId: user.id,
    });
    return jsonOk({ ok: true, checklists });
  });
}

async function withOwnedOs(
  request: Request,
  osId: number,
  run: (
    user: AppUser,
    os: NonNullable<Awaited<ReturnType<typeof assertOsOwnedByTecnico>> extends { ok: true; os: infer O } ? O : never>,
  ) => Promise<Response>,
) {
  await ensureSchema();
  const auth = await requireMobileTecnico(request);
  if (!auth.ok) return auth.response;
  const owned = await assertOsOwnedByTecnico(osId, auth.user);
  if (!owned.ok) return jsonError(owned.error, 404);
  try {
    return await run(auth.user, owned.os);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha na operação.");
  }
}

export async function handleMobileStartOs(request: Request, osId: number) {
  return withOwnedOs(request, osId, async (user, ownedOs) => {
    const body = await readJsonBody<{ materialOk?: boolean; divergencia?: string }>(
      request,
    );
    const roles = mobileOsRoles(user);
    const hasItems = ownedOs.items.length > 0;
    const confirmOk = body?.materialOk === true;

    // Com material: técnico precisa confirmar equipamentos explicitamente.
    if (hasItems && !confirmOk) {
      let os = ownedOs;
      if (ownedOs.stage === 4) {
        os =
          (await startExecOs({
            osId,
            materialOk: false,
            quem: user.name,
            userId: user.id,
            isAdmin: roles.isAdmin,
            canRole: roles.canRole,
          })) ?? ownedOs;
      }
      if (body?.divergencia?.trim()) {
        os =
          (await markMaterialDivergence({
            osId,
            texto: body.divergencia.trim(),
            quem: user.name,
            userId: user.id,
          })) ?? os;
      }
      return jsonOk({
        ok: true,
        needsMaterialConfirm: true,
        os: serializeOs(os!),
      });
    }

    const os = await startExecOs({
      osId,
      materialOk: true,
      quem: user.name,
      userId: user.id,
      isAdmin: roles.isAdmin,
      canRole: roles.canRole,
    });
    return jsonOk({
      ok: true,
      needsMaterialConfirm: false,
      os: serializeOs(os!),
    });
  });
}

export async function handleMobileCheckInOs(request: Request, osId: number) {
  return withOwnedOs(request, osId, async (user) => {
    const roles = mobileOsRoles(user);
    const os = await checkInOs({
      osId,
      quem: user.name,
      userId: user.id,
      isAdmin: roles.isAdmin,
      canRole: roles.canRole,
    });
    return jsonOk({ ok: true, os: serializeOs(os!) });
  });
}

export async function handleMobilePauseOs(request: Request, osId: number) {
  return withOwnedOs(request, osId, async (user) => {
    const body = await readJsonBody<{ motivo?: string }>(request);
    const roles = mobileOsRoles(user);
    const os = await pauseOs({
      osId,
      motivo: body?.motivo ?? "",
      quem: user.name,
      userId: user.id,
      isAdmin: roles.isAdmin,
      canRole: roles.canRole,
    });
    return jsonOk({ ok: true, os: serializeOs(os!) });
  });
}

export async function handleMobileResumeOs(request: Request, osId: number) {
  return withOwnedOs(request, osId, async (user) => {
    const roles = mobileOsRoles(user);
    const os = await resumeOs({
      osId,
      quem: user.name,
      userId: user.id,
      isAdmin: roles.isAdmin,
      canRole: roles.canRole,
    });
    return jsonOk({ ok: true, os: serializeOs(os!) });
  });
}

export async function handleMobileCheckOutOs(request: Request, osId: number) {
  return withOwnedOs(request, osId, async (user) => {
    const body = await readJsonBody<{
      resolucao?: string;
      fotos?: string[];
      anexos?: Array<{ name: string; mime: string; data: string }>;
      assinatura?: string | null;
      finalizar?: boolean;
      clientActionId?: string;
    }>(request);
    const roles = mobileOsRoles(user);
    const os = await checkOutOs({
      osId,
      resolucao: body?.resolucao ?? "",
      fotos: body?.fotos,
      anexos: body?.anexos,
      assinatura: body?.assinatura,
      finalizar: body?.finalizar !== false,
      quem: user.name,
      userId: user.id,
      isAdmin: roles.isAdmin,
      canRole: roles.canRole,
    });
    return jsonOk({
      ok: true,
      os: serializeOs(os!, { includeRel: true }),
      clientActionId: body?.clientActionId ?? null,
    });
  });
}

export async function handleMobileFrotaVeiculo(request: Request) {
  await ensureSchema();
  const auth = await requireMobileTecnico(request);
  if (!auth.ok) return auth.response;
  if (!auth.user.defaultVehicleId) {
    return jsonOk({ ok: true, vehicle: null, catalog: null, history: [] });
  }
  await ensureFleetCatalogDefaults();
  const vehicle = await getFleetVehicleById(auth.user.defaultVehicleId);
  const [fuel, service, payment] = await Promise.all([
    listFleetCatalog("fuel"),
    listFleetCatalog("service"),
    listFleetCatalog("payment"),
  ]);
  const history = vehicle
    ? await listVehicleHistory(vehicle.id, 40)
    : [];
  return jsonOk({
    ok: true,
    vehicle,
    catalog: { fuel, service, payment },
    history,
  });
}

async function requireDefaultVehicle(user: AppUser) {
  if (!user.defaultVehicleId) {
    throw new Error("Nenhum veículo setado na frota para o seu usuário.");
  }
  const vehicle = await getFleetVehicleById(user.defaultVehicleId);
  if (!vehicle || !vehicle.active) {
    throw new Error("Veículo da frota indisponível.");
  }
  return vehicle;
}

export async function handleMobileFrotaKm(request: Request) {
  await ensureSchema();
  const auth = await requireMobileTecnico(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await readJsonBody<{
      odometer?: number;
      occurredAt?: string;
      reason?: string;
      kind?: string;
      notes?: string;
      clientActionId?: string;
    }>(request);
    const vehicle = await requireDefaultVehicle(auth.user);
    const driver = await ensureFleetDriverForUser(auth.user);
    const kindRaw = String(body?.kind ?? "daily_km").trim().toLowerCase();
    const kind =
      kindRaw === "entrada" || kindRaw === "saida" || kindRaw === "saída"
        ? kindRaw === "saída"
          ? "saida"
          : kindRaw
        : "daily_km";
    const defaultReason =
      kind === "entrada" ? "Entrada" : kind === "saida" ? "Saída" : "Lançamento app técnico";
    const id = await createReading({
      vehicleId: vehicle.id,
      driverId: driver.id,
      occurredAt: body?.occurredAt || new Date().toISOString(),
      odometer: Number(body?.odometer),
      kind,
      reason: body?.reason?.trim() || defaultReason,
      notes: body?.notes ?? null,
      createdBy: auth.user.id,
    });
    return jsonOk({ ok: true, id, clientActionId: body?.clientActionId ?? null });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao lançar KM.");
  }
}

export async function handleMobileFrotaAbastecimento(request: Request) {
  await ensureSchema();
  const auth = await requireMobileTecnico(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await readJsonBody<{
      odometer?: number;
      occurredAt?: string;
      fuelType?: string;
      pricePerLiter?: number;
      totalAmount?: number;
      liters?: number;
      fullTank?: boolean;
      station?: string;
      paymentMethod?: string;
      notes?: string;
      photos?: Array<{ foto?: string; thumb?: string }>;
      clientActionId?: string;
    }>(request);
    const vehicle = await requireDefaultVehicle(auth.user);
    const driver = await ensureFleetDriverForUser(auth.user);
    const liters = Number(body?.liters);
    const totalAmount = Number(body?.totalAmount);
    const pricePerLiter =
      body?.pricePerLiter != null
        ? Number(body.pricePerLiter)
        : liters > 0
          ? totalAmount / liters
          : 0;
    const photos = (Array.isArray(body?.photos) ? body!.photos! : [])
      .filter((p) => typeof p?.foto === "string" && p.foto.length > 16)
      .slice(0, 6)
      .map((p) => ({
        foto: String(p.foto),
        thumb:
          typeof p.thumb === "string" && p.thumb.length > 16
            ? String(p.thumb)
            : String(p.foto),
      }));
    const id = await createRefueling({
      vehicleId: vehicle.id,
      driverId: driver.id,
      occurredAt: body?.occurredAt || new Date().toISOString(),
      odometer: Number(body?.odometer),
      fuelType: body?.fuelType?.trim() || "Gas. Comum",
      pricePerLiter,
      totalAmount,
      liters,
      fullTank: body?.fullTank ?? false,
      station: body?.station ?? null,
      reason: null,
      paymentMethod: body?.paymentMethod ?? null,
      discount: 0,
      previousMissing: false,
      notes: body?.notes ?? null,
      photos,
      createdBy: auth.user.id,
    });
    return jsonOk({ ok: true, id, clientActionId: body?.clientActionId ?? null });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Falha ao lançar abastecimento.",
    );
  }
}

export async function handleMobileFrotaServico(request: Request) {
  await ensureSchema();
  const auth = await requireMobileTecnico(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await readJsonBody<{
      odometer?: number | null;
      occurredAt?: string;
      title?: string;
      serviceType?: string;
      amount?: number;
      location?: string;
      paymentMethod?: string;
      notes?: string;
      clientActionId?: string;
    }>(request);
    const vehicle = await requireDefaultVehicle(auth.user);
    const driver = await ensureFleetDriverForUser(auth.user);
    const id = await createService({
      vehicleId: vehicle.id,
      driverId: driver.id,
      occurredAt: body?.occurredAt || new Date().toISOString(),
      odometer: body?.odometer == null ? null : Number(body.odometer),
      title: body?.title ?? null,
      serviceType: body?.serviceType?.trim() || "Outros",
      amount: Number(body?.amount ?? 0),
      discount: 0,
      installments: null,
      location: body?.location ?? null,
      paymentMethod: body?.paymentMethod ?? null,
      notes: body?.notes ?? null,
      createdBy: auth.user.id,
    });
    return jsonOk({ ok: true, id, clientActionId: body?.clientActionId ?? null });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao lançar serviço.");
  }
}

export async function handleMobileSyncBatch(request: Request) {
  await ensureSchema();
  const auth = await requireMobileTecnico(request);
  if (!auth.ok) return auth.response;
  const body = await readJsonBody<{
    actions?: Array<{
      id: string;
      type: string;
      osId?: number;
      payload?: Record<string, unknown>;
      createdAt?: string;
    }>;
  }>(request);
  const actions = body?.actions ?? [];
  const results: Array<{
    id: string;
    ok: boolean;
    error?: string;
    data?: unknown;
  }> = [];

  for (const action of actions) {
    try {
      const res = await applySyncAction(auth.user, action);
      results.push({ id: action.id, ok: true, data: res });
    } catch (error) {
      results.push({
        id: action.id,
        ok: false,
        error: error instanceof Error ? error.message : "Falha",
      });
    }
  }
  return jsonOk({ ok: true, results });
}

async function applySyncAction(
  user: AppUser,
  action: {
    id: string;
    type: string;
    osId?: number;
    payload?: Record<string, unknown>;
  },
) {
  const roles = mobileOsRoles(user);
  const payload = action.payload ?? {};

  if (action.type.startsWith("os_")) {
    if (!action.osId) throw new Error("osId obrigatório.");
    const owned = await assertOsOwnedByTecnico(action.osId, user);
    if (!owned.ok) throw new Error(owned.error);

    if (action.type === "os_start") {
      const hasItems = owned.os.items.length > 0;
      const materialOk = payload.materialOk === true || !hasItems;
      return serializeOs(
        (await startExecOs({
          osId: action.osId,
          materialOk,
          quem: user.name,
          userId: user.id,
          isAdmin: roles.isAdmin,
          canRole: roles.canRole,
        }))!,
      );
    }
    if (action.type === "os_check_in") {
      return serializeOs(
        (await checkInOs({
          osId: action.osId,
          quem: user.name,
          userId: user.id,
          isAdmin: roles.isAdmin,
          canRole: roles.canRole,
        }))!,
      );
    }
    if (action.type === "os_pause") {
      return serializeOs(
        (await pauseOs({
          osId: action.osId,
          motivo: String(payload.motivo ?? ""),
          quem: user.name,
          userId: user.id,
          isAdmin: roles.isAdmin,
          canRole: roles.canRole,
        }))!,
      );
    }
    if (action.type === "os_resume") {
      return serializeOs(
        (await resumeOs({
          osId: action.osId,
          quem: user.name,
          userId: user.id,
          isAdmin: roles.isAdmin,
          canRole: roles.canRole,
        }))!,
      );
    }
    if (action.type === "os_check_out") {
      return serializeOs(
        (await checkOutOs({
          osId: action.osId,
          resolucao: String(payload.resolucao ?? ""),
          fotos: Array.isArray(payload.fotos)
            ? (payload.fotos as string[])
            : undefined,
          anexos: Array.isArray(payload.anexos)
            ? (payload.anexos as Array<{ name: string; mime: string; data: string }>)
            : undefined,
          assinatura:
            payload.assinatura == null ? null : String(payload.assinatura),
          finalizar: payload.finalizar !== false,
          quem: user.name,
          userId: user.id,
          isAdmin: roles.isAdmin,
          canRole: roles.canRole,
        }))!,
        { includeRel: true },
      );
    }
    throw new Error(`Ação O.S. desconhecida: ${action.type}`);
  }

  if (action.type === "frota_km" || action.type === "frota_abastecimento" || action.type === "frota_servico") {
    const vehicle = await requireDefaultVehicle(user);
    const driver = await ensureFleetDriverForUser(user);
    if (action.type === "frota_km") {
      const kindRaw = String(payload.kind ?? "daily_km").trim().toLowerCase();
      const kind =
        kindRaw === "entrada" || kindRaw === "saida" || kindRaw === "saída"
          ? kindRaw === "saída"
            ? "saida"
            : kindRaw
          : "daily_km";
      const defaultReason =
        kind === "entrada"
          ? "Entrada"
          : kind === "saida"
            ? "Saída"
            : "Lançamento offline app técnico";
      const id = await createReading({
        vehicleId: vehicle.id,
        driverId: driver.id,
        occurredAt: String(payload.occurredAt || new Date().toISOString()),
        odometer: Number(payload.odometer),
        kind,
        reason: String(payload.reason || defaultReason),
        notes: payload.notes == null ? null : String(payload.notes),
        createdBy: user.id,
      });
      return { id };
    }
    if (action.type === "frota_abastecimento") {
      const liters = Number(payload.liters);
      const totalAmount = Number(payload.totalAmount);
      const pricePerLiter =
        payload.pricePerLiter != null
          ? Number(payload.pricePerLiter)
          : liters > 0
            ? totalAmount / liters
            : 0;
      const id = await createRefueling({
        vehicleId: vehicle.id,
        driverId: driver.id,
        occurredAt: String(payload.occurredAt || new Date().toISOString()),
        odometer: Number(payload.odometer),
        fuelType: String(payload.fuelType || "Gas. Comum"),
        pricePerLiter,
        totalAmount,
        liters,
        fullTank: Boolean(payload.fullTank),
        station: payload.station == null ? null : String(payload.station),
        reason: null,
        paymentMethod:
          payload.paymentMethod == null ? null : String(payload.paymentMethod),
        discount: 0,
        previousMissing: false,
        notes: payload.notes == null ? null : String(payload.notes),
        photos: (Array.isArray(payload.photos) ? payload.photos : [])
          .filter(
            (p): p is { foto: string; thumb: string } =>
              !!p &&
              typeof p === "object" &&
              typeof (p as { foto?: string }).foto === "string" &&
              String((p as { foto: string }).foto).length > 16,
          )
          .slice(0, 6)
          .map((p) => ({
            foto: String(p.foto),
            thumb:
              typeof (p as { thumb?: string }).thumb === "string" &&
              String((p as { thumb: string }).thumb).length > 16
                ? String((p as { thumb: string }).thumb)
                : String(p.foto),
          })),
        createdBy: user.id,
      });
      return { id };
    }
    const id = await createService({
      vehicleId: vehicle.id,
      driverId: driver.id,
      occurredAt: String(payload.occurredAt || new Date().toISOString()),
      odometer: payload.odometer == null ? null : Number(payload.odometer),
      title: payload.title == null ? null : String(payload.title),
      serviceType: String(payload.serviceType || "Outros"),
      amount: Number(payload.amount ?? 0),
      discount: 0,
      installments: null,
      location: payload.location == null ? null : String(payload.location),
      paymentMethod:
        payload.paymentMethod == null ? null : String(payload.paymentMethod),
      notes: payload.notes == null ? null : String(payload.notes),
      createdBy: user.id,
    });
    return { id };
  }

  throw new Error(`Ação desconhecida: ${action.type}`);
}
