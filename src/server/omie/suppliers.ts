import "@tanstack/react-start/server-only";

import { upsertOmieSupplier } from "@/db/suppliers";
import { listOrcamentosOmieApps, omiePaginate, type OmieAppConfig } from "@/server/omie/client";
import { normalizeCliente } from "@/server/omie/clients";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function extractTags(raw: Record<string, unknown>): string[] {
  const root = (raw["clientes_cadastro"] ?? raw["cadastro"] ?? raw) as Record<string, unknown>;
  const tags = root["tags"];
  if (!Array.isArray(tags)) return [];
  return tags
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry === "object") {
        return text((entry as Record<string, unknown>)["tag"]);
      }
      return "";
    })
    .filter(Boolean);
}

function hasFornecedorTag(tags: string[]) {
  return tags.some((tag) => tag.toLowerCase() === "fornecedor");
}

function clientInactive(raw: Record<string, unknown>) {
  const root = (raw["clientes_cadastro"] ?? raw["cadastro"] ?? raw) as Record<string, unknown>;
  const flag = String(root["inativo"] ?? raw["inativo"] ?? raw["inactive"] ?? "N")
    .trim()
    .toUpperCase();
  return flag === "S" || flag === "1" || flag === "TRUE";
}

async function listClientesPages(
  app: OmieAppConfig,
  withFornecedorFilter: boolean,
) {
  return omiePaginate<{
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
      ...(withFornecedorFilter
        ? { clientesFiltro: { tags: [{ tag: "Fornecedor" }] } }
        : {}),
    }),
    (response) => ({
      page: response.pagina ?? 1,
      totalPages: response.total_de_paginas ?? 1,
      items: response.clientes_cadastro ?? [],
    }),
  );
}

export async function syncOmieSuppliersForApp(app: OmieAppConfig) {
  let items: Record<string, unknown>[] = [];
  let usedTagFilter = true;
  try {
    items = (await listClientesPages(app, true)) as Record<string, unknown>[];
  } catch {
    usedTagFilter = false;
    items = (await listClientesPages(app, false)) as Record<string, unknown>[];
  }

  // Se o filtro por tag não retornou nada útil, tenta lista geral e filtra localmente.
  if (usedTagFilter && items.length === 0) {
    items = (await listClientesPages(app, false)) as Record<string, unknown>[];
    usedTagFilter = false;
  }

  let count = 0;
  for (const item of items) {
    const raw = item as Record<string, unknown>;
    const tags = extractTags(raw);
    if (!usedTagFilter && tags.length > 0 && !hasFornecedorTag(tags)) continue;
    // Sem tags no payload da listagem filtrada: confia no filtro Omie; na lista geral sem tags, pula.
    if (!usedTagFilter && tags.length === 0) continue;

    const client = normalizeCliente(raw);
    if (!client) continue;
    await upsertOmieSupplier({
      omieAppId: app.id,
      omieAppName: app.name,
      codigoOmie: client.codigo_cliente_omie,
      razaoSocial: client.razao_social || client.nome_fantasia || `Fornecedor ${client.codigo_cliente_omie}`,
      nomeFantasia: client.nome_fantasia || null,
      cnpjCpf: client.cnpj_cpf,
      inactive: clientInactive(raw),
    });
    count += 1;
  }

  return { count };
}

export async function syncAllOmieSuppliers() {
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
      const result = await syncOmieSuppliersForApp(app);
      total += result.count;
      perApp.push({ appId: app.id, count: result.count });
    } catch (error) {
      perApp.push({
        appId: app.id,
        count: 0,
        error: error instanceof Error ? error.message : "Falha ao sincronizar fornecedores",
      });
    }
  }
  return { total, perApp };
}
