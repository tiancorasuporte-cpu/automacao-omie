import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";
import {
  formatDisplayDate,
  formatOmieDate,
  listOmieApps,
  omiePaginate,
  parseAmount,
  parseOmieDate,
  type OmieAppConfig,
} from "@/server/omie/client";
import { getCliente, pickClientNameFromRecord } from "@/server/omie/clients";

export type OpenBoletoHit = {
  omieAppId: string;
  omieAppName: string;
  clientName: string | null;
  documentNumber: string | null;
  omieCode: number | null;
  integrationCode: string | null;
  dueDate: string;
  amount: number | null;
  status: string | null;
  source: "omie" | "local";
};

/** @alias OpenBoletoHit */
export type BoletoHit = OpenBoletoHit;

const MAX_BOLETOS_LIST = 30;

function currentMonthBounds() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from, to };
}

export function currentMonthLabel() {
  const { from } = currentMonthBounds();
  return from.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function lookupDateRange() {
  const { from, to } = currentMonthBounds();
  return { from: formatOmieDate(from), to: formatOmieDate(to) };
}

function isDueDateInCurrentMonth(dueDate: string) {
  const [y, m] = dueDate.slice(0, 10).split("-").map(Number);
  const now = new Date();
  return y === now.getFullYear() && m === now.getMonth() + 1;
}

export function normalizeDocumento(value: string) {
  return value.replace(/\D/g, "");
}

export function extractDocumento(text: string) {
  const digitsOnly = text.replace(/\D/g, " ");
  const candidates = [
    ...text.matchAll(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g),
    ...text.matchAll(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g),
    ...digitsOnly.matchAll(/\b\d{14}\b/g),
    ...digitsOnly.matchAll(/\b\d{11}\b/g),
  ];
  for (const match of candidates) {
    const digits = normalizeDocumento(match[0] ?? "");
    if (digits.length === 14 || digits.length === 11) return digits;
  }
  return null;
}

export function formatDocumento(digits: string) {
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  return digits;
}

function decodeDisplayText(value: string | null | undefined) {
  if (!value) return value ?? "";
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function isCancelledStatus(status: string | null | undefined) {
  return String(status ?? "").toUpperCase() === "CANCELADO";
}

function isPaidStatus(status: string | null | undefined) {
  const value = String(status ?? "").toUpperCase();
  return ["RECEBIDO", "BAIXADO", "LIQUIDADO", "PAGO"].includes(value);
}

function isOpenStatus(status: string | null | undefined) {
  return !isPaidStatus(status) && !isCancelledStatus(status);
}

export function formatBoletoStatusLabel(status: string | null | undefined) {
  const value = String(status ?? "").toUpperCase();
  if (isPaidStatus(value)) return "Pago";
  if (isCancelledStatus(value)) return "Cancelado";
  if (value.includes("ATRAS")) return "Atrasado";
  if (value.includes("VENC")) return "Vencido";
  return "Em aberto";
}

function mapOmieRowToHit(app: OmieAppConfig, item: Record<string, unknown>): OpenBoletoHit | null {
  if (!isBoletoRow(item)) return null;

  const status = String(item["status_titulo"] ?? item["cStatus"] ?? "") || null;
  if (isCancelledStatus(status)) return null;

  const dueDate = parseOmieDate(String(item["data_vencimento"] ?? item["dDtVenc"] ?? "")) ?? null;
  if (!dueDate || !isDueDateInCurrentMonth(dueDate)) return null;

  const clientCode = Number(item["codigo_cliente_fornecedor"] ?? item["nCodCliente"] ?? 0) || null;
  const boleto = item["boleto"] as Record<string, unknown> | undefined;
  const omieCode = Number(item["codigo_lancamento_omie"] ?? item["nCodTitulo"] ?? 0) || null;

  return {
    omieAppId: app.id,
    omieAppName: app.name,
    clientName: pickClientNameFromRecord(item),
    documentNumber:
      String(boleto?.["cNumBoleto"] ?? item["numero_documento"] ?? item["cNumBoleto"] ?? "") || null,
    omieCode,
    integrationCode: String(item["codigo_lancamento_integracao"] ?? item["cCodIntTitulo"] ?? "") || null,
    dueDate,
    amount: parseAmount(item["valor_documento"] ?? item["nValorTitulo"]),
    status,
    source: "omie",
  };
}

function isBoletoRow(item: Record<string, unknown>) {
  const boleto = item["boleto"] as Record<string, unknown> | undefined;
  const tipo = String(item["cTipo"] ?? item["codigo_tipo_documento"] ?? "").toUpperCase();
  const numBoleto = String(boleto?.["cNumBoleto"] ?? item["cNumBoleto"] ?? "").trim();
  return tipo === "BOL" || Boolean(numBoleto) || boleto?.["cGerado"] === "S";
}

async function listClientCodesByDocumento(app: OmieAppConfig, documento: string) {
  const response = await omieCallSafe(app, documento);
  const codes = new Set<number>();
  const names = new Map<number, string>();

  for (const row of response) {
    const code = Number(row["codigo_cliente_omie"] ?? 0);
    if (!code) continue;
    codes.add(code);
    const name =
      pickClientNameFromRecord(row) ||
      String(row["razao_social"] ?? row["nome_fantasia"] ?? "").trim() ||
      null;
    if (name) names.set(code, name);
  }

  return { codes: [...codes], names };
}

async function omieCallSafe(app: OmieAppConfig, documento: string) {
  try {
    const { omieCall } = await import("@/server/omie/client");
    const response = await omieCall<{ clientes_cadastro?: Record<string, unknown>[] }>(
      app,
      "/geral/clientes/",
      "ListarClientes",
      {
        pagina: 1,
        registros_por_pagina: 50,
        clientesFiltro: { cnpj_cpf: documento },
      },
    );
    return response.clientes_cadastro ?? [];
  } catch {
    return [];
  }
}

async function listBoletosFromOmie(app: OmieAppConfig, documento: string) {
  try {
    const range = lookupDateRange();
    const items = await omiePaginate<{
      pagina?: number;
      total_de_paginas?: number;
      conta_receber_cadastro?: Record<string, unknown>[];
    }>(
      app,
      "/financas/contareceber/",
      "ListarContasReceber",
      (page) => ({
        pagina: page,
        registros_por_pagina: 100,
        filtrar_por_cpf_cnpj: documento,
        filtrar_por_data_de: range.from,
        filtrar_por_data_ate: range.to,
      }),
      (response) => ({
        page: response.pagina ?? 1,
        totalPages: response.total_de_paginas ?? 1,
        items: response.conta_receber_cadastro ?? [],
      }),
    );

    const hits: OpenBoletoHit[] = [];
    for (const raw of items) {
      const hit = mapOmieRowToHit(app, raw as Record<string, unknown>);
      if (!hit) continue;

      if (!hit.clientName && hit.omieCode) {
        const clientCode = Number((raw as Record<string, unknown>)["codigo_cliente_fornecedor"] ?? 0);
        if (clientCode) {
          const client = await getCliente(app, clientCode);
          hit.clientName = client?.nome_fantasia || client?.razao_social || null;
        }
      }

      hits.push(hit);
    }
    return hits;
  } catch {
    return [] as OpenBoletoHit[];
  }
}

/** @deprecated Use listBoletosFromOmie */
async function listOpenBoletosFromOmie(app: OmieAppConfig, documento: string) {
  const hits = await listBoletosFromOmie(app, documento);
  return hits.filter((hit) => isOpenStatus(hit.status));
}

async function listBoletosFromLocal(app: OmieAppConfig, clientCodes: number[]) {
  if (clientCodes.length === 0) return [] as OpenBoletoHit[];
  const db = await getDb();
  const rows = await db<
    {
      client_name: string | null;
      document_number: string | null;
      omie_code: number | null;
      integration_code: string | null;
      due_date: string;
      amount: string | null;
      status: string | null;
    }[]
  >`
    select client_name, document_number, omie_code, integration_code, due_date::text, amount::text, status
    from due_items
    where omie_app_id = ${app.id}
      and item_type = 'boleto'
      and client_code in ${db(clientCodes)}
      and coalesce(status, '') not in ('CANCELADO')
      and due_date >= date_trunc('month', current_date)::date
      and due_date < (date_trunc('month', current_date) + interval '1 month')::date
    order by due_date desc
    limit 50
  `;

  return rows
    .map(
      (row) =>
        ({
          omieAppId: app.id,
          omieAppName: app.name,
          clientName: row.client_name,
          documentNumber: row.document_number,
          omieCode: row.omie_code,
          integrationCode: row.integration_code,
          dueDate: row.due_date.slice(0, 10),
          amount: row.amount == null ? null : Number(row.amount),
          status: row.status,
          source: "local" as const,
        }) satisfies OpenBoletoHit,
    )
    .filter((row) => !isCancelledStatus(row.status) && isDueDateInCurrentMonth(row.dueDate));
}

/** @deprecated Use listBoletosFromLocal */
async function listOpenBoletosFromLocal(app: OmieAppConfig, clientCodes: number[]) {
  const hits = await listBoletosFromLocal(app, clientCodes);
  return hits.filter((hit) => isOpenStatus(hit.status));
}

function normalizeDocumentNumber(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(/\D/g, "").replace(/^0+/, "") || value.trim();
}

function dedupeHits(hits: OpenBoletoHit[]) {
  const byKey = new Map<string, OpenBoletoHit>();
  for (const hit of hits) {
    const key = hit.omieCode
      ? `${hit.omieAppId}|code:${hit.omieCode}`
      : [
          hit.omieAppId,
          hit.dueDate,
          hit.amount ?? "",
          normalizeDocumentNumber(hit.documentNumber),
        ].join("|");
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, hit);
      continue;
    }
    if (!prev.omieCode && hit.omieCode) {
      byKey.set(key, { ...hit, documentNumber: hit.documentNumber ?? prev.documentNumber });
    } else if (prev.omieCode && !prev.documentNumber && hit.documentNumber) {
      byKey.set(key, { ...prev, documentNumber: hit.documentNumber });
    }
  }
  return [...byKey.values()].sort((a, b) => sortBoletos(a, b));
}

function sortBoletos(a: OpenBoletoHit, b: OpenBoletoHit) {
  const aOpen = isOpenStatus(a.status) ? 0 : 1;
  const bOpen = isOpenStatus(b.status) ? 0 : 1;
  if (aOpen !== bOpen) return aOpen - bOpen;
  return a.dueDate.localeCompare(b.dueDate);
}

export function parseBoletoSelection(text: string, max: number) {
  const match = text.trim().match(/^(\d{1,2})$/);
  if (!match) return null;
  const index = Number(match[1]) - 1;
  if (index < 0 || index >= max) return null;
  return index;
}

const MAX_AUTO_SEND_BOLETOS = 5;

export function boletosToDeliver(boletos: OpenBoletoHit[]) {
  return boletos
    .filter((b) => b.omieCode && isOpenStatus(b.status))
    .slice(0, MAX_AUTO_SEND_BOLETOS);
}

export async function lookupBoletosByDocumento(documentoRaw: string) {
  const documento = normalizeDocumento(documentoRaw);
  if (documento.length !== 14 && documento.length !== 11) {
    return {
      ok: false as const,
      error: "Informe um CNPJ (14 dígitos) ou CPF (11 dígitos) válido.",
    };
  }

  const apps = listOmieApps();
  if (apps.length === 0) {
    return { ok: false as const, error: "Nenhuma empresa Omie configurada." };
  }

  const allHits: OpenBoletoHit[] = [];
  const clientNames: string[] = [];

  for (const app of apps) {
    const fromOmie = await listBoletosFromOmie(app, documento);
    allHits.push(...fromOmie);

    const { codes, names } = await listClientCodesByDocumento(app, documento);
    for (const name of names.values()) clientNames.push(name);
    const fromLocal = await listBoletosFromLocal(app, codes);
    allHits.push(...fromLocal);
  }

  const boletos = dedupeHits(allHits).slice(0, MAX_BOLETOS_LIST);
  return {
    ok: true as const,
    documento,
    documentoLabel: formatDocumento(documento),
    tipo: documento.length === 14 ? ("CNPJ" as const) : ("CPF" as const),
    clientName: clientNames.find(Boolean) ?? boletos[0]?.clientName ?? null,
    boletos,
  };
}

/** @deprecated Use lookupBoletosByDocumento */
export async function lookupOpenBoletosByDocumento(documentoRaw: string) {
  const result = await lookupBoletosByDocumento(documentoRaw);
  if (!result.ok) return result;
  return {
    ...result,
    boletos: result.boletos.filter((b) => isOpenStatus(b.status)),
  };
}

export function formatBoletoLookupAnswer(
  result: Awaited<ReturnType<typeof lookupBoletosByDocumento>>,
) {
  if (!result.ok) return result.error;

  const money = (value: number | null) =>
    value == null
      ? "—"
      : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (result.boletos.length === 0) {
    return [
      `Consultei o ${result.tipo} *${result.documentoLabel}*${result.clientName ? ` (${result.clientName})` : ""}.`,
      `Não encontrei boletos com vencimento em *${currentMonthLabel()}* nas empresas configuradas.`,
    ].join("\n");
  }

  const openCount = result.boletos.filter((b) => isOpenStatus(b.status)).length;
  const clientLabel = result.clientName ? ` — ${decodeDisplayText(result.clientName)}` : "";
  const lines = [
    `Encontrei *${result.boletos.length}* boleto(s) com vencimento em *${currentMonthLabel()}* para o ${result.tipo} *${result.documentoLabel}*${clientLabel}:`,
    openCount > 0 ? `(${openCount} em aberto/atrasado)` : "",
    "",
  ].filter(Boolean);

  const deliverable = boletosToDeliver(result.boletos);
  if (deliverable.length === 0) {
    result.boletos.forEach((item, index) => {
      lines.push(
        `*${index + 1}.* ${item.omieAppName} · Doc. ${item.documentNumber ?? "—"}`,
        `   Venc. ${formatDisplayDate(item.dueDate)} · ${money(item.amount)} · ${formatBoletoStatusLabel(item.status)}`,
      );
    });
  }

  if (deliverable.length > 0) {
    lines.push(
      "",
      `📎 Enviando *${deliverable.length}* link(s) ou PDF(s) em uma mensagem abaixo…`,
    );
  } else if (openCount > 0) {
    lines.push(
      "",
      "📎 Responda com o *número* do boleto (ex: *1*) para receber o PDF ou link.",
    );
  } else {
    lines.push("", "ℹ️ Todos os boletos listados já constam como pagos.");
  }

  return lines.join("\n");
}
