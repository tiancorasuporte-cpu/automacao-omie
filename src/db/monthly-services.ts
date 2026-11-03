import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";

export type MonthlyService = {
  id: number;
  nome: string;
  descricao: string;
  valor: number;
  custo: number;
  active: boolean;
  showInOrcamento: boolean;
  createdAt: string;
  updatedAt: string;
};

type MonthlyServiceRow = {
  id: number;
  nome: string;
  descricao?: string | null;
  valor: string | number;
  custo?: string | number | null;
  active: boolean;
  show_in_orcamento?: boolean | null;
  created_at: string | Date;
  updated_at: string | Date;
};

export type ListMonthlyServicesOptions = {
  /** Só ativos (default true). */
  activeOnly?: boolean;
  /** Só os que entram no seletor de Orçamentos. */
  forOrcamento?: boolean;
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
    descricao: row.descricao?.trim() ? String(row.descricao) : "",
    valor: toNumber(row.valor),
    custo: toNumber(row.custo),
    active: Boolean(row.active),
    showInOrcamento: row.show_in_orcamento !== false,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function listMonthlyServices(
  activeOnlyOrOpts: boolean | ListMonthlyServicesOptions = true,
) {
  const opts: ListMonthlyServicesOptions =
    typeof activeOnlyOrOpts === "boolean"
      ? { activeOnly: activeOnlyOrOpts }
      : activeOnlyOrOpts;
  const activeOnly = opts.activeOnly !== false;
  const forOrcamento = opts.forOrcamento === true;

  const db = await getDb();
  let rows: MonthlyServiceRow[];
  if (activeOnly && forOrcamento) {
    rows = (await db`
      select * from monthly_services
      where active = true and show_in_orcamento = true
      order by nome asc
    `) as MonthlyServiceRow[];
  } else if (activeOnly) {
    rows = (await db`
      select * from monthly_services
      where active = true
      order by nome asc
    `) as MonthlyServiceRow[];
  } else if (forOrcamento) {
    rows = (await db`
      select * from monthly_services
      where show_in_orcamento = true
      order by active desc, nome asc
    `) as MonthlyServiceRow[];
  } else {
    rows = (await db`
      select * from monthly_services
      order by active desc, nome asc
    `) as MonthlyServiceRow[];
  }
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
  descricao?: string;
  valor: number;
  custo?: number;
  showInOrcamento?: boolean;
}) {
  const db = await getDb();
  const nome = input.nome.trim();
  if (!nome) throw new Error("Informe o nome do serviço mensal.");
  if (!Number.isFinite(input.valor) || input.valor < 0) {
    throw new Error("Valor do serviço mensal inválido.");
  }
  const custo =
    input.custo != null && Number.isFinite(input.custo) && input.custo >= 0 ? input.custo : 0;
  const descricao = (input.descricao ?? "").trim().slice(0, 2000);
  const showInOrcamento = input.showInOrcamento !== false;
  const rows = (await db`
    insert into monthly_services (
      nome, descricao, valor, custo, active, show_in_orcamento, created_at, updated_at
    )
    values (
      ${nome.slice(0, 200)}, ${descricao}, ${input.valor}, ${custo}, true,
      ${showInOrcamento}, now(), now()
    )
    returning *
  `) as MonthlyServiceRow[];
  const row = rows[0];
  if (!row) throw new Error("Não foi possível cadastrar o serviço mensal.");
  return toService(row);
}

export async function updateMonthlyService(input: {
  id: number;
  nome: string;
  descricao?: string;
  valor: number;
  custo?: number;
  active?: boolean;
  showInOrcamento?: boolean;
}) {
  const db = await getDb();
  const nome = input.nome.trim();
  if (!nome) throw new Error("Informe o nome do serviço mensal.");
  if (!Number.isFinite(input.valor) || input.valor < 0) {
    throw new Error("Valor do serviço mensal inválido.");
  }
  const existing = await getMonthlyServiceById(input.id);
  if (!existing) throw new Error("Serviço mensal não encontrado.");

  const custo =
    input.custo != null && Number.isFinite(input.custo) && input.custo >= 0
      ? input.custo
      : existing.custo;
  const descricao =
    input.descricao !== undefined
      ? input.descricao.trim().slice(0, 2000)
      : existing.descricao;
  const active = input.active !== undefined ? input.active : existing.active;
  const showInOrcamento =
    input.showInOrcamento !== undefined ? input.showInOrcamento : existing.showInOrcamento;

  const rows = (await db`
    update monthly_services
    set
      nome = ${nome.slice(0, 200)},
      descricao = ${descricao},
      valor = ${input.valor},
      custo = ${custo},
      active = ${active},
      show_in_orcamento = ${showInOrcamento},
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

export async function deleteMonthlyService(id: number) {
  const db = await getDb();
  const rows = (await db`
    delete from monthly_services where id = ${id} returning id
  `) as Array<{ id: number }>;
  if (!rows[0]) throw new Error("Serviço mensal não encontrado.");
}
