import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";
import { creditTeamStock, teamStockTransaction } from "@/db/team-stock";

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

export type MatSaidaDestino = "os" | "equipe";

export type MatSaidaItemInput = {
  productId: number;
  nome: string;
  qtd: number;
};

export type MatSaida = {
  id: number;
  num: string;
  destino: MatSaidaDestino;
  teamId: number;
  teamName: string;
  tecnicoNome: string | null;
  osId: number | null;
  osNum: string | null;
  status: string;
  createdByName: string | null;
  createdAt: string;
  itens: Array<{
    id: number;
    productId: number;
    nome: string;
    qtd: number;
    osItemId: number | null;
  }>;
};

async function nextSaidaNum() {
  const db = await getDb();
  const rows = await db`
    select num from mat_saidas
    where num ~ '^SD-[0-9]+$'
    order by id desc
    limit 1
  `;
  const last = str((rows as Record<string, unknown>[])[0]?.["num"]);
  const n = last ? Number(last.replace(/^SD-/, "")) : 0;
  const next = Number.isFinite(n) ? n + 1 : 1;
  return `SD-${String(next).padStart(4, "0")}`;
}

function mapSaida(
  row: Record<string, unknown>,
  itens: MatSaida["itens"] = [],
): MatSaida {
  return {
    id: num(row["id"]),
    num: str(row["num"]),
    destino: str(row["destino"]) as MatSaidaDestino,
    teamId: num(row["team_id"]),
    teamName: str(row["team_name"] ?? ""),
    tecnicoNome: row["tecnico_nome"] == null ? null : str(row["tecnico_nome"]),
    osId: row["os_id"] == null ? null : num(row["os_id"]),
    osNum: row["os_num"] == null ? null : str(row["os_num"]),
    status: str(row["status"]),
    createdByName: row["created_by_name"] == null ? null : str(row["created_by_name"]),
    createdAt: iso(row["created_at"]),
    itens,
  };
}

export async function listMatSaidas(limit = 50) {
  const db = await getDb();
  const rows = await db`
    select
      s.*,
      t.name as team_name,
      o.num as os_num
    from mat_saidas s
    join assist_teams t on t.id = s.team_id
    left join assist_os o on o.id = s.os_id
    order by s.id desc
    limit ${Math.min(Math.max(limit, 1), 100)}
  `;
  const saidas = (rows as Record<string, unknown>[]).map((r) => mapSaida(r));
  if (!saidas.length) return saidas;
  const ids = saidas.map((s) => s.id);
  const itens = await db`
    select * from mat_saida_itens
    where saida_id = any(${ids})
    order by id asc
  `;
  const bySaida = new Map<number, MatSaida["itens"]>();
  for (const raw of itens as Record<string, unknown>[]) {
    const saidaId = num(raw["saida_id"]);
    const list = bySaida.get(saidaId) ?? [];
    list.push({
      id: num(raw["id"]),
      productId: num(raw["product_id"]),
      nome: str(raw["nome"]),
      qtd: num(raw["qtd"]),
      osItemId: raw["os_item_id"] == null ? null : num(raw["os_item_id"]),
    });
    bySaida.set(saidaId, list);
  }
  return saidas.map((s) => ({ ...s, itens: bySaida.get(s.id) ?? [] }));
}

export async function emitMatSaida(input: {
  destino: MatSaidaDestino;
  teamId: number;
  tecnicoNome?: string | null;
  osId?: number | null;
  itens: MatSaidaItemInput[];
  userId: number;
  userName: string;
}) {
  if (!input.itens.length) throw new Error("Adicione ao menos um produto.");
  if (input.destino === "os" && !input.osId) {
    throw new Error("Selecione a OS de destino.");
  }

  const db = await getDb();
  const [team] = (await db`
    select id, name from assist_teams where id = ${input.teamId} and active = true limit 1
  `) as Array<{ id: number; name: string }>;
  if (!team) throw new Error("Equipe inválida.");

  let os: { id: number; num: string; stage: number; team_id: number | null } | null = null;
  if (input.osId) {
    const [row] = (await db`
      select id, num, stage, team_id from assist_os where id = ${input.osId} limit 1
    `) as Array<{ id: number; num: string; stage: number; team_id: number | null }>;
    if (!row) throw new Error("OS não encontrada.");
    if (row.stage >= 7) throw new Error("OS já finalizada.");
    os = row;
  }

  const tecnicoNome = input.tecnicoNome?.trim() || null;
  const numSaida = await nextSaidaNum();

  return teamStockTransaction(db, async (tx) => {
    const [saidaRow] = (await tx`
      insert into mat_saidas (
        num, destino, team_id, tecnico_nome, os_id, status,
        created_by, created_by_name
      ) values (
        ${numSaida},
        ${input.destino},
        ${input.teamId},
        ${tecnicoNome},
        ${os?.id ?? null},
        'emitida',
        ${input.userId},
        ${input.userName}
      )
      returning *
    `) as Record<string, unknown>[];
    if (!saidaRow) throw new Error("Falha ao emitir saída.");
    const saidaId = num(saidaRow["id"]);

    if (os && !os.team_id) {
      await tx`
        update assist_os
        set team_id = ${input.teamId},
            tecnico_nome = coalesce(${tecnicoNome}, tecnico_nome),
            updated_at = now()
        where id = ${os.id}
      `;
    } else if (os && tecnicoNome) {
      await tx`
        update assist_os
        set tecnico_nome = coalesce(tecnico_nome, ${tecnicoNome}),
            updated_at = now()
        where id = ${os.id}
      `;
    }

    const itensOut: MatSaida["itens"] = [];
    for (const item of input.itens) {
      const qtd = Number(item.qtd);
      if (!Number.isFinite(qtd) || qtd <= 0) {
        throw new Error(`Quantidade inválida para ${item.nome}.`);
      }
      const nome = item.nome.trim();
      if (!nome) throw new Error("Produto sem nome.");

      let osItemId: number | null = null;
      if (os) {
        const [osItem] = (await tx`
          insert into assist_os_items (
            os_id, qtd, nome, status, origem, equipe, product_id, sort_order
          ) values (
            ${os.id},
            ${qtd},
            ${nome},
            ${os.stage >= 5 ? "campo" : "separado"},
            'pdv',
            ${team.name},
            ${item.productId},
            0
          )
          returning id
        `) as Array<{ id: number }>;
        osItemId = osItem?.id ?? null;
      }

      const [line] = (await tx`
        insert into mat_saida_itens (saida_id, product_id, nome, qtd, os_item_id)
        values (${saidaId}, ${item.productId}, ${nome}, ${qtd}, ${osItemId})
        returning id
      `) as Array<{ id: number }>;

      await creditTeamStock(tx, {
        teamId: input.teamId,
        productId: item.productId,
        nome,
        quantidade: qtd,
        tipo: "entrada_pdv",
        tecnicoNome,
        osId: os?.id ?? null,
        saidaId,
        motivo: os ? `Saída PDV ${numSaida} → OS ${os.num}` : `Saída PDV ${numSaida} → estoque equipe`,
        userId: input.userId,
        userName: input.userName,
      });

      itensOut.push({
        id: line?.id ?? 0,
        productId: item.productId,
        nome,
        qtd,
        osItemId,
      });
    }

    if (os) {
      await tx`
        insert into assist_os_events (os_id, quem, user_id, acao)
        values (
          ${os.id},
          ${input.userName},
          ${input.userId},
          ${`Saída PDV ${numSaida}: ${itensOut.length} item(ns) para equipe ${team.name}${tecnicoNome ? ` · téc. ${tecnicoNome}` : ""}`}
        )
      `;
    }

    return mapSaida(
      {
        ...saidaRow,
        team_name: team.name,
        os_num: os?.num ?? null,
      },
      itensOut,
    );
  });
}
