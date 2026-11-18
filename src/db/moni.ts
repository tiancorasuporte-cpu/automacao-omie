import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";

export const MONI_TIPO_LABEL: Record<number, string> = {
  1: "Residencial",
  2: "Comercial",
  3: "Industrial",
  4: "Patrimônio público",
  5: "Veraneio",
  6: "Condomínio",
  7: "Cooperativa",
  8: "Igreja",
};

export type MoniConta = {
  id: number;
  empresa: number;
  codigo: number;
  segundoCodigo: string | null;
  nome: string;
  razaoSocial: string | null;
  cgc: string | null;
  tipo: number | null;
  tipoLabel: string | null;
  suspenso: boolean;
  endereco: string | null;
  bairro: string | null;
  cep: string | null;
  syncedAt: string;
};

type MoniContaRow = {
  id: number;
  empresa: number | null;
  codigo: number;
  segundo_codigo: string | null;
  nome: string;
  razao_social: string | null;
  cgc: string | null;
  tipo: number | null;
  suspenso: boolean;
  endereco: string | null;
  bairro: string | null;
  cep: string | null;
  synced_at: string | Date;
};

function toConta(row: MoniContaRow): MoniConta {
  const tipo = row.tipo == null ? null : Number(row.tipo);
  return {
    id: row.id,
    empresa: Number(row.empresa ?? 1),
    codigo: Number(row.codigo),
    segundoCodigo: row.segundo_codigo,
    nome: row.nome,
    razaoSocial: row.razao_social,
    cgc: row.cgc,
    tipo,
    tipoLabel: tipo != null ? (MONI_TIPO_LABEL[tipo] ?? `Tipo ${tipo}`) : null,
    suspenso: Boolean(row.suspenso),
    endereco: row.endereco,
    bairro: row.bairro,
    cep: row.cep,
    syncedAt: row.synced_at instanceof Date ? row.synced_at.toISOString() : String(row.synced_at),
  };
}

export function normalizeMoniEmpresa(value: unknown, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.trunc(n);
}

export async function upsertMoniConta(input: {
  empresa: number;
  codigo: number;
  segundoCodigo?: string | null;
  nome: string;
  razaoSocial?: string | null;
  cgc?: string | null;
  tipo?: number | null;
  suspenso?: boolean;
  endereco?: string | null;
  bairro?: string | null;
  cep?: string | null;
}) {
  const db = await getDb();
  const empresa = normalizeMoniEmpresa(input.empresa);
  const nome = input.nome.trim().slice(0, 120) || `Conta ${input.codigo}`;
  await db`
    insert into moni_contas (
      empresa, codigo, segundo_codigo, nome, razao_social, cgc, tipo, suspenso, endereco, bairro, cep, synced_at
    ) values (
      ${empresa},
      ${input.codigo},
      ${input.segundoCodigo?.trim().slice(0, 20) || null},
      ${nome},
      ${input.razaoSocial?.trim().slice(0, 120) || null},
      ${input.cgc?.trim().slice(0, 32) || null},
      ${input.tipo ?? null},
      ${input.suspenso === true},
      ${input.endereco?.trim().slice(0, 120) || null},
      ${input.bairro?.trim().slice(0, 60) || null},
      ${input.cep?.trim().slice(0, 16) || null},
      now()
    )
    on conflict (empresa, codigo) do update set
      segundo_codigo = excluded.segundo_codigo,
      nome = excluded.nome,
      razao_social = excluded.razao_social,
      cgc = excluded.cgc,
      tipo = excluded.tipo,
      suspenso = excluded.suspenso,
      endereco = excluded.endereco,
      bairro = excluded.bairro,
      cep = excluded.cep,
      synced_at = now()
  `;
}

export async function countMoniContas() {
  const db = await getDb();
  const rows = (await db`select count(*)::int as total from moni_contas`) as Array<{ total: number }>;
  return Number(rows[0]?.total ?? 0);
}

export async function getMoniContaByCodigo(codigo: number, empresa?: number | null) {
  const db = await getDb();
  const emp = empresa == null ? null : normalizeMoniEmpresa(empresa);
  if (emp != null) {
    const rows = (await db`
      select * from moni_contas
      where codigo = ${codigo} and empresa = ${emp}
      limit 1
    `) as MoniContaRow[];
    return rows[0] ? toConta(rows[0]) : null;
  }
  const rows = (await db`
    select * from moni_contas where codigo = ${codigo} order by empresa asc limit 1
  `) as MoniContaRow[];
  return rows[0] ? toConta(rows[0]) : null;
}

export async function searchMoniContasLocal(input: {
  query: string;
  empresa?: number | null;
  limit?: number;
}): Promise<MoniConta[]> {
  const db = await getDb();
  const q = input.query.trim();
  if (q.length < 1) return [];
  const limit = Math.min(Math.max(input.limit ?? 40, 1), 100);
  const like = `%${q}%`;
  const digits = q.replace(/\D/g, "");
  const empresa = input.empresa == null ? null : normalizeMoniEmpresa(input.empresa);

  const rows = (await db`
    select *
    from moni_contas
    where
      (${empresa}::int is null or empresa = ${empresa})
      and (
        nome ilike ${like}
        or coalesce(razao_social, '') ilike ${like}
        or coalesce(segundo_codigo, '') ilike ${like}
        or codigo::text ilike ${like}
        or (${digits.length >= 3} and coalesce(cgc, '') ilike ${`%${digits}%`})
      )
    order by
      case when codigo::text = ${q} or segundo_codigo = ${q} then 0 else 1 end,
      empresa asc,
      nome asc
    limit ${limit}
  `) as MoniContaRow[];

  return rows.map(toConta);
}

export async function listMoniEmpresasLocal(): Promise<number[]> {
  const db = await getDb();
  const rows = (await db`
    select distinct empresa::int as empresa
    from moni_contas
    where empresa is not null
    order by empresa asc
  `) as Array<{ empresa: number }>;
  return rows.map((r) => normalizeMoniEmpresa(r.empresa)).filter((n) => n > 0);
}
