import "@tanstack/react-start/server-only";

import { upsertOmieProduct } from "@/db/products";
import { listOmieApps, omiePaginate, parseAmount, type OmieAppConfig } from "@/server/omie/client";

function productInactive(raw: Record<string, unknown>) {
  const flag = String(raw["inativo"] ?? raw["inactive"] ?? "N").trim().toUpperCase();
  return flag === "S" || flag === "1" || flag === "TRUE";
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
      // Sem este filtro a Omie devolve 0 produtos em vários apps.
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
      ncm: String(raw["ncm"] ?? "").trim() || null,
      inactive: productInactive(raw),
    });
    count += 1;
  }

  return count;
}

export async function syncAllOmieProducts() {
  const apps = listOmieApps();
  let total = 0;
  const perApp: Array<{ appId: string; count: number; error?: string }> = [];

  for (const app of apps) {
    try {
      const count = await syncOmieProductsForApp(app);
      total += count;
      perApp.push({ appId: app.id, count });
    } catch (error) {
      perApp.push({
        appId: app.id,
        count: 0,
        error: error instanceof Error ? error.message : "Falha ao sincronizar produtos",
      });
    }
  }

  return { total, perApp };
}
