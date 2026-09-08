import "@tanstack/react-start/server-only";

import { finishSyncLog, markStaleOpenDueItems, startSyncLog, closeNonOpenInvoiceDueItems } from "@/db/due-items";
import {
  formatOmieDate,
  listOmieApps,
  omiePaginate,
  parseOmieDate,
  type OmieAppConfig,
} from "@/server/omie/client";

import { clearClienteCache } from "@/server/omie/clients";
import { saveDueItemFromMovement, syncInvoiceDocuments } from "@/server/omie/invoice-sync";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const openOmieCodes: number[] = [];
  for (const raw of items) {
    const item = raw as Record<string, unknown>;
    const mapped = {
      ...item,
      dDtVenc: item["dDtVenc"] ?? item["data_vencimento"],
      nCodTitulo: item["nCodTitulo"] ?? item["codigo_lancamento_omie"],
      nCodCliente: item["nCodCliente"] ?? item["codigo_cliente_fornecedor"],
      nValorTitulo: item["nValorTitulo"] ?? item["valor_documento"],
      cStatus: item["cStatus"] ?? item["status_titulo"] ?? "A VENCER",
      cNumBoleto: (item["boleto"] as Record<string, unknown> | undefined)?.["cNumBoleto"] ?? item["cNumBoleto"],
      cTipo: (item["boleto"] as Record<string, unknown> | undefined)?.["cGerado"] === "S" ? "BOL" : item["cTipo"],
      chave_nfe: item["chave_nfe"],
      cChaveNFe: item["chave_nfe"],
      nCodOS: item["nCodOS"],
      numero_documento_fiscal: item["numero_documento_fiscal"],
    };
    const omieCode = Number(mapped.nCodTitulo ?? 0) || null;
    if (omieCode) openOmieCodes.push(omieCode);
    if (await saveDueItemFromMovement(app, mapped, { from, to })) count += 1;
  }

  const fromIso = parseOmieDate(fromStr) ?? fromStr;
  const toIso = parseOmieDate(toStr) ?? toStr;
  // Só fecha stale se a lista em aberto veio com sucesso (mesmo vazia = tudo quitado na janela).
  try {
    await markStaleOpenDueItems({
      omieAppId: app.id,
      from: fromIso,
      to: toIso,
      openOmieCodes,
    });
  } catch (error) {
    console.warn("[sync] falha ao fechar títulos stale", app.id, error);
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
    const tasks: Array<[string, (app: OmieAppConfig, from: Date, to: Date) => Promise<number>]> = [
      ["movimentos", syncMovimentosFinanceiros],
      ["contas_receber", syncContasReceber],
    ];

    for (const [name, fn] of tasks) {
      try {
        breakdown[name] = await fn(app, from, to);
        await sleep(1_500);
      } catch (error) {
        breakdown[name] = 0;
        errors.push(`${name}: ${error instanceof Error ? error.message : "erro"}`);
      }
    }

    try {
      const invoiceResult = await syncInvoiceDocuments(app, from, to);
      breakdown.nfe = invoiceResult.nfe;
      breakdown.nfse = invoiceResult.nfse;
      errors.push(...invoiceResult.errors);
    } catch (error) {
      breakdown.nfe = 0;
      breakdown.nfse = 0;
      errors.push(`notas: ${error instanceof Error ? error.message : "erro"}`);
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
  try {
    await closeNonOpenInvoiceDueItems();
  } catch (error) {
    console.warn("[sync] cleanup notas", error);
  }
  return { ok: true as const, results };
}
