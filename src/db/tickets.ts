import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";
import { getSetting, setSetting } from "@/db/settings";
import {
  TICKET_ATIVOS,
  TICKET_PRIO_ORD,
  type TicketCatId,
  type TicketPrio,
  type TicketSetorId,
  type TicketStatusId,
} from "@/lib/tickets-domain";

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

function dateOnly(v: unknown) {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = str(v);
  return s ? s.slice(0, 10) : null;
}

export type TicketAnexo = { name: string; mime: string; data: string };

export type TicketEvent = {
  id: number;
  quando: string;
  quem: string;
  userId: number | null;
  tipo: string;
  titulo: string;
  texto: string;
  anexos: TicketAnexo[];
};

export type Ticket = {
  id: number;
  num: string;
  cat: string;
  codigoRef: string | null;
  clientName: string;
  omieAppId: string | null;
  clientCode: number | null;
  contato: string | null;
  descricao: string;
  prioridade: TicketPrio;
  status: TicketStatusId;
  openedBy: number | null;
  openedByName: string;
  respUserId: number | null;
  respName: string | null;
  osId: number | null;
  osTipo: string | null;
  lev: {
    origem: string | null;
    obs: string | null;
    itens: Array<{ qtd: number; nome: string; obs: string | null }>;
  } | null;
  setores: TicketSetorId[];
  agDate: string | null;
  createdAt: string;
  updatedAt: string;
  events: TicketEvent[];
};

type TicketLev = NonNullable<Ticket["lev"]>;

function parseLev(raw: unknown): TicketLev | null {
  if (raw == null || raw === "") return null;
  try {
    const parsed = typeof raw === "object" ? raw : JSON.parse(String(raw));
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    const itensRaw = Array.isArray(obj["itens"]) ? obj["itens"] : [];
    const itens = itensRaw
      .map((it) => {
        if (!it || typeof it !== "object") return null;
        const row = it as Record<string, unknown>;
        const nome = str(row["nome"]).trim();
        if (!nome) return null;
        return {
          qtd: num(row["qtd"]) || 1,
          nome,
          obs: nullableStr(row["obs"]),
        };
      })
      .filter((x): x is { qtd: number; nome: string; obs: string | null } => Boolean(x));
    return {
      itens,
      origem: nullableStr(obj["origem"]),
      obs: nullableStr(obj["obs"]),
    };
  } catch {
    return null;
  }
}

function mapTicket(row: Record<string, unknown>, setores: TicketSetorId[] = []): Ticket {
  return {
    id: num(row["id"]),
    num: str(row["num"]),
    cat: str(row["cat"]),
    codigoRef: nullableStr(row["codigo_ref"]),
    clientName: str(row["client_name"]),
    omieAppId: nullableStr(row["omie_app_id"]),
    clientCode: row["client_code"] == null ? null : num(row["client_code"]),
    contato: nullableStr(row["contato"]),
    descricao: str(row["descricao"]),
    prioridade: (str(row["prioridade"]) || "Normal") as TicketPrio,
    status: str(row["status"]) as TicketStatusId,
    openedBy: row["opened_by"] == null ? null : num(row["opened_by"]),
    openedByName: str(row["opened_by_name"]),
    respUserId: row["resp_user_id"] == null ? null : num(row["resp_user_id"]),
    respName: nullableStr(row["resp_name"]),
    osId: row["os_id"] == null ? null : num(row["os_id"]),
    osTipo: nullableStr(row["os_tipo"]),
    lev: parseLev(row["lev_json"]),
    setores,
    agDate: dateOnly(row["ag_date"]),
    createdAt:
      row["created_at"] instanceof Date
        ? row["created_at"].toISOString()
        : str(row["created_at"]),
    updatedAt:
      row["updated_at"] instanceof Date
        ? row["updated_at"].toISOString()
        : str(row["updated_at"]),
    events: [],
  };
}

function parseAnexos(raw: unknown): TicketAnexo[] {
  if (raw == null || raw === "") return [];
  try {
    const parsed = typeof raw === "object" ? raw : JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((it) => {
        if (!it || typeof it !== "object") return null;
        const row = it as Record<string, unknown>;
        const name = str(row["name"]).trim();
        const data = str(row["data"]).trim();
        if (!name || !data) return null;
        return {
          name,
          mime: str(row["mime"]).trim() || "application/octet-stream",
          data,
        };
      })
      .filter((x): x is TicketAnexo => Boolean(x));
  } catch {
    return [];
  }
}

function mapEvent(row: Record<string, unknown>): TicketEvent {
  return {
    id: num(row["id"]),
    quando:
      row["quando"] instanceof Date ? row["quando"].toISOString() : str(row["quando"]),
    quem: str(row["quem"]),
    userId: row["user_id"] == null ? null : num(row["user_id"]),
    tipo: str(row["tipo"]),
    titulo: str(row["titulo"]),
    texto: str(row["texto"]),
    anexos: parseAnexos(row["anexos_json"]),
  };
}

async function nextTicketNum() {
  const raw = (await getSetting("ticket_seq"))?.trim();
  const current = Number(raw);
  const next = Number.isFinite(current) && current > 0 ? Math.floor(current) + 1 : 1;
  await setSetting("ticket_seq", String(next));
  return `TK-${String(next).padStart(4, "0")}`;
}

async function loadSetoresMap(ticketIds: number[]) {
  const map = new Map<number, TicketSetorId[]>();
  if (!ticketIds.length) return map;
  const db = await getDb();
  const rows = (await db`
    select ticket_id, setor from ticket_sectors
    where ticket_id = any(${ticketIds})
    order by setor asc
  `) as Array<{ ticket_id: number; setor: string }>;
  for (const row of rows) {
    const id = num(row.ticket_id);
    const list = map.get(id) ?? [];
    list.push(str(row.setor) as TicketSetorId);
    map.set(id, list);
  }
  return map;
}

export async function addTicketEvent(input: {
  ticketId: number;
  quem: string;
  userId?: number | null;
  tipo: string;
  titulo: string;
  texto?: string;
  anexos?: TicketAnexo[] | undefined;
}) {
  const anexos = (input.anexos ?? [])
    .map((a) => ({
      name: str(a.name).trim(),
      mime: str(a.mime).trim() || "application/octet-stream",
      data: str(a.data).trim(),
    }))
    .filter((a) => a.name && a.data)
    .slice(0, 10);
  const db = await getDb();
  await db`
    insert into ticket_events (ticket_id, quem, user_id, tipo, titulo, texto, anexos_json)
    values (
      ${input.ticketId},
      ${input.quem},
      ${input.userId ?? null},
      ${input.tipo},
      ${input.titulo},
      ${input.texto ?? ""},
      ${anexos.length ? JSON.stringify(anexos) : null}
    )
  `;
}

export async function setTicketSectors(ticketId: number, setores: string[]) {
  const db = await getDb();
  const unique = [...new Set(setores.map((s) => s.trim()).filter(Boolean))];
  await db`delete from ticket_sectors where ticket_id = ${ticketId}`;
  for (const setor of unique) {
    await db`
      insert into ticket_sectors (ticket_id, setor) values (${ticketId}, ${setor})
      on conflict do nothing
    `;
  }
}

export async function createTicket(input: {
  cat: TicketCatId | string;
  codigoRef?: string | null | undefined;
  clientName: string;
  omieAppId?: string | null | undefined;
  clientCode?: number | null | undefined;
  contato?: string | null | undefined;
  descricao: string;
  prioridade?: TicketPrio | undefined;
  setores: string[];
  openedBy: number | null;
  openedByName: string;
  lev?: TicketLev | null | undefined;
}) {
  const db = await getDb();
  const numTk = await nextTicketNum();
  const setores = [...new Set(input.setores.map((s) => s.trim()).filter(Boolean))];
  if (!setores.length) throw new Error("Selecione ao menos um setor.");
  const [row] = (await db`
    insert into tickets (
      num, cat, codigo_ref, client_name, omie_app_id, client_code, contato,
      descricao, prioridade, status, opened_by, opened_by_name, lev_json
    ) values (
      ${numTk},
      ${input.cat},
      ${nullableStr(input.codigoRef)},
      ${input.clientName.trim()},
      ${nullableStr(input.omieAppId)},
      ${input.clientCode ?? null},
      ${nullableStr(input.contato)},
      ${input.descricao.trim()},
      ${input.prioridade ?? "Normal"},
      'aberto',
      ${input.openedBy},
      ${input.openedByName},
      ${input.lev != null ? JSON.stringify(input.lev) : null}
    )
    returning *
  `) as Record<string, unknown>[];
  if (!row) throw new Error("Falha ao criar ticket.");
  const ticket = mapTicket(row, setores as TicketSetorId[]);
  await setTicketSectors(ticket.id, setores);
  await addTicketEvent({
    ticketId: ticket.id,
    quem: input.openedByName,
    userId: input.openedBy,
    tipo: "abertura",
    titulo: "Ticket aberto",
    texto: input.descricao.trim(),
  });
  return getTicketById(ticket.id);
}

export async function getTicketById(id: number) {
  const db = await getDb();
  const [row] = (await db`select * from tickets where id = ${id} limit 1`) as Record<
    string,
    unknown
  >[];
  if (!row) return null;
  const setoresMap = await loadSetoresMap([id]);
  const ticket = mapTicket(row, setoresMap.get(id) ?? []);
  const events = (await db`
    select * from ticket_events where ticket_id = ${id} order by id asc
  `) as Record<string, unknown>[];
  ticket.events = events.map(mapEvent);
  return ticket;
}

export async function listTickets(input: {
  queue: "meu" | "meus" | "todos";
  filter: "ativos" | "fechados" | "todos";
  userId: number;
  userSectors: string[];
  query?: string | undefined;
}) {
  const db = await getDb();
  const q = input.query?.trim() ?? "";
  const like = q ? `%${q}%` : null;
  const rows = (await db`
    select t.*
    from tickets t
    where (
      ${input.filter}::text = 'todos'
      or (${input.filter}::text = 'ativos' and t.status = any(${TICKET_ATIVOS}))
      or (${input.filter}::text = 'fechados' and t.status = any(${["resolvido", "os"]}))
    )
    and (
      ${like}::text is null
      or t.num ilike ${like}
      or t.client_name ilike ${like}
      or coalesce(t.codigo_ref, '') ilike ${like}
      or t.descricao ilike ${like}
    )
    and (
      ${input.queue}::text = 'todos'
      or (${input.queue}::text = 'meus' and t.opened_by = ${input.userId})
      or (
        ${input.queue}::text = 'meu'
        and exists (
          select 1 from ticket_sectors ts
          where ts.ticket_id = t.id
            and ts.setor = any(${input.userSectors})
        )
      )
    )
    order by t.created_at desc
    limit 500
  `) as Record<string, unknown>[];

  const ids = rows.map((r) => num(r["id"]));
  const setoresMap = await loadSetoresMap(ids);
  const tickets = rows.map((r) => mapTicket(r, setoresMap.get(num(r["id"])) ?? []));

  tickets.sort((a, b) => {
    const aActive = TICKET_ATIVOS.includes(a.status) ? 0 : 1;
    const bActive = TICKET_ATIVOS.includes(b.status) ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    const pa = TICKET_PRIO_ORD[a.prioridade] ?? 9;
    const pb = TICKET_PRIO_ORD[b.prioridade] ?? 9;
    if (pa !== pb) return pa - pb;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return tickets;
}

export async function assumeTicket(input: {
  id: number;
  userId: number;
  userName: string;
}) {
  const db = await getDb();
  await db`
    update tickets
    set status = 'andamento',
        resp_user_id = ${input.userId},
        resp_name = ${input.userName},
        updated_at = now()
    where id = ${input.id}
  `;
  await addTicketEvent({
    ticketId: input.id,
    quem: input.userName,
    userId: input.userId,
    tipo: "assumiu",
    titulo: "Assumiu o ticket",
  });
  return getTicketById(input.id);
}

export async function commentTicket(input: {
  id: number;
  userId: number;
  userName: string;
  texto: string;
  anexos?: TicketAnexo[] | undefined;
}) {
  const texto = input.texto.trim();
  const anexos = input.anexos ?? [];
  if (!texto && !anexos.length) throw new Error("Informe um comentário ou anexo.");
  await addTicketEvent({
    ticketId: input.id,
    quem: input.userName,
    userId: input.userId,
    tipo: "coment",
    titulo: anexos.length ? `Comentário · ${anexos.length} anexo(s)` : "Comentário",
    texto,
    anexos,
  });
  const db = await getDb();
  await db`update tickets set updated_at = now() where id = ${input.id}`;
  return getTicketById(input.id);
}

export async function forwardTicket(input: {
  id: number;
  userId: number;
  userName: string;
  addSetores: string[];
  removeMine: boolean;
  mySectors: string[];
  texto?: string | undefined;
}) {
  const current = await getTicketById(input.id);
  if (!current) throw new Error("Ticket não encontrado.");
  let setores = [...current.setores];
  for (const s of input.addSetores) {
    if (!setores.includes(s as TicketSetorId)) setores.push(s as TicketSetorId);
  }
  if (input.removeMine) {
    const mine = new Set(input.mySectors);
    setores = setores.filter((s) => !mine.has(s));
  }
  if (!setores.length) throw new Error("O ticket precisa ficar com ao menos um setor.");
  await setTicketSectors(input.id, setores);
  const db = await getDb();
  await db`
    update tickets
    set status = 'encaminhado',
        resp_user_id = null,
        resp_name = null,
        updated_at = now()
    where id = ${input.id}
  `;
  await addTicketEvent({
    ticketId: input.id,
    quem: input.userName,
    userId: input.userId,
    tipo: "encaminhou",
    titulo: "Encaminhou",
    texto: input.texto?.trim() || `Setores: ${setores.join(", ")}`,
  });
  return getTicketById(input.id);
}

export async function resolveTicket(input: {
  id: number;
  userId: number;
  userName: string;
  texto: string;
  anexos?: TicketAnexo[] | undefined;
}) {
  const texto = input.texto.trim();
  const anexos = input.anexos ?? [];
  if (!texto && !anexos.length) throw new Error("Informe o texto da solução ou um anexo.");
  const db = await getDb();
  await db`
    update tickets
    set status = 'resolvido',
        resp_user_id = coalesce(resp_user_id, ${input.userId}),
        resp_name = coalesce(resp_name, ${input.userName}),
        updated_at = now()
    where id = ${input.id}
  `;
  await addTicketEvent({
    ticketId: input.id,
    quem: input.userName,
    userId: input.userId,
    tipo: "solucao",
    titulo: anexos.length ? `Resolvido · ${anexos.length} anexo(s)` : "Resolvido",
    texto,
    anexos,
  });
  return getTicketById(input.id);
}

export async function reopenTicket(input: {
  id: number;
  userId: number;
  userName: string;
  texto?: string | undefined;
}) {
  const db = await getDb();
  await db`
    update tickets
    set status = 'aberto',
        resp_user_id = null,
        resp_name = null,
        updated_at = now()
    where id = ${input.id}
  `;
  await addTicketEvent({
    ticketId: input.id,
    quem: input.userName,
    userId: input.userId,
    tipo: "reabriu",
    titulo: "Reaberto",
    texto: input.texto?.trim() || "",
  });
  return getTicketById(input.id);
}

export async function scheduleTicket(input: {
  id: number;
  agDate: string | null;
  userId: number;
  userName: string;
}) {
  const current = await getTicketById(input.id);
  if (!current) throw new Error("Ticket não encontrado.");
  const agDate = input.agDate?.trim() ? input.agDate.trim().slice(0, 10) : null;
  const db = await getDb();
  await db`
    update tickets
    set ag_date = ${agDate},
        updated_at = now()
    where id = ${input.id}
  `;
  await addTicketEvent({
    ticketId: input.id,
    quem: input.userName,
    userId: input.userId,
    tipo: "agendamento",
    titulo: agDate ? `Agendado para ${agDate}` : "Data agendada removida",
  });
  return getTicketById(input.id);
}

export async function linkTicketToOs(input: {
  ticketId: number;
  osId: number;
  osTipoLabel: string;
  userId: number;
  userName: string;
}) {
  const current = await getTicketById(input.ticketId);
  if (!current) throw new Error("Ticket não encontrado.");
  const setores = current.setores.includes("assist")
    ? current.setores
    : [...current.setores, "assist" as TicketSetorId];
  await setTicketSectors(input.ticketId, setores);
  const db = await getDb();
  await db`
    update tickets
    set status = 'os',
        os_id = ${input.osId},
        os_tipo = ${input.osTipoLabel},
        resp_user_id = ${input.userId},
        resp_name = ${input.userName},
        updated_at = now()
    where id = ${input.ticketId}
  `;
  await addTicketEvent({
    ticketId: input.ticketId,
    quem: input.userName,
    userId: input.userId,
    tipo: "os",
    titulo: "OS aberta",
    texto: input.osTipoLabel,
  });
  return getTicketById(input.ticketId);
}
