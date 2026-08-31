import "@tanstack/react-start/server-only";

import { omieCall, type OmieAppConfig } from "@/server/omie/client";

export type ClienteResumo = {
  codigo_cliente_omie: number;
  razao_social: string;
  nome_fantasia: string;
  telefone1_ddd: string;
  telefone1_numero: string;
  telefone2_ddd: string;
  telefone2_numero: string;
  celular: string;
};

const clientCache = new Map<string, ClienteResumo>();

function normalizeCliente(raw: Record<string, unknown>, fallbackCode?: number): ClienteResumo | undefined {
  const root = (raw["clientes_cadastro"] ?? raw["cadastro"] ?? raw) as Record<string, unknown>;
  const code = Number(root["codigo_cliente_omie"] ?? root["codigo_cliente"] ?? fallbackCode ?? 0);
  if (!code) return undefined;

  const nomeFantasia = String(root["nome_fantasia"] ?? root["nome"] ?? "").trim();
  const razaoSocial = String(root["razao_social"] ?? root["cRazaoSocial"] ?? nomeFantasia).trim();

  return {
    codigo_cliente_omie: code,
    razao_social: razaoSocial,
    nome_fantasia: nomeFantasia || razaoSocial,
    telefone1_ddd: String(root["telefone1_ddd"] ?? root["ddd"] ?? ""),
    telefone1_numero: String(root["telefone1_numero"] ?? root["telefone"] ?? ""),
    telefone2_ddd: String(root["telefone2_ddd"] ?? ""),
    telefone2_numero: String(root["telefone2_numero"] ?? ""),
    celular: String(root["celular"] ?? root["telefone_celular"] ?? root["fone"] ?? root["cTel"] ?? ""),
  };
}

function digitsPhone(value: string) {
  return value.replace(/\D/g, "");
}

function pickValidPhone(...values: string[]) {
  for (const value of values) {
    const digits = digitsPhone(value);
    if (digits.length >= 10 && digits.length <= 15) return digits;
  }
  return null;
}

function phoneCandidates(client: ClienteResumo) {
  return [
    client.celular,
    `${client.telefone1_ddd}${client.telefone1_numero}`,
    client.telefone1_numero,
    `${client.telefone2_ddd}${client.telefone2_numero}`,
    client.telefone2_numero,
  ];
}

export function clientPhones(client: ClienteResumo | undefined) {
  if (!client) return [] as string[];

  const seen = new Set<string>();
  const phones: string[] = [];
  for (const candidate of phoneCandidates(client)) {
    const digits = pickValidPhone(candidate);
    if (!digits || seen.has(digits)) continue;
    seen.add(digits);
    phones.push(digits);
  }
  return phones;
}

export function clientPhone(client: ClienteResumo | undefined) {
  return clientPhones(client)[0] ?? null;
}

export function clientDisplayName(client: ClienteResumo | undefined) {
  if (!client) return null;
  return client.nome_fantasia.trim() || client.razao_social.trim() || null;
}

export function pickClientPhoneFromRecord(record: Record<string, unknown>) {
  const candidates = [
    record["celular"],
    record["telefone"],
    record["cTel"],
    record["fone"],
    record["telefone_cliente"],
    record["cFone"],
    `${record["ddd"] ?? ""}${record["telefone1_numero"] ?? ""}`,
    `${record["telefone1_ddd"] ?? ""}${record["telefone1_numero"] ?? ""}`,
    `${record["telefone2_ddd"] ?? ""}${record["telefone2_numero"] ?? ""}`,
  ];
  for (const value of candidates) {
    const digits = digitsPhone(String(value ?? ""));
    if (digits.length >= 10 && digits.length <= 15) return digits;
  }
  return null;
}

export function pickClientNameFromRecord(record: Record<string, unknown>) {
  const candidates = [
    record["nome_cliente"],
    record["cNomeCliente"],
    record["cNome"],
    record["cRazaoSocial"],
    record["razao_social"],
    record["nome_fantasia"],
    record["cNomeDestinatario"],
    record["nome_destinatario"],
    record["xNome"],
    record["xFant"],
    record["cNomeConsFinal"],
    record["dest_xNome"],
  ];
  for (const value of candidates) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return null;
}

export function pickClientCodeFromRecord(record: Record<string, unknown>) {
  const code = Number(
    record["nCodCliente"] ??
      record["codigo_cliente_fornecedor"] ??
      record["codigo_cliente_omie"] ??
      record["nCodCli"] ??
      record["nCodigoCliente"] ??
      record["nCodCliDest"] ??
      record["codigo_cliente"] ??
      0,
  );
  return code || null;
}

export function resolveStoredClientPhone(
  client: ClienteResumo | undefined,
  record: Record<string, unknown>,
) {
  return clientPhone(client) || pickClientPhoneFromRecord(record);
}

export async function getCliente(app: OmieAppConfig, clientCode: number) {
  const cacheKey = `${app.id}:${clientCode}`;
  const cached = clientCache.get(cacheKey);
  if (cached) return cached;

  try {
    const response = await omieCall<Record<string, unknown>>(app, "/geral/clientes/", "ConsultarCliente", {
      codigo_cliente_omie: clientCode,
    });
    const client = normalizeCliente(response, clientCode);
    if (client) {
      clientCache.set(cacheKey, client);
      return client;
    }
  } catch {
    // fallback abaixo
  }

  try {
    const response = await omieCall<{
      clientes_cadastro?: Record<string, unknown>[];
    }>(app, "/geral/clientes/", "ListarClientes", {
      pagina: 1,
      registros_por_pagina: 1,
      clientesFiltro: { codigo_cliente_omie: clientCode },
    });
    const row = response.clientes_cadastro?.[0];
    if (row) {
      const client = normalizeCliente(row, clientCode);
      if (client) {
        clientCache.set(cacheKey, client);
        return client;
      }
    }
  } catch {
    // fallback abaixo
  }

  try {
    const response = await omieCall<{
      clientes_cadastro?: Record<string, unknown>[];
    }>(app, "/geral/clientes/", "ListarClientes", {
      pagina: 1,
      registros_por_pagina: 1,
      clientesPorCodigo: [{ codigo_cliente_omie: clientCode }],
    });
    const row = response.clientes_cadastro?.[0];
    if (row) {
      const client = normalizeCliente(row, clientCode);
      if (client) {
        clientCache.set(cacheKey, client);
        return client;
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function clearClienteCache() {
  clientCache.clear();
}
