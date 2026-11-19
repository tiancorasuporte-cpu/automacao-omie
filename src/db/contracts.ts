import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";

export const SITUACAO_CONTRATO: Record<string, string> = {
  "00": "Em elaboração",
  "10": "Ativo",
  "90": "Suspenso",
  "99": "Cancelado",
};

export const TIPO_FAT_CONTRATO: Record<string, string> = {
  "01": "Mensal",
  "02": "Bimestral",
  "03": "Trimestral",
  "06": "Semestral",
  "12": "Anual",
};

export type ContratoItemDetalhe = {
  seq: number | null;
  descricao: string | null;
  quantidade: number | null;
  valorUnit: number | null;
  valorTotal: number | null;
};

export type ContratoDetalhesJson = {
  itens?: ContratoItemDetalhe[];
  categoria?: string | null;
  codIntCtr?: string | null;
};

export type OmieContrato = {
  id: number;
  omieAppId: string;
  omieAppName: string;
  codigoContrato: number;
  codigoCliente: number;
  cnpjCpf: string | null;
  clienteNome: string | null;
  numero: string | null;
  situacao: string;
  situacaoLabel: string;
  vigenciaIni: string | null;
  vigenciaFim: string | null;
  valorMensal: number | null;
  tipoFat: string | null;
  tipoFatLabel: string | null;
  descricaoResumo: string | null;
  diaFat: number | null;
  contato: string | null;
  cidadePrestacao: string | null;
  observacoes: string | null;
  detalhes: ContratoDetalhesJson | null;
  moniQtd: number;
  syncedAt: string;
};

export type MoniContaVinculo = {
  id: number;
  omieContratoId: number;
  moniEmpresa: number;
  moniContaCodigo: string;
  moniContaNome: string | null;
  moniContaIdExt: string | null;
  observacao: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClienteContratoGrupo = {
  groupKey: string;
  cnpjCpf: string | null;
  nome: string;
  apps: Array<{ id: string; name: string }>;
  qtdAtivos: number;
  qtdTotal: number;
  valorMensalAtivos: number;
  /** Contas Moni vinculadas a contratos ativos deste cliente. */
  moniQtdAtivos: number;
  /** Contratos ativos que têm ao menos 1 conta Moni. */
  moniContratosAtivos: number;
  codigoCliente: number | null;
  omieAppId: string | null;
};

type ContratoRow = {
  id: number;
  omie_app_id: string;
  omie_app_name: string;
  codigo_contrato: string | number;
  codigo_cliente: string | number;
  cnpj_cpf: string | null;
  cliente_nome: string | null;
  numero: string | null;
  situacao: string;
  vigencia_ini: string | Date | null;
  vigencia_fim: string | Date | null;
  valor_mensal: string | number | null;
  tipo_fat: string | null;
  descricao_resumo: string | null;
  dia_fat: number | null;
  contato: string | null;
  cidade_prestacao: string | null;
  observacoes: string | null;
  detalhes_json: ContratoDetalhesJson | null;
  moni_qtd?: number | string | null;
  synced_at: string | Date;
};

type MoniRow = {
  id: number;
  omie_contrato_id: number;
  moni_empresa?: number | null;
  moni_conta_codigo: string;
  moni_conta_nome: string | null;
  moni_conta_id_ext: string | null;
  observacao: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function dateStr(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value);
  return s.includes("T") ? s.slice(0, 10) : s.slice(0, 10);
}

function isoStr(value: string | Date | null | undefined) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toContrato(row: ContratoRow): OmieContrato {
  const situacao = String(row.situacao ?? "").padStart(2, "0");
  const tipoFat = row.tipo_fat ? String(row.tipo_fat).padStart(2, "0") : null;
  return {
    id: row.id,
    omieAppId: row.omie_app_id,
    omieAppName: row.omie_app_name,
    codigoContrato: Number(row.codigo_contrato),
    codigoCliente: Number(row.codigo_cliente),
    cnpjCpf: row.cnpj_cpf,
    clienteNome: row.cliente_nome,
    numero: row.numero,
    situacao,
    situacaoLabel: SITUACAO_CONTRATO[situacao] ?? situacao,
    vigenciaIni: dateStr(row.vigencia_ini),
    vigenciaFim: dateStr(row.vigencia_fim),
    valorMensal: row.valor_mensal == null ? null : Number(row.valor_mensal),
    tipoFat,
    tipoFatLabel: tipoFat ? (TIPO_FAT_CONTRATO[tipoFat] ?? tipoFat) : null,
    descricaoResumo: row.descricao_resumo,
    diaFat: row.dia_fat == null ? null : Number(row.dia_fat),
    contato: row.contato,
    cidadePrestacao: row.cidade_prestacao,
    observacoes: row.observacoes,
    detalhes: row.detalhes_json ?? null,
    moniQtd: Number(row.moni_qtd ?? 0),
    syncedAt: isoStr(row.synced_at),
  };
}

function toMoni(row: MoniRow): MoniContaVinculo {
  return {
    id: row.id,
    omieContratoId: row.omie_contrato_id,
    moniEmpresa: Number(row.moni_empresa ?? 1) || 1,
    moniContaCodigo: row.moni_conta_codigo,
    moniContaNome: row.moni_conta_nome,
    moniContaIdExt: row.moni_conta_id_ext,
    observacao: row.observacao,
    createdAt: isoStr(row.created_at),
    updatedAt: isoStr(row.updated_at),
  };
}

export function normalizeCnpjCpf(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 11 || digits.length === 14 ? digits : null;
}

export function syntheticClientKey(omieAppId: string, codigoCliente: number) {
  return `${omieAppId}:${codigoCliente}`;
}

export function isSyntheticGroupKey(key: string) {
  return key.includes(":") && !/^\d{11}$|^\d{14}$/.test(key);
}

export async function upsertOmieContrato(input: {
  omieAppId: string;
  omieAppName: string;
  codigoContrato: number;
  codigoCliente: number;
  cnpjCpf?: string | null;
  clienteNome?: string | null;
  numero?: string | null;
  situacao: string;
  vigenciaIni?: string | null;
  vigenciaFim?: string | null;
  valorMensal?: number | null;
  tipoFat?: string | null;
  descricaoResumo?: string | null;
  diaFat?: number | null;
  contato?: string | null;
  cidadePrestacao?: string | null;
  observacoes?: string | null;
  detalhes?: ContratoDetalhesJson | null;
}) {
  const db = await getDb();
  const cnpj = normalizeCnpjCpf(input.cnpjCpf);
  const detalhesJson = input.detalhes ? JSON.stringify(input.detalhes) : null;
  await db`
    insert into omie_contratos (
      omie_app_id, omie_app_name, codigo_contrato, codigo_cliente, cnpj_cpf, cliente_nome,
      numero, situacao, vigencia_ini, vigencia_fim, valor_mensal, tipo_fat, descricao_resumo,
      dia_fat, contato, cidade_prestacao, observacoes, detalhes_json, synced_at
    ) values (
      ${input.omieAppId}, ${input.omieAppName}, ${input.codigoContrato}, ${input.codigoCliente},
      ${cnpj}, ${input.clienteNome?.trim().slice(0, 255) || null},
      ${input.numero?.trim().slice(0, 60) || null},
      ${String(input.situacao).padStart(2, "0").slice(0, 2)},
      ${input.vigenciaIni || null},
      ${input.vigenciaFim || null},
      ${input.valorMensal ?? null},
      ${input.tipoFat ? String(input.tipoFat).padStart(2, "0").slice(0, 2) : null},
      ${input.descricaoResumo?.trim() || null},
      ${input.diaFat ?? null},
      ${input.contato?.trim().slice(0, 160) || null},
      ${input.cidadePrestacao?.trim().slice(0, 120) || null},
      ${input.observacoes?.trim() || null},
      ${detalhesJson},
      now()
    )
    on conflict (omie_app_id, codigo_contrato) do update set
      omie_app_name = excluded.omie_app_name,
      codigo_cliente = excluded.codigo_cliente,
      cnpj_cpf = excluded.cnpj_cpf,
      cliente_nome = excluded.cliente_nome,
      numero = excluded.numero,
      situacao = excluded.situacao,
      vigencia_ini = excluded.vigencia_ini,
      vigencia_fim = excluded.vigencia_fim,
      valor_mensal = excluded.valor_mensal,
      tipo_fat = excluded.tipo_fat,
      descricao_resumo = excluded.descricao_resumo,
      dia_fat = excluded.dia_fat,
      contato = excluded.contato,
      cidade_prestacao = excluded.cidade_prestacao,
      observacoes = excluded.observacoes,
      detalhes_json = excluded.detalhes_json,
      synced_at = now()
  `;
}

export async function countOmieContratos(omieAppId?: string) {
  const db = await getDb();
  const appId = omieAppId?.trim() || null;
  const rows = (await db`
    select count(*)::int as total
    from omie_contratos
    where (${appId}::text is null or omie_app_id = ${appId})
  `) as Array<{ total: number }>;
  return Number(rows[0]?.total ?? 0);
}

export async function listClientesComContratoAtivo(input?: {
  omieAppId?: string | null;
  query?: string | null;
  limit?: number;
  offset?: number;
}): Promise<{ items: ClienteContratoGrupo[]; total: number }> {
  const db = await getDb();
  const appId = input?.omieAppId?.trim() || null;
  const q = input?.query?.trim() || "";
  const like = q ? `%${q}%` : null;
  const limit = Math.min(Math.max(input?.limit ?? 20, 1), 100);
  const offset = Math.max(input?.offset ?? 0, 0);

  const rows = (await db`
    with base as (
      select
        id,
        case
          when nullif(trim(cnpj_cpf), '') is not null then cnpj_cpf
          else omie_app_id || ':' || codigo_cliente::text
        end as group_key,
        cnpj_cpf,
        codigo_cliente,
        omie_app_id,
        omie_app_name,
        cliente_nome,
        situacao,
        coalesce(valor_mensal, 0)::float8 as valor_mensal
      from omie_contratos
      where (${appId}::text is null or omie_app_id = ${appId})
    ),
    with_active as (
      select group_key
      from base
      where situacao = '10'
      group by group_key
    ),
    moni_por_contrato as (
      select omie_contrato_id, count(*)::int as moni_qtd
      from omie_contrato_moni_contas
      group by omie_contrato_id
    ),
    grouped as (
      select
        b.group_key,
        max(nullif(trim(b.cnpj_cpf), '')) as cnpj_cpf,
        coalesce(
          max(nullif(trim(b.cliente_nome), '')) filter (where b.situacao = '10'),
          max(nullif(trim(b.cliente_nome), '')),
          'Cliente'
        ) as nome,
        count(*) filter (where b.situacao = '10')::int as qtd_ativos,
        count(*)::int as qtd_total,
        coalesce(sum(b.valor_mensal) filter (where b.situacao = '10'), 0)::float8 as valor_mensal_ativos,
        coalesce(sum(m.moni_qtd) filter (where b.situacao = '10'), 0)::int as moni_qtd_ativos,
        count(*) filter (
          where b.situacao = '10' and coalesce(m.moni_qtd, 0) > 0
        )::int as moni_contratos_ativos,
        json_agg(jsonb_build_object('id', b.omie_app_id, 'name', b.omie_app_name))
          filter (where b.situacao = '10') as apps_json,
        max(b.codigo_cliente) filter (
          where b.cnpj_cpf is null or trim(b.cnpj_cpf) = ''
        ) as codigo_cliente_sint,
        max(b.omie_app_id) filter (
          where b.cnpj_cpf is null or trim(b.cnpj_cpf) = ''
        ) as omie_app_id_sint
      from base b
      inner join with_active a on a.group_key = b.group_key
      left join moni_por_contrato m on m.omie_contrato_id = b.id
      group by b.group_key
    ),
    filtered as (
      select *
      from grouped g
      where (
        ${like}::text is null
        or g.nome ilike ${like}
        or coalesce(g.cnpj_cpf, '') ilike ${like}
        or g.group_key ilike ${like}
      )
    )
    select
      f.*,
      count(*) over()::int as total_count
    from filtered f
    order by f.nome asc
    limit ${limit}
    offset ${offset}
  `) as Array<{
    group_key: string;
    cnpj_cpf: string | null;
    nome: string;
    qtd_ativos: number;
    qtd_total: number;
    valor_mensal_ativos: number;
    moni_qtd_ativos: number;
    moni_contratos_ativos: number;
    apps_json: Array<{ id: string; name: string }> | null;
    codigo_cliente_sint: string | number | null;
    omie_app_id_sint: string | null;
    total_count: number;
  }>;

  const total = Number(rows[0]?.total_count ?? 0);
  const items = rows.map((row) => {
    const appsRaw = row.apps_json ?? [];
    const seen = new Set<string>();
    const apps: Array<{ id: string; name: string }> = [];
    for (const a of appsRaw) {
      if (!a?.id || seen.has(a.id)) continue;
      seen.add(a.id);
      apps.push({ id: a.id, name: a.name || a.id });
    }
    const cnpj = normalizeCnpjCpf(row.cnpj_cpf);
    return {
      groupKey: row.group_key,
      cnpjCpf: cnpj,
      nome: row.nome || "Cliente",
      apps,
      qtdAtivos: Number(row.qtd_ativos ?? 0),
      qtdTotal: Number(row.qtd_total ?? 0),
      valorMensalAtivos: Number(row.valor_mensal_ativos ?? 0),
      moniQtdAtivos: Number(row.moni_qtd_ativos ?? 0),
      moniContratosAtivos: Number(row.moni_contratos_ativos ?? 0),
      codigoCliente: cnpj ? null : row.codigo_cliente_sint != null ? Number(row.codigo_cliente_sint) : null,
      omieAppId: cnpj ? null : row.omie_app_id_sint,
    };
  });

  return { items, total };
}

export async function listContratosDoCliente(input: {
  groupKey: string;
  omieAppId?: string | null;
}): Promise<OmieContrato[]> {
  const db = await getDb();
  const appId = input.omieAppId?.trim() || null;
  const key = input.groupKey.trim();
  if (!key) return [];

  const synthetic = isSyntheticGroupKey(key);
  let rows: ContratoRow[];

  if (synthetic) {
    const [app, codigoRaw] = key.split(":");
    const codigo = Number(codigoRaw);
    if (!app || !codigo) return [];
    rows = (await db`
      select c.*,
        (select count(*)::int from omie_contrato_moni_contas m where m.omie_contrato_id = c.id) as moni_qtd
      from omie_contratos c
      where c.omie_app_id = ${app}
        and c.codigo_cliente = ${codigo}
        and (${appId}::text is null or c.omie_app_id = ${appId})
      order by
        case when c.situacao = '10' then 0 else 1 end,
        c.vigencia_ini desc nulls last,
        c.numero asc nulls last
    `) as ContratoRow[];
  } else {
    const cnpj = normalizeCnpjCpf(key) ?? key.replace(/\D/g, "");
    rows = (await db`
      select c.*,
        (select count(*)::int from omie_contrato_moni_contas m where m.omie_contrato_id = c.id) as moni_qtd
      from omie_contratos c
      where c.cnpj_cpf = ${cnpj}
        and (${appId}::text is null or c.omie_app_id = ${appId})
      order by
        case when c.situacao = '10' then 0 else 1 end,
        c.omie_app_name asc,
        c.vigencia_ini desc nulls last,
        c.numero asc nulls last
    `) as ContratoRow[];
  }

  return rows.map(toContrato);
}

export async function getContratoById(id: number): Promise<OmieContrato | null> {
  const db = await getDb();
  const rows = (await db`
    select c.*,
      (select count(*)::int from omie_contrato_moni_contas m where m.omie_contrato_id = c.id) as moni_qtd
    from omie_contratos c
    where c.id = ${id}
    limit 1
  `) as ContratoRow[];
  return rows[0] ? toContrato(rows[0]) : null;
}

export async function listMoniContasDoContrato(omieContratoId: number) {
  const db = await getDb();
  const rows = (await db`
    select *
    from omie_contrato_moni_contas
    where omie_contrato_id = ${omieContratoId}
    order by moni_conta_nome asc nulls last, moni_conta_codigo asc
  `) as MoniRow[];
  return rows.map(toMoni);
}

export async function addMoniContaAoContrato(input: {
  omieContratoId: number;
  moniEmpresa: number;
  moniContaCodigo: string;
  moniContaNome?: string | null;
  moniContaIdExt?: string | null;
  observacao?: string | null;
}) {
  const db = await getDb();
  const codigo = input.moniContaCodigo.trim().slice(0, 120);
  if (!codigo) throw new Error("Informe o código da conta Moni.");
  const empresa = Math.trunc(Number(input.moniEmpresa));
  if (!Number.isFinite(empresa) || empresa <= 0) {
    throw new Error("Informe a empresa Moni (tenant).");
  }
  const rows = (await db`
    insert into omie_contrato_moni_contas (
      omie_contrato_id, moni_empresa, moni_conta_codigo, moni_conta_nome, moni_conta_id_ext, observacao
    ) values (
      ${input.omieContratoId},
      ${empresa},
      ${codigo},
      ${input.moniContaNome?.trim().slice(0, 255) || null},
      ${input.moniContaIdExt?.trim().slice(0, 120) || null},
      ${input.observacao?.trim() || null}
    )
    on conflict (omie_contrato_id, moni_empresa, moni_conta_codigo) do update set
      moni_conta_nome = excluded.moni_conta_nome,
      moni_conta_id_ext = coalesce(excluded.moni_conta_id_ext, omie_contrato_moni_contas.moni_conta_id_ext),
      observacao = excluded.observacao,
      updated_at = now()
    returning *
  `) as MoniRow[];
  return toMoni(rows[0]!);
}

export async function removeMoniContaDoContrato(id: number) {
  const db = await getDb();
  await db`delete from omie_contrato_moni_contas where id = ${id}`;
}
