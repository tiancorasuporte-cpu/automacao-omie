import { getSql } from "../src/db/client";
import { ensureSchema } from "../src/db/schema";

const SUPABASE_URL = (process.env["TRACKER_SUPABASE_URL"] ?? "https://ojupbvpujqrerfqunqrt.supabase.co").replace(/\/$/, "");
const SUPABASE_KEY = process.env["TRACKER_SUPABASE_KEY"] ?? "sb_publishable_Q8HdSy1rI6svIqgogkKaow_W9DbDZl-";
const SERVICE_KEY = process.env["TRACKER_SERVICE_KEY"]?.trim();
const EMAIL = process.env["TRACKER_EMAIL"]?.trim();
const PASSWORD = process.env["TRACKER_PASSWORD"];
const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_MEDIA = process.argv.includes("--sem-midia");
const MOTIVO = "Importado do uniform-tracker-pro";

type TrackerCollaborator = {
  id: string;
  name: string;
  department: string | null;
  phone: string | null;
  cost_center_id?: string | null;
  created_at: string;
  updated_at?: string | null;
};
type TrackerCostCenter = { id: string; name: string };
type TrackerInventory = {
  id: string;
  piece: string;
  size: string | null;
  quantity: number;
  min_quantity: number;
  cost: number | string | null;
  value: number | string | null;
  created_at: string;
};
type TrackerMovementItem = {
  piece: string;
  size: string | null;
  cost: number | string | null;
  quantity: number | null;
  inventory_id: string | null;
};
type TrackerMovement = {
  id: string;
  collaborator_id: string;
  type: "entrega" | "troca" | "devolucao";
  notes: string | null;
  signature_url: string | null;
  photo_urls: string[] | null;
  created_at: string;
  movement_items: TrackerMovementItem[];
};

async function authToken() {
  if (SERVICE_KEY) return SERVICE_KEY;
  if (!EMAIL || !PASSWORD) {
    throw new Error("Defina TRACKER_EMAIL e TRACKER_PASSWORD (login do uniform-tracker-pro) ou TRACKER_SERVICE_KEY.");
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string; msg?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`Falha no login do Supabase: ${body.error_description ?? body.msg ?? res.status}`);
  }
  return body.access_token;
}

function headers(token: string) {
  return { apikey: SERVICE_KEY ?? SUPABASE_KEY, Authorization: `Bearer ${token}` };
}

async function fetchAll<T>(token: string, table: string, select = "*"): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=created_at.asc&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, { headers: headers(token) });
    if (!res.ok) throw new Error(`Erro ao ler ${table}: ${res.status} ${await res.text()}`);
    const page = (await res.json()) as T[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function downloadAsDataUrl(token: string, ref: string | null | undefined): Promise<string | null> {
  if (!ref || SKIP_MEDIA) return null;
  if (ref.startsWith("data:")) return ref;
  const url = /^https?:\/\//.test(ref)
    ? ref
    : `${SUPABASE_URL}/storage/v1/object/authenticated/uniformes/${ref.replace(/^\/+/, "").replace(/^uniformes\//, "")}`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) {
    console.warn(`  ! NÃ£o foi possÃ­vel baixar ${ref}: ${res.status}`);
    return null;
  }
  const type = res.headers.get("content-type")?.split(";")[0] || "image/png";
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:${type};base64,${buffer.toString("base64")}`;
}

function money(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function clean(value: string | null | undefined, max: number) {
  const text = (value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

function norm(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

const token = await authToken();
console.log("Lendo dados do uniform-tracker-pro...");
const [collaborators, costCenters, inventory, movements] = await Promise.all([
  fetchAll<TrackerCollaborator>(token, "collaborators"),
  fetchAll<TrackerCostCenter>(token, "cost_centers").catch(() => [] as TrackerCostCenter[]),
  fetchAll<TrackerInventory>(token, "inventory"),
  fetchAll<TrackerMovement>(
    token,
    "movements",
    "id,collaborator_id,type,notes,signature_url,photo_urls,created_at,movement_items(piece,size,cost,quantity,inventory_id)",
  ),
]);
console.log(
  `Encontrados: ${collaborators.length} colaboradores, ${inventory.length} peÃ§as, ${movements.length} movimentaÃ§Ãµes.`,
);
if (DRY_RUN) {
  console.log("--dry-run: nada foi gravado.");
  process.exit(0);
}

await ensureSchema();
const sql = getSql();
const costCenterName = new Map(costCenters.map((c) => [c.id, c.name]));

const collabMap = new Map<string, number>();
let collabCreated = 0;
for (const c of collaborators) {
  const [byOrigin] = await sql<{ id: number }[]>`
    select id from uniform_collaborators where origem_id = ${c.id}
  `;
  if (byOrigin) {
    collabMap.set(c.id, byOrigin.id);
    continue;
  }
  const nome = clean(c.name, 200) ?? "Sem nome";
  const departamento = clean(c.department ?? (c.cost_center_id ? costCenterName.get(c.cost_center_id) : null), 120);
  const existing = (await sql<{ id: number; nome: string }[]>`
    select id, nome from uniform_collaborators where origem_id is null
  `).find((row) => norm(row.nome) === norm(nome));
  if (existing) {
    await sql`update uniform_collaborators set origem_id = ${c.id} where id = ${existing.id}`;
    collabMap.set(c.id, existing.id);
    continue;
  }
  const [row] = await sql<{ id: number }[]>`
    insert into uniform_collaborators (nome, departamento, telefone, origem_id, created_at, updated_at)
    values (${nome}, ${departamento}, ${clean(c.phone, 32)}, ${c.id}, ${c.created_at}, ${c.updated_at ?? c.created_at})
    returning id
  `;
  collabMap.set(c.id, row!.id);
  collabCreated++;
}

const itemMap = new Map<string, number>();
const itemByName = new Map<string, number>();
let itemsCreated = 0;
for (const inv of inventory) {
  const nome = clean(inv.piece, 200) ?? "PeÃ§a";
  const tamanho = clean(inv.size, 20);
  const key = `${norm(nome)}|${norm(tamanho)}`;
  const [byOrigin] = await sql<{ id: number }[]>`select id from uniform_items where origem_id = ${inv.id}`;
  if (byOrigin) {
    itemMap.set(inv.id, byOrigin.id);
    itemByName.set(key, byOrigin.id);
    continue;
  }
  const quantidade = Math.max(0, Math.trunc(Number(inv.quantity) || 0));
  const custo = money(inv.cost ?? inv.value);
  const id = await sql.begin(async (trx) => {
    const tx = trx as unknown as typeof sql;
    const [row] = await tx<{ id: number }[]>`
      insert into uniform_items (nome, tamanho, quantidade, estoque_minimo, custo, origem_id, created_at, updated_at)
      values (
        ${nome}, ${tamanho}, ${quantidade}, ${Math.max(0, Math.trunc(Number(inv.min_quantity) || 0))},
        ${custo}, ${inv.id}, ${inv.created_at}, ${inv.created_at}
      )
      returning id
    `;
    if (quantidade > 0) {
      await tx`
        insert into uniform_stock_moves (item_id, tipo, quantidade, saldo_apos, custo_unitario, motivo)
        values (${row!.id}, 'inicial', ${quantidade}, ${quantidade}, ${custo}, ${MOTIVO})
      `;
    }
    return row!.id;
  });
  itemMap.set(inv.id, id);
  itemByName.set(key, id);
  itemsCreated++;
}

async function resolveItem(line: TrackerMovementItem) {
  if (line.inventory_id && itemMap.has(line.inventory_id)) return itemMap.get(line.inventory_id)!;
  const nome = clean(line.piece, 200) ?? "PeÃ§a";
  const tamanho = clean(line.size, 20);
  const key = `${norm(nome)}|${norm(tamanho)}`;
  const known = itemByName.get(key);
  if (known) return known;
  const origem = `peca:${key}`.slice(0, 64);
  const [existing] = await sql<{ id: number }[]>`select id from uniform_items where origem_id = ${origem}`;
  const id =
    existing?.id ??
    (
      await sql<{ id: number }[]>`
        insert into uniform_items (nome, tamanho, quantidade, custo, active, origem_id)
        values (${nome}, ${tamanho}, 0, ${money(line.cost)}, false, ${origem})
        returning id
      `
    )[0]!.id;
  itemByName.set(key, id);
  return id;
}

let movCreated = 0;
let movSkipped = 0;
for (const [index, m] of movements.entries()) {
  const [already] = await sql<{ id: number }[]>`select id from uniform_movements where origem_id = ${m.id}`;
  if (already) {
    movSkipped++;
    continue;
  }
  const collaboratorId = collabMap.get(m.collaborator_id);
  if (!collaboratorId) {
    console.warn(`  ! MovimentaÃ§Ã£o ${m.id} sem colaborador correspondente; ignorada.`);
    movSkipped++;
    continue;
  }
  const direcao = m.type === "devolucao" ? "entrada" : "saida";
  const lines = await Promise.all(
    (m.movement_items ?? []).map(async (line) => ({
      itemId: await resolveItem(line),
      descricao: clean(line.piece, 200) ?? "PeÃ§a",
      tamanho: clean(line.size, 20),
      quantidade: Math.max(1, Math.trunc(Number(line.quantity) || 1)),
      custo: money(line.cost),
    })),
  );
  const assinatura = await downloadAsDataUrl(token, m.signature_url);
  const fotos = (await Promise.all((m.photo_urls ?? []).map((ref) => downloadAsDataUrl(token, ref)))).filter(
    (foto): foto is string => Boolean(foto),
  );

  await sql.begin(async (trx) => {
    const tx = trx as unknown as typeof sql;
    const [mov] = await tx<{ id: number }[]>`
      insert into uniform_movements (collaborator_id, tipo, observacao, assinatura, origem_id, created_at)
      values (${collaboratorId}, ${m.type}, ${clean(m.notes, 4000)}, ${assinatura}, ${m.id}, ${m.created_at})
      returning id
    `;
    for (const line of lines) {
      await tx`
        insert into uniform_movement_items
          (movement_id, item_id, direcao, condicao, descricao, tamanho, quantidade, custo_unitario)
        values (
          ${mov!.id}, ${line.itemId}, ${direcao}, ${direcao === "entrada" ? "reaproveitavel" : null},
          ${line.descricao}, ${line.tamanho}, ${line.quantidade}, ${line.custo}
        )
      `;
    }
    for (const foto of fotos) {
      await tx`insert into uniform_movement_photos (movement_id, foto, thumb) values (${mov!.id}, ${foto}, ${foto})`;
    }
  });
  movCreated++;
  if ((index + 1) % 25 === 0) console.log(`  ${index + 1}/${movements.length} movimentaÃ§Ãµes...`);
}

console.log(
  `ConcluÃ­do. Colaboradores novos: ${collabCreated}, peÃ§as novas: ${itemsCreated}, movimentaÃ§Ãµes importadas: ${movCreated}, ignoradas/jÃ¡ existentes: ${movSkipped}.`,
);
await sql.end({ timeout: 2 });
