import "@tanstack/react-start/server-only";

import { getOmieClientByCodigo, upsertOmieClient } from "@/db/clients";
import { upsertOmieContrato, type ContratoDetalhesJson, type ContratoItemDetalhe } from "@/db/contracts";
import {
  listOmieApps,
  omiePaginate,
  parseAmount,
  parseOmieDate,
  type OmieAppConfig,
} from "@/server/omie/client";
import { clientDisplayName, getCliente } from "@/server/omie/clients";

type ContratoRaw = Record<string, unknown>;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function extractItens(raw: ContratoRaw): ContratoItemDetalhe[] {
  const itens = (raw["itensContrato"] ?? raw["itens_contrato"] ?? []) as unknown[];
  if (!Array.isArray(itens)) return [];
  const out: ContratoItemDetalhe[] = [];
  for (const item of itens) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const cab = (row["itemCabecalho"] ?? row["item_cabecalho"] ?? {}) as Record<string, unknown>;
    const descObj = (row["itemDescrServ"] ?? row["item_descr_serv"] ?? {}) as Record<string, unknown>;
    const descricao =
      text(descObj["descrCompleta"] ?? descObj["descricao"] ?? row["descricao"]) || null;
    out.push({
      seq: Number(cab["seq"] ?? 0) || null,
      descricao,
      quantidade: parseAmount(cab["quant"] ?? cab["quantidade"]),
      valorUnit: parseAmount(cab["valorUnit"] ?? cab["valor_unitario"]),
      valorTotal: parseAmount(cab["valorTotal"] ?? cab["valor_total"]),
    });
  }
  return out;
}

function extractObservacoes(raw: ContratoRaw) {
  const obs = (raw["observacoes"] ?? {}) as Record<string, unknown>;
  if (typeof raw["observacoes"] === "string") return text(raw["observacoes"]) || null;
  return (
    text(obs["cObsContrato"] ?? obs["obs"] ?? obs["observacao"] ?? obs["cObs"]) || null
  );
}

function normalizeContrato(raw: ContratoRaw) {
  const cab = (raw["cabecalho"] ?? raw["contratoCabecalho"] ?? raw) as Record<string, unknown>;
  const inf = (raw["infAdic"] ?? raw["infoAdic"] ?? {}) as Record<string, unknown>;
  const codigoContrato = Number(cab["nCodCtr"] ?? cab["codigo_contrato"] ?? 0);
  const codigoCliente = Number(cab["nCodCli"] ?? cab["codigo_cliente"] ?? 0);
  if (!codigoContrato || !codigoCliente) return null;

  const itens = extractItens(raw);
  const firstDesc = itens.find((i) => i.descricao)?.descricao ?? null;
  const detalhes: ContratoDetalhesJson = {
    itens,
    categoria: text(inf["cCodCateg"] ?? "") || null,
    codIntCtr: text(cab["cCodIntCtr"] ?? "") || null,
  };

  const diaFatRaw = Number(cab["nDiaFat"] ?? 0);

  return {
    codigoContrato,
    codigoCliente,
    numero: text(cab["cNumCtr"] ?? cab["numero"]) || null,
    situacao: text(cab["cCodSit"] ?? cab["situacao"] ?? "00").padStart(2, "0").slice(0, 2),
    vigenciaIni: parseOmieDate(text(cab["dVigInicial"] ?? cab["vigencia_inicial"]) || null),
    vigenciaFim: parseOmieDate(text(cab["dVigFinal"] ?? cab["vigencia_final"]) || null),
    valorMensal: parseAmount(cab["nValTotMes"] ?? cab["valor_total_mes"]),
    tipoFat: text(cab["cTipoFat"] ?? cab["tipo_faturamento"] ?? "") || null,
    descricaoResumo: firstDesc,
    diaFat: Number.isFinite(diaFatRaw) && diaFatRaw > 0 ? diaFatRaw : null,
    contato: text(inf["cContato"] ?? "") || null,
    cidadePrestacao: text(inf["cCidPrestServ"] ?? "") || null,
    observacoes: extractObservacoes(raw),
    detalhes,
  };
}

async function resolveClienteLocalOrOmie(app: OmieAppConfig, codigoCliente: number) {
  const local = await getOmieClientByCodigo(app.id, codigoCliente).catch(() => null);
  if (local) {
    return {
      nome: local.nomeFantasia || local.razaoSocial || `Cliente ${codigoCliente}`,
      cnpjCpf: local.cnpjCpf,
    };
  }

  const remote = await getCliente(app, codigoCliente).catch(() => undefined);
  if (!remote) {
    return { nome: `Cliente ${codigoCliente}`, cnpjCpf: null as string | null };
  }

  const nome =
    clientDisplayName(remote) || remote.razao_social || remote.nome_fantasia || `Cliente ${codigoCliente}`;
  await upsertOmieClient({
    omieAppId: app.id,
    omieAppName: app.name,
    codigoCliente: remote.codigo_cliente_omie,
    razaoSocial: remote.razao_social || nome,
    nomeFantasia: remote.nome_fantasia || null,
    cnpjCpf: remote.cnpj_cpf,
    endereco: remote.endereco,
    contato: remote.contato,
  }).catch(() => undefined);

  return { nome, cnpjCpf: remote.cnpj_cpf };
}

export async function syncOmieContratosForApp(app: OmieAppConfig) {
  const items = await omiePaginate<{
    pagina?: number;
    total_de_paginas?: number;
    contratoCadastro?: ContratoRaw[];
    contrato_cadastro?: ContratoRaw[];
  }>(
    app,
    "/servicos/contrato/",
    "ListarContratos",
    (page) => ({
      pagina: page,
      registros_por_pagina: 50,
      apenas_importado_api: "N",
    }),
    (response) => ({
      page: response.pagina ?? 1,
      totalPages: response.total_de_paginas ?? 1,
      items: response.contratoCadastro ?? response.contrato_cadastro ?? [],
    }),
  );

  const clientCache = new Map<number, { nome: string; cnpjCpf: string | null }>();
  let count = 0;

  for (const item of items) {
    const raw = item as ContratoRaw;
    const cab = normalizeContrato(raw);
    if (!cab) continue;

    let client = clientCache.get(cab.codigoCliente);
    if (!client) {
      client = await resolveClienteLocalOrOmie(app, cab.codigoCliente);
      clientCache.set(cab.codigoCliente, client);
    }

    await upsertOmieContrato({
      omieAppId: app.id,
      omieAppName: app.name,
      codigoContrato: cab.codigoContrato,
      codigoCliente: cab.codigoCliente,
      cnpjCpf: client.cnpjCpf,
      clienteNome: client.nome,
      numero: cab.numero,
      situacao: cab.situacao,
      vigenciaIni: cab.vigenciaIni,
      vigenciaFim: cab.vigenciaFim,
      valorMensal: cab.valorMensal,
      tipoFat: cab.tipoFat,
      descricaoResumo: cab.descricaoResumo,
      diaFat: cab.diaFat,
      contato: cab.contato,
      cidadePrestacao: cab.cidadePrestacao,
      observacoes: cab.observacoes,
      detalhes: cab.detalhes,
    });
    count += 1;
  }

  return { count };
}

export async function syncAllOmieContratos() {
  const apps = listOmieApps();
  if (!apps.length) {
    throw new Error("Nenhuma empresa Omie configurada em OMIE_APPS.");
  }

  let total = 0;
  const perApp: Array<{ appId: string; appName: string; count: number; error?: string }> = [];

  for (const app of apps) {
    try {
      const result = await syncOmieContratosForApp(app);
      total += result.count;
      perApp.push({ appId: app.id, appName: app.name, count: result.count });
    } catch (error) {
      perApp.push({
        appId: app.id,
        appName: app.name,
        count: 0,
        error: error instanceof Error ? error.message : "Falha ao sincronizar contratos",
      });
    }
  }

  return { total, perApp };
}
