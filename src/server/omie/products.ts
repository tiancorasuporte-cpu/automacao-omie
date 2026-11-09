import "@tanstack/react-start/server-only";

import {
  resetOmieProductFiscalStockAbsent,
  updateOmieProductFiscalStock,
  upsertOmieProduct,
} from "@/db/products";
import {
  formatOmieDate,
  omieCall,
  omiePaginate,
  parseAmount,
  type OmieAppConfig,
} from "@/server/omie/client";

function productInactive(raw: Record<string, unknown>) {
  const flag = String(raw["inativo"] ?? raw["inactive"] ?? "N").trim().toUpperCase();
  return flag === "S" || flag === "1" || flag === "TRUE";
}

function extractCmcFromProduct(raw: Record<string, unknown>) {
  return parseAmount(
    raw["nCMC"] ??
      raw["ncmc"] ??
      raw["cmc"] ??
      raw["valor_custo"] ??
      raw["custo_unitario"] ??
      raw["nValorCusto"],
  );
}

function extractFiscalSaldo(raw: Record<string, unknown>) {
  return parseAmount(
    raw["nSaldo"] ??
      raw["nsaldo"] ??
      raw["nSaldoFisico"] ??
      raw["nSaldoDisponivel"] ??
      raw["saldo"] ??
      raw["quantidade"],
  );
}

/** Posição de estoque Omie: CMC (`nCMC`) + saldo fiscal (`nSaldo`) via ListarPosEstoque. */
export async function syncProductCmcFromStock(app: OmieAppConfig) {
  const byProduct = new Map<number, { saldo: number; cmc: number | null }>();
  let page = 1;
  let totalPages = 1;
  const dataPosicao = formatOmieDate(new Date());

  while (page <= totalPages) {
    const response = await omieCall<{
      nPagina?: number;
      nTotPaginas?: number;
      produtos?: Record<string, unknown>[];
    }>(app, "/estoque/consulta/", "ListarPosEstoque", {
      nPagina: page,
      nRegPorPagina: 100,
      dDataPosicao: dataPosicao,
      cExibeTodos: "S",
      lista_local_estoque: "TODOS",
    });

    totalPages = Math.max(1, Number(response.nTotPaginas ?? 1));
    for (const raw of response.produtos ?? []) {
      const codigoProduto = Number(raw["nCodProd"] ?? raw["ncodprod"] ?? 0);
      if (!codigoProduto) continue;
      const cmc = parseAmount(raw["nCMC"] ?? raw["ncmc"] ?? raw["cmc"]);
      const saldoRaw = extractFiscalSaldo(raw);
      const saldo = saldoRaw != null && Number.isFinite(saldoRaw) ? saldoRaw : 0;
      const current = byProduct.get(codigoProduto);
      if (!current) {
        byProduct.set(codigoProduto, {
          saldo,
          cmc: cmc != null && cmc >= 0 ? cmc : null,
        });
        continue;
      }
      current.saldo += saldo;
      if (cmc != null && cmc >= 0 && (current.cmc == null || cmc > current.cmc)) {
        current.cmc = cmc;
      }
    }
    page += 1;
  }

  let updated = 0;
  let fiscalUpdated = 0;
  for (const [codigoProduto, data] of byProduct) {
    await updateOmieProductFiscalStock(app.id, codigoProduto, data.saldo, data.cmc);
    fiscalUpdated += 1;
    if (data.cmc != null && data.cmc > 0) updated += 1;
  }
  await resetOmieProductFiscalStockAbsent(app.id, [...byProduct.keys()]);
  return { updated, fiscalUpdated, scanned: byProduct.size };
}

export async function syncOmieProductsForApp(app: OmieAppConfig) {
  const items = await omiePaginate<{
    pagina?: number;
    total_de_paginas?: number;
    produto_servico_cadastro?: Record<string, unknown>[];
  }>(
    app,
    "/geral/produtos/",
    "ListarProdutos",
    (page) => ({
      pagina: page,
      registros_por_pagina: 100,
      apenas_importado_api: "N",
      filtrar_apenas_omiepdv: "N",
    }),
    (response) => ({
      page: response.pagina ?? 1,
      totalPages: response.total_de_paginas ?? 1,
      items: response.produto_servico_cadastro ?? [],
    }),
  );

  let count = 0;
  for (const raw of items) {
    const codigoProduto = Number(raw["codigo_produto"] ?? 0);
    if (!codigoProduto) continue;
    const descricao = String(raw["descricao"] ?? raw["descricao_familia"] ?? "").trim();
    if (!descricao) continue;

    await upsertOmieProduct({
      omieAppId: app.id,
      omieAppName: app.name,
      codigoProduto,
      codigoInterno: String(raw["codigo"] ?? raw["codigo_produto_integracao"] ?? "").trim() || null,
      descricao: descricao.slice(0, 255),
      unidade: String(raw["unidade"] ?? "UN").trim() || "UN",
      valorUnitario: parseAmount(raw["valor_unitario"] ?? raw["nPrecoUnitario"] ?? raw["preco_unitario"]),
      cmc: extractCmcFromProduct(raw),
      ncm: String(raw["ncm"] ?? "").trim() || null,
      inactive: productInactive(raw),
    });
    count += 1;
  }

  let cmcUpdated = 0;
  let fiscalUpdated = 0;
  let cmcError: string | undefined;
  try {
    const cmcResult = await syncProductCmcFromStock(app);
    cmcUpdated = cmcResult.updated;
    fiscalUpdated = cmcResult.fiscalUpdated;
  } catch (error) {
    cmcError = error instanceof Error ? error.message : "Falha ao buscar CMC/estoque no Omie.";
  }

  return { count, cmcUpdated, fiscalUpdated, cmcError };
}

export async function syncOmieFiscalStockForApp(app: OmieAppConfig) {
  return syncProductCmcFromStock(app);
}

export async function syncAllOmieFiscalStock() {
  const { listOrcamentosOmieApps } = await import("@/server/omie/client");
  const apps = listOrcamentosOmieApps();
  if (!apps.length) {
    throw new Error(
      "Empresa Belfer não configurada. Inclua o app Belfer em OMIE_APPS (ou defina OMIE_ORCAMENTOS_APP).",
    );
  }
  let fiscalTotal = 0;
  let cmcTotal = 0;
  const perApp: Array<{
    appId: string;
    fiscalUpdated: number;
    cmcUpdated: number;
    scanned: number;
    error?: string;
  }> = [];

  for (const app of apps) {
    try {
      const result = await syncOmieFiscalStockForApp(app);
      fiscalTotal += result.fiscalUpdated;
      cmcTotal += result.updated;
      perApp.push({
        appId: app.id,
        fiscalUpdated: result.fiscalUpdated,
        cmcUpdated: result.updated,
        scanned: result.scanned,
      });
    } catch (error) {
      perApp.push({
        appId: app.id,
        fiscalUpdated: 0,
        cmcUpdated: 0,
        scanned: 0,
        error: error instanceof Error ? error.message : "Falha ao sincronizar estoque fiscal",
      });
    }
  }

  return { fiscalTotal, cmcTotal, perApp };
}

export async function syncAllOmieProducts() {
  const { listOrcamentosOmieApps } = await import("@/server/omie/client");
  const apps = listOrcamentosOmieApps();
  if (!apps.length) {
    throw new Error(
      'Empresa Belfer não configurada. Inclua o app Belfer em OMIE_APPS (ou defina OMIE_ORCAMENTOS_APP).',
    );
  }
  let total = 0;
  let cmcTotal = 0;
  let fiscalTotal = 0;
  const perApp: Array<{
    appId: string;
    count: number;
    cmcUpdated?: number;
    fiscalUpdated?: number;
    cmcError?: string;
    error?: string;
  }> = [];

  for (const app of apps) {
    try {
      const result = await syncOmieProductsForApp(app);
      total += result.count;
      cmcTotal += result.cmcUpdated;
      fiscalTotal += result.fiscalUpdated;
      perApp.push({
        appId: app.id,
        count: result.count,
        cmcUpdated: result.cmcUpdated,
        fiscalUpdated: result.fiscalUpdated,
        ...(result.cmcError ? { cmcError: result.cmcError } : {}),
      });
    } catch (error) {
      perApp.push({
        appId: app.id,
        count: 0,
        error: error instanceof Error ? error.message : "Falha ao sincronizar produtos",
      });
    }
  }

  return { total, cmcTotal, fiscalTotal, perApp };
}
