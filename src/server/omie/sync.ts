import "@tanstack/react-start/server-only";

import { finishSyncLog, startSyncLog, upsertDueItem } from "@/db/due-items";
import {
  formatOmieDate,
  listOmieApps,
  omiePaginate,
  parseAmount,
  parseOmieDate,
  type OmieAppConfig,
} from "@/server/omie/client";

import {
  clearClienteCache,
  clientDisplayName,
  getCliente,
  pickClientCodeFromRecord,
  pickClientNameFromRecord,
  resolveStoredClientPhone,
} from "@/server/omie/clients";

const CLOSED_STATUS = new Set(["CANCELADO", "RECEBIDO", "LIQUIDADO", "PAGO", "BAIXADO"]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickDueDate(item: Record<string, unknown>) {
  return (
    parseOmieDate(String(item["dDtVenc"] ?? "")) ??
    parseOmieDate(String(item["data_vencimento"] ?? "")) ??
    parseOmieDate(String(item["dDtVencimento"] ?? "")) ??
    parseOmieDate(String(item["dDtVencParcela"] ?? ""))
  );
}

function isBoletoMovement(detalhes: Record<string, unknown>) {
  const tipo = String(detalhes["cTipo"] ?? "").toUpperCase();
  const boleto = String(detalhes["cNumBoleto"] ?? "").trim();
  return tipo === "BOL" || Boolean(boleto);
}

function isDueDateInWindow(dueDate: string, from: Date, to: Date) {
  const fromIso = parseOmieDate(formatOmieDate(from));
  const toIso = parseOmieDate(formatOmieDate(to));
  if (!fromIso || !toIso) return true;
  return dueDate >= fromIso && dueDate <= toIso;
}

async function saveDueItemFromMovement(
  app: OmieAppConfig,
  detalhes: Record<string, unknown>,
  window?: { from: Date; to: Date },
) {
  if (!isBoletoMovement(detalhes)) return false;

  const dueDate = pickDueDate(detalhes);
  if (!dueDate) return false;
  if (window && !isDueDateInWindow(dueDate, window.from, window.to)) return false;

  const status = String(detalhes["cStatus"] ?? detalhes["status_titulo"] ?? "").toUpperCase();
  if (status && CLOSED_STATUS.has(status)) return false;

  const clientCode = pickClientCodeFromRecord(detalhes);
  const client = clientCode ? await getCliente(app, clientCode) : undefined;
  const omieCode = Number(detalhes["nCodTitulo"] ?? detalhes["codigo_lancamento_omie"] ?? 0) || null;

  await upsertDueItem({
    omieAppId: app.id,
    omieAppName: app.name,
    itemType: "boleto",
    omieCode,
    integrationCode: String(detalhes["cCodIntTitulo"] ?? detalhes["codigo_lancamento_integracao"] ?? "") || null,
    documentNumber:
      String(
        detalhes["cNumBoleto"] ??
          detalhes["cNumDocFiscal"] ??
          detalhes["cNumTitulo"] ??
          detalhes["numero_documento"] ??
          "",
      ) || null,
    clientCode,
    clientName: clientDisplayName(client) || pickClientNameFromRecord(detalhes),
    clientPhone: resolveStoredClientPhone(client, detalhes),
    dueDate,
    amount: parseAmount(detalhes["nValorTitulo"] ?? detalhes["valor_documento"]),
    status: status || null,
  });

  return true;
}

async function syncMovimentosFinanceiros(app: OmieAppConfig, from: Date, to: Date) {
  const fromStr = formatOmieDate(from);
  const toStr = formatOmieDate(to);

  const items = await omiePaginate<{
    nPagina?: number;
    nTotPaginas?: number;
    movimentos?: Record<string, unknown>[];
  }>(
    app,
    "/financas/mf/",
    "ListarMovimentos",
    (page) => ({
      nPagina: page,
      nRegPorPagina: 500,
      cNatureza: "R",
      cTpLancamento: "CR",
      dDtVencDe: fromStr,
      dDtVencAte: toStr,
    }),
    (response) => ({
      page: response.nPagina ?? 1,
      totalPages: response.nTotPaginas ?? 1,
      items: response.movimentos ?? [],
    }),
  );

  let count = 0;
  for (const raw of items) {
    const movimento = raw as Record<string, unknown>;
    const detalhes = (movimento["detalhes"] ?? movimento) as Record<string, unknown>;
    if (String(detalhes["cNatureza"] ?? "R").toUpperCase() !== "R") continue;
    if (await saveDueItemFromMovement(app, detalhes, { from, to })) count += 1;
  }

  return count;
}

async function syncContasReceber(app: OmieAppConfig, from: Date, to: Date) {
  const fromStr = formatOmieDate(from);
  const toStr = formatOmieDate(to);

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
      filtrar_apenas_titulos_em_aberto: "S",
      filtrar_por_data_de: fromStr,
      filtrar_por_data_ate: toStr,
    }),
    (response) => ({
      page: response.pagina ?? 1,
      totalPages: response.total_de_paginas ?? 1,
      items: response.conta_receber_cadastro ?? [],
    }),
  );

  let count = 0;
  for (const raw of items) {
    const item = raw as Record<string, unknown>;
    const mapped = {
      ...item,
      dDtVenc: item["dDtVenc"] ?? item["data_vencimento"],
      nCodTitulo: item["nCodTitulo"] ?? item["codigo_lancamento_omie"],
      nCodCliente: item["nCodCliente"] ?? item["codigo_cliente_fornecedor"],
      nValorTitulo: item["nValorTitulo"] ?? item["valor_documento"],
      cStatus: item["cStatus"] ?? item["status_titulo"],
      cNumBoleto: (item["boleto"] as Record<string, unknown> | undefined)?.["cNumBoleto"] ?? item["cNumBoleto"],
      cTipo: (item["boleto"] as Record<string, unknown> | undefined)?.["cGerado"] === "S" ? "BOL" : item["cTipo"],
    };
    if (await saveDueItemFromMovement(app, mapped, { from, to })) count += 1;
  }

  return count;
}

function syncWindow(daysBack = 90, daysAhead = 120) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - daysBack);
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  to.setDate(to.getDate() + daysAhead);
  return { from, to };
}

export async function syncOmieApp(app: OmieAppConfig, daysBack = 90, daysAhead = 120) {
  const logId = await startSyncLog(app.id);
  clearClienteCache();
  const { from, to } = syncWindow(daysBack, daysAhead);
  const breakdown: Record<string, number> = {};
  const errors: string[] = [];

  try {
    const tasks = [
      ["movimentos", syncMovimentosFinanceiros],
      ["contas_receber", syncContasReceber],
    ] as const;

    for (const [name, fn] of tasks) {
      try {
        breakdown[name] = await fn(app, from, to);
        await sleep(1_500);
      } catch (error) {
        breakdown[name] = 0;
        errors.push(`${name}: ${error instanceof Error ? error.message : "erro"}`);
      }
    }

    const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
    await finishSyncLog(logId, total, errors.length ? errors.join(" | ") : null);
    return {
      ok: true as const,
      appId: app.id,
      itemsFound: total,
      breakdown,
      errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na sincronização";
    await finishSyncLog(logId, 0, message);
    return { ok: false as const, appId: app.id, error: message };
  }
}

export async function syncAllOmieApps(daysBack = 90, daysAhead = 120) {
  const apps = listOmieApps();
  if (apps.length === 0) {
    return { ok: false as const, error: "Nenhum aplicativo Omie configurado no .env." };
  }
  const results = [];
  for (let index = 0; index < apps.length; index++) {
    if (index > 0) await sleep(8_000);
    results.push(await syncOmieApp(apps[index]!, daysBack, daysAhead));
  }
  return { ok: true as const, results };
}
