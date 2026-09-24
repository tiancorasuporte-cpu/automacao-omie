import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";

export type MonthlyService = {
  id: number;
  nome: string;
  valor: number;
  custo: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type MonthlyServiceRow = {
  id: number;
  nome: string;
  valor: string | number;
  custo?: string | number | null;
  active: boolean;
  created_at: string | Date;
  updated_at: string | Date;
};

function toNumber(value: string | number | null | undefined) {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toService(row: MonthlyServiceRow): MonthlyService {
  return {
    id: row.id,
    nome: row.nome,
    valor: toNumber(row.valor),
    custo: toNumber(row.custo),
    active: Boolean(row.active),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function listMonthlyServices(activeOnly = true) {
  const db = await getDb();
  const rows = activeOnly
    ? ((await db`
        select * from monthly_services
        where active = true
        order by nome asc
      `) as MonthlyServiceRow[])
    : ((await db`
        select * from monthly_services
        order by active desc, nome asc
      `) as MonthlyServiceRow[]);
  return rows.map(toService);
}

export async function getMonthlyServiceById(id: number) {
  const db = await getDb();
  const rows = (await db`
    select * from monthly_services where id = ${id} limit 1
  `) as MonthlyServiceRow[];
  return rows[0] ? toService(rows[0]) : null;
}

export async function createMonthlyService(input: {
  nome: string;
  valor: number;
  custo?: number;
}) {
  const db = await getDb();
  const nome = input.nome.trim();
  if (!nome) throw new Error("Informe o nome do serviço mensal.");
  if (!Number.isFinite(input.valor) || input.valor < 0) {
    throw new Error("Valor do serviço mensal inválido.");
  }
  const custo =
    input.custo != null && Number.isFinite(input.custo) && input.custo >= 0 ? input.custo : 0;
  const rows = (await db`
    insert into monthly_services (nome, valor, custo, active, created_at, updated_at)
    values (${nome.slice(0, 200)}, ${input.valor}, ${custo}, true, now(), now())
    returning *
  `) as MonthlyServiceRow[];
  const row = rows[0];
  if (!row) throw new Error("Não foi possível cadastrar o serviço mensal.");
  return toService(row);
}

export async function updateMonthlyService(input: {
  id: number;
  nome: string;
  valor: number;
  custo?: number;
  active?: boolean;
}) {
  const db = await getDb();
  const nome = input.nome.trim();
  if (!nome) throw new Error("Informe o nome do serviço mensal.");
  if (!Number.isFinite(input.valor) || input.valor < 0) {
    throw new Error("Valor do serviço mensal inválido.");
  }
  const custo =
    input.custo != null && Number.isFinite(input.custo) && input.custo >= 0 ? input.custo : 0;
  const active = input.active !== false;
  const rows = (await db`
    update monthly_services
    set
      nome = ${nome.slice(0, 200)},
      valor = ${input.valor},
      custo = ${custo},
      active = ${active},
      updated_at = now()
    where id = ${input.id}
    returning *
  `) as MonthlyServiceRow[];
  const row = rows[0];
  if (!row) throw new Error("Serviço mensal não encontrado.");
  return toService(row);
}

export async function deactivateMonthlyService(id: number) {
  const db = await getDb();
  await db`
    update monthly_services
    set active = false, updated_at = now()
    where id = ${id}
  `;
}
