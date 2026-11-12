import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";
import { getSetting, setSetting } from "@/db/settings";
import {
  entryStageForTipo,
  isDirectOsTipo,
  OS_LAST_STAGE,
  OS_STAGES,
  type OsItemStatus,
  type OsTipo,
} from "@/lib/assistencia-domain";
import type { OsWorkflowRole } from "@/lib/require-auth";

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown) {
  return v == null ? "" : String(v);
}

function nullableStr(v: unknown) {
  const s = str(v).trim();
  return s || null;
}

function parseJson<T>(raw: unknown): T | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "object") return raw as T;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return null;
  }
}

export type AssistTeam = {
  id: number;
  name: string;
  active: boolean;
  members: Array<{ id: number; name: string; userId: number | null; active: boolean }>;
};

export type AssistOsItem = {
  id: number;
  osId: number;
  qtd: number;
  nome: string;
  status: OsItemStatus;
  previsao: string | null;
  origem: string | null;
  equipe: string | null;
  usado: number | null;
  devolvido: number | null;
  productId: number | null;
  sobraDestino: "devolver" | "equipe" | null;
  baixaStatus: "pendente" | "feita" | "ignorada" | null;
  baixaQtd: number | null;
  sortOrder: number;
};

export type AssistOsEvent = {
  id: number;
  quando: string;
  quem: string;
  userId: number | null;
  acao: string;
};

export type AssistOsPending = {
  to: number;
  motivo: string;
  by: string;
  quando: string;
};

export type AssistOsEnvio = {
  equipe: string;
  quando: string;
  troca?: boolean;
  div?: string | null;
};

export type AssistOsConf = {
  itens: Array<{ id: number; nome: string; saiu: number; usou: number; volta: number }>;
  resumo?: string;
  estoque: string;
  quando: string;
  contest?: string | null;
};

export type AssistOs = {
  id: number;
  num: string;
  tipo: OsTipo | string;
  subtipo: string | null;
  stage: number;
  omieAppId: string | null;
  clientCode: number | null;
  clientName: string;
  clientCity: string | null;
  clientAddress: string | null;
  servico: string;
  quoteId: number | null;
  quoteNumero: string | null;
  ticketId: number | null;
  ticketComId: number | null;
  teamId: number | null;
  tecnicoNome: string | null;
  agDate: string | null;
  periodo: string | null;
  hora: string | null;
  prevista: boolean;
  ciAt: string | null;
  coAt: string | null;
  /** Quando a OS está pausada em execução (após check-in). */
  pausedAt: string | null;
  pauseMotivo: string | null;
  resolucao: string | null;
  finDate: string | null;
  envio: AssistOsEnvio | null;
  pending: AssistOsPending | null;
  conf: AssistOsConf | null;
  confBy: { estoque: string; tecnico: string } | null;
  lev: {
    itens: Array<{ qtd: number; nome: string; obs: string | null }>;
    obs: string | null;
  } | null;
  rel: {
    texto: string;
    fotos: string[];
    anexos: Array<{ name: string; mime: string; data: string }>;
    /** Assinatura do cliente (data URL). */
    assinatura: string | null;
  } | null;
  fromCompras: boolean;
  fromTecnico: boolean;
  /** Quem aprovou o orçamento / pedido (quando veio do Comercial). */
  aprovadoPor: string | null;
  aprovadoEm: string | null;
  aprovacaoAnexo: { name: string; mime: string; data: string } | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  items: AssistOsItem[];
  events: AssistOsEvent[];
  teamName: string | null;
};

function iso(v: unknown) {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const s = str(v);
  return s || null;
}

function dateOnly(v: unknown) {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = str(v);
  return s ? s.slice(0, 10) : null;
}

function mapItem(row: Record<string, unknown>): AssistOsItem {
  const sobra = nullableStr(row["sobra_destino"]);
  const baixa = nullableStr(row["baixa_status"]);
  return {
    id: num(row["id"]),
    osId: num(row["os_id"]),
    qtd: num(row["qtd"]),
    nome: str(row["nome"]),
    status: str(row["status"]) as OsItemStatus,
    previsao: dateOnly(row["previsao"]),
    origem: nullableStr(row["origem"]),
    equipe: nullableStr(row["equipe"]),
    usado: row["usado"] == null ? null : num(row["usado"]),
    devolvido: row["devolvido"] == null ? null : num(row["devolvido"]),
    productId: row["product_id"] == null ? null : num(row["product_id"]),
    sobraDestino: sobra === "devolver" || sobra === "equipe" ? sobra : null,
    baixaStatus:
      baixa === "pendente" || baixa === "feita" || baixa === "ignorada" ? baixa : null,
    baixaQtd: row["baixa_qtd"] == null ? null : num(row["baixa_qtd"]),
    sortOrder: num(row["sort_order"]),
  };
}

function mapEvent(row: Record<string, unknown>): AssistOsEvent {
  return {
    id: num(row["id"]),
    quando: iso(row["quando"]) ?? "",
    quem: str(row["quem"]),
    userId: row["user_id"] == null ? null : num(row["user_id"]),
    acao: str(row["acao"]),
  };
}

function mapOs(row: Record<string, unknown>, items: AssistOsItem[] = []): AssistOs {
  return {
    id: num(row["id"]),
    num: str(row["num"]),
    tipo: str(row["tipo"]),
    subtipo: nullableStr(row["subtipo"]),
    stage: num(row["stage"]),
    omieAppId: nullableStr(row["omie_app_id"]),
    clientCode: row["client_code"] == null ? null : num(row["client_code"]),
    clientName: str(row["client_name"]),
    clientCity: nullableStr(row["client_city"]),
    clientAddress: nullableStr(row["client_address"]),
    servico: str(row["servico"]),
    quoteId: row["quote_id"] == null ? null : num(row["quote_id"]),
    quoteNumero: nullableStr(row["quote_numero"]),
    ticketId: row["ticket_id"] == null ? null : num(row["ticket_id"]),
    ticketComId: row["ticket_com_id"] == null ? null : num(row["ticket_com_id"]),
    teamId: row["team_id"] == null ? null : num(row["team_id"]),
    tecnicoNome: nullableStr(row["tecnico_nome"]),
    agDate: dateOnly(row["ag_date"]),
    periodo: nullableStr(row["periodo"]),
    hora: nullableStr(row["hora"]),
    prevista: Boolean(row["prevista"]),
    ciAt: iso(row["ci_at"]),
    coAt: iso(row["co_at"]),
    pausedAt: iso(row["paused_at"]),
    pauseMotivo: nullableStr(row["pause_motivo"]),
    resolucao: nullableStr(row["resolucao"]),
    finDate: dateOnly(row["fin_date"]),
    envio: parseJson<AssistOsEnvio>(row["envio_json"]),
    pending: parseJson<AssistOsPending>(row["pending_json"]),
    conf: parseJson<AssistOsConf>(row["conf_json"]),
    confBy: parseJson<{ estoque: string; tecnico: string }>(row["conf_by_json"]),
    lev: (() => {
      const raw = parseJson<{
        itens?: Array<{ qtd?: number; nome?: string; obs?: string | null }>;
        obs?: string | null;
      }>(row["lev_json"]);
      if (!raw) return null;
      return {
        obs: raw.obs ?? null,
        itens: (raw.itens ?? [])
          .map((it) => ({
            qtd: num(it.qtd) || 1,
            nome: str(it.nome).trim(),
            obs: it.obs ?? null,
          }))
          .filter((it) => it.nome),
      };
    })(),
    rel: (() => {
      const raw = parseJson<{
        texto?: string;
        fotos?: string[];
        anexos?: Array<{ name?: string; mime?: string; data?: string }>;
        assinatura?: string | null;
      }>(row["rel_json"]);
      if (!raw) return null;
      const assinatura =
        typeof raw.assinatura === "string" && raw.assinatura.trim().length > 16
          ? raw.assinatura.trim()
          : null;
      return {
        texto: str(raw.texto),
        fotos: Array.isArray(raw.fotos) ? raw.fotos.filter((f) => typeof f === "string") : [],
        anexos: Array.isArray(raw.anexos)
          ? raw.anexos
              .map((a) => ({
                name: str(a?.name),
                mime: str(a?.mime) || "application/octet-stream",
                data: str(a?.data),
              }))
              .filter((a) => a.name && a.data)
          : [],
        assinatura,
      };
    })(),
    fromCompras: Boolean(row["from_compras"]),
    fromTecnico: Boolean(row["from_tecnico"]),
    aprovadoPor: nullableStr(row["aprovado_por"]),
    aprovadoEm: iso(row["aprovado_em"]),
    aprovacaoAnexo: (() => {
      const raw = parseJson<{ name?: string; mime?: string; data?: string }>(
        row["aprovacao_anexo_json"],
      );
      if (!raw?.name || !raw?.data) return null;
      return {
        name: str(raw.name),
        mime: str(raw.mime) || "application/octet-stream",
        data: str(raw.data),
      };
    })(),
    createdBy: row["created_by"] == null ? null : num(row["created_by"]),
    createdByName: nullableStr(row["created_by_name"]),
    createdAt: iso(row["created_at"]) ?? "",
    updatedAt: iso(row["updated_at"]) ?? "",
    items,
    events: [],
    teamName: nullableStr(row["team_name"]),
  };
}

async function nextOsNum() {
  const raw = (await getSetting("assist_os_seq"))?.trim();
  const current = Number(raw);
  const next = Number.isFinite(current) && current > 0 ? Math.floor(current) + 1 : 1;
  await setSetting("assist_os_seq", String(next));
  return String(next).padStart(5, "0");
}

export async function addOsEvent(input: {
  osId: number;
  quem: string;
  userId?: number | null | undefined;
  acao: string;
}) {
  const db = await getDb();
  await db`
    insert into assist_os_events (os_id, quem, user_id, acao)
    values (${input.osId}, ${input.quem}, ${input.userId ?? null}, ${input.acao})
  `;
}

async function loadItems(osIds: number[]) {
  const map = new Map<number, AssistOsItem[]>();
  if (!osIds.length) return map;
  const db = await getDb();
  const rows = (await db`
    select * from assist_os_items
    where os_id = any(${osIds})
    order by sort_order asc, id asc
  `) as Record<string, unknown>[];
  for (const row of rows) {
    const item = mapItem(row);
    const list = map.get(item.osId) ?? [];
    list.push(item);
    map.set(item.osId, list);
  }
  return map;
}

export async function listAssistTeams(activeOnly = true) {
  const db = await getDb();
  const teams = (await db`
    select * from assist_teams
    where (${activeOnly}::boolean = false or active = true)
    order by name asc
  `) as Record<string, unknown>[];
  const members = (await db`
    select * from assist_team_members
    where (${activeOnly}::boolean = false or active = true)
    order by name asc
  `) as Record<string, unknown>[];
  return teams.map((t) => {
    const id = num(t["id"]);
    return {
      id,
      name: str(t["name"]),
      active: Boolean(t["active"]),
      members: members
        .filter((m) => num(m["team_id"]) === id)
        .map((m) => ({
          id: num(m["id"]),
          name: str(m["name"]),
          userId: m["user_id"] == null ? null : num(m["user_id"]),
          active: Boolean(m["active"]),
        })),
    } satisfies AssistTeam;
  });
}

export async function saveAssistTeam(input: {
  id?: number | null | undefined;
  name: string;
  active?: boolean | undefined;
}) {
  const db = await getDb();
  const name = input.name.trim();
  if (!name) throw new Error("Nome da equipe obrigatório.");
  if (input.id) {
    await db`
      update assist_teams
      set name = ${name},
          active = ${input.active ?? true},
          updated_at = now()
      where id = ${input.id}
    `;
    return input.id;
  }
  const [row] = (await db`
    insert into assist_teams (name, active) values (${name}, ${input.active ?? true})
    returning id
  `) as Array<{ id: number }>;
  if (!row) throw new Error("Falha ao criar equipe.");
  return num(row.id);
}

export async function saveAssistTeamMember(input: {
  id?: number | null | undefined;
  teamId: number;
  name: string;
  userId?: number | null | undefined;
  active?: boolean | undefined;
}) {
  const db = await getDb();
  const name = input.name.trim();
  if (!name) throw new Error("Nome do técnico obrigatório.");
  if (input.id) {
    await db`
      update assist_team_members
      set name = ${name},
          user_id = ${input.userId ?? null},
          active = ${input.active ?? true}
      where id = ${input.id}
    `;
    return input.id;
  }
  const [row] = (await db`
    insert into assist_team_members (team_id, name, user_id, active)
    values (${input.teamId}, ${name}, ${input.userId ?? null}, ${input.active ?? true})
    returning id
  `) as Array<{ id: number }>;
  if (!row) throw new Error("Falha ao criar membro.");
  return num(row.id);
}

export async function getOsByQuoteId(quoteId: number) {
  const db = await getDb();
  const [row] = (await db`
    select o.*, t.name as team_name
    from assist_os o
    left join assist_teams t on t.id = o.team_id
    where o.quote_id = ${quoteId}
    order by o.id desc
    limit 1
  `) as Record<string, unknown>[];
  if (!row) return null;
  const id = num(row["id"]);
  const itemsMap = await loadItems([id]);
  return mapOs(row, itemsMap.get(id) ?? []);
}

export async function getOsById(id: number) {
  const db = await getDb();
  const [row] = (await db`
    select o.*, t.name as team_name
    from assist_os o
    left join assist_teams t on t.id = o.team_id
    where o.id = ${id}
    limit 1
  `) as Record<string, unknown>[];
  if (!row) return null;
  let itemsMap = await loadItems([id]);
  let os = mapOs(row, itemsMap.get(id) ?? []);

  // Consistência: antes de Em execução não pode ficar com item em campo/aplicado
  // (ex.: OS retornada no kanban sem limpar status).
  if (
    os.stage < 5 &&
    os.items.some((i) =>
      ["campo", "aplicado", "chegou", "extra"].includes(i.status),
    )
  ) {
    await db`
      update assist_os
      set ci_at = null,
          co_at = null,
          paused_at = null,
          pause_motivo = null,
          envio_json = null,
          updated_at = now()
      where id = ${os.id}
    `;
    await db`
      update assist_os_items
      set status = 'separado',
          usado = null,
          devolvido = null,
          sobra_destino = null,
          baixa_status = null,
          baixa_qtd = null,
          updated_at = now()
      where os_id = ${os.id}
        and status in ('campo', 'aplicado', 'chegou', 'extra')
    `;
    const [fresh] = (await db`
      select o.*, t.name as team_name
      from assist_os o
      left join assist_teams t on t.id = o.team_id
      where o.id = ${id}
      limit 1
    `) as Record<string, unknown>[];
    if (fresh) {
      itemsMap = await loadItems([id]);
      os = mapOs(fresh, itemsMap.get(id) ?? []);
    }
  }

  const events = (await db`
    select * from assist_os_events where os_id = ${id} order by id asc
  `) as Record<string, unknown>[];
  os.events = events.map(mapEvent);
  return os;
}

export async function listOs(input?: {
  query?: string | undefined;
  stage?: number | null | undefined;
}) {
  const db = await getDb();
  const q = input?.query?.trim() ?? "";
  const like = q ? `%${q}%` : null;
  const stage = input?.stage ?? null;
  const rows = (await db`
    select o.*, t.name as team_name
    from assist_os o
    left join assist_teams t on t.id = o.team_id
    where (${stage}::int is null or o.stage = ${stage})
      and (
        ${like}::text is null
        or o.num ilike ${like}
        or o.client_name ilike ${like}
        or coalesce(o.quote_numero, '') ilike ${like}
        or coalesce(o.servico, '') ilike ${like}
      )
    order by o.updated_at desc
    limit 800
  `) as Record<string, unknown>[];
  const ids = rows.map((r) => num(r["id"]));
  const itemsMap = await loadItems(ids);
  return rows.map((r) => mapOs(r, itemsMap.get(num(r["id"])) ?? []));
}

export async function createOs(input: {
  tipo: OsTipo;
  subtipo?: string | null | undefined;
  clientName: string;
  clientCity?: string | null | undefined;
  clientAddress?: string | null | undefined;
  omieAppId?: string | null | undefined;
  clientCode?: number | null | undefined;
  servico?: string | undefined;
  quoteId?: number | null | undefined;
  quoteNumero?: string | null | undefined;
  ticketId?: number | null | undefined;
  items?: Array<{ qtd: number; nome: string; productId?: number | null }> | undefined;
  aprovadoPor?: string | null | undefined;
  aprovacaoAnexo?: { name: string; mime: string; data: string } | null | undefined;
  createdBy: number | null;
  createdByName: string;
}) {
  if (input.tipo === "pedido" && !input.quoteId && !input.quoteNumero) {
    throw new Error("Pedido aprovado exige vínculo com orçamento.");
  }
  if ((input.tipo === "manut" || input.tipo === "monit") && !input.subtipo?.trim()) {
    throw new Error("Informe o subtipo.");
  }
  const stage = entryStageForTipo(input.tipo);
  const db = await getDb();
  const numOs = await nextOsNum();
  const aprovadoPor = nullableStr(input.aprovadoPor);
  const anexo = input.aprovacaoAnexo?.name?.trim() && input.aprovacaoAnexo?.data
    ? {
        name: input.aprovacaoAnexo.name.trim(),
        mime: input.aprovacaoAnexo.mime || "application/octet-stream",
        data: input.aprovacaoAnexo.data,
      }
    : null;
  const [row] = (await db`
    insert into assist_os (
      num, tipo, subtipo, stage, omie_app_id, client_code, client_name, client_city,
      client_address, servico, quote_id, quote_numero, ticket_id,
      aprovado_por, aprovado_em, aprovacao_anexo_json,
      created_by, created_by_name
    ) values (
      ${numOs},
      ${input.tipo},
      ${nullableStr(input.subtipo)},
      ${stage},
      ${nullableStr(input.omieAppId)},
      ${input.clientCode ?? null},
      ${input.clientName.trim()},
      ${nullableStr(input.clientCity)},
      ${nullableStr(input.clientAddress)},
      ${input.servico?.trim() ?? ""},
      ${input.quoteId ?? null},
      ${nullableStr(input.quoteNumero)},
      ${input.ticketId ?? null},
      ${aprovadoPor},
      ${aprovadoPor ? new Date() : null},
      ${anexo ? JSON.stringify(anexo) : null},
      ${input.createdBy},
      ${input.createdByName}
    )
    returning id
  `) as Array<{ id: number }>;
  if (!row) throw new Error("Falha ao criar OS.");
  const osId = num(row.id);
  const items = input.items ?? [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const productId =
      it.productId != null && Number.isFinite(it.productId) && it.productId > 0
        ? Number(it.productId)
        : null;
    await db`
      insert into assist_os_items (os_id, qtd, nome, status, product_id, sort_order)
      values (${osId}, ${it.qtd}, ${it.nome.trim()}, 'pendente', ${productId}, ${i})
    `;
  }
  await addOsEvent({
    osId,
    quem: input.createdByName,
    userId: input.createdBy,
    acao: `OS criada (${input.tipo}${input.subtipo ? ` · ${input.subtipo}` : ""})`,
  });
  if (aprovadoPor) {
    await addOsEvent({
      osId,
      quem: input.createdByName,
      userId: input.createdBy,
      acao: `Pedido aprovado por ${aprovadoPor}${anexo ? ` · anexo ${anexo.name}` : ""}`,
    });
  }
  return getOsById(osId);
}

export async function deleteOs(input: {
  osId: number;
  quem: string;
  userId: number | null;
}) {
  const db = await getDb();
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  if (os.stage >= 7) {
    throw new Error("OS finalizada não pode ser excluída.");
  }
  await db`
    insert into assist_os_events (os_id, quem, user_id, acao)
    values (
      ${os.id},
      ${input.quem},
      ${input.userId},
      ${`OS ${os.num} excluída`}
    )
  `;
  await db`delete from assist_os where id = ${os.id}`;
  return { ok: true as const, id: os.id, num: os.num };
}

function stageMover(stage: number): OsWorkflowRole | null {
  const found = OS_STAGES.find((s) => s.idx === stage);
  return found?.mover ?? null;
}

export function assertCanMoveStage(
  stage: number,
  can: (role: OsWorkflowRole) => boolean,
  isAdminUser: boolean,
) {
  if (isAdminUser) return;
  const mover = stageMover(stage);
  if (!mover) throw new Error("Esta etapa não permite movimentação.");
  if (!can(mover)) throw new Error(`Somente ${mover} pode mover esta etapa.`);
}

export async function updateOsItemStatus(input: {
  itemId: number;
  status: OsItemStatus;
  previsao?: string | null | undefined;
  quem: string;
  userId?: number | null | undefined;
}) {
  const db = await getDb();
  const [item] = (await db`
    select * from assist_os_items where id = ${input.itemId} limit 1
  `) as Record<string, unknown>[];
  if (!item) throw new Error("Item não encontrado.");
  const prevStatus = str(item["status"]);
  const goingToComprar = input.status === "comprar" && prevStatus !== "comprar";
  await db`
    update assist_os_items
    set status = ${input.status},
        previsao = ${input.previsao ?? null},
        compra_visto_em = case
          when ${goingToComprar}::boolean then null
          else compra_visto_em
        end,
        updated_at = now()
    where id = ${input.itemId}
  `;
  await addOsEvent({
    osId: num(item["os_id"]),
    quem: input.quem,
    userId: input.userId,
    acao: `Item "${str(item["nome"])}" → ${input.status}`,
  });
  await db`update assist_os set updated_at = now() where id = ${num(item["os_id"])}`;
  return getOsById(num(item["os_id"]));
}

export async function addOsItem(input: {
  osId: number;
  qtd: number;
  nome: string;
  status?: OsItemStatus | undefined;
  origem?: string | null | undefined;
  productId?: number | null | undefined;
  quem: string;
  userId?: number | null | undefined;
}) {
  const db = await getDb();
  await db`
    insert into assist_os_items (os_id, qtd, nome, status, origem, product_id)
    values (
      ${input.osId},
      ${input.qtd},
      ${input.nome.trim()},
      ${input.status ?? "extra"},
      ${nullableStr(input.origem)},
      ${input.productId ?? null}
    )
  `;
  await addOsEvent({
    osId: input.osId,
    quem: input.quem,
    userId: input.userId,
    acao: `Item adicionado: ${input.nome.trim()}`,
  });
  return getOsById(input.osId);
}

function expectedAdvanceStage(os: AssistOs): number {
  if (os.stage >= OS_LAST_STAGE) throw new Error("OS já finalizada.");
  if (os.stage === 0) return 1;
  if (os.stage === 1) {
    const bad = os.items.some((i) => i.status === "pendente" || i.status === "recebido");
    if (bad) throw new Error("Marque todos os itens como separado ou a comprar.");
    const needBuy = os.items.some((i) => i.status === "comprar");
    return needBuy ? 2 : 3;
  }
  if (os.stage === 2) {
    throw new Error("Compras avança automaticamente ao receber os itens.");
  }
  if (os.stage === 3) {
    throw new Error("Use agendar para ir para Agendado.");
  }
  if (os.stage === 4) {
    throw new Error("Use envio/execução para ir para Em execução.");
  }
  if (os.stage === 5) {
    throw new Error("Use check-out/conferência para ir para Executado.");
  }
  if (os.stage === 6) return 7;
  return os.stage + 1;
}

export async function advanceOs(input: {
  osId: number;
  quem: string;
  userId?: number | null;
  isAdmin: boolean;
  canRole: (role: OsWorkflowRole) => boolean;
}) {
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  if (os.pending) throw new Error("Há retorno pendente de aprovação.");
  if (os.stage >= OS_LAST_STAGE) throw new Error("OS já finalizada.");
  assertCanMoveStage(os.stage, input.canRole, input.isAdmin);

  const next = expectedAdvanceStage(os);

  const db = await getDb();
  const finDate = next === 7 ? new Date().toISOString().slice(0, 10) : null;
  await db`
    update assist_os
    set stage = ${next},
        fin_date = coalesce(${finDate}::date, fin_date),
        updated_at = now()
    where id = ${os.id}
  `;
  await addOsEvent({
    osId: os.id,
    quem: input.quem,
    userId: input.userId,
    acao: `Avançou para ${OS_STAGES.find((s) => s.idx === next)?.name ?? next}`,
  });
  return getOsById(os.id);
}

/** Movimento por arraste no Kanban (avanço simples ou retorno). */
export async function moveOsOnKanban(input: {
  osId: number;
  toStage: number;
  quem: string;
  userId?: number | null;
  isAdmin: boolean;
  canRole: (role: OsWorkflowRole) => boolean;
}) {
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  if (os.pending) throw new Error("Há retorno pendente de aprovação.");
  if (input.toStage === os.stage) return os;
  if (input.toStage < 0 || input.toStage > OS_LAST_STAGE) {
    throw new Error("Etapa inválida.");
  }

  if (input.toStage < os.stage) {
    // Kanban: quem pode mover aplica na hora (admin ou papel da etapa).
    return requestReturnOs({
      osId: input.osId,
      toStage: input.toStage,
      motivo: "Movido no Kanban",
      quem: input.quem,
      userId: input.userId ?? null,
      applyNow: input.isAdmin || input.canRole("assistencia"),
    });
  }

  assertCanMoveStage(os.stage, input.canRole, input.isAdmin);
  const expected = expectedAdvanceStage(os);
  if (input.toStage !== expected) {
    const name = OS_STAGES.find((s) => s.idx === expected)?.name ?? expected;
    throw new Error(
      `Não é possível pular etapas. Próximo passo: ${name}. Use o painel da OS se precisar agendar/enviar/conferir.`,
    );
  }
  return advanceOs(input);
}

export async function scheduleOs(input: {
  osId: number;
  agDate: string;
  periodo?: string | null | undefined;
  hora?: string | null | undefined;
  teamId?: number | null | undefined;
  tecnicoNome?: string | null | undefined;
  quem: string;
  userId?: number | null | undefined;
  isAdmin: boolean;
  canRole: (role: OsWorkflowRole) => boolean;
}) {
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  if (os.stage !== 3 && os.stage !== 4) throw new Error("Agendamento só nas etapas 3 ou 4.");
  assertCanMoveStage(3, input.canRole, input.isAdmin);
  if (!input.agDate) throw new Error("Informe a data.");
  const db = await getDb();
  await db`
    update assist_os
    set stage = 4,
        ag_date = ${input.agDate},
        periodo = ${nullableStr(input.periodo)},
        hora = ${nullableStr(input.hora)},
        team_id = ${input.teamId ?? null},
        tecnico_nome = ${nullableStr(input.tecnicoNome)},
        updated_at = now()
    where id = ${os.id}
  `;
  await addOsEvent({
    osId: os.id,
    quem: input.quem,
    userId: input.userId,
    acao: `Agendado para ${input.agDate}${input.periodo ? ` · ${input.periodo}` : ""}`,
  });
  return getOsById(os.id);
}

export async function startExecOs(input: {
  osId: number;
  quem: string;
  userId?: number | null;
  isAdmin: boolean;
  canRole: (role: OsWorkflowRole) => boolean;
  /** Sem app: confirma OK do material direto. */
  materialOk?: boolean;
}) {
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  if (os.stage !== 4) throw new Error("OS precisa estar Agendada.");
  assertCanMoveStage(4, input.canRole, input.isAdmin);
  const hasItems = os.items.length > 0;
  const db = await getDb();

  if (hasItems && !input.materialOk) {
    const envio: AssistOsEnvio = {
      equipe: os.tecnicoNome || os.teamName || "Equipe",
      quando: new Date().toISOString(),
      div: null,
    };
    await db`
      update assist_os
      set envio_json = ${JSON.stringify(envio)},
          updated_at = now()
      where id = ${os.id}
    `;
    await addOsEvent({
      osId: os.id,
      quem: input.quem,
      userId: input.userId,
      acao: "Material enviado (aguardando OK)",
    });
    return getOsById(os.id);
  }

  if (hasItems) {
    await db`
      update assist_os_items
      set status = 'campo', updated_at = now()
      where os_id = ${os.id}
        and status in ('separado', 'recebido', 'chegou', 'pendente', 'aplicado')
    `;
  }

  const envio: AssistOsEnvio = {
    equipe: os.tecnicoNome || os.teamName || "Equipe",
    quando: new Date().toISOString(),
  };
  await db`
    update assist_os
    set stage = 5,
        envio_json = ${JSON.stringify(envio)},
        updated_at = now()
    where id = ${os.id}
  `;
  await addOsEvent({
    osId: os.id,
    quem: input.quem,
    userId: input.userId,
    acao: hasItems ? "OK material · Em execução" : "Em execução (sem material)",
  });
  return getOsById(os.id);
}

export async function markMaterialDivergence(input: {
  osId: number;
  texto: string;
  quem: string;
  userId?: number | null;
}) {
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  if (!os.envio) throw new Error("Não há envio pendente.");
  const envio = { ...os.envio, div: input.texto.trim() };
  const db = await getDb();
  await db`
    update assist_os set envio_json = ${JSON.stringify(envio)}, updated_at = now()
    where id = ${os.id}
  `;
  await addOsEvent({
    osId: os.id,
    quem: input.quem,
    userId: input.userId,
    acao: `Divergência de material: ${input.texto.trim()}`,
  });
  return getOsById(os.id);
}

export async function checkInOs(input: {
  osId: number;
  quem: string;
  userId?: number | null;
  isAdmin: boolean;
  canRole: (role: OsWorkflowRole) => boolean;
}) {
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  if (os.stage !== 5) throw new Error("Check-in só em execução.");
  assertCanMoveStage(5, input.canRole, input.isAdmin);
  if (os.ciAt) throw new Error("Check-in já registrado.");
  const db = await getDb();

  // Limite: 1 check-in aberto por técnico/equipe.
  const techName = (os.tecnicoNome ?? input.quem).trim();
  const openCheckins = (await db`
    select id, num, client_name
    from assist_os
    where stage = 5
      and ci_at is not null
      and co_at is null
      and id <> ${os.id}
      and (
        (
          tecnico_nome is not null
          and lower(trim(tecnico_nome)) = lower(${techName})
        )
        or (
          ${os.teamId}::int is not null
          and team_id = ${os.teamId}
        )
        or (
          ${input.userId ?? null}::int is not null
          and exists (
            select 1 from assist_team_members m
            where m.team_id = assist_os.team_id
              and m.user_id = ${input.userId}
              and coalesce(m.active, true) = true
          )
        )
      )
    order by ci_at desc
    limit 3
  `) as Array<{ id: number; num: string; client_name: string }>;
  if (openCheckins.length) {
    const other = openCheckins[0]!;
    throw new Error(
      `Já existe check-in em andamento na OS ${other.num} (${other.client_name}). Finalize (check-out) antes de iniciar outra.`,
    );
  }

  await db`
    update assist_os set ci_at = now(), updated_at = now() where id = ${os.id}
  `;
  await addOsEvent({
    osId: os.id,
    quem: input.quem,
    userId: input.userId,
    acao: "Check-in",
  });
  return getOsById(os.id);
}

export async function pauseOs(input: {
  osId: number;
  motivo: string;
  quem: string;
  userId?: number | null;
  isAdmin: boolean;
  canRole: (role: OsWorkflowRole) => boolean;
}) {
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  if (os.stage !== 5) throw new Error("Pausa só em execução.");
  assertCanMoveStage(5, input.canRole, input.isAdmin);
  if (!os.ciAt) throw new Error("Faça check-in antes de pausar.");
  if (os.coAt) throw new Error("OS já teve check-out.");
  if (os.pausedAt) throw new Error("OS já está pausada.");
  const motivo = input.motivo.trim();
  if (!motivo) throw new Error("Informe o motivo da pausa.");
  const db = await getDb();
  await db`
    update assist_os
    set paused_at = now(),
        pause_motivo = ${motivo},
        updated_at = now()
    where id = ${os.id}
  `;
  await addOsEvent({
    osId: os.id,
    quem: input.quem,
    userId: input.userId,
    acao: `OS pausada · ${motivo}`,
  });
  return getOsById(os.id);
}

export async function resumeOs(input: {
  osId: number;
  quem: string;
  userId?: number | null;
  isAdmin: boolean;
  canRole: (role: OsWorkflowRole) => boolean;
}) {
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  if (os.stage !== 5) throw new Error("Retomada só em execução.");
  assertCanMoveStage(5, input.canRole, input.isAdmin);
  if (!os.pausedAt) throw new Error("OS não está pausada.");
  if (os.coAt) throw new Error("OS já teve check-out.");
  const db = await getDb();
  const motivo = os.pauseMotivo;
  await db`
    update assist_os
    set paused_at = null,
        pause_motivo = null,
        updated_at = now()
    where id = ${os.id}
  `;
  await addOsEvent({
    osId: os.id,
    quem: input.quem,
    userId: input.userId,
    acao: motivo ? `OS retomada (pausa: ${motivo})` : "OS retomada",
  });
  return getOsById(os.id);
}

function buildOsRel(input: {
  texto: string;
  fotos?: string[] | undefined;
  anexos?: Array<{ name: string; mime: string; data: string }> | undefined;
  assinatura?: string | null | undefined;
  fallback?: AssistOs["rel"];
}) {
  const fotos = (input.fotos ?? input.fallback?.fotos ?? []).filter(Boolean).slice(0, 12);
  const anexos = (input.anexos ?? input.fallback?.anexos ?? [])
    .filter((a) => a.name && a.data)
    .slice(0, 10);
  const assinaturaRaw =
    input.assinatura === undefined
      ? input.fallback?.assinatura ?? null
      : input.assinatura;
  const assinatura =
    typeof assinaturaRaw === "string" && assinaturaRaw.trim().length > 16
      ? assinaturaRaw.trim()
      : null;
  return { texto: input.texto.trim(), fotos, anexos, assinatura };
}

export async function checkOutOs(input: {
  osId: number;
  resolucao: string;
  fotos?: string[] | undefined;
  anexos?: Array<{ name: string; mime: string; data: string }> | undefined;
  assinatura?: string | null | undefined;
  /** Quando true, tenta marcar Executado após o check-out (app do técnico). */
  finalizar?: boolean | undefined;
  quem: string;
  userId?: number | null;
  isAdmin: boolean;
  canRole: (role: OsWorkflowRole) => boolean;
}) {
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  if (os.stage !== 5) throw new Error("Check-out só em execução.");
  assertCanMoveStage(5, input.canRole, input.isAdmin);
  if (!os.ciAt) throw new Error("Faça check-in antes.");
  if (os.pausedAt) throw new Error("OS pausada. Retome a execução antes do check-out.");
  if (!input.resolucao.trim()) throw new Error("Informe a resolução.");
  const rel = buildOsRel({
    texto: input.resolucao,
    fotos: input.fotos,
    anexos: input.anexos,
    assinatura: input.assinatura,
    fallback: os.rel,
  });
  const db = await getDb();
  await db`
    update assist_os
    set co_at = now(),
        resolucao = ${input.resolucao.trim()},
        rel_json = ${JSON.stringify(rel)},
        updated_at = now()
    where id = ${os.id}
  `;
  const extras = [
    rel.fotos.length ? `${rel.fotos.length} foto(s)` : null,
    rel.anexos.length ? `${rel.anexos.length} anexo(s)` : null,
    rel.assinatura ? "assinatura" : null,
  ].filter(Boolean);
  await addOsEvent({
    osId: os.id,
    quem: input.quem,
    userId: input.userId,
    acao: `Check-out${extras.length ? ` · ${extras.join(", ")}` : ""}`,
  });

  if (!input.finalizar) return getOsById(os.id);

  try {
    if (os.tipo === "visita") {
      const current = await getOsById(os.id);
      if (current?.lev) {
        return finishVisita({
          osId: os.id,
          quem: input.quem,
          userId: input.userId,
          isAdmin: input.isAdmin,
          canRole: input.canRole,
        });
      }
    }
    return await markExecutedManual({
      osId: os.id,
      quem: input.quem,
      userId: input.userId,
      isAdmin: input.isAdmin,
      canRole: input.canRole,
    });
  } catch {
    // Check-out ok; material em campo ou visita sem levantamento fica para conferência.
    // Ainda assim sai de "Em execução" para o técnico ver "Aguardando conferência".
    await db`
      update assist_os
      set stage = 6, updated_at = now()
      where id = ${os.id} and stage = 5
    `;
    await addOsEvent({
      osId: os.id,
      quem: input.quem,
      userId: input.userId,
      acao: "Finalizado pelo técnico · aguardando conferência",
    });
    return getOsById(os.id);
  }
}

/** Salva rascunho de resolução/anexos em execução (antes do check-out). */
export async function saveOsResolucao(input: {
  osId: number;
  resolucao: string;
  fotos?: string[] | undefined;
  anexos?: Array<{ name: string; mime: string; data: string }> | undefined;
  assinatura?: string | null | undefined;
  quem: string;
  userId?: number | null;
  isAdmin: boolean;
  canRole: (role: OsWorkflowRole) => boolean;
}) {
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  if (os.stage !== 5) throw new Error("Resolução só em execução.");
  assertCanMoveStage(5, input.canRole, input.isAdmin);
  const rel = buildOsRel({
    texto: input.resolucao,
    fotos: input.fotos,
    anexos: input.anexos,
    assinatura: input.assinatura,
  });
  const db = await getDb();
  await db`
    update assist_os
    set resolucao = ${input.resolucao.trim() || null},
        rel_json = ${JSON.stringify(rel)},
        updated_at = now()
    where id = ${os.id}
  `;
  await addOsEvent({
    osId: os.id,
    quem: input.quem,
    userId: input.userId,
    acao: "Atualizou resolução / anexos",
  });
  return getOsById(os.id);
}

export async function saveOsLev(input: {
  osId: number;
  lev: {
    itens: Array<{ qtd: number; nome: string; obs: string | null }>;
    obs: string | null;
  };
  quem: string;
  userId?: number | null | undefined;
}) {
  const db = await getDb();
  await db`
    update assist_os
    set lev_json = ${JSON.stringify(input.lev)}, updated_at = now()
    where id = ${input.osId}
  `;
  await addOsEvent({
    osId: input.osId,
    quem: input.quem,
    userId: input.userId,
    acao: "Levantamento de orçamento salvo",
  });
  return getOsById(input.osId);
}

export async function submitConference(input: {
  osId: number;
  rows: Array<{ id: number; usou: number }>;
  quem: string;
  userId?: number | null;
  isAdmin: boolean;
  canRole: (role: OsWorkflowRole) => boolean;
}) {
  if (!input.isAdmin && !input.canRole("estoque")) {
    throw new Error("Somente Estoque faz conferência.");
  }
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  if (os.stage !== 5 || !os.coAt) throw new Error("Conferência após check-out.");
  const db = await getDb();
  const confItens: AssistOsConf["itens"] = [];
  for (const row of input.rows) {
    const item = os.items.find((i) => i.id === row.id);
    if (!item) continue;
    const usou = Math.max(0, row.usou);
    const volta = Math.max(0, item.qtd - usou);
    await db`
      update assist_os_items
      set usado = ${usou}, devolvido = ${volta}, status = 'aplicado', updated_at = now()
      where id = ${item.id}
    `;
    confItens.push({
      id: item.id,
      nome: item.nome,
      saiu: item.qtd,
      usou,
      volta,
    });
  }
  const conf: AssistOsConf = {
    itens: confItens,
    estoque: input.quem,
    quando: new Date().toISOString(),
  };
  await db`
    update assist_os
    set conf_json = ${JSON.stringify(conf)}, updated_at = now()
    where id = ${os.id}
  `;
  await addOsEvent({
    osId: os.id,
    quem: input.quem,
    userId: input.userId,
    acao: "Conferência enviada para aceite",
  });
  return getOsById(os.id);
}

export async function acceptConference(input: {
  osId: number;
  quem: string;
  userId?: number | null | undefined;
  isAdmin: boolean;
  canRole: (role: OsWorkflowRole) => boolean;
  contest?: string | null | undefined;
}) {
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  if (!os.conf) throw new Error("Não há conferência pendente.");
  assertCanMoveStage(5, input.canRole, input.isAdmin);
  const db = await getDb();

  if (input.contest?.trim()) {
    const conf = { ...os.conf, contest: input.contest.trim() };
    await db`
      update assist_os
      set conf_json = ${JSON.stringify(conf)}, updated_at = now()
      where id = ${os.id}
    `;
    await addOsEvent({
      osId: os.id,
      quem: input.quem,
      userId: input.userId,
      acao: `Conferência contestada: ${input.contest.trim()}`,
    });
    await db`
      update assist_os set conf_json = null, updated_at = now() where id = ${os.id}
    `;
    return getOsById(os.id);
  }

  const confBy = { estoque: os.conf.estoque, tecnico: input.quem };
  await db`
    update assist_os
    set stage = 6,
        conf_json = null,
        conf_by_json = ${JSON.stringify(confBy)},
        updated_at = now()
    where id = ${os.id}
  `;
  await addOsEvent({
    osId: os.id,
    quem: input.quem,
    userId: input.userId,
    acao: "Conferência aceita · Executado",
  });
  return getOsById(os.id);
}

export async function finishVisita(input: {
  osId: number;
  quem: string;
  userId?: number | null;
  isAdmin: boolean;
  canRole: (role: OsWorkflowRole) => boolean;
}) {
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  if (os.tipo !== "visita") throw new Error("Somente visita técnica.");
  if (!os.lev) throw new Error("Salve o levantamento antes.");
  if (!os.coAt) throw new Error("Faça check-out antes.");
  assertCanMoveStage(5, input.canRole, input.isAdmin);
  const db = await getDb();
  await db`
    update assist_os set stage = 6, updated_at = now() where id = ${os.id}
  `;
  await addOsEvent({
    osId: os.id,
    quem: input.quem,
    userId: input.userId,
    acao: "Visita concluída · Executado",
  });
  return getOsById(os.id);
}

/** Skip conference for OS without material after checkout. */
export async function markExecutedManual(input: {
  osId: number;
  quem: string;
  userId?: number | null;
  isAdmin: boolean;
  canRole: (role: OsWorkflowRole) => boolean;
}) {
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  if (os.stage !== 5 || !os.coAt) throw new Error("Check-out necessário.");
  if (os.items.some((i) => i.status === "campo" || i.status === "extra")) {
    throw new Error("Há material em campo — use conferência.");
  }
  assertCanMoveStage(5, input.canRole, input.isAdmin);
  const db = await getDb();
  await db`update assist_os set stage = 6, updated_at = now() where id = ${os.id}`;
  await addOsEvent({
    osId: os.id,
    quem: input.quem,
    userId: input.userId,
    acao: "Marcado como Executado",
  });
  return getOsById(os.id);
}

/**
 * Ao voltar etapa, limpa estado de campo para o app refletir o retorno.
 * Sem isso a OS pode continuar "em execução/finalizada" no app (ci/co/envio).
 */
async function applyReturnStageCleanup(
  db: Awaited<ReturnType<typeof getDb>>,
  os: AssistOs,
  toStage: number,
) {
  if (toStage < 5) {
    // Voltou de execução: limpa campo e devolve itens ao estado de separação.
    await db`
      update assist_os
      set ci_at = null,
          co_at = null,
          paused_at = null,
          pause_motivo = null,
          envio_json = null,
          updated_at = now()
      where id = ${os.id}
    `;
    await db`
      update assist_os_items
      set status = 'separado',
          usado = null,
          devolvido = null,
          sobra_destino = null,
          baixa_status = null,
          baixa_qtd = null,
          updated_at = now()
      where os_id = ${os.id}
        and status in ('campo', 'aplicado', 'chegou', 'extra')
    `;
  }
  if (toStage < 3) {
    await db`
      update assist_os
      set ag_date = null,
          periodo = null,
          hora = null,
          updated_at = now()
      where id = ${os.id}
    `;
  }
}

export async function requestReturnOs(input: {
  osId: number;
  toStage: number;
  motivo: string;
  quem: string;
  userId?: number | null;
  /** Admin ou Assistência aplica na hora; demais só solicitam. */
  applyNow: boolean;
}) {
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  if (input.toStage < 0 || input.toStage >= os.stage) {
    throw new Error("Etapa de retorno inválida.");
  }
  if (isDirectOsTipo(os.tipo) && input.toStage < 3 && os.items.length === 0) {
    throw new Error("OS direta sem material não volta abaixo de agendamento.");
  }
  if (!input.motivo.trim()) throw new Error("Informe o motivo.");

  const db = await getDb();
  if (input.applyNow) {
    await db`
      update assist_os
      set stage = ${input.toStage},
          pending_json = null,
          updated_at = now()
      where id = ${os.id}
    `;
    await applyReturnStageCleanup(db, os, input.toStage);
    await addOsEvent({
      osId: os.id,
      quem: input.quem,
      userId: input.userId,
      acao: `Retornou para etapa ${input.toStage}: ${input.motivo.trim()}`,
    });
    return getOsById(os.id);
  }

  const pending: AssistOsPending = {
    to: input.toStage,
    motivo: input.motivo.trim(),
    by: input.quem,
    quando: new Date().toISOString(),
  };
  await db`
    update assist_os
    set pending_json = ${JSON.stringify(pending)}, updated_at = now()
    where id = ${os.id}
  `;
  await addOsEvent({
    osId: os.id,
    quem: input.quem,
    userId: input.userId,
    acao: `Solicitou retorno para ${input.toStage}: ${input.motivo.trim()}`,
  });
  return getOsById(os.id);
}

export async function resolveReturnOs(input: {
  osId: number;
  approve: boolean;
  quem: string;
  userId?: number | null;
}) {
  const os = await getOsById(input.osId);
  if (!os?.pending) throw new Error("Não há retorno pendente.");
  const db = await getDb();
  if (input.approve) {
    const toStage = os.pending.to;
    await db`
      update assist_os
      set stage = ${toStage},
          pending_json = null,
          updated_at = now()
      where id = ${os.id}
    `;
    await applyReturnStageCleanup(db, os, toStage);
    await addOsEvent({
      osId: os.id,
      quem: input.quem,
      userId: input.userId,
      acao: `Retorno aprovado → etapa ${toStage}`,
    });
  } else {
    await db`
      update assist_os set pending_json = null, updated_at = now() where id = ${os.id}
    `;
    await addOsEvent({
      osId: os.id,
      quem: input.quem,
      userId: input.userId,
      acao: "Retorno rejeitado",
    });
  }
  return getOsById(os.id);
}

export async function receivePurchaseItem(input: {
  itemId: number;
  quem: string;
  userId?: number | null;
}) {
  const db = await getDb();
  const [item] = (await db`
    select * from assist_os_items where id = ${input.itemId} limit 1
  `) as Record<string, unknown>[];
  if (!item) throw new Error("Item não encontrado.");
  if (str(item["status"]) !== "comprado") throw new Error("Item não está como comprado.");
  await db`
    update assist_os_items
    set status = 'recebido', updated_at = now()
    where id = ${input.itemId}
  `;
  const osId = num(item["os_id"]);
  await addOsEvent({
    osId,
    quem: input.quem,
    userId: input.userId,
    acao: `Recebido: ${str(item["nome"])}`,
  });

  const os = await getOsById(osId);
  if (os && os.stage === 2) {
    const still = os.items.filter((i) => i.id !== input.itemId && i.status === "comprado");
    if (!still.length) {
      await db`
        update assist_os
        set stage = 1, from_compras = true, updated_at = now()
        where id = ${osId}
      `;
      await addOsEvent({
        osId,
        quem: input.quem,
        userId: input.userId,
        acao: "Compras concluídas · voltou para Separação",
      });
    }
  }
  return getOsById(osId);
}

export async function requestMaterialFromField(input: {
  osId: number;
  items: Array<{ qtd: number; nome: string }>;
  quem: string;
  userId?: number | null;
  isAdmin: boolean;
  canRole: (role: OsWorkflowRole) => boolean;
}) {
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  if (os.stage !== 5) throw new Error("Solicitação só em execução.");
  assertCanMoveStage(5, input.canRole, input.isAdmin);
  if (!input.items.length) throw new Error("Informe itens.");
  const db = await getDb();
  for (const it of input.items) {
    await db`
      insert into assist_os_items (os_id, qtd, nome, status, origem)
      values (${os.id}, ${it.qtd}, ${it.nome.trim()}, 'pendente', 'tecnico')
    `;
  }
  await db`
    update assist_os
    set stage = 1, from_tecnico = true, updated_at = now()
    where id = ${os.id}
  `;
  await addOsEvent({
    osId: os.id,
    quem: input.quem,
    userId: input.userId,
    acao: "Material solicitado em campo → Separação",
  });
  return getOsById(os.id);
}

export async function linkOsTicketCom(osId: number, ticketComId: number) {
  const db = await getDb();
  await db`
    update assist_os set ticket_com_id = ${ticketComId}, updated_at = now()
    where id = ${osId}
  `;
}

export async function searchQuotesLocal(query: string, limit = 20) {
  const db = await getDb();
  const q = query.trim();
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const rows = (await db`
    select id, numero_interno, client_name, client_code, omie_app_id, status, total
    from quotes
    where numero_interno ilike ${like}
       or coalesce(client_name, '') ilike ${like}
    order by created_at desc
    limit ${Math.min(limit, 50)}
  `) as Array<{
    id: number;
    numero_interno: string;
    client_name: string | null;
    client_code: number | null;
    omie_app_id: string;
    status: string;
    total: number | null;
  }>;
  return rows.map((r) => ({
    id: num(r.id),
    numero: str(r.numero_interno),
    clientName: r.client_name,
    clientCode: r.client_code == null ? null : num(r.client_code),
    omieAppId: str(r.omie_app_id),
    status: str(r.status),
    total: r.total == null ? null : num(r.total),
  }));
}

function materialFieldItems(os: AssistOs) {
  return os.items.filter((i) =>
    ["campo", "extra", "aplicado", "separado", "recebido"].includes(i.status),
  );
}

export function osNeedsMaterialDisposition(os: AssistOs) {
  // Após check-out: em execução (5) ou já no kanban Executado (6).
  if ((os.stage !== 5 && os.stage !== 6) || !os.coAt) return false;
  const items = materialFieldItems(os);
  if (!items.length) return false;
  return items.some((i) => i.usado == null || (i.qtd - (i.usado ?? 0) > 0 && !i.sobraDestino));
}

/** Stage 1: todos os itens marcados (separado/comprar) — pronto para avançar. */
export function canAdvanceFromSeparacao(os: AssistOs) {
  if (os.stage !== 1) {
    return { ready: false as const, nextStage: null, needBuy: false };
  }
  if (os.items.some((i) => i.status === "pendente" || i.status === "recebido")) {
    return { ready: false as const, nextStage: null, needBuy: false };
  }
  const needBuy = os.items.some((i) => i.status === "comprar");
  return {
    ready: true as const,
    nextStage: needBuy ? 2 : 3,
    needBuy,
  };
}

export function osNeedsMaterialConfirm(os: AssistOs) {
  if (os.stage !== 4) return false;
  if (!os.items.length) return false;
  // Escritório já enviou para o técnico confirmar (envio_json preenchido).
  if (!os.envio) return false;
  return os.items.some((i) =>
    ["pendente", "separado", "recebido", "chegou", "comprado", "comprar"].includes(i.status),
  );
}

export function osHasPendingBaixa(os: AssistOs) {
  return os.items.some(
    (i) => i.productId != null && (i.usado ?? 0) > 0 && i.baixaStatus === "pendente",
  );
}

export async function listOsForMatSaida() {
  const db = await getDb();
  const rows = await db`
    select o.id, o.num, o.tipo, o.stage, o.client_name, o.team_id, o.tecnico_nome, t.name as team_name
    from assist_os o
    left join assist_teams t on t.id = o.team_id
    where o.stage < 7
    order by o.updated_at desc
    limit 200
  `;
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: num(r["id"]),
    num: str(r["num"]),
    tipo: str(r["tipo"]),
    stage: num(r["stage"]),
    clientName: str(r["client_name"]),
    teamId: r["team_id"] == null ? null : num(r["team_id"]),
    tecnicoNome: r["tecnico_nome"] == null ? null : str(r["tecnico_nome"]),
    teamName: r["team_name"] == null ? null : str(r["team_name"]),
  }));
}

export async function saveOsMaterialDisposition(input: {
  osId: number;
  rows: Array<{
    id: number;
    usado: number;
    sobraDestino?: "devolver" | "equipe" | null;
  }>;
  quem: string;
  userId?: number | null;
}) {
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  if ((os.stage !== 5 && os.stage !== 6) || !os.coAt) {
    throw new Error("Informe uso/sobra após o check-out.");
  }

  const needsTeamStock = input.rows.some((row) => {
    const item = os.items.find((i) => i.id === row.id);
    if (!item?.productId) return false;
    const usado = Math.max(0, Math.min(item.qtd, Number(row.usado) || 0));
    const sobra = Math.max(0, item.qtd - usado);
    return (
      usado > 0 ||
      row.sobraDestino === "devolver" ||
      row.sobraDestino === "equipe" ||
      sobra > 0
    );
  });
  if (needsTeamStock && !os.teamId) {
    throw new Error("OS sem equipe — defina a equipe antes de informar materiais.");
  }

  const { creditTeamStock, debitTeamStock, teamStockTransaction } = await import(
    "@/db/team-stock"
  );
  const db = await getDb();

  await teamStockTransaction(db, async (tx) => {
    for (const row of input.rows) {
      const item = os.items.find((i) => i.id === row.id);
      if (!item) continue;
      const usado = Math.max(0, Math.min(item.qtd, Number(row.usado) || 0));
      const sobra = Math.max(0, item.qtd - usado);
      const sobraDestino =
        sobra <= 0
          ? null
          : row.sobraDestino === "devolver" || row.sobraDestino === "equipe"
            ? row.sobraDestino
            : null;
      if (sobra > 0 && !sobraDestino) {
        throw new Error(`Informe o destino da sobra de ${item.nome}.`);
      }

      const baixaStatus =
        item.productId && usado > 0
          ? item.baixaStatus === "feita" || item.baixaStatus === "ignorada"
            ? item.baixaStatus
            : "pendente"
          : null;
      const baixaQtd = item.productId && usado > 0 ? usado : null;

      await tx`
        update assist_os_items
        set usado = ${usado},
            devolvido = ${sobra},
            sobra_destino = ${sobraDestino},
            baixa_status = ${baixaStatus},
            baixa_qtd = ${baixaQtd},
            status = 'aplicado',
            updated_at = now()
        where id = ${item.id}
      `;

      if (!item.productId || !os.teamId) continue;

      const prevUsado = item.usado ?? 0;
      const prevSobraDestino = item.sobraDestino;
      const prevDevolvido = item.devolvido ?? 0;

      const stockRows = await tx`
        select quantidade from team_stock
        where team_id = ${os.teamId} and product_id = ${item.productId}
        limit 1
      `;
      const stockRow = (stockRows as Record<string, unknown>[])[0];
      const hasTeamStock = Boolean(stockRow);
      const available = stockRow ? num(stockRow["quantidade"]) : 0;

      // Item "extra" já saiu do estoque da equipe ao ser aplicado na OS.
      const alreadyDebitedFromTeam = item.status === "extra";

      // Debita só o que ainda há saldo — nunca bloqueia o salvamento de uso/sobra.
      const usadoDelta = Math.max(0, usado - prevUsado);
      if (usadoDelta > 0 && hasTeamStock && !alreadyDebitedFromTeam) {
        const debitQty = Math.min(usadoDelta, available);
        if (debitQty > 0) {
          await debitTeamStock(tx, {
            teamId: os.teamId,
            productId: item.productId,
            quantidade: debitQty,
            tipo: "aplicado_os",
            tecnicoNome: os.tecnicoNome,
            osId: os.id,
            motivo: `Usado na OS ${os.num}`,
            userId: input.userId ?? null,
            userName: input.quem,
          });
        }
      }

      // Sobra para devolver: sai do estoque da equipe (se houver saldo).
      if (sobraDestino === "devolver" && sobra > 0 && hasTeamStock) {
        const alreadyReturned =
          prevSobraDestino === "devolver" ? prevDevolvido : 0;
        const returnDelta = Math.max(0, sobra - alreadyReturned);
        if (returnDelta > 0) {
          const balRows = await tx`
            select quantidade from team_stock
            where team_id = ${os.teamId} and product_id = ${item.productId}
            limit 1
          `;
          const bal = num((balRows as Record<string, unknown>[])[0]?.["quantidade"]);
          const debitQty = Math.min(returnDelta, Math.max(0, bal));
          if (debitQty > 0) {
            await debitTeamStock(tx, {
              teamId: os.teamId,
              productId: item.productId,
              quantidade: debitQty,
              tipo: "devolvido_empresa",
              tecnicoNome: os.tecnicoNome,
              osId: os.id,
              motivo: `Sobra devolvida · OS ${os.num}`,
              userId: input.userId ?? null,
              userName: input.quem,
            });
          }
        }
      }

      // Sobra fica na equipe: credita quando o material não está no estoque da equipe.
      if (sobraDestino === "equipe" && sobra > 0) {
        const prevEquipeSobra =
          prevSobraDestino === "equipe" ? prevDevolvido : 0;
        const creditDelta = Math.max(0, sobra - prevEquipeSobra);
        if (creditDelta > 0 && (!hasTeamStock || available <= 0)) {
          await creditTeamStock(tx, {
            teamId: os.teamId,
            productId: item.productId,
            nome: item.nome,
            quantidade: creditDelta,
            tipo: "sobra_os",
            tecnicoNome: os.tecnicoNome,
            osId: os.id,
            motivo: `Sobra na equipe · OS ${os.num}`,
            userId: input.userId ?? null,
            userName: input.quem,
          });
        }
      }

      // Se antes ia devolver e agora fica na equipe, recoloca o que já tinha sido debitado.
      if (prevSobraDestino === "devolver" && sobraDestino === "equipe" && prevDevolvido > 0) {
        await creditTeamStock(tx, {
          teamId: os.teamId,
          productId: item.productId,
          nome: item.nome,
          quantidade: prevDevolvido,
          tipo: "ajuste",
          tecnicoNome: os.tecnicoNome,
          osId: os.id,
          motivo: `Sobra permanece na equipe · OS ${os.num}`,
          userId: input.userId ?? null,
          userName: input.quem,
        });
      }
    }
  });

  await addOsEvent({
    osId: os.id,
    quem: input.quem,
    userId: input.userId,
    acao: "Informou uso e destino da sobra dos materiais",
  });
  return getOsById(os.id);
}

export async function resolveOsMaterialBaixa(input: {
  osId: number;
  itemIds: number[];
  action: "baixar" | "ignorar";
  quem: string;
  userId: number;
}) {
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  const { moveProductStock } = await import("@/db/stock");
  const db = await getDb();

  for (const itemId of input.itemIds) {
    const item = os.items.find((i) => i.id === itemId);
    if (!item) continue;
    if (item.baixaStatus !== "pendente" || !item.productId || !(item.baixaQtd || item.usado)) {
      continue;
    }
    const qtd = item.baixaQtd ?? item.usado ?? 0;
    if (qtd <= 0) continue;

    if (input.action === "baixar") {
      await moveProductStock({
        productId: item.productId,
        tipo: "saida",
        quantidade: qtd,
        motivo: `Baixa OS ${os.num}`,
        observacao: `${item.nome} · técnico ${os.tecnicoNome ?? "—"}`,
        userId: input.userId,
      });
      await db`
        update assist_os_items
        set baixa_status = 'feita', updated_at = now()
        where id = ${item.id}
      `;
    } else {
      await db`
        update assist_os_items
        set baixa_status = 'ignorada', updated_at = now()
        where id = ${item.id}
      `;
    }
  }

  await addOsEvent({
    osId: os.id,
    quem: input.quem,
    userId: input.userId,
    acao:
      input.action === "baixar"
        ? "Baixa de materiais confirmada no estoque da empresa"
        : "Baixa de materiais ignorada (sem debitar estoque da empresa)",
  });
  return getOsById(os.id);
}

export async function listMaterialPendencias() {
  const list = await listOs();
  const disposition: AssistOs[] = [];
  const baixa: AssistOs[] = [];
  for (const os of list) {
    if (osNeedsMaterialDisposition(os)) disposition.push(os);
    if (osHasPendingBaixa(os)) baixa.push(os);
  }
  return { disposition, baixa };
}
