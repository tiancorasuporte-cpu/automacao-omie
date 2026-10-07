import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";
import { facilitiesFuncaoLabel } from "@/lib/facilities-domain";
import {
  uniformMovementLabel,
  uniformStockMoveLabel,
  type UniformCondition,
  type UniformDirection,
  type UniformMovementType,
} from "@/lib/uniformes-domain";

export type UniformCollaborator = {
  id: number;
  nome: string;
  matricula: string | null;
  departamento: string | null;
  cargo: string | null;
  telefone: string | null;
  tamanhoCamisa: string | null;
  tamanhoCalca: string | null;
  tamanhoCalcado: string | null;
  facilitiesCollaboratorId: number | null;
  observacao: string | null;
  active: boolean;
  pecasEmPosse: number;
  createdAt: string;
};

export type UniformItem = {
  id: number;
  nome: string;
  categoria: string | null;
  tamanho: string | null;
  quantidade: number;
  estoqueMinimo: number;
  custo: number;
  vidaUtilMeses: number | null;
  fotoThumb: string | null;
  hasFoto: boolean;
  active: boolean;
  baixo: boolean;
  createdAt: string;
};

export type UniformMovementItem = {
  id: number;
  itemId: number;
  direcao: UniformDirection;
  condicao: UniformCondition | null;
  descricao: string;
  tamanho: string | null;
  quantidade: number;
  custoUnitario: number;
  proximaTroca: string | null;
};

export type UniformMovement = {
  id: number;
  collaboratorId: number;
  collaboratorNome: string;
  collaboratorMatricula: string | null;
  collaboratorDepartamento: string | null;
  collaboratorCargo: string | null;
  tipo: UniformMovementType;
  tipoLabel: string;
  observacao: string | null;
  hasAssinatura: boolean;
  photoCount: number;
  status: "ativo" | "estornado";
  estornoMotivo: string | null;
  estornadoEm: string | null;
  estornadoPorNome: string | null;
  createdByName: string | null;
  createdAt: string;
  items: UniformMovementItem[];
  totalSaida: number;
  totalEntrada: number;
};

export type UniformStockMove = {
  id: number;
  itemId: number;
  itemNome: string;
  itemTamanho: string | null;
  tipo: string;
  tipoLabel: string;
  quantidade: number;
  saldoApos: number;
  custoUnitario: number | null;
  fornecedor: string | null;
  documento: string | null;
  motivo: string | null;
  movementId: number | null;
  createdByName: string | null;
  createdAt: string;
};

export type UniformHolding = {
  collaboratorId: number;
  itemId: number;
  descricao: string;
  tamanho: string | null;
  quantidade: number;
  ultimaEntrega: string | null;
  proximaTroca: string | null;
};

type Db = Awaited<ReturnType<typeof getDb>>;
type Row = Record<string, unknown>;

const MAX_PHOTO_CHARS = 1_600_000;
const MAX_THUMB_CHARS = 120_000;
const MAX_SIGNATURE_CHARS = 600_000;

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toIso(value: unknown) {
  if (value == null) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

function toDateOnly(value: unknown) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(String(value));
  return iso?.[1] ?? null;
}

function str(value: unknown) {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function clean(value: string | null | undefined, max: number) {
  const s = value?.trim();
  return s ? s.slice(0, max) : null;
}

function assertImage(value: string, max: number, label: string, mime = /^data:image\/(jpeg|png|webp);base64,/) {
  if (!mime.test(value)) throw new Error(`${label} em formato inválido.`);
  if (value.length > max) throw new Error(`${label} muito grande. Tire a foto novamente.`);
}

function addMonths(months: number) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + months, now.getDate());
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, "0");
  const d = String(target.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** postgres.js types drop the call signature on TransactionSql; runtime is identical. */
async function transaction<T>(db: Db, fn: (tx: Db) => Promise<T>): Promise<T> {
  return (await db.begin((tx) => fn(tx as unknown as Db))) as T;
}

function mapCollaborator(row: Row): UniformCollaborator {
  return {
    id: toNumber(row["id"]),
    nome: String(row["nome"] ?? ""),
    matricula: str(row["matricula"]),
    departamento: str(row["departamento"]),
    cargo: str(row["cargo"]),
    telefone: str(row["telefone"]),
    tamanhoCamisa: str(row["tamanho_camisa"]),
    tamanhoCalca: str(row["tamanho_calca"]),
    tamanhoCalcado: str(row["tamanho_calcado"]),
    facilitiesCollaboratorId:
      row["facilities_collaborator_id"] == null ? null : toNumber(row["facilities_collaborator_id"]),
    observacao: str(row["observacao"]),
    active: Boolean(row["active"]),
    pecasEmPosse: toNumber(row["pecas_em_posse"]),
    createdAt: toIso(row["created_at"]),
  };
}

function mapItem(row: Row): UniformItem {
  const quantidade = toNumber(row["quantidade"]);
  const estoqueMinimo = toNumber(row["estoque_minimo"]);
  return {
    id: toNumber(row["id"]),
    nome: String(row["nome"] ?? ""),
    categoria: str(row["categoria"]),
    tamanho: str(row["tamanho"]),
    quantidade,
    estoqueMinimo,
    custo: toNumber(row["custo"]),
    vidaUtilMeses: row["vida_util_meses"] == null ? null : toNumber(row["vida_util_meses"]),
    fotoThumb: str(row["foto_thumb"]),
    hasFoto: Boolean(row["has_foto"]),
    active: Boolean(row["active"]),
    baixo: Boolean(row["active"]) && quantidade <= estoqueMinimo,
    createdAt: toIso(row["created_at"]),
  };
}

function mapStockMove(row: Row): UniformStockMove {
  const tipo = String(row["tipo"] ?? "");
  return {
    id: toNumber(row["id"]),
    itemId: toNumber(row["item_id"]),
    itemNome: String(row["item_nome"] ?? ""),
    itemTamanho: str(row["item_tamanho"]),
    tipo,
    tipoLabel: uniformStockMoveLabel(tipo),
    quantidade: toNumber(row["quantidade"]),
    saldoApos: toNumber(row["saldo_apos"]),
    custoUnitario: row["custo_unitario"] == null ? null : toNumber(row["custo_unitario"]),
    fornecedor: str(row["fornecedor"]),
    documento: str(row["documento"]),
    motivo: str(row["motivo"]),
    movementId: row["movement_id"] == null ? null : toNumber(row["movement_id"]),
    createdByName: str(row["created_by_name"]),
    createdAt: toIso(row["created_at"]),
  };
}

// ---------- Colaboradores ----------

export async function listUniformCollaborators() {
  const db = await getDb();
  const rows = (await db`
    select
      c.*,
      coalesce((
        select sum(case when mi.direcao = 'saida' then mi.quantidade else -mi.quantidade end)
        from uniform_movement_items mi
        join uniform_movements m on m.id = mi.movement_id
        where m.collaborator_id = c.id and m.status = 'ativo'
      ), 0) as pecas_em_posse
    from uniform_collaborators c
    order by c.active desc, c.nome asc
  `) as Row[];
  return rows.map(mapCollaborator);
}

export type UniformCollaboratorInput = {
  nome: string;
  matricula?: string | null | undefined;
  departamento?: string | null | undefined;
  cargo?: string | null | undefined;
  telefone?: string | null | undefined;
  tamanhoCamisa?: string | null | undefined;
  tamanhoCalca?: string | null | undefined;
  tamanhoCalcado?: string | null | undefined;
  observacao?: string | null | undefined;
};

export async function createUniformCollaborator(input: UniformCollaboratorInput) {
  const db = await getDb();
  const nome = input.nome.trim();
  if (!nome) throw new Error("Informe o nome do colaborador.");
  const rows = (await db`
    insert into uniform_collaborators (
      nome, matricula, departamento, cargo, telefone,
      tamanho_camisa, tamanho_calca, tamanho_calcado, observacao
    ) values (
      ${nome.slice(0, 200)}, ${clean(input.matricula, 40)}, ${clean(input.departamento, 120)},
      ${clean(input.cargo, 120)}, ${clean(input.telefone, 32)},
      ${clean(input.tamanhoCamisa, 12)}, ${clean(input.tamanhoCalca, 12)},
      ${clean(input.tamanhoCalcado, 12)}, ${clean(input.observacao, 2000)}
    )
    returning *, 0 as pecas_em_posse
  `) as Row[];
  return mapCollaborator(rows[0]!);
}

export async function updateUniformCollaborator(
  input: UniformCollaboratorInput & { id: number; active: boolean },
) {
  const db = await getDb();
  const nome = input.nome.trim();
  if (!nome) throw new Error("Informe o nome do colaborador.");
  const rows = (await db`
    update uniform_collaborators set
      nome = ${nome.slice(0, 200)},
      matricula = ${clean(input.matricula, 40)},
      departamento = ${clean(input.departamento, 120)},
      cargo = ${clean(input.cargo, 120)},
      telefone = ${clean(input.telefone, 32)},
      tamanho_camisa = ${clean(input.tamanhoCamisa, 12)},
      tamanho_calca = ${clean(input.tamanhoCalca, 12)},
      tamanho_calcado = ${clean(input.tamanhoCalcado, 12)},
      observacao = ${clean(input.observacao, 2000)},
      active = ${input.active},
      updated_at = now()
    where id = ${input.id}
    returning *, 0 as pecas_em_posse
  `) as Row[];
  if (!rows[0]) throw new Error("Colaborador não encontrado.");
  return mapCollaborator(rows[0]);
}

/** Com histórico o cadastro é só desativado, para não perder o rastro das entregas. */
export async function removeUniformCollaborator(id: number) {
  const db = await getDb();
  const used = (await db`
    select 1 from uniform_movements where collaborator_id = ${id} limit 1
  `) as Row[];
  if (used.length > 0) {
    await db`update uniform_collaborators set active = false, updated_at = now() where id = ${id}`;
    return { deactivated: true as const };
  }
  await db`delete from uniform_collaborators where id = ${id}`;
  return { deactivated: false as const };
}

export async function importUniformCollaboratorsFromFacilities() {
  const db = await getDb();
  const rows = (await db`
    select f.id, f.nome, f.funcao, f.telefone, p.nome as posto_nome
    from facilities_collaborators f
    left join facilities_posts p on p.id = f.posto_base_id
    where f.active = true
      and not exists (
        select 1 from uniform_collaborators u where u.facilities_collaborator_id = f.id
      )
      and not exists (
        select 1 from uniform_collaborators u
        where lower(trim(u.nome)) = lower(trim(f.nome))
      )
    order by f.nome
  `) as Row[];
  for (const row of rows) {
    await db`
      insert into uniform_collaborators (nome, cargo, departamento, telefone, facilities_collaborator_id)
      values (
        ${String(row["nome"])},
        ${facilitiesFuncaoLabel(String(row["funcao"] ?? ""))},
        ${str(row["posto_nome"])},
        ${str(row["telefone"])},
        ${toNumber(row["id"])}
      )
    `;
  }
  return { imported: rows.length };
}

// ---------- Estoque ----------

export async function listUniformItems() {
  const db = await getDb();
  const rows = (await db`
    select
      id, nome, categoria, tamanho, quantidade, estoque_minimo, custo, vida_util_meses,
      foto_thumb, (foto is not null) as has_foto, active, created_at
    from uniform_items
    order by active desc, nome asc, tamanho asc nulls first
  `) as Row[];
  return rows.map(mapItem);
}

export async function getUniformItemPhoto(id: number) {
  const db = await getDb();
  const rows = (await db`select foto from uniform_items where id = ${id}`) as Row[];
  return str(rows[0]?.["foto"]);
}

export type UniformItemInput = {
  nome: string;
  categoria?: string | null | undefined;
  tamanho?: string | null | undefined;
  estoqueMinimo: number;
  custo: number;
  vidaUtilMeses?: number | null | undefined;
};

type PhotoInput = { foto: string; thumb: string } | null;

function validatePhoto(photo: PhotoInput | undefined) {
  if (!photo) return;
  assertImage(photo.foto, MAX_PHOTO_CHARS, "Foto");
  assertImage(photo.thumb, MAX_THUMB_CHARS, "Miniatura");
}

export async function createUniformItem(
  input: UniformItemInput & { quantidadeInicial: number; photo?: PhotoInput; userId: number },
) {
  const nome = input.nome.trim();
  if (!nome) throw new Error("Informe o nome da peça.");
  validatePhoto(input.photo);
  const db = await getDb();
  const tamanho = clean(input.tamanho, 20);
  const dup = (await db`
    select 1 from uniform_items
    where active = true and lower(trim(nome)) = lower(${nome})
      and coalesce(lower(trim(tamanho)), '') = coalesce(lower(${tamanho}), '')
    limit 1
  `) as Row[];
  if (dup.length > 0) {
    throw new Error("Já existe uma peça ativa com esse nome e tamanho. Use Entrada para abastecer.");
  }
  const qtd = Math.max(0, Math.floor(input.quantidadeInicial));
  return transaction(db, async (tx) => {
    const rows = (await tx`
      insert into uniform_items (
        nome, categoria, tamanho, quantidade, estoque_minimo, custo, vida_util_meses, foto, foto_thumb
      ) values (
        ${nome.slice(0, 200)}, ${clean(input.categoria, 60)}, ${tamanho}, ${qtd},
        ${Math.max(0, Math.floor(input.estoqueMinimo))}, ${Math.max(0, input.custo)},
        ${input.vidaUtilMeses && input.vidaUtilMeses > 0 ? Math.floor(input.vidaUtilMeses) : null},
        ${input.photo?.foto ?? null}, ${input.photo?.thumb ?? null}
      )
      returning id, nome, categoria, tamanho, quantidade, estoque_minimo, custo, vida_util_meses,
        foto_thumb, (foto is not null) as has_foto, active, created_at
    `) as Row[];
    const item = mapItem(rows[0]!);
    if (qtd > 0) {
      await tx`
        insert into uniform_stock_moves (item_id, tipo, quantidade, saldo_apos, custo_unitario, created_by)
        values (${item.id}, 'inicial', ${qtd}, ${qtd}, ${item.custo}, ${input.userId})
      `;
    }
    return item;
  });
}

/** `photo`: undefined mantém, null remove. Quantidade só muda por entrada/ajuste. */
export async function updateUniformItem(
  input: UniformItemInput & { id: number; active: boolean; photo?: PhotoInput },
) {
  const nome = input.nome.trim();
  if (!nome) throw new Error("Informe o nome da peça.");
  validatePhoto(input.photo);
  const db = await getDb();
  const keepPhoto = input.photo === undefined;
  const rows = (await db`
    update uniform_items set
      nome = ${nome.slice(0, 200)},
      categoria = ${clean(input.categoria, 60)},
      tamanho = ${clean(input.tamanho, 20)},
      estoque_minimo = ${Math.max(0, Math.floor(input.estoqueMinimo))},
      custo = ${Math.max(0, input.custo)},
      vida_util_meses = ${input.vidaUtilMeses && input.vidaUtilMeses > 0 ? Math.floor(input.vidaUtilMeses) : null},
      foto = case when ${keepPhoto} then foto else ${input.photo?.foto ?? null} end,
      foto_thumb = case when ${keepPhoto} then foto_thumb else ${input.photo?.thumb ?? null} end,
      active = ${input.active},
      updated_at = now()
    where id = ${input.id}
    returning id, nome, categoria, tamanho, quantidade, estoque_minimo, custo, vida_util_meses,
      foto_thumb, (foto is not null) as has_foto, active, created_at
  `) as Row[];
  if (!rows[0]) throw new Error("Peça não encontrada.");
  return mapItem(rows[0]);
}

/** Peça já movimentada é desativada para preservar histórico e custos. */
export async function removeUniformItem(id: number) {
  const db = await getDb();
  const used = (await db`
    select 1 from uniform_movement_items where item_id = ${id} limit 1
  `) as Row[];
  if (used.length > 0) {
    await db`update uniform_items set active = false, updated_at = now() where id = ${id}`;
    return { deactivated: true as const };
  }
  await transaction(db, async (tx) => {
    await tx`delete from uniform_stock_moves where item_id = ${id}`;
    await tx`delete from uniform_items where id = ${id}`;
  });
  return { deactivated: false as const };
}

async function lockItem(tx: Db, id: number) {
  const rows = (await tx`
    select id, nome, tamanho, quantidade, custo, vida_util_meses, active
    from uniform_items where id = ${id} for update
  `) as Row[];
  const row = rows[0];
  if (!row) throw new Error("Peça não encontrada.");
  return {
    id,
    nome: String(row["nome"]),
    tamanho: str(row["tamanho"]),
    quantidade: toNumber(row["quantidade"]),
    custo: toNumber(row["custo"]),
    vidaUtilMeses: row["vida_util_meses"] == null ? null : toNumber(row["vida_util_meses"]),
    active: Boolean(row["active"]),
  };
}

/** Custo médio ponderado: compras com preços diferentes não distorcem o valor em estoque. */
export async function restockUniformItem(input: {
  itemId: number;
  quantidade: number;
  custoUnitario: number;
  fornecedor?: string | null | undefined;
  documento?: string | null | undefined;
  motivo?: string | null | undefined;
  userId: number;
}) {
  const qtd = Math.floor(input.quantidade);
  if (qtd <= 0) throw new Error("Informe uma quantidade maior que zero.");
  const custo = Math.max(0, input.custoUnitario);
  const db = await getDb();
  return transaction(db, async (tx) => {
    const item = await lockItem(tx, input.itemId);
    const novoSaldo = item.quantidade + qtd;
    const custoMedio =
      novoSaldo > 0 ? (item.quantidade * item.custo + qtd * custo) / novoSaldo : custo;
    await tx`
      update uniform_items
      set quantidade = ${novoSaldo}, custo = ${Math.round(custoMedio * 100) / 100}, updated_at = now()
      where id = ${item.id}
    `;
    await tx`
      insert into uniform_stock_moves (
        item_id, tipo, quantidade, saldo_apos, custo_unitario, fornecedor, documento, motivo, created_by
      ) values (
        ${item.id}, 'entrada', ${qtd}, ${novoSaldo}, ${custo},
        ${clean(input.fornecedor, 160)}, ${clean(input.documento, 80)}, ${clean(input.motivo, 2000)},
        ${input.userId}
      )
    `;
    return { saldo: novoSaldo };
  });
}

export async function adjustUniformItem(input: {
  itemId: number;
  novaQuantidade: number;
  motivo: string;
  userId: number;
}) {
  const nova = Math.floor(input.novaQuantidade);
  if (nova < 0) throw new Error("A quantidade não pode ser negativa.");
  const motivo = input.motivo.trim();
  if (!motivo) throw new Error("Informe o motivo do ajuste.");
  const db = await getDb();
  return transaction(db, async (tx) => {
    const item = await lockItem(tx, input.itemId);
    const delta = nova - item.quantidade;
    if (delta === 0) return { saldo: nova };
    await tx`update uniform_items set quantidade = ${nova}, updated_at = now() where id = ${item.id}`;
    await tx`
      insert into uniform_stock_moves (item_id, tipo, quantidade, saldo_apos, custo_unitario, motivo, created_by)
      values (${item.id}, 'ajuste', ${delta}, ${nova}, ${item.custo}, ${motivo.slice(0, 2000)}, ${input.userId})
    `;
    return { saldo: nova };
  });
}

export async function listUniformStockMoves(limit = 1500) {
  const db = await getDb();
  const rows = (await db`
    select
      s.*,
      i.nome as item_nome,
      i.tamanho as item_tamanho,
      coalesce(nullif(trim(u.name), ''), u.username) as created_by_name
    from uniform_stock_moves s
    join uniform_items i on i.id = s.item_id
    left join users u on u.id = s.created_by
    order by s.created_at desc, s.id desc
    limit ${limit}
  `) as Row[];
  return rows.map(mapStockMove);
}

// ---------- Movimentações ----------

export async function listUniformMovements(limit = 2000) {
  const db = await getDb();
  const headers = (await db`
    select
      m.id, m.collaborator_id, m.tipo, m.observacao, m.status, m.estorno_motivo, m.estornado_em,
      m.created_at, (m.assinatura is not null) as has_assinatura,
      (select count(*) from uniform_movement_photos p where p.movement_id = m.id) as photo_count,
      c.nome as collaborator_nome, c.matricula, c.departamento, c.cargo,
      coalesce(nullif(trim(u.name), ''), u.username) as created_by_name,
      coalesce(nullif(trim(e.name), ''), e.username) as estornado_por_nome
    from uniform_movements m
    join uniform_collaborators c on c.id = m.collaborator_id
    left join users u on u.id = m.created_by
    left join users e on e.id = m.estornado_por
    order by m.created_at desc, m.id desc
    limit ${limit}
  `) as Row[];
  if (headers.length === 0) return [] as UniformMovement[];
  const ids = headers.map((h) => toNumber(h["id"]));
  const itemRows = (await db`
    select * from uniform_movement_items
    where movement_id in ${db(ids)}
    order by id
  `) as Row[];
  const byMovement = new Map<number, UniformMovementItem[]>();
  for (const row of itemRows) {
    const movementId = toNumber(row["movement_id"]);
    const list = byMovement.get(movementId) ?? [];
    list.push({
      id: toNumber(row["id"]),
      itemId: toNumber(row["item_id"]),
      direcao: String(row["direcao"]) === "entrada" ? "entrada" : "saida",
      condicao: row["condicao"] == null ? null : (String(row["condicao"]) as UniformCondition),
      descricao: String(row["descricao"] ?? ""),
      tamanho: str(row["tamanho"]),
      quantidade: toNumber(row["quantidade"]),
      custoUnitario: toNumber(row["custo_unitario"]),
      proximaTroca: toDateOnly(row["proxima_troca"]),
    });
    byMovement.set(movementId, list);
  }
  return headers.map((h): UniformMovement => {
    const id = toNumber(h["id"]);
    const items = byMovement.get(id) ?? [];
    const tipo = String(h["tipo"]) as UniformMovementType;
    return {
      id,
      collaboratorId: toNumber(h["collaborator_id"]),
      collaboratorNome: String(h["collaborator_nome"] ?? ""),
      collaboratorMatricula: str(h["matricula"]),
      collaboratorDepartamento: str(h["departamento"]),
      collaboratorCargo: str(h["cargo"]),
      tipo,
      tipoLabel: uniformMovementLabel(tipo),
      observacao: str(h["observacao"]),
      hasAssinatura: Boolean(h["has_assinatura"]),
      photoCount: toNumber(h["photo_count"]),
      status: String(h["status"]) === "estornado" ? "estornado" : "ativo",
      estornoMotivo: str(h["estorno_motivo"]),
      estornadoEm: h["estornado_em"] == null ? null : toIso(h["estornado_em"]),
      estornadoPorNome: str(h["estornado_por_nome"]),
      createdByName: str(h["created_by_name"]),
      createdAt: toIso(h["created_at"]),
      items,
      totalSaida: items
        .filter((i) => i.direcao === "saida")
        .reduce((sum, i) => sum + i.quantidade * i.custoUnitario, 0),
      totalEntrada: items
        .filter((i) => i.direcao === "entrada")
        .reduce((sum, i) => sum + i.quantidade * i.custoUnitario, 0),
    };
  });
}

export async function getUniformMovementMedia(id: number) {
  const db = await getDb();
  const header = (await db`select assinatura from uniform_movements where id = ${id}`) as Row[];
  const photos = (await db`
    select id, foto from uniform_movement_photos where movement_id = ${id} order by id
  `) as Row[];
  return {
    assinatura: str(header[0]?.["assinatura"]),
    photos: photos.map((p) => ({ id: toNumber(p["id"]), foto: String(p["foto"]) })),
  };
}

export async function listUniformHoldings(collaboratorId?: number) {
  const db = await getDb();
  const filter = collaboratorId ?? null;
  const rows = (await db`
    select
      m.collaborator_id,
      mi.item_id,
      i.nome as descricao,
      i.tamanho,
      sum(case when mi.direcao = 'saida' then mi.quantidade else -mi.quantidade end) as quantidade,
      max(case when mi.direcao = 'saida' then m.created_at end) as ultima_entrega,
      max(case when mi.direcao = 'saida' then mi.proxima_troca end) as proxima_troca
    from uniform_movement_items mi
    join uniform_movements m on m.id = mi.movement_id
    join uniform_items i on i.id = mi.item_id
    where m.status = 'ativo'
      and (${filter}::int is null or m.collaborator_id = ${filter})
    group by m.collaborator_id, mi.item_id, i.nome, i.tamanho
    having sum(case when mi.direcao = 'saida' then mi.quantidade else -mi.quantidade end) > 0
    order by i.nome
  `) as Row[];
  return rows.map(
    (row): UniformHolding => ({
      collaboratorId: toNumber(row["collaborator_id"]),
      itemId: toNumber(row["item_id"]),
      descricao: String(row["descricao"] ?? ""),
      tamanho: str(row["tamanho"]),
      quantidade: toNumber(row["quantidade"]),
      ultimaEntrega: row["ultima_entrega"] == null ? null : toIso(row["ultima_entrega"]),
      proximaTroca: toDateOnly(row["proxima_troca"]),
    }),
  );
}

type LineInput = { itemId: number; quantidade: number };

function aggregate<T extends LineInput>(lines: T[], key: (l: T) => string) {
  const map = new Map<string, T>();
  for (const line of lines) {
    const q = Math.floor(line.quantidade);
    if (q <= 0) throw new Error("Quantidade deve ser maior que zero.");
    const k = key(line);
    const prev = map.get(k);
    map.set(k, prev ? { ...prev, quantidade: prev.quantidade + q } : { ...line, quantidade: q });
  }
  return [...map.values()];
}

export async function createUniformMovement(input: {
  collaboratorId: number;
  tipo: UniformMovementType;
  observacao?: string | null | undefined;
  assinatura: string;
  fotos: Array<{ foto: string; thumb: string }>;
  saidas: LineInput[];
  entradas: Array<LineInput & { condicao: UniformCondition }>;
  userId: number;
}) {
  assertImage(input.assinatura, MAX_SIGNATURE_CHARS, "Assinatura", /^data:image\/png;base64,/);
  if (input.fotos.length > 6) throw new Error("Máximo de 6 fotos por movimentação.");
  input.fotos.forEach((f) => validatePhoto(f));

  const saidas = aggregate(input.saidas, (l) => String(l.itemId));
  const entradas = aggregate(input.entradas, (l) => `${l.itemId}:${l.condicao}`);

  if (input.tipo === "entrega" && (saidas.length === 0 || entradas.length > 0)) {
    throw new Error("Na entrega, informe apenas as peças entregues.");
  }
  if (input.tipo === "devolucao" && (entradas.length === 0 || saidas.length > 0)) {
    throw new Error("Na devolução, informe apenas as peças devolvidas.");
  }
  if (input.tipo === "troca" && (saidas.length === 0 || entradas.length === 0)) {
    throw new Error("Na troca, informe a peça devolvida e a peça nova entregue.");
  }

  const db = await getDb();
  return transaction(db, async (tx) => {
    const collab = (await tx`
      select id, active from uniform_collaborators where id = ${input.collaboratorId}
    `) as Row[];
    if (!collab[0]) throw new Error("Colaborador não encontrado.");
    if (!collab[0]["active"]) throw new Error("Colaborador inativo.");

    const returnedByItem = new Map<number, number>();
    for (const e of entradas) {
      returnedByItem.set(e.itemId, (returnedByItem.get(e.itemId) ?? 0) + e.quantidade);
    }
    if (returnedByItem.size > 0) {
      const held = (await tx`
        select mi.item_id,
          sum(case when mi.direcao = 'saida' then mi.quantidade else -mi.quantidade end) as qtd
        from uniform_movement_items mi
        join uniform_movements m on m.id = mi.movement_id
        where m.status = 'ativo' and m.collaborator_id = ${input.collaboratorId}
        group by mi.item_id
      `) as Row[];
      const heldMap = new Map(held.map((r) => [toNumber(r["item_id"]), toNumber(r["qtd"])]));
      for (const [itemId, qtd] of returnedByItem) {
        const has = heldMap.get(itemId) ?? 0;
        if (has < qtd) {
          const it = await lockItem(tx, itemId);
          throw new Error(
            `${it.nome}${it.tamanho ? ` (${it.tamanho})` : ""}: o colaborador tem ${has} em posse, não dá para devolver ${qtd}.`,
          );
        }
      }
    }

    const movRows = (await tx`
      insert into uniform_movements (collaborator_id, tipo, observacao, assinatura, created_by)
      values (
        ${input.collaboratorId}, ${input.tipo}, ${clean(input.observacao, 2000)},
        ${input.assinatura}, ${input.userId}
      )
      returning id
    `) as Row[];
    const movementId = toNumber(movRows[0]!["id"]);

    for (const line of saidas) {
      const item = await lockItem(tx, line.itemId);
      if (!item.active) throw new Error(`${item.nome} está inativa.`);
      if (item.quantidade < line.quantidade) {
        throw new Error(
          `Estoque insuficiente de ${item.nome}${item.tamanho ? ` (${item.tamanho})` : ""}: disponível ${item.quantidade}.`,
        );
      }
      const saldo = item.quantidade - line.quantidade;
      await tx`update uniform_items set quantidade = ${saldo}, updated_at = now() where id = ${item.id}`;
      await tx`
        insert into uniform_movement_items (
          movement_id, item_id, direcao, descricao, tamanho, quantidade, custo_unitario, proxima_troca
        ) values (
          ${movementId}, ${item.id}, 'saida', ${item.nome}, ${item.tamanho}, ${line.quantidade},
          ${item.custo}, ${item.vidaUtilMeses ? addMonths(item.vidaUtilMeses) : null}
        )
      `;
      await tx`
        insert into uniform_stock_moves (item_id, tipo, quantidade, saldo_apos, custo_unitario, movement_id, created_by)
        values (${item.id}, 'saida', ${-line.quantidade}, ${saldo}, ${item.custo}, ${movementId}, ${input.userId})
      `;
    }

    for (const line of entradas) {
      const item = await lockItem(tx, line.itemId);
      await tx`
        insert into uniform_movement_items (
          movement_id, item_id, direcao, condicao, descricao, tamanho, quantidade, custo_unitario
        ) values (
          ${movementId}, ${item.id}, 'entrada', ${line.condicao}, ${item.nome}, ${item.tamanho},
          ${line.quantidade}, ${item.custo}
        )
      `;
      if (line.condicao === "reaproveitavel") {
        const saldo = item.quantidade + line.quantidade;
        await tx`update uniform_items set quantidade = ${saldo}, updated_at = now() where id = ${item.id}`;
        await tx`
          insert into uniform_stock_moves (item_id, tipo, quantidade, saldo_apos, custo_unitario, movement_id, created_by)
          values (${item.id}, 'devolucao', ${line.quantidade}, ${saldo}, ${item.custo}, ${movementId}, ${input.userId})
        `;
      }
    }

    for (const photo of input.fotos) {
      await tx`
        insert into uniform_movement_photos (movement_id, foto, thumb)
        values (${movementId}, ${photo.foto}, ${photo.thumb})
      `;
    }

    return { movementId };
  });
}

/** Estorno desfaz o efeito no estoque mantendo o registro (substitui editar/excluir). */
export async function reverseUniformMovement(input: { id: number; motivo: string; userId: number }) {
  const motivo = input.motivo.trim();
  if (!motivo) throw new Error("Informe o motivo do estorno.");
  const db = await getDb();
  return transaction(db, async (tx) => {
    const rows = (await tx`
      select id, status from uniform_movements where id = ${input.id} for update
    `) as Row[];
    if (!rows[0]) throw new Error("Movimentação não encontrada.");
    if (String(rows[0]["status"]) === "estornado") throw new Error("Movimentação já estornada.");

    const items = (await tx`
      select item_id, direcao, condicao, quantidade from uniform_movement_items where movement_id = ${input.id}
    `) as Row[];
    for (const row of items) {
      const direcao = String(row["direcao"]);
      const condicao = str(row["condicao"]);
      const qtd = toNumber(row["quantidade"]);
      let delta = 0;
      if (direcao === "saida") delta = qtd;
      else if (condicao === "reaproveitavel") delta = -qtd;
      if (delta === 0) continue;
      const item = await lockItem(tx, toNumber(row["item_id"]));
      const saldo = item.quantidade + delta;
      if (saldo < 0) {
        throw new Error(
          `Não dá para estornar: ${item.nome} ficaria com estoque negativo (atual ${item.quantidade}).`,
        );
      }
      await tx`update uniform_items set quantidade = ${saldo}, updated_at = now() where id = ${item.id}`;
      await tx`
        insert into uniform_stock_moves (item_id, tipo, quantidade, saldo_apos, custo_unitario, motivo, movement_id, created_by)
        values (${item.id}, 'estorno', ${delta}, ${saldo}, ${item.custo}, ${motivo.slice(0, 2000)}, ${input.id}, ${input.userId})
      `;
    }
    await tx`
      update uniform_movements set
        status = 'estornado', estorno_motivo = ${motivo.slice(0, 2000)},
        estornado_em = now(), estornado_por = ${input.userId}
      where id = ${input.id}
    `;
    return { ok: true as const };
  });
}
