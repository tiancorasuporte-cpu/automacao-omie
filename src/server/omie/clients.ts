import "@tanstack/react-start/server-only";

import { upsertOmieClient } from "@/db/clients";
import { listOrcamentosOmieApps, omieCall, omiePaginate, type OmieAppConfig } from "@/server/omie/client";

export type ClienteResumo = {
  codigo_cliente_omie: number;
  razao_social: string;
  nome_fantasia: string;
  cnpj_cpf: string | null;
  telefone1_ddd: string;
  telefone1_numero: string;
  telefone2_ddd: string;
  telefone2_numero: string;
  celular: string;
  endereco: string | null;
  contato: string | null;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function formatCep(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : value;
}

export function formatClienteEndereco(root: Record<string, unknown>) {
  const rua = text(root["endereco"]);
  const numero = text(root["endereco_numero"]);
  const complemento = text(root["complemento"]);
  const bairro = text(root["bairro"]);
  const cidade = text(root["cidade"]);
  const estado = text(root["estado"]);
  const cep = text(root["cep"]);

  const linha1 = [rua, numero].filter(Boolean).join(", ");
  const cidadeUf = cidade && estado && !cidade.includes("(") ? `${cidade}/${estado}` : cidade || estado;
  const parts = [linha1, complemento, bairro, cidadeUf].filter(Boolean);
  if (cep) parts.push(`CEP ${formatCep(cep)}`);
  return parts.length ? parts.join(" - ") : null;
}

const clientCache = new Map<string, ClienteResumo>();

export function normalizeCliente(raw: Record<string, unknown>, fallbackCode?: number): ClienteResumo | undefined {
  const root = (raw["clientes_cadastro"] ?? raw["cadastro"] ?? raw) as Record<string, unknown>;
  const code = Number(root["codigo_cliente_omie"] ?? root["codigo_cliente"] ?? fallbackCode ?? 0);
  if (!code) return undefined;

  const nomeFantasia = String(root["nome_fantasia"] ?? root["nome"] ?? "").trim();
  const razaoSocial = String(root["razao_social"] ?? root["cRazaoSocial"] ?? nomeFantasia).trim();
  const cnpjCpf = String(root["cnpj_cpf"] ?? root["cnpj"] ?? root["cpf_cnpj"] ?? "").trim() || null;

  return {
    codigo_cliente_omie: code,
    razao_social: razaoSocial,
    nome_fantasia: nomeFantasia || razaoSocial,
    cnpj_cpf: cnpjCpf,
    telefone1_ddd: String(root["telefone1_ddd"] ?? root["ddd"] ?? ""),
    telefone1_numero: String(root["telefone1_numero"] ?? root["telefone"] ?? ""),
    telefone2_ddd: String(root["telefone2_ddd"] ?? ""),
    telefone2_numero: String(root["telefone2_numero"] ?? ""),
    celular: String(root["celular"] ?? root["telefone_celular"] ?? root["fone"] ?? root["cTel"] ?? ""),
    endereco: formatClienteEndereco(root),
    contato: text(root["contato"]) || null,
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
    `${client.telefone2_ddd}${client.telefone2_numero}`,
    client.telefone2_numero,
    client.celular,
    `${client.telefone1_ddd}${client.telefone1_numero}`,
    client.telefone1_numero,
  ];
}

/** Preferência: Telefone 2 do Omie; se vazio, celular / telefone 1 (um único número). */
export function clientPhones(client: ClienteResumo | undefined) {
  if (!client) return [] as string[];

  for (const candidate of phoneCandidates(client)) {
    const digits = pickValidPhone(candidate);
    if (digits) return [digits];
  }
  return [];
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
    `${record["telefone2_ddd"] ?? ""}${record["telefone2_numero"] ?? ""}`,
    record["telefone2_numero"],
    record["celular"],
    record["telefone"],
    record["cTel"],
    record["fone"],
    record["telefone_cliente"],
    record["cFone"],
    `${record["ddd"] ?? ""}${record["telefone1_numero"] ?? ""}`,
    `${record["telefone1_ddd"] ?? ""}${record["telefone1_numero"] ?? ""}`,
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

export function clearClienteCache(appId?: string, clientCode?: number) {
  if (appId && clientCode) {
    clientCache.delete(`${appId}:${clientCode}`);
    return;
  }
  clientCache.clear();
}

/** Divide telefone BR em DDD + número (aceita com ou sem 55). */
export function splitBrazilPhone(value: string) {
  let digits = digitsPhone(value);
  if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2);
  if (digits.length < 10 || digits.length > 11) return null;
  return { ddd: digits.slice(0, 2), numero: digits.slice(2), digits };
}

/** Campos que a Omie devolve no ConsultarCliente mas rejeita / invalida no AlterarCliente. */
const ALTERAR_CLIENTE_OMIT = new Set([
  "celular",
  "info",
  "tags",
  "recomendacoes",
  "características",
  "caracteristicas",
  // ConsultarCliente pode devolver código/texto que AlterarCliente não aceita.
  "tipo_atividade",
  "cnae",
  "cnae_municipal",
  "nif",
  "documento_exterior",
]);

/** Flags Omie que só aceitam S/N no AlterarCliente. */
const ALTERAR_CLIENTE_SN_FLAGS = new Set([
  "bloqueado",
  "inativo",
  "enviar_anexos",
  "optante_simples_nacional",
  "pessoa_fisica",
  "produtor_rural",
  "contribuinte",
  "importado_api",
  "nao_gerar_boleto",
  "cnae_secundario",
]);

function toOmieSN(value: unknown, fallback: "S" | "N" = "N"): "S" | "N" {
  if (value === true || value === 1) return "S";
  if (value === false || value === 0) return "N";
  const text = String(value ?? "")
    .trim()
    .toUpperCase();
  if (text === "S" || text === "SIM" || text === "TRUE" || text === "1") return "S";
  if (text === "N" || text === "NAO" || text === "NÃO" || text === "FALSE" || text === "0") return "N";
  if (!text) return fallback;
  return fallback;
}

/**
 * Atualiza Telefone 2 (preferido no WhatsApp) no cadastro Omie.
 * Consulta o cliente e reenvia o cadastro completo — AlterarCliente exige endereço/UF.
 */
export async function updateClientePhoneInOmie(
  app: OmieAppConfig,
  clientCode: number,
  phone: string,
) {
  const split = splitBrazilPhone(phone);
  if (!split) {
    throw new Error("Informe um telefone válido com DDD (10 ou 11 dígitos).");
  }

  const response = await omieCall<Record<string, unknown>>(app, "/geral/clientes/", "ConsultarCliente", {
    codigo_cliente_omie: clientCode,
  });
  const root = (
    (response["clientes_cadastro"] as Record<string, unknown> | undefined) ?? response
  ) as Record<string, unknown>;

  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(root)) {
    if (ALTERAR_CLIENTE_OMIT.has(key)) continue;
    if (value === undefined || value === null) continue;
    // Omie não gosta de objetos aninhados vazios / arrays de metadados no Alterar.
    if (Array.isArray(value)) continue;
    if (typeof value === "object") continue;
    if (ALTERAR_CLIENTE_SN_FLAGS.has(key)) {
      payload[key] = toOmieSN(value);
      continue;
    }
    // Evita reenviar string vazia em flags/campos sensíveis.
    if (typeof value === "string" && !value.trim() && ALTERAR_CLIENTE_SN_FLAGS.has(key)) continue;
    payload[key] = value;
  }

  payload["codigo_cliente_omie"] = clientCode;
  payload["telefone2_ddd"] = split.ddd;
  payload["telefone2_numero"] = split.numero;
  payload["bloqueado"] = toOmieSN(root["bloqueado"], "N");
  payload["inativo"] = toOmieSN(root["inativo"], "N");

  const estado = String(payload["estado"] ?? "").trim();
  if (!estado) {
    throw new Error(
      "Cadastro Omie sem Estado (UF). Preencha o endereço do cliente na Omie e tente de novo.",
    );
  }

  await omieCall(app, "/geral/clientes/", "AlterarCliente", payload);

  clearClienteCache(app.id, clientCode);
  return { phone: split.digits, ddd: split.ddd, numero: split.numero };
}

function clientInactive(raw: Record<string, unknown>) {
  const flag = String(raw["inativo"] ?? raw["inactive"] ?? "N").trim().toUpperCase();
  return flag === "S" || flag === "1" || flag === "TRUE";
}

export async function syncOmieClientsForApp(app: OmieAppConfig) {
  const items = await omiePaginate<{
    pagina?: number;
    total_de_paginas?: number;
    clientes_cadastro?: Record<string, unknown>[];
  }>(
    app,
    "/geral/clientes/",
    "ListarClientes",
    (page) => ({
      pagina: page,
      registros_por_pagina: 100,
      apenas_importado_api: "N",
    }),
    (response) => ({
      page: response.pagina ?? 1,
      totalPages: response.total_de_paginas ?? 1,
      items: response.clientes_cadastro ?? [],
    }),
  );

  let count = 0;
  for (const item of items) {
    const raw = item as Record<string, unknown>;
    const client = normalizeCliente(raw);
    if (!client) continue;
    await upsertOmieClient({
      omieAppId: app.id,
      omieAppName: app.name,
      codigoCliente: client.codigo_cliente_omie,
      razaoSocial: client.razao_social || client.nome_fantasia || `Cliente ${client.codigo_cliente_omie}`,
      nomeFantasia: client.nome_fantasia || null,
      cnpjCpf: client.cnpj_cpf,
      endereco: client.endereco,
      contato: client.contato,
      inactive: clientInactive(raw),
    });
    count += 1;
  }
  return { count };
}

export async function syncAllOmieClients() {
  const apps = listOrcamentosOmieApps();
  if (!apps.length) {
    throw new Error(
      "Empresa Belfer não configurada. Inclua o app Belfer em OMIE_APPS (ou defina OMIE_ORCAMENTOS_APP).",
    );
  }
  let total = 0;
  const perApp: Array<{ appId: string; count: number; error?: string }> = [];
  for (const app of apps) {
    try {
      const result = await syncOmieClientsForApp(app);
      total += result.count;
      perApp.push({ appId: app.id, count: result.count });
    } catch (error) {
      perApp.push({
        appId: app.id,
        count: 0,
        error: error instanceof Error ? error.message : "Falha ao sincronizar clientes",
      });
    }
  }
  return { total, perApp };
}
