import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";

export type OmieClient = {
  id: number;
  omieAppId: string;
  omieAppName: string;
  codigoCliente: number;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpjCpf: string | null;
  endereco: string | null;
  contato: string | null;
  inactive: boolean;
  syncedAt: string;
};

export type OmieClientSearchResult = {
  codigo: number;
  nome: string;
  cnpjCpf: string | null;
  endereco: string | null;
  contato: string | null;
};

type ClientRow = {
  id: number;
  omie_app_id: string;
  omie_app_name: string;
  codigo_cliente: string | number;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj_cpf: string | null;
  endereco: string | null;
  contato: string | null;
  inactive: boolean;
  synced_at: string | Date;
};

function toClient(row: ClientRow): OmieClient {
  return {
    id: row.id,
    omieAppId: row.omie_app_id,
    omieAppName: row.omie_app_name,
    codigoCliente: Number(row.codigo_cliente),
    razaoSocial: row.razao_social,
    nomeFantasia: row.nome_fantasia,
    cnpjCpf: row.cnpj_cpf,
    endereco: row.endereco ?? null,
    contato: row.contato ?? null,
    inactive: Boolean(row.inactive),
    syncedAt: row.synced_at instanceof Date ? row.synced_at.toISOString() : String(row.synced_at),
  };
}

export async function upsertOmieClient(input: {
  omieAppId: string;
  omieAppName: string;
  codigoCliente: number;
  razaoSocial: string;
  nomeFantasia?: string | null;
  cnpjCpf?: string | null;
  endereco?: string | null;
  contato?: string | null;
  inactive?: boolean;
}) {
  const db = await getDb();
  const razao = input.razaoSocial.trim().slice(0, 255);
  if (!razao) return;
  await db`
    insert into omie_clients (
      omie_app_id, omie_app_name, codigo_cliente, razao_social, nome_fantasia, cnpj_cpf,
      endereco, contato, inactive, synced_at
    ) values (
      ${input.omieAppId}, ${input.omieAppName}, ${input.codigoCliente}, ${razao},
      ${input.nomeFantasia?.trim().slice(0, 255) || null},
      ${input.cnpjCpf?.trim().slice(0, 32) || null},
      ${input.endereco?.trim() || null},
      ${input.contato?.trim().slice(0, 160) || null},
      ${input.inactive === true}, now()
    )
    on conflict (omie_app_id, codigo_cliente) do update set
      omie_app_name = excluded.omie_app_name,
      razao_social = excluded.razao_social,
      nome_fantasia = excluded.nome_fantasia,
      cnpj_cpf = excluded.cnpj_cpf,
      endereco = excluded.endereco,
      contato = excluded.contato,
      inactive = excluded.inactive,
      synced_at = now()
  `;
}

export async function updateOmieClientDetails(input: {
  omieAppId: string;
  codigoCliente: number;
  endereco: string | null;
  contato: string | null;
}) {
  const db = await getDb();
  await db`
    update omie_clients
    set endereco = ${input.endereco?.trim() || null},
        contato = ${input.contato?.trim().slice(0, 160) || null}
    where omie_app_id = ${input.omieAppId} and codigo_cliente = ${input.codigoCliente}
  `;
}

export async function countOmieClients(omieAppId?: string) {
  const db = await getDb();
  const appId = omieAppId?.trim() || null;
  const rows = (await db`
    select count(*)::int as total
    from omie_clients
    where (${appId}::text is null or omie_app_id = ${appId})
      and inactive = false
  `) as Array<{ total: number }>;
  return Number(rows[0]?.total ?? 0);
}

export async function searchOmieClientsLocal(input: {
  omieAppId: string;
  query: string;
  limit?: number;
}): Promise<OmieClientSearchResult[]> {
  const db = await getDb();
  const q = input.query.trim();
  if (q.length < 2) return [];
  const limit = Math.min(Math.max(input.limit ?? 40, 1), 100);
  const like = `%${q}%`;

  const rows = (await db`
    select *
    from omie_clients
    where omie_app_id = ${input.omieAppId}
      and inactive = false
      and (
        razao_social ilike ${like}
        or coalesce(nome_fantasia, '') ilike ${like}
        or coalesce(cnpj_cpf, '') ilike ${like}
        or codigo_cliente::text ilike ${like}
      )
    order by razao_social asc
    limit ${limit}
  `) as ClientRow[];

  return rows.map((row) => {
    const client = toClient(row);
    return {
      codigo: client.codigoCliente,
      nome: client.razaoSocial || client.nomeFantasia || `Cliente ${client.codigoCliente}`,
      cnpjCpf: client.cnpjCpf,
      endereco: client.endereco,
      contato: client.contato,
    };
  });
}
