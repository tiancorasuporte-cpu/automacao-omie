import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";

type Db = Awaited<ReturnType<typeof getDb>>;

export type TeamStockRow = {
  teamId: number;
  teamName: string;
  productId: number;
  nome: string;
  quantidade: number;
  updatedAt: string;
};

export type TeamStockMove = {
  id: number;
  teamId: number;
  teamName: string;
  productId: number;
  productName: string;
  tipo: string;
  quantidade: number;
  saldoApos: number;
  tecnicoNome: string | null;
  osId: number | null;
  osNum: string | null;
  saidaId: number | null;
  motivo: string | null;
  userName: string | null;
  createdAt: string;
};

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown) {
  return v == null ? "" : String(v);
}

function iso(v: unknown) {
  if (v == null) return "";
  return v instanceof Date ? v.toISOString() : String(v);
}

async function transaction<T>(db: Db, fn: (tx: Db) => Promise<T>): Promise<T> {
  return (await db.begin((tx) => fn(tx as unknown as Db))) as T;
}

export async function listTeamStock(input?: {
  teamId?: number | null;
  query?: string | null;
}) {
  const db = await getDb();
  const teamId = input?.teamId ?? null;
  const query = input?.query?.trim() || null;
  const like = query ? `%${query}%` : null;
  const rows = await db`
    select
      s.team_id,
      t.name as team_name,
      s.product_id,
      s.nome,
      s.quantidade,
      s.updated_at
    from team_stock s
    join assist_teams t on t.id = s.team_id
    where s.quantidade > 0
      and (${teamId}::int is null or s.team_id = ${teamId})
      and (
        ${like}::text is null
        or s.nome ilike ${like}
        or t.name ilike ${like}
      )
    order by t.name asc, s.nome asc
  `;
  return (rows as Record<string, unknown>[]).map((row) => ({
    teamId: num(row["team_id"]),
    teamName: str(row["team_name"]),
    productId: num(row["product_id"]),
    nome: str(row["nome"]),
    quantidade: num(row["quantidade"]),
    updatedAt: iso(row["updated_at"]),
  })) satisfies TeamStockRow[];
}

export async function listTeamStockMoves(input?: {
  teamId?: number | null;
  limit?: number;
}) {
  const db = await getDb();
  const teamId = input?.teamId ?? null;
  const limit = Math.min(Math.max(input?.limit ?? 100, 1), 300);
  const rows = await db`
    select
      m.*,
      t.name as team_name,
      coalesce(p.descricao, '') as product_name,
      o.num as os_num
    from team_stock_moves m
    join assist_teams t on t.id = m.team_id
    left join omie_products p on p.id = m.product_id
    left join assist_os o on o.id = m.os_id
    where (${teamId}::int is null or m.team_id = ${teamId})
    order by m.id desc
    limit ${limit}
  `;
  return (rows as Record<string, unknown>[]).map((row) => ({
    id: num(row["id"]),
    teamId: num(row["team_id"]),
    teamName: str(row["team_name"]),
    productId: num(row["product_id"]),
    productName: str(row["product_name"]),
    tipo: str(row["tipo"]),
    quantidade: num(row["quantidade"]),
    saldoApos: num(row["saldo_apos"]),
    tecnicoNome: row["tecnico_nome"] == null ? null : str(row["tecnico_nome"]),
    osId: row["os_id"] == null ? null : num(row["os_id"]),
    osNum: row["os_num"] == null ? null : str(row["os_num"]),
    saidaId: row["saida_id"] == null ? null : num(row["saida_id"]),
    motivo: row["motivo"] == null ? null : str(row["motivo"]),
    userName: row["user_name"] == null ? null : str(row["user_name"]),
    createdAt: iso(row["created_at"]),
  })) satisfies TeamStockMove[];
}

export async function creditTeamStock(
  tx: Db,
  input: {
    teamId: number;
    productId: number;
    nome: string;
    quantidade: number;
    tipo: string;
    tecnicoNome?: string | null;
    osId?: number | null;
    saidaId?: number | null;
    motivo?: string | null;
    userId?: number | null;
    userName?: string | null;
  },
) {
  const qty = Number(input.quantidade);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantidade inválida.");

  await tx`
    insert into team_stock (team_id, product_id, nome, quantidade, updated_at)
    values (${input.teamId}, ${input.productId}, ${input.nome}, 0, now())
    on conflict (team_id, product_id) do update set nome = excluded.nome
  `;

  const locked = await tx`
    select quantidade from team_stock
    where team_id = ${input.teamId} and product_id = ${input.productId}
    for update
  `;
  const current = num((locked as Record<string, unknown>[])[0]?.["quantidade"]);
  const saldo = current + qty;
  await tx`
    update team_stock
    set quantidade = ${saldo}, nome = ${input.nome}, updated_at = now()
    where team_id = ${input.teamId} and product_id = ${input.productId}
  `;
  await tx`
    insert into team_stock_moves (
      team_id, product_id, tipo, quantidade, saldo_apos,
      tecnico_nome, os_id, saida_id, motivo, user_id, user_name
    ) values (
      ${input.teamId},
      ${input.productId},
      ${input.tipo},
      ${qty},
      ${saldo},
      ${input.tecnicoNome ?? null},
      ${input.osId ?? null},
      ${input.saidaId ?? null},
      ${input.motivo ?? null},
      ${input.userId ?? null},
      ${input.userName ?? null}
    )
  `;
  return saldo;
}

export async function debitTeamStock(
  tx: Db,
  input: {
    teamId: number;
    productId: number;
    quantidade: number;
    tipo: string;
    tecnicoNome?: string | null;
    osId?: number | null;
    saidaId?: number | null;
    motivo?: string | null;
    userId?: number | null;
    userName?: string | null;
  },
) {
  const qty = Number(input.quantidade);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantidade inválida.");

  const locked = await tx`
    select quantidade, nome from team_stock
    where team_id = ${input.teamId} and product_id = ${input.productId}
    for update
  `;
  const row = (locked as Record<string, unknown>[])[0];
  if (!row) throw new Error("Produto sem saldo no estoque da equipe.");
  const current = num(row["quantidade"]);
  if (current < qty) {
    throw new Error(
      `Saldo insuficiente na equipe para ${str(row["nome"])} (disp. ${current}).`,
    );
  }
  const saldo = current - qty;
  await tx`
    update team_stock
    set quantidade = ${saldo}, updated_at = now()
    where team_id = ${input.teamId} and product_id = ${input.productId}
  `;
  await tx`
    insert into team_stock_moves (
      team_id, product_id, tipo, quantidade, saldo_apos,
      tecnico_nome, os_id, saida_id, motivo, user_id, user_name
    ) values (
      ${input.teamId},
      ${input.productId},
      ${input.tipo},
      ${qty},
      ${saldo},
      ${input.tecnicoNome ?? null},
      ${input.osId ?? null},
      ${input.saidaId ?? null},
      ${input.motivo ?? null},
      ${input.userId ?? null},
      ${input.userName ?? null}
    )
  `;
  return saldo;
}

/** Debita estoque da equipe e dá entrada no estoque físico da empresa. */
export async function returnTeamProductToCompany(input: {
  teamId: number;
  productId: number;
  quantidade: number;
  userId: number;
  userName: string;
  motivo?: string | null;
}) {
  const qty = Number(input.quantidade);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantidade inválida.");

  const db = await getDb();
  const { moveProductStock } = await import("@/db/stock");

  const [team] = (await db`
    select name from assist_teams where id = ${input.teamId} limit 1
  `) as Array<{ name: string }>;
  if (!team) throw new Error("Equipe não encontrada.");

  await transaction(db, async (tx) => {
    await debitTeamStock(tx, {
      teamId: input.teamId,
      productId: input.productId,
      quantidade: qty,
      tipo: "devolvido_empresa",
      motivo: input.motivo?.trim() || `Devolução ao estoque · ${team.name}`,
      userId: input.userId,
      userName: input.userName,
    });
  });

  await moveProductStock({
    productId: input.productId,
    tipo: "entrada",
    quantidade: qty,
    motivo: input.motivo?.trim() || `Devolução da ${team.name}`,
    observacao: `Retorno do estoque da equipe ${team.name}`,
    userId: input.userId,
  });

  return { ok: true as const, teamName: team.name };
}

export { transaction as teamStockTransaction };
