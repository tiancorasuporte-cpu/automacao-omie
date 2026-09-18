import "@tanstack/react-start/server-only";

import { updateOmieProductCmc, upsertOmieProduct } from "@/db/products";
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

/** Busca o CMC (Custo Médio Contábil) da Omie via ListarPosEstoque (`nCMC`). */
export async function syncProductCmcFromStock(app: OmieAppConfig) {
  const byProduct = new Map<number, number>();
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
      if (cmc == null || cmc < 0) continue;
      const current = byProduct.get(codigoProduto);
      if (current == null || (cmc > 0 && cmc > current) || (current <= 0 && cmc >= 0)) {
        byProduct.set(codigoProduto, cmc);
      }
    }
    page += 1;
  }

  let updated = 0;
  for (const [codigoProduto, cmc] of byProduct) {
    if (cmc <= 0) continue;
    await updateOmieProductCmc(app.id, codigoProduto, cmc);
    updated += 1;
  }
  return { updated, scanned: byProduct.size };
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
  let cmcError: string | undefined;
  try {
    const cmcResult = await syncProductCmcFromStock(app);
    cmcUpdated = cmcResult.updated;
  } catch (error) {
    cmcError = error instanceof Error ? error.message : "Falha ao buscar CMC no estoque Omie.";
  }

  return { count, cmcUpdated, cmcError };
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
  const perApp: Array<{
    appId: string;
    count: number;
    cmcUpdated?: number;
    cmcError?: string;
    error?: string;
  }> = [];

  for (const app of apps) {
    try {
      const result = await syncOmieProductsForApp(app);
      total += result.count;
      cmcTotal += result.cmcUpdated;
      perApp.push({
        appId: app.id,
        count: result.count,
        cmcUpdated: result.cmcUpdated,
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

  return { total, cmcTotal, perApp };
}
