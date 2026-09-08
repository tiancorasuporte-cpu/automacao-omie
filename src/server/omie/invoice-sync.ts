import "@tanstack/react-start/server-only";

import { upsertDueItem, markStaleOpenDueItems } from "@/db/due-items";
import type { DueItemType } from "@/db/schema";
import {
  formatOmieDate,
  omiePaginate,
  parseAmount,
  parseOmieDate,
  type OmieAppConfig,
} from "@/server/omie/client";
import {
  clientDisplayName,
  getCliente,
  pickClientCodeFromRecord,
  pickClientNameFromRecord,
  resolveStoredClientPhone,
} from "@/server/omie/clients";
import { isClosedReceivableStatus, isOpenReceivableStatus } from "@/server/omie/status";

function pickDueDate(item: Record<string, unknown>) {
  return (
    parseOmieDate(String(item["dDtVenc"] ?? "")) ??
    parseOmieDate(String(item["data_vencimento"] ?? "")) ??
    parseOmieDate(String(item["dDtVencimento"] ?? "")) ??
    parseOmieDate(String(item["dDtVencParcela"] ?? ""))
  );
}

function isDueDateInWindow(dueDate: string, from: Date, to: Date) {
  const fromIso = parseOmieDate(formatOmieDate(from));
  const toIso = parseOmieDate(formatOmieDate(to));
  if (!fromIso || !toIso) return true;
  return dueDate >= fromIso && dueDate <= toIso;
}

export function isBoletoMovement(detalhes: Record<string, unknown>) {
  const tipo = String(detalhes["cTipo"] ?? "").toUpperCase();
  const boleto = String(detalhes["cNumBoleto"] ?? "").trim();
  return tipo === "BOL" || Boolean(boleto);
}

export function classifyReceivableType(detalhes: Record<string, unknown>): DueItemType | null {
  if (isBoletoMovement(detalhes)) return "boleto";

  const tipo = String(detalhes["cTipo"] ?? "").toUpperCase();
  const origem = String(detalhes["cOrigem"] ?? detalhes["cGrupo"] ?? "").toUpperCase();
  const chave = String(detalhes["cChaveNFe"] ?? "").trim();
  const doc = String(detalhes["cNumDocFiscal"] ?? detalhes["cNumTitulo"] ?? detalhes["numero_documento"] ?? "");

  if (tipo.includes("NFS") || origem.includes("NFSE") || /nfs-?e/i.test(doc)) return "nfse";
  if (tipo.includes("NFE") || tipo === "NF" || chave.length > 40 || /nf-?e/i.test(doc)) return "nfe";

  return null;
}

function nfeIntegrationCode(nIdNfe: number | null, nCodTitulo: number | null, chaveNfe?: string | null) {
  if (nIdNfe) return `nfe:${nIdNfe}`;
  const chave = chaveNfe?.replace(/\D/g, "") ?? "";
  if (chave.length >= 40) return `chave:${chave}`;
  if (nCodTitulo) return `titulo:${nCodTitulo}`;
  return null;
}

function nfseIntegrationCode(nCodNFSe: number | null, nCodTitulo: number | null = null) {
  if (nCodNFSe) return `nfse:${nCodNFSe}`;
  if (nCodTitulo) return `titulo:${nCodTitulo}`;
  return null;
}

export async function saveReceivableDueItem(
  app: OmieAppConfig,
  input: {
    itemType: DueItemType;
    detalhes: Record<string, unknown>;
    omieCode: number | null;
    integrationCode: string | null;
    documentNumber: string | null;
    clientCode: number | null;
    clientName: string | null;
    dueDate: string;
    amount: number | null;
    status: string | null;
  },
  window?: { from: Date; to: Date },
) {
  if (!input.dueDate) return false;
  if (window && !isDueDateInWindow(input.dueDate, window.from, window.to)) return false;

  const status = String(input.status ?? "");
  if (isClosedReceivableStatus(status)) return false;
  // Notas sem status cobrável não entram como alerta (evita NF já quitada).
  if ((input.itemType === "nfe" || input.itemType === "nfse") && !isOpenReceivableStatus(status)) {
    return false;
  }

  const client = input.clientCode ? await getCliente(app, input.clientCode) : undefined;

  await upsertDueItem({
    omieAppId: app.id,
    omieAppName: app.name,
    itemType: input.itemType,
    omieCode: input.omieCode,
    integrationCode: input.integrationCode,
    documentNumber: input.documentNumber,
    clientCode: input.clientCode,
    clientName: input.clientName || clientDisplayName(client) || pickClientNameFromRecord(input.detalhes),
    clientPhone: resolveStoredClientPhone(client, input.detalhes),
    dueDate: input.dueDate,
    amount: input.amount,
    status: input.status,
  });

  return true;
}

export async function saveDueItemFromMovement(
  app: OmieAppConfig,
  detalhes: Record<string, unknown>,
  window?: { from: Date; to: Date },
) {
  const itemType = classifyReceivableType(detalhes);
  if (!itemType) return false;

  const dueDate = pickDueDate(detalhes);
  if (!dueDate) return false;

  const nCodTitulo = Number(detalhes["nCodTitulo"] ?? detalhes["codigo_lancamento_omie"] ?? 0) || null;
  const nIdNfe = Number(detalhes["nIdNfe"] ?? detalhes["nCodNF"] ?? 0) || null;
  const nCodNFSe = Number(detalhes["nCodNFSe"] ?? 0) || null;
  const chaveNfe = String(detalhes["chave_nfe"] ?? detalhes["cChaveNFe"] ?? "").trim() || null;

  const omieCode =
    itemType === "nfe"
      ? nIdNfe ?? nCodTitulo
      : itemType === "nfse"
        ? nCodNFSe ?? nCodTitulo
        : nCodTitulo;

  return saveReceivableDueItem(
    app,
    {
      itemType,
      detalhes,
      omieCode,
      integrationCode:
        itemType === "nfe"
          ? nfeIntegrationCode(nIdNfe, nCodTitulo, chaveNfe)
          : itemType === "nfse"
            ? nfseIntegrationCode(nCodNFSe, nCodTitulo)
            : String(detalhes["cCodIntTitulo"] ?? detalhes["codigo_lancamento_integracao"] ?? "") || null,
      documentNumber:
        String(
          detalhes["cNumBoleto"] ??
            detalhes["cNumDocFiscal"] ??
            detalhes["cNumTitulo"] ??
            detalhes["numero_documento"] ??
            "",
        ) || null,
      clientCode: pickClientCodeFromRecord(detalhes),
      clientName: pickClientNameFromRecord(detalhes),
      dueDate,
      amount: parseAmount(detalhes["nValorTitulo"] ?? detalhes["valor_documento"]),
      status: String(detalhes["cStatus"] ?? detalhes["status_titulo"] ?? "") || null,
    },
    window,
  );
}

async function syncNfeInvoices(app: OmieAppConfig, from: Date, to: Date) {
  const fromStr = formatOmieDate(from);
  const toStr = formatOmieDate(to);

  const items = await omiePaginate<{
    pagina?: number;
    total_de_paginas?: number;
    nfCadastro?: Record<string, unknown>[];
  }>(
    app,
    "/produtos/nfconsultar/",
    "ListarNF",
    (page) => ({
      pagina: page,
      registros_por_pagina: 50,
      filtrar_por_data_de: fromStr,
      filtrar_por_data_ate: toStr,
    }),
    (response) => ({
      page: response.pagina ?? 1,
      totalPages: response.total_de_paginas ?? 1,
      items: response.nfCadastro ?? [],
    }),
  );

  let count = 0;
  for (const raw of items) {
    const cadastro = raw as Record<string, unknown>;
    const ide = (cadastro["ide"] ?? {}) as Record<string, unknown>;
    const dest = (cadastro["nfDestInt"] ?? cadastro["dest"] ?? {}) as Record<string, unknown>;
    const total = (cadastro["total"] ?? {}) as Record<string, unknown>;
    const icms = (total["ICMSTot"] ?? {}) as Record<string, unknown>;

    const nIdNfe =
      Number(ide["nCodNF"] ?? ide["nIdNF"] ?? ide["nIdNfe"] ?? cadastro["nCodNF"] ?? 0) || null;
    const chaveNfe =
      String(ide["cChaveNFe"] ?? ide["chave_nfe"] ?? cadastro["cChaveNFe"] ?? cadastro["chave_nfe"] ?? "")
        .replace(/\D/g, "") || null;
    const documentNumber = String(ide["nNF"] ?? ide["cNumNF"] ?? "").trim() || null;
    const clientCode = Number(dest["nCodCli"] ?? dest["nCodCliente"] ?? dest["nCodigoCliente"] ?? 0) || null;
    const defaultAmount = parseAmount(icms["vNF"] ?? total["vNF"]);

    const titulos = (cadastro["titulos"] ?? []) as Record<string, unknown>[];
    if (titulos.length > 0) {
      for (const titulo of titulos) {
        const dueDate = pickDueDate(titulo);
        if (!dueDate) continue;
        const nCodTitulo = Number(titulo["nCodTitulo"] ?? 0) || null;
        const saved = await saveReceivableDueItem(
          app,
          {
            itemType: "nfe",
            detalhes: { ...titulo, nIdNfe, nCodCliente: clientCode },
            omieCode: nIdNfe ?? nCodTitulo,
            integrationCode: nfeIntegrationCode(nIdNfe, nCodTitulo, chaveNfe),
            documentNumber,
            clientCode,
            clientName: null,
            dueDate,
            amount: parseAmount(titulo["nValor"] ?? titulo["nValorTitulo"]) ?? defaultAmount,
            status: String(titulo["cStatus"] ?? "") || null,
          },
          { from, to },
        );
        if (saved) count += 1;
      }
      continue;
    }

    const dueDate =
      pickDueDate(ide) ??
      parseOmieDate(String(ide["dDtVenc"] ?? ide["dEmi"] ?? ide["dDtEmissao"] ?? ""));
    if (!dueDate) continue;

    const saved = await saveReceivableDueItem(
      app,
      {
        itemType: "nfe",
        detalhes: cadastro,
        omieCode: nIdNfe,
        integrationCode: nfeIntegrationCode(nIdNfe, null),
        documentNumber,
        clientCode,
        clientName: null,
        dueDate,
        amount: defaultAmount,
        status: String(ide["cStatus"] ?? "") || null,
      },
      { from, to },
    );
    if (saved) count += 1;
  }

  return count;
}

async function syncNfseInvoices(app: OmieAppConfig, from: Date, to: Date) {
  const fromStr = formatOmieDate(from);
  const toStr = formatOmieDate(to);

  const items = await omiePaginate<{
    nPagina?: number;
    nTotPaginas?: number;
    nfseEncontradas?: Record<string, unknown>[];
  }>(
    app,
    "/servicos/nfse/",
    "ListarNFSEs",
    (page) => ({
      nPagina: page,
      nRegPorPagina: 50,
      dEmiInicial: fromStr,
      dEmiFinal: toStr,
    }),
    (response) => ({
      page: response.nPagina ?? 1,
      totalPages: response.nTotPaginas ?? 1,
      items: response.nfseEncontradas ?? [],
    }),
  );

  let count = 0;
  for (const raw of items) {
    const entry = raw as Record<string, unknown>;
    const cab = (entry["Cabecalho"] ?? entry["cabecalho"] ?? {}) as Record<string, unknown>;
    const emissao = (entry["Emissao"] ?? entry["emissao"] ?? {}) as Record<string, unknown>;
    const valores = (entry["Valores"] ?? entry["valores"] ?? {}) as Record<string, unknown>;
    const os = (entry["OrdemServico"] ?? entry["ordemServico"] ?? {}) as Record<string, unknown>;

    const nCodNFSe =
      Number(cab["nCodNFSe"] ?? cab["nCodigoNFSe"] ?? cab["nCodNF"] ?? entry["nCodNFSe"] ?? 0) || null;
    if (!nCodNFSe) continue;

    const documentNumber =
      String(cab["nNumeroNFSe"] ?? cab["cNumeroNFSe"] ?? cab["nNumeroNF"] ?? "").trim() || String(nCodNFSe);
    const clientCode =
      Number(
        cab["nCodigoCliente"] ??
          cab["nCodCliente"] ??
          cab["nCodCli"] ??
          os["nCodigoCliente"] ??
          0,
      ) || null;

    const dueDate =
      pickDueDate(cab) ??
      parseOmieDate(String(cab["dDtVenc"] ?? emissao["cDataEmissao"] ?? cab["dDtEmissao"] ?? ""));
    if (!dueDate) continue;

    const saved = await saveReceivableDueItem(
      app,
      {
        itemType: "nfse",
        detalhes: entry,
        omieCode: nCodNFSe,
        integrationCode: nfseIntegrationCode(nCodNFSe),
        documentNumber,
        clientCode,
        clientName: String(cab["cRazaoSocial"] ?? cab["cNome"] ?? "").trim() || null,
        dueDate,
        amount: parseAmount(valores["nValorLiquido"] ?? valores["nValorTotalServicos"]),
        status: String(cab["cStatus"] ?? cab["cStatusNFSe"] ?? "").trim() || null,
      },
      { from, to },
    );
    if (saved) count += 1;
  }

  return count;
}

export async function syncInvoiceDocuments(app: OmieAppConfig, from: Date, to: Date) {
  let nfe = 0;
  let nfse = 0;
  const errors: string[] = [];

  try {
    nfe = await syncNfeInvoices(app, from, to);
  } catch (error) {
    errors.push(`nfe: ${error instanceof Error ? error.message : "erro"}`);
  }

  try {
    nfse = await syncNfseInvoices(app, from, to);
  } catch (error) {
    errors.push(`nfse: ${error instanceof Error ? error.message : "erro"}`);
  }

  return { nfe, nfse, errors };
}
