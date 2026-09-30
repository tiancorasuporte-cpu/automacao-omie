import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";
import {
  defaultHoursForEscala,
  facilitiesEmpresaLabel,
  facilitiesEscalaLabel,
  facilitiesFuncaoLabel,
  facilitiesMotivoLabel,
  facilitiesMotivoPagaHoras,
  monthRange,
  type FacilitiesEmpresaId,
  type FacilitiesEscalaId,
  type FacilitiesFuncaoId,
  type FacilitiesMotivoId,
} from "@/lib/facilities-domain";

export type FacilitiesPost = {
  id: number;
  nome: string;
  endereco: string | null;
  cidade: string | null;
  observacao: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FacilitiesCollaborator = {
  id: number;
  nome: string;
  empresa: FacilitiesEmpresaId;
  empresaLabel: string;
  funcao: FacilitiesFuncaoId;
  funcaoLabel: string;
  escala: FacilitiesEscalaId;
  escalaLabel: string;
  postoBaseId: number | null;
  postoBaseNome: string | null;
  telefone: string | null;
  active: boolean;
  defaultHours: number;
  createdAt: string;
  updatedAt: string;
};

export type FacilitiesSubstitution = {
  id: number;
  data: string;
  motivo: FacilitiesMotivoId;
  motivoLabel: string;
  postoId: number;
  postoNome: string;
  ausenteId: number;
  ausenteNome: string;
  ausenteEmpresa: string;
  substitutoId: number;
  substitutoNome: string;
  substitutoEmpresa: string;
  substitutoEscala: string;
  horas: number;
  observacao: string | null;
  foraDoPostoBase: boolean;
  pagaHoras: boolean;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
};

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toIso(value: string | Date) {
  return value instanceof Date ? value.toISOString() : String(value);
}

/** Postgres `date` arrives as Date; String(date).slice(0,10) yields "Fri Sep 25". */
function toDateOnly(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const raw = String(value ?? "").trim();
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (iso?.[1]) return iso[1];
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
    const d = String(parsed.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return raw.slice(0, 10);
}

function mapPost(row: Record<string, unknown>): FacilitiesPost {
  return {
    id: toNumber(row["id"]),
    nome: String(row["nome"] ?? ""),
    endereco: row["endereco"] == null ? null : String(row["endereco"]),
    cidade: row["cidade"] == null ? null : String(row["cidade"]),
    observacao: row["observacao"] == null ? null : String(row["observacao"]),
    active: Boolean(row["active"]),
    createdAt: toIso(row["created_at"] as string | Date),
    updatedAt: toIso(row["updated_at"] as string | Date),
  };
}

function mapCollaborator(row: Record<string, unknown>): FacilitiesCollaborator {
  const empresa = String(row["empresa"] ?? "") as FacilitiesEmpresaId;
  const funcao = String(row["funcao"] ?? "") as FacilitiesFuncaoId;
  const escala = String(row["escala"] ?? "") as FacilitiesEscalaId;
  return {
    id: toNumber(row["id"]),
    nome: String(row["nome"] ?? ""),
    empresa,
    empresaLabel: facilitiesEmpresaLabel(empresa),
    funcao,
    funcaoLabel: facilitiesFuncaoLabel(funcao),
    escala,
    escalaLabel: facilitiesEscalaLabel(escala),
    postoBaseId: row["posto_base_id"] == null ? null : toNumber(row["posto_base_id"]),
    postoBaseNome: row["posto_base_nome"] == null ? null : String(row["posto_base_nome"]),
    telefone: row["telefone"] == null ? null : String(row["telefone"]),
    active: Boolean(row["active"]),
    defaultHours: defaultHoursForEscala(escala),
    createdAt: toIso(row["created_at"] as string | Date),
    updatedAt: toIso(row["updated_at"] as string | Date),
  };
}

function mapSubstitution(row: Record<string, unknown>): FacilitiesSubstitution {
  const motivo = String(row["motivo"] ?? "") as FacilitiesMotivoId;
  const postoBaseSubstituto =
    row["substituto_posto_base_id"] == null ? null : toNumber(row["substituto_posto_base_id"]);
  const postoId = toNumber(row["posto_id"]);
  return {
    id: toNumber(row["id"]),
    data: toDateOnly(row["data"]),
    motivo,
    motivoLabel: facilitiesMotivoLabel(motivo),
    postoId,
    postoNome: String(row["posto_nome"] ?? ""),
    ausenteId: toNumber(row["ausente_id"]),
    ausenteNome: String(row["ausente_nome"] ?? ""),
    ausenteEmpresa: facilitiesEmpresaLabel(String(row["ausente_empresa"] ?? "")),
    substitutoId: toNumber(row["substituto_id"]),
    substitutoNome: String(row["substituto_nome"] ?? ""),
    substitutoEmpresa: facilitiesEmpresaLabel(String(row["substituto_empresa"] ?? "")),
    substitutoEscala: facilitiesEscalaLabel(String(row["substituto_escala"] ?? "")),
    horas: toNumber(row["horas"]),
    observacao: row["observacao"] == null ? null : String(row["observacao"]),
    foraDoPostoBase: postoBaseSubstituto != null && postoBaseSubstituto !== postoId,
    pagaHoras: facilitiesMotivoPagaHoras(motivo),
    createdBy: row["created_by"] == null ? null : toNumber(row["created_by"]),
    createdByName: (() => {
      const name = row["created_by_name"] == null ? "" : String(row["created_by_name"]).trim();
      return name || null;
    })(),
    createdAt: toIso(row["created_at"] as string | Date),
  };
}

export async function listFacilitiesPosts(activeOnly = true) {
  const db = await getDb();
  const rows = activeOnly
    ? ((await db`
        select * from facilities_posts
        where active = true
        order by nome asc
      `) as Array<Record<string, unknown>>)
    : ((await db`
        select * from facilities_posts
        order by active desc, nome asc
      `) as Array<Record<string, unknown>>);
  return rows.map(mapPost);
}

export async function createFacilitiesPost(input: {
  nome: string;
  endereco?: string | null;
  cidade?: string | null;
  observacao?: string | null;
}) {
  const db = await getDb();
  const nome = input.nome.trim();
  if (!nome) throw new Error("Informe o nome do posto.");
  const rows = (await db`
    insert into facilities_posts (nome, endereco, cidade, observacao, active, created_at, updated_at)
    values (
      ${nome.slice(0, 200)},
      ${input.endereco?.trim().slice(0, 255) || null},
      ${input.cidade?.trim().slice(0, 120) || null},
      ${input.observacao?.trim() || null},
      true, now(), now()
    )
    returning *
  `) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) throw new Error("Não foi possível cadastrar o posto.");
  return mapPost(row);
}

export async function updateFacilitiesPost(input: {
  id: number;
  nome: string;
  endereco?: string | null;
  cidade?: string | null;
  observacao?: string | null;
  active?: boolean;
}) {
  const db = await getDb();
  const nome = input.nome.trim();
  if (!nome) throw new Error("Informe o nome do posto.");
  const rows = (await db`
    update facilities_posts
    set
      nome = ${nome.slice(0, 200)},
      endereco = ${input.endereco?.trim().slice(0, 255) || null},
      cidade = ${input.cidade?.trim().slice(0, 120) || null},
      observacao = ${input.observacao?.trim() || null},
      active = ${input.active !== false},
      updated_at = now()
    where id = ${input.id}
    returning *
  `) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) throw new Error("Posto não encontrado.");
  return mapPost(row);
}

export async function deactivateFacilitiesPost(id: number) {
  const db = await getDb();
  await db`
    update facilities_posts
    set active = false, updated_at = now()
    where id = ${id}
  `;
}

export async function listFacilitiesCollaborators(activeOnly = true) {
  const db = await getDb();
  const rows = activeOnly
    ? ((await db`
        select
          c.*,
          p.nome as posto_base_nome
        from facilities_collaborators c
        left join facilities_posts p on p.id = c.posto_base_id
        where c.active = true
        order by c.nome asc
      `) as Array<Record<string, unknown>>)
    : ((await db`
        select
          c.*,
          p.nome as posto_base_nome
        from facilities_collaborators c
        left join facilities_posts p on p.id = c.posto_base_id
        order by c.active desc, c.nome asc
      `) as Array<Record<string, unknown>>);
  return rows.map(mapCollaborator);
}

export async function createFacilitiesCollaborator(input: {
  nome: string;
  empresa: FacilitiesEmpresaId;
  funcao: FacilitiesFuncaoId;
  escala: FacilitiesEscalaId;
  postoBaseId?: number | null;
  telefone?: string | null;
}) {
  const db = await getDb();
  const nome = input.nome.trim();
  if (!nome) throw new Error("Informe o nome do colaborador.");
  const rows = (await db`
    insert into facilities_collaborators (
      nome, empresa, funcao, escala, posto_base_id, telefone, active, created_at, updated_at
    ) values (
      ${nome.slice(0, 200)}, ${input.empresa}, ${input.funcao}, ${input.escala},
      ${input.postoBaseId ?? null}, ${input.telefone?.trim().slice(0, 32) || null},
      true, now(), now()
    )
    returning *
  `) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) throw new Error("Não foi possível cadastrar o colaborador.");
  const withPost = (await db`
    select c.*, p.nome as posto_base_nome
    from facilities_collaborators c
    left join facilities_posts p on p.id = c.posto_base_id
    where c.id = ${toNumber(row["id"])}
    limit 1
  `) as Array<Record<string, unknown>>;
  return mapCollaborator(withPost[0] ?? row);
}

export async function updateFacilitiesCollaborator(input: {
  id: number;
  nome: string;
  empresa: FacilitiesEmpresaId;
  funcao: FacilitiesFuncaoId;
  escala: FacilitiesEscalaId;
  postoBaseId?: number | null;
  telefone?: string | null;
  active?: boolean;
}) {
  const db = await getDb();
  const nome = input.nome.trim();
  if (!nome) throw new Error("Informe o nome do colaborador.");
  const rows = (await db`
    update facilities_collaborators
    set
      nome = ${nome.slice(0, 200)},
      empresa = ${input.empresa},
      funcao = ${input.funcao},
      escala = ${input.escala},
      posto_base_id = ${input.postoBaseId ?? null},
      telefone = ${input.telefone?.trim().slice(0, 32) || null},
      active = ${input.active !== false},
      updated_at = now()
    where id = ${input.id}
    returning id
  `) as Array<Record<string, unknown>>;
  if (!rows[0]) throw new Error("Colaborador não encontrado.");
  const withPost = (await db`
    select c.*, p.nome as posto_base_nome
    from facilities_collaborators c
    left join facilities_posts p on p.id = c.posto_base_id
    where c.id = ${input.id}
    limit 1
  `) as Array<Record<string, unknown>>;
  return mapCollaborator(withPost[0]!);
}

export async function deactivateFacilitiesCollaborator(id: number) {
  const db = await getDb();
  await db`
    update facilities_collaborators
    set active = false, updated_at = now()
    where id = ${id}
  `;
}

export async function listFacilitiesSubstitutions(input: {
  monthKey: string;
  postoId?: number | null;
  collaboratorId?: number | null;
}) {
  const db = await getDb();
  const { start, end } = monthRange(input.monthKey);
  const postoId = input.postoId && input.postoId > 0 ? input.postoId : null;
  const collaboratorId =
    input.collaboratorId && input.collaboratorId > 0 ? input.collaboratorId : null;
  const rows = (await db`
    select
      s.*,
      p.nome as posto_nome,
      a.nome as ausente_nome,
      a.empresa as ausente_empresa,
      sub.nome as substituto_nome,
      sub.empresa as substituto_empresa,
      sub.escala as substituto_escala,
      sub.posto_base_id as substituto_posto_base_id,
      coalesce(nullif(trim(u.name), ''), u.username) as created_by_name
    from facilities_substitutions s
    join facilities_posts p on p.id = s.posto_id
    join facilities_collaborators a on a.id = s.ausente_id
    join facilities_collaborators sub on sub.id = s.substituto_id
    left join users u on u.id = s.created_by
    where s.data >= ${start}::date
      and s.data <= ${end}::date
      and (${postoId}::int is null or s.posto_id = ${postoId})
      and (
        ${collaboratorId}::int is null
        or s.ausente_id = ${collaboratorId}
        or s.substituto_id = ${collaboratorId}
      )
    order by s.data desc, s.id desc
  `) as Array<Record<string, unknown>>;
  return rows.map(mapSubstitution);
}

export async function createFacilitiesSubstitution(input: {
  data: string;
  motivo: FacilitiesMotivoId;
  postoId: number;
  ausenteId: number;
  substitutoId: number;
  horas: number;
  observacao?: string | null;
  createdBy?: number | null;
}) {
  if (input.ausenteId === input.substitutoId) {
    throw new Error("Ausente e substituto precisam ser pessoas diferentes.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.data)) {
    throw new Error("Data inválida.");
  }
  if (!Number.isFinite(input.horas) || input.horas <= 0) {
    throw new Error("Informe as horas da substituição.");
  }
  const db = await getDb();
  const rows = (await db`
    insert into facilities_substitutions (
      data, motivo, posto_id, ausente_id, substituto_id, horas, observacao, created_by, created_at, updated_at
    ) values (
      ${input.data}::date, ${input.motivo}, ${input.postoId}, ${input.ausenteId}, ${input.substitutoId},
      ${input.horas}, ${input.observacao?.trim() || null}, ${input.createdBy ?? null}, now(), now()
    )
    returning id
  `) as Array<{ id: number }>;
  const id = Number(rows[0]?.id);
  if (!id) throw new Error("Não foi possível lançar a substituição.");
  const loaded = (await db`
    select
      s.*,
      p.nome as posto_nome,
      a.nome as ausente_nome,
      a.empresa as ausente_empresa,
      sub.nome as substituto_nome,
      sub.empresa as substituto_empresa,
      sub.escala as substituto_escala,
      sub.posto_base_id as substituto_posto_base_id,
      coalesce(nullif(trim(u.name), ''), u.username) as created_by_name
    from facilities_substitutions s
    join facilities_posts p on p.id = s.posto_id
    join facilities_collaborators a on a.id = s.ausente_id
    join facilities_collaborators sub on sub.id = s.substituto_id
    left join users u on u.id = s.created_by
    where s.id = ${id}
    limit 1
  `) as Array<Record<string, unknown>>;
  return mapSubstitution(loaded[0]!);
}

export async function deleteFacilitiesSubstitution(id: number) {
  const db = await getDb();
  await db`delete from facilities_substitutions where id = ${id}`;
}

export async function getFacilitiesMonthSummary(monthKey: string) {
  const db = await getDb();
  const { start, end } = monthRange(monthKey);

  const totals = (await db`
    select
      count(*)::int as trocas,
      count(*) filter (where motivo = 'troca')::int as permutas,
      coalesce(sum(case when motivo <> 'troca' then horas else 0 end), 0)::float as horas
    from facilities_substitutions
    where data >= ${start}::date and data <= ${end}::date
  `) as Array<{ trocas: number; permutas: number; horas: number }>;

  const byPosto = (await db`
    select
      p.id,
      p.nome,
      count(*)::int as trocas,
      coalesce(sum(case when s.motivo <> 'troca' then s.horas else 0 end), 0)::float as horas
    from facilities_substitutions s
    join facilities_posts p on p.id = s.posto_id
    where s.data >= ${start}::date and s.data <= ${end}::date
    group by p.id, p.nome
    order by trocas desc, p.nome asc
  `) as Array<{ id: number; nome: string; trocas: number; horas: number }>;

  const bySubstituto = (await db`
    select
      c.id,
      c.nome,
      c.empresa,
      c.escala,
      count(*) filter (where s.motivo <> 'troca')::int as trocas,
      count(*) filter (where s.motivo = 'troca')::int as permutas,
      coalesce(sum(case when s.motivo <> 'troca' then s.horas else 0 end), 0)::float as horas
    from facilities_substitutions s
    join facilities_collaborators c on c.id = s.substituto_id
    where s.data >= ${start}::date and s.data <= ${end}::date
    group by c.id, c.nome, c.empresa, c.escala
    having
      count(*) filter (where s.motivo <> 'troca') > 0
      or coalesce(sum(case when s.motivo <> 'troca' then s.horas else 0 end), 0) > 0
    order by horas desc, trocas desc, c.nome asc
  `) as Array<{
    id: number;
    nome: string;
    empresa: string;
    escala: string;
    trocas: number;
    permutas: number;
    horas: number;
  }>;

  const byMotivo = (await db`
    select
      motivo,
      count(*)::int as trocas,
      coalesce(sum(case when motivo <> 'troca' then horas else 0 end), 0)::float as horas
    from facilities_substitutions
    where data >= ${start}::date and data <= ${end}::date
    group by motivo
    order by trocas desc
  `) as Array<{ motivo: string; trocas: number; horas: number }>;

  const counts = (await db`
    select
      (select count(*)::int from facilities_posts where active = true) as postos,
      (select count(*)::int from facilities_collaborators where active = true) as colaboradores
  `) as Array<{ postos: number; colaboradores: number }>;

  const foraBase = (await db`
    select count(*)::int as total
    from facilities_substitutions s
    join facilities_collaborators c on c.id = s.substituto_id
    where s.data >= ${start}::date
      and s.data <= ${end}::date
      and c.posto_base_id is not null
      and c.posto_base_id <> s.posto_id
  `) as Array<{ total: number }>;

  return {
    monthKey,
    start,
    end,
    trocas: Number(totals[0]?.trocas ?? 0),
    permutas: Number(totals[0]?.permutas ?? 0),
    horas: Number(totals[0]?.horas ?? 0),
    foraDoPostoBase: Number(foraBase[0]?.total ?? 0),
    postosAtivos: Number(counts[0]?.postos ?? 0),
    colaboradoresAtivos: Number(counts[0]?.colaboradores ?? 0),
    byPosto: byPosto.map((row) => ({
      id: row.id,
      nome: row.nome,
      trocas: Number(row.trocas),
      horas: Number(row.horas),
    })),
    bySubstituto: bySubstituto.map((row) => ({
      id: row.id,
      nome: row.nome,
      empresa: facilitiesEmpresaLabel(row.empresa),
      escala: facilitiesEscalaLabel(row.escala),
      trocas: Number(row.trocas),
      permutas: Number(row.permutas),
      horas: Number(row.horas),
      defaultHours: defaultHoursForEscala(row.escala),
    })),
    byMotivo: byMotivo.map((row) => ({
      motivo: row.motivo,
      motivoLabel: facilitiesMotivoLabel(row.motivo),
      pagaHoras: facilitiesMotivoPagaHoras(row.motivo),
      trocas: Number(row.trocas),
      horas: Number(row.horas),
    })),
  };
}
