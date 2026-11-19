import { getDb } from "@/db/schema";
import { getOsById, addOsEvent, type AssistOs } from "@/db/assistencia";
import { isLevantamentoTecnico } from "@/lib/assistencia-domain";

export type AssistLtItem = {
  id: number;
  osId: number;
  productId: number;
  codigoProduto: number;
  nome: string;
  qtd: number;
};

function num(v: unknown) {
  return Number(v) || 0;
}

function str(v: unknown) {
  return String(v ?? "").trim();
}

export async function listLtItems(osId: number): Promise<AssistLtItem[]> {
  const db = await getDb();
  const rows = (await db`
    select id, os_id, product_id, codigo_produto, nome, qtd
    from assist_lt_items
    where os_id = ${osId}
    order by nome asc, id asc
  `) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: num(r["id"]),
    osId: num(r["os_id"]),
    productId: num(r["product_id"]),
    codigoProduto: num(r["codigo_produto"]),
    nome: str(r["nome"]),
    qtd: num(r["qtd"]) || 1,
  }));
}

async function assertLtEditable(os: AssistOs) {
  if (!isLevantamentoTecnico(os.tipo)) {
    throw new Error("Somente O.S. de Levantamento Técnico.");
  }
  if (os.levStatus === "finalizado") {
    throw new Error("Levantamento finalizado — reabra para editar.");
  }
  if (os.stage < 4) {
    throw new Error("Agende a O.S. antes de montar o levantamento.");
  }
}

export async function nextLtNumero() {
  const db = await getDb();
  const [row] = (await db`
    update app_settings
    set value = (coalesce(nullif(value, ''), '0')::int + 1)::text,
        updated_at = now()
    where key = 'assist_lt_seq'
    returning value
  `) as Array<{ value: string }>;
  const n = Number(row?.value || 1);
  return `L.T. ${String(n).padStart(4, "0")}`;
}

/** Upsert item (consolida qtd do mesmo produto). */
export async function upsertLtItem(input: {
  osId: number;
  productId: number;
  qtd: number;
  quem: string;
  userId?: number | null;
}) {
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  await assertLtEditable(os);
  const qtd = Number(input.qtd);
  if (!Number.isFinite(qtd) || qtd <= 0) throw new Error("Quantidade inválida.");

  const db = await getDb();
  const [prod] = (await db`
    select id, codigo_produto, descricao
    from omie_products
    where id = ${input.productId} and inactive = false
    limit 1
  `) as Array<{ id: number; codigo_produto: number | string; descricao: string }>;
  if (!prod) throw new Error("Produto não encontrado no catálogo Omie.");

  await db`
    insert into assist_lt_items (os_id, product_id, codigo_produto, nome, qtd, updated_at)
    values (
      ${os.id},
      ${prod.id},
      ${Number(prod.codigo_produto)},
      ${String(prod.descricao).slice(0, 400)},
      ${qtd},
      now()
    )
    on conflict (os_id, product_id) do update set
      qtd = excluded.qtd,
      nome = excluded.nome,
      codigo_produto = excluded.codigo_produto,
      updated_at = now()
  `;

  if (!os.levStatus) {
    await db`
      update assist_os set lev_status = 'rascunho', updated_at = now() where id = ${os.id}
    `;
  }

  await addOsEvent({
    osId: os.id,
    quem: input.quem,
    userId: input.userId,
    acao: `L.T. item: ${qtd}× ${prod.descricao}`,
  });
  return getOsById(os.id);
}

export async function removeLtItem(input: {
  osId: number;
  itemId: number;
  quem: string;
  userId?: number | null;
}) {
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  await assertLtEditable(os);
  const db = await getDb();
  const [row] = (await db`
    delete from assist_lt_items
    where id = ${input.itemId} and os_id = ${os.id}
    returning nome
  `) as Array<{ nome: string }>;
  if (row) {
    await addOsEvent({
      osId: os.id,
      quem: input.quem,
      userId: input.userId,
      acao: `L.T. removeu: ${row.nome}`,
    });
  }
  return getOsById(os.id);
}

export async function replaceLtItems(input: {
  osId: number;
  items: Array<{ productId: number; qtd: number }>;
  quem: string;
  userId?: number | null;
}) {
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  await assertLtEditable(os);
  const db = await getDb();

  await db`delete from assist_lt_items where os_id = ${os.id}`;
  for (const it of input.items) {
    const qtd = Number(it.qtd);
    if (!Number.isFinite(qtd) || qtd <= 0) continue;
    const [prod] = (await db`
      select id, codigo_produto, descricao
      from omie_products
      where id = ${it.productId} and inactive = false
      limit 1
    `) as Array<{ id: number; codigo_produto: number | string; descricao: string }>;
    if (!prod) continue;
    await db`
      insert into assist_lt_items (os_id, product_id, codigo_produto, nome, qtd, updated_at)
      values (
        ${os.id}, ${prod.id}, ${Number(prod.codigo_produto)},
        ${String(prod.descricao).slice(0, 400)}, ${qtd}, now()
      )
      on conflict (os_id, product_id) do update set
        qtd = assist_lt_items.qtd + excluded.qtd,
        updated_at = now()
    `;
  }
  await db`
    update assist_os
    set lev_status = coalesce(lev_status, 'rascunho'), updated_at = now()
    where id = ${os.id}
  `;
  await addOsEvent({
    osId: os.id,
    quem: input.quem,
    userId: input.userId,
    acao: "L.T. rascunho salvo",
  });
  return getOsById(os.id);
}

export async function finalizeLevantamentoTecnico(input: {
  osId: number;
  quem: string;
  userId?: number | null;
  isAdmin: boolean;
  canRole: (role: "assistencia" | "estoque" | "compras") => boolean;
}) {
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  if (!isLevantamentoTecnico(os.tipo)) {
    throw new Error("Somente Levantamento Técnico.");
  }
  if (os.levStatus === "finalizado") {
    return { os, already: true as const };
  }
  if (os.stage !== 5) throw new Error("O.S. precisa estar Em execução.");
  if (!os.ciAt) throw new Error("Faça o check-in antes de finalizar o L.T.");

  const items = await listLtItems(os.id);
  if (items.length === 0) {
    throw new Error("Adicione ao menos um produto do catálogo antes de finalizar.");
  }

  if (!input.isAdmin && !input.canRole("assistencia")) {
    throw new Error("Sem permissão para finalizar o levantamento.");
  }

  const db = await getDb();
  let ltNumero = os.ltNumero;
  if (!ltNumero) {
    ltNumero = await nextLtNumero();
  }

  const nowIso = new Date().toISOString();
  await db`
    update assist_os
    set lt_numero = ${ltNumero},
        lev_status = 'finalizado',
        lev_finalizado_em = now(),
        lev_finalizado_por = ${input.quem},
        co_at = coalesce(co_at, now()),
        stage = 6,
        updated_at = now()
    where id = ${os.id}
  `;

  // Espelha em lev_json para compat com telas/tickets antigos
  await db`
    update assist_os
    set lev_json = ${JSON.stringify({
      obs: null,
      itens: items.map((i) => ({
        qtd: i.qtd,
        nome: i.nome,
        obs: null,
        productId: i.productId,
        codigoProduto: i.codigoProduto,
      })),
    })},
    updated_at = now()
    where id = ${os.id}
  `;

  await addOsEvent({
    osId: os.id,
    quem: input.quem,
    userId: input.userId,
    acao: `Levantamento Técnico finalizado · ${ltNumero}`,
  });

  const done = await getOsById(os.id);
  if (!done) throw new Error("OS não encontrada após finalizar.");

  try {
    const { createOportunidadeFromOs } = await import("@/db/crm");
    await createOportunidadeFromOs({
      osNum: done.num,
      osId: done.id,
      cliente: done.clientName,
      cidade: done.clientCity,
      servico: done.servico || null,
      tecnico: done.tecnicoNome || done.teamName || input.quem,
      dataVisita: nowIso.slice(0, 10),
      vendedor: done.createdByName || input.quem,
      autor: input.quem,
      ltNumero,
      omieAppId: done.omieAppId,
      codigoClienteOmie: done.clientCode,
      itens: items.map((i) => ({
        qtd: i.qtd,
        nome: i.nome,
        productId: i.productId,
        codigoProduto: i.codigoProduto,
      })),
    });
  } catch {
    // CRM best-effort
  }

  return { os: done, already: false as const };
}

export async function reopenLevantamentoTecnico(input: {
  osId: number;
  quem: string;
  userId?: number | null;
  isAdmin: boolean;
}) {
  if (!input.isAdmin) throw new Error("Somente admin reabre o L.T.");
  const os = await getOsById(input.osId);
  if (!os) throw new Error("OS não encontrada.");
  if (!isLevantamentoTecnico(os.tipo)) throw new Error("Não é Levantamento Técnico.");
  const db = await getDb();
  await db`
    update assist_os
    set lev_status = 'rascunho',
        lev_finalizado_em = null,
        lev_finalizado_por = null,
        stage = 5,
        updated_at = now()
    where id = ${os.id}
  `;
  await addOsEvent({
    osId: os.id,
    quem: input.quem,
    userId: input.userId,
    acao: "Levantamento Técnico reaberto para correção",
  });
  return getOsById(os.id);
}
