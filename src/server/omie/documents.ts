import "@tanstack/react-start/server-only";

import type { DueItem } from "@/db/schema";
import { omieCall, type OmieAppConfig } from "@/server/omie/client";

export type DueItemDocument = {
  filename: string;
  mimetype: string;
  url?: string;
  base64?: string;
};

export type DocumentPdfResult = {
  document: DueItemDocument | null;
  status: string | null;
  link: string | null;
  barcode: string | null;
  documentNumber: string | null;
};

type BoletoOmieResponse = {
  cLinkBoleto?: string;
  cCodStatus?: string;
  cDesStatus?: string;
  cCodBarras?: string;
  cNumBoleto?: string;
};

function safeFilename(value: string) {
  return value.replace(/[^\w.-]+/g, "_").slice(0, 80) || "documento";
}

function parseIntegrationRef(integrationCode: string | null | undefined, prefix: string) {
  if (!integrationCode?.startsWith(`${prefix}:`)) return null;
  const value = Number(integrationCode.slice(prefix.length + 1));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseChaveRef(integrationCode: string | null | undefined) {
  if (!integrationCode?.startsWith("chave:")) return null;
  const chave = integrationCode.slice("chave:".length).replace(/\D/g, "");
  return chave.length >= 40 ? chave : null;
}

function parseDocumentNumber(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function lookupTituloFinanceiro(app: OmieAppConfig, nCodTitulo: number) {
  try {
    const response = await omieCall<{
      titulosEncontrados?: Record<string, unknown>[];
    }>(app, "/financas/pesquisartitulos/", "PesquisarLancamentos", {
      nPagina: 1,
      nRegPorPagina: 1,
      nCodTitulo,
      cNatureza: "R",
    });
    const hit = response.titulosEncontrados?.[0];
    if (hit) return flattenTituloRecord(hit);
  } catch {
    // tenta consulta direta
  }

  try {
    const cr = await omieCall<Record<string, unknown>>(app, "/financas/contareceber/", "ConsultarContaReceber", {
      codigo_lancamento_omie: nCodTitulo,
    });
    return flattenTituloRecord(cr);
  } catch {
    return null;
  }
}

/** Unifica cabecTitulo/detalhes do PesquisarLancamentos com o formato plano do ConsultarContaReceber. */
function flattenTituloRecord(hit: Record<string, unknown>) {
  const cab = (
    (hit["cabecTitulo"] as Record<string, unknown> | undefined) ??
    (hit["Cabecalho"] as Record<string, unknown> | undefined) ??
    (hit["detalhes"] as Record<string, unknown> | undefined) ??
    {}
  ) as Record<string, unknown>;

  const merged: Record<string, unknown> = { ...hit, ...cab };

  const nCodOS = Number(cab["nCodOS"] ?? hit["nCodOS"] ?? hit["nCodigoOS"] ?? 0) || null;
  const nCodNF =
    Number(cab["nCodNF"] ?? cab["nCodNFSe"] ?? hit["nCodNF"] ?? hit["nCodNFSe"] ?? hit["nIdNfe"] ?? 0) || null;
  const chave = String(cab["cChaveNFe"] ?? hit["cChaveNFe"] ?? hit["chave_nfe"] ?? "").replace(/\D/g, "");
  const numeroFiscal =
    String(
      cab["cNumDocFiscal"] ??
        hit["cNumDocFiscal"] ??
        hit["numero_documento_fiscal"] ??
        hit["numero_documento"] ??
        "",
    ).trim() || null;

  if (nCodOS) merged["nCodOS"] = nCodOS;
  if (nCodNF) {
    merged["nCodNF"] = nCodNF;
    merged["nCodNFSe"] = nCodNF;
    merged["nIdNfe"] = nCodNF;
  }
  if (chave) {
    merged["cChaveNFe"] = chave;
    merged["chave_nfe"] = chave;
  }
  if (numeroFiscal) {
    merged["numero_documento_fiscal"] = numeroFiscal;
    merged["cNumDocFiscal"] = numeroFiscal;
  }

  return merged;
}

function normalizeDocDigits(value: unknown) {
  return String(value ?? "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");
}

function documentNumberMatches(doc: Record<string, unknown>, numero?: string | null) {
  const want = normalizeDocDigits(numero);
  if (!want) return true;
  const got = normalizeDocDigits(doc.nNumero ?? doc.cNumero ?? doc.nDoc ?? doc.cNumNFSe ?? "");
  if (!got || got === "0") return false;
  return got === want || got.endsWith(want) || want.endsWith(got);
}

async function lookupFiscalDocumentId(
  app: OmieAppConfig,
  input: {
    modelo: "55" | "99";
    chave?: string | null;
    numero?: string | null;
    nIdOS?: number | null;
    nIdReceb?: number | null;
  },
) {
  const param: Record<string, unknown> = {
    nPagina: 1,
    nRegPorPagina: 20,
    cModelo: input.modelo,
  };

  if (input.chave) param.nChave = input.chave;
  if (input.nIdOS) param.nIdOS = input.nIdOS;
  if (input.nIdReceb) param.nIdReceb = input.nIdReceb;

  const numero = parseDocumentNumber(input.numero ?? null);
  if (!input.chave && !input.nIdOS && numero) {
    param.nDocInicial = numero;
    param.nDocFinal = numero;
  }

  if (!param.nChave && !param.nIdOS && !param.nIdReceb && param.nDocInicial == null) {
    return null;
  }

  try {
    const response = await omieCall<{
      documentosEncontrados?: Record<string, unknown>[];
    }>(app, "/contador/xml/", "ListarDocumentos", param);

    for (const doc of response.documentosEncontrados ?? []) {
      const nIdNF = Number(doc.nIdNF ?? 0) || null;
      if (!nIdNF) continue;

      if (input.nIdOS) {
        const docOs = Number(doc.nIdOS ?? 0) || null;
        if (docOs && docOs !== input.nIdOS) continue;
      }

      // Omie às vezes ignora nIdReceb e devolve a 1ª página genérica.
      if (input.nIdReceb) {
        const docReceb = Number(doc.nIdReceb ?? 0) || null;
        if (docReceb && docReceb !== input.nIdReceb) continue;
        if (!docReceb && !documentNumberMatches(doc, input.numero)) continue;
      }

      if (input.numero && !documentNumberMatches(doc, input.numero)) continue;
      if (!input.chave && !input.nIdOS && !input.numero && Number(doc.nNumero ?? 0) === 0) continue;

      return nIdNF;
    }
  } catch {
    // sem documento fiscal indexado
  }

  return null;
}

async function lookupNfseIdFromOrdemServico(app: OmieAppConfig, nCodOS: number) {
  try {
    const status = await omieCall<Record<string, unknown>>(app, "/servicos/os/", "StatusOS", { nCodOS });
    const direct =
      Number(status["nCodNF"] ?? status["nIdNf"] ?? status["nCodNFSe"] ?? status["nIdNF"] ?? 0) || null;
    if (direct) return direct;

    const lista = status["ListaRpsNfse"] ?? status["listaRpsNfse"] ?? status["RpsNfse"];
    if (Array.isArray(lista)) {
      for (const entry of lista) {
        if (!entry || typeof entry !== "object") continue;
        const row = entry as Record<string, unknown>;
        const id = Number(row["nCodNF"] ?? row["nIdNf"] ?? row["nCodNFSe"] ?? row["nIdNF"] ?? 0) || null;
        if (id) return id;
      }
    }
  } catch {
    // status indisponível
  }

  try {
    const os = await omieCall<Record<string, unknown>>(app, "/servicos/os/", "ConsultarOS", { nCodOS });
    const cab = (os["Cabecalho"] as Record<string, unknown> | undefined) ?? os;
    const info = (os["InformacoesAdicionais"] as Record<string, unknown> | undefined) ?? {};
    const direct =
      Number(
        cab["nCodNF"] ??
          cab["nCodNFSe"] ??
          info["nCodNF"] ??
          info["nCodNFSe"] ??
          os["nCodNF"] ??
          os["nCodNFSe"] ??
          0,
      ) || null;
    if (direct) return direct;
  } catch {
    // OS indisponível
  }

  return null;
}

async function resolveNfeLookup(
  app: OmieAppConfig,
  item: Pick<DueItem, "omieCode" | "integrationCode" | "documentNumber">,
) {
  const nfeFromCode = parseIntegrationRef(item.integrationCode, "nfe");
  if (nfeFromCode) {
    return { nIdNfe: nfeFromCode, chaveNfe: null as string | null, numeroNfe: item.documentNumber };
  }

  const tituloId =
    parseIntegrationRef(item.integrationCode, "titulo") ??
    (item.integrationCode == null && item.omieCode ? item.omieCode : null);
  const titulo = tituloId ? await lookupTituloFinanceiro(app, tituloId) : null;

  const chaveRaw =
    parseChaveRef(item.integrationCode) ??
    String(titulo?.["cChaveNFe"] ?? titulo?.["chave_nfe"] ?? "").replace(/\D/g, "");
  const chaveNfe = chaveRaw.length >= 40 ? chaveRaw : null;

  const numero =
    item.documentNumber ??
    (titulo?.["numero_documento_fiscal"] as string | undefined) ??
    (titulo?.["cNumDocFiscal"] as string | undefined) ??
    (titulo?.["numero_documento"] as string | undefined) ??
    null;

  const nCodNF = Number(titulo?.["nCodNF"] ?? titulo?.["nIdNfe"] ?? 0) || null;

  let nIdNfe: number | null = nCodNF;
  if (!nIdNfe && chaveNfe) {
    nIdNfe = await lookupFiscalDocumentId(app, { modelo: "55", chave: chaveNfe });
  }
  if (!nIdNfe && tituloId) {
    nIdNfe = await lookupFiscalDocumentId(app, {
      modelo: "55",
      nIdReceb: tituloId,
      numero,
    });
  }
  if (!nIdNfe && numero) {
    nIdNfe = await lookupFiscalDocumentId(app, { modelo: "55", numero });
  }

  return { nIdNfe, chaveNfe, numeroNfe: item.documentNumber };
}

async function resolveNfseLookup(
  app: OmieAppConfig,
  item: Pick<DueItem, "omieCode" | "integrationCode" | "documentNumber">,
) {
  const nfseFromCode = parseIntegrationRef(item.integrationCode, "nfse");
  if (nfseFromCode) {
    return { nIdNf: nfseFromCode, nCodOS: null as number | null };
  }

  const tituloId =
    parseIntegrationRef(item.integrationCode, "titulo") ??
    (item.integrationCode == null && item.omieCode ? item.omieCode : null);
  const titulo = tituloId ? await lookupTituloFinanceiro(app, tituloId) : null;
  const nCodOS = Number(titulo?.["nCodOS"] ?? titulo?.["nCodigoOS"] ?? 0) || null;
  const nCodNF = Number(titulo?.["nCodNF"] ?? titulo?.["nCodNFSe"] ?? 0) || null;
  const numero =
    item.documentNumber ??
    (titulo?.["numero_documento_fiscal"] as string | undefined) ??
    (titulo?.["cNumDocFiscal"] as string | undefined) ??
    null;

  let nIdNf: number | null = nCodNF;
  if (!nIdNf && nCodOS) {
    nIdNf = await lookupNfseIdFromOrdemServico(app, nCodOS);
  }
  if (!nIdNf && nCodOS) {
    nIdNf = await lookupFiscalDocumentId(app, { modelo: "99", nIdOS: nCodOS, numero });
  }
  // nIdReceb no contador/xml costuma ignorar o filtro — só usa com número da nota para validar.
  if (!nIdNf && tituloId && numero) {
    nIdNf = await lookupFiscalDocumentId(app, {
      modelo: "99",
      nIdReceb: tituloId,
      numero,
    });
  }
  if (!nIdNf && numero) {
    nIdNf = await lookupFiscalDocumentId(app, { modelo: "99", numero });
  }

  return { nIdNf, nCodOS };
}

function omieDocumentSoftError(response: Record<string, unknown>) {
  const status = typeof response["cDesStatus"] === "string" ? response["cDesStatus"].trim() : "";
  const code = String(response["cCodStatus"] ?? "").trim();
  if (/nenhum registro/i.test(status)) return status;
  if (code && code !== "0") return status || `Omie status ${code}`;
  return null;
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function cleanBase64Payload(value: string) {
  const trimmed = value.trim();
  if (trimmed.includes(",") && /base64/i.test(trimmed.slice(0, 80))) {
    return trimmed.slice(trimmed.indexOf(",") + 1).replace(/\s+/g, "");
  }
  return trimmed.replace(/\s+/g, "");
}

function isPdfBuffer(buffer: Buffer) {
  return buffer.length >= 100 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
}

function decodePdfBase64(value: string) {
  try {
    const buffer = Buffer.from(cleanBase64Payload(value), "base64");
    return isPdfBuffer(buffer) ? buffer : null;
  } catch {
    return null;
  }
}

function pickLinkFromResponse(response: Record<string, unknown>) {
  return [
    response["cUrlDanfe"],
    response["cLinkDanfe"],
    response["cPdfDanfe"],
    response["cPdfNFSe"],
    response["cPdf"],
    response["cUrlNF"],
    response["cUrlNFSe"],
    response["cLinkNFSe"],
    response["cLinkPortal"],
    response["cUrl"],
    response["cLink"],
    response["cLinkAcesso"],
  ]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find((value) => value.length > 0 && isHttpUrl(value));
}

function pickPdfFromOmieResponse(
  response: Record<string, unknown>,
  input: { documentNumber?: string | null; fallbackName: string },
) {
  const candidates = [
    response["cPdfDanfe"],
    response["cPdfNFSe"],
    response["cPdfOs"],
    response["cDanfe"],
    response["cPdf"],
    response["pdf"],
    response["cArquivo"],
  ]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

  const link = pickLinkFromResponse(response) ?? candidates.find(isHttpUrl) ?? null;

  let base64: string | null = null;
  for (const candidate of candidates) {
    if (isHttpUrl(candidate)) continue;
    if (!decodePdfBase64(candidate)) continue;
    base64 = cleanBase64Payload(candidate);
    break;
  }

  if (!link && !base64) return null;

  const label = input.documentNumber?.trim() || input.fallbackName;
  return {
    filename: `${safeFilename(label)}.pdf`,
    mimetype: "application/pdf",
    ...(base64 ? { base64 } : {}),
    ...(link ? { url: link } : {}),
  } satisfies DueItemDocument;
}

/** Baixa/valida o PDF; evita enviar URL Omie incompleta ou HTML como se fosse PDF. */
export async function materializePdfDocument(document: DueItemDocument): Promise<DueItemDocument | null> {
  if (document.base64) {
    const buffer = decodePdfBase64(document.base64);
    if (!buffer) return null;
    return {
      filename: document.filename,
      mimetype: "application/pdf",
      base64: buffer.toString("base64"),
      ...(document.url ? { url: document.url } : {}),
    };
  }

  if (!document.url) return null;

  try {
    const response = await fetch(document.url, {
      redirect: "follow",
      headers: { Accept: "application/pdf,application/octet-stream,*/*" },
    });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!isPdfBuffer(buffer)) return null;
    return {
      filename: document.filename,
      mimetype: "application/pdf",
      base64: buffer.toString("base64"),
      url: document.url,
    };
  } catch {
    return null;
  }
}

function metaFromBoletoResponse(response: BoletoOmieResponse) {
  const link = response.cLinkBoleto?.trim() || null;
  const barcode = response.cCodBarras?.trim() || null;
  const documentNumber = response.cNumBoleto?.trim() || null;
  return { link, barcode, documentNumber };
}

async function fetchBoletoFromOmie(app: OmieAppConfig, omieCode: number, integrationCode?: string | null) {
  return omieCall<BoletoOmieResponse>(app, "/financas/contareceberboleto/", "ObterBoleto", {
    nCodTitulo: omieCode,
    cCodIntTitulo: integrationCode?.startsWith("titulo:") ? "" : integrationCode ?? "",
  });
}

async function fetchBoletoUrlFromOmie(app: OmieAppConfig, omieCode: number, integrationCode?: string | null) {
  try {
    const response = await omieCall<{ cLinkBoleto?: string }>(
      app,
      "/financas/pesquisartitulos/",
      "ObterURLBoleto",
      {
        nCodTitulo: omieCode,
        cCodIntTitulo: integrationCode?.startsWith("titulo:") ? "" : integrationCode ?? "",
      },
    );
    return response.cLinkBoleto?.trim() || null;
  } catch {
    return null;
  }
}

function documentFromBoletoResponse(
  response: BoletoOmieResponse,
  input: { omieCode: number; documentNumber?: string | null },
) {
  const link = response.cLinkBoleto?.trim();
  if (!link) return null;
  const label = input.documentNumber ?? response.cNumBoleto?.trim() ?? String(input.omieCode);
  return {
    filename: `${safeFilename(label)}.pdf`,
    mimetype: "application/pdf",
    url: link,
  } satisfies DueItemDocument;
}

/** Obtém PDF/link do boleto; tenta gerar no Omie se ainda não existir. */
export async function resolveBoletoPdfWithStatus(
  app: OmieAppConfig,
  input: { omieCode: number; integrationCode?: string | null; documentNumber?: string | null },
): Promise<DocumentPdfResult> {
  if (!input.omieCode) {
    return {
      document: null,
      status: "Título sem código Omie.",
      link: null,
      barcode: null,
      documentNumber: input.documentNumber ?? null,
    };
  }

  try {
    let response = await fetchBoletoFromOmie(app, input.omieCode, input.integrationCode);
    let meta = metaFromBoletoResponse(response);
    let document = documentFromBoletoResponse(response, input);

    if (document) {
      return {
        document,
        status: null,
        link: meta.link,
        barcode: meta.barcode,
        documentNumber: meta.documentNumber ?? input.documentNumber ?? null,
      };
    }

    const notGenerated =
      response.cCodStatus === "1998" || /nenhum boleto foi gerado/i.test(response.cDesStatus ?? "");

    if (notGenerated) {
      try {
        await omieCall(app, "/financas/contareceberboleto/", "GerarBoleto", {
          nCodTitulo: input.omieCode,
          cCodIntTitulo: input.integrationCode?.startsWith("titulo:") ? "" : input.integrationCode ?? "",
        });
        response = await fetchBoletoFromOmie(app, input.omieCode, input.integrationCode);
        meta = metaFromBoletoResponse(response);
        document = documentFromBoletoResponse(response, input);
        if (document) {
          return {
            document,
            status: null,
            link: meta.link,
            barcode: meta.barcode,
            documentNumber: meta.documentNumber ?? input.documentNumber ?? null,
          };
        }
      } catch {
        // Omie pode recusar (ex.: título vencido) — segue com status abaixo.
      }
    }

    let link = meta.link;
    if (!link) {
      link = await fetchBoletoUrlFromOmie(app, input.omieCode, input.integrationCode);
    }

    return {
      document: null,
      status: response.cDesStatus?.trim() || "PDF do boleto indisponível no Omie.",
      link,
      barcode: meta.barcode,
      documentNumber: meta.documentNumber ?? input.documentNumber ?? null,
    };
  } catch (error) {
    return {
      document: null,
      status: error instanceof Error ? error.message : "Falha ao consultar boleto no Omie.",
      link: null,
      barcode: null,
      documentNumber: input.documentNumber ?? null,
    };
  }
}

export async function resolveNfePdfWithStatus(
  app: OmieAppConfig,
  item: Pick<DueItem, "omieCode" | "integrationCode" | "documentNumber">,
): Promise<DocumentPdfResult> {
  const lookup = await resolveNfeLookup(app, item);
  if (!lookup.nIdNfe) {
    return {
      document: null,
      status: "NF-e sem vínculo com nota fiscal no Omie. Sincronize novamente ou verifique a chave da nota.",
      link: null,
      barcode: null,
      documentNumber: item.documentNumber,
    };
  }

  const nIdNfe = lookup.nIdNfe;
  // Preferir DANFE completa (ObterNfe); ObterDanfeSimp é só a versão simplificada.
  const pdfAttempts = [
    { endpoint: "/produtos/dfedocs/", call: "ObterNfe", param: { nIdNfe } },
    { endpoint: "/produtos/dfedocs/", call: "ObterDanfeSimp", param: { nIdNfe } },
  ] as const;

  for (const attempt of pdfAttempts) {
    try {
      const response = await omieCall<Record<string, unknown>>(app, attempt.endpoint, attempt.call, attempt.param);
      if (omieDocumentSoftError(response)) continue;
      const candidate = pickPdfFromOmieResponse(response, {
        documentNumber: item.documentNumber,
        fallbackName: `nfe-${nIdNfe}`,
      });
      const link = pickLinkFromResponse(response) ?? candidate?.url ?? null;
      const document = candidate ? await materializePdfDocument(candidate) : null;

      if (document?.base64) {
        return {
          document,
          status: null,
          link: link ?? document.url ?? null,
          barcode: null,
          documentNumber: item.documentNumber,
        };
      }
      // URL Omie inválida/incompleta: tenta próximo método em vez de anexar lixo.
    } catch {
      // tenta próximo método
    }
  }

  try {
    const response = await omieCall<Record<string, unknown>>(app, "/produtos/notafiscalutil/", "GetUrlDanfe", {
      nCodNF: nIdNfe,
      cCodNFInt: "",
    });
    const link = pickLinkFromResponse(response);
    if (link) {
      const document = await materializePdfDocument({
        filename: `${safeFilename(item.documentNumber?.trim() || `nfe-${nIdNfe}`)}.pdf`,
        mimetype: "application/pdf",
        url: link,
      });
      return {
        document,
        status: null,
        link,
        barcode: null,
        documentNumber: item.documentNumber,
      };
    }
  } catch {
    // link indisponível
  }

  return {
    document: null,
    status: "DANFE/PDF da NF-e indisponível no Omie.",
    link: null,
    barcode: null,
    documentNumber: item.documentNumber,
  };
}

export async function resolveNfsePdfWithStatus(
  app: OmieAppConfig,
  item: Pick<DueItem, "omieCode" | "integrationCode" | "documentNumber">,
): Promise<DocumentPdfResult> {
  const lookup = await resolveNfseLookup(app, item);
  const nIdNf = lookup.nIdNf;
  const nCodOS = lookup.nCodOS;

  const pdfAttempts: Array<{ endpoint: string; call: string; param: Record<string, unknown> }> = [];
  if (nIdNf) {
    pdfAttempts.push(
      { endpoint: "/servicos/osdocs/", call: "ObterNFSe", param: { nIdNf } },
      { endpoint: "/servicos/osdocs/", call: "ObterViaUnica", param: { nIdNf } },
      { endpoint: "/servicos/osdocs/", call: "ObterDemonst", param: { nIdNf } },
    );
  }
  if (nCodOS) {
    pdfAttempts.push({ endpoint: "/servicos/osdocs/", call: "ObterOS", param: { nIdOs: nCodOS } });
  }

  if (pdfAttempts.length === 0) {
    return {
      document: null,
      status: "NFS-e sem vínculo com nota no Omie. Sincronize novamente.",
      link: null,
      barcode: null,
      documentNumber: item.documentNumber,
    };
  }

  let lastStatus: string | null = null;
  let fallbackLink: string | null = null;

  for (const attempt of pdfAttempts) {
    try {
      const response = await omieCall<Record<string, unknown>>(app, attempt.endpoint, attempt.call, attempt.param);
      const soft = omieDocumentSoftError(response);
      if (soft) {
        lastStatus = soft;
        continue;
      }

      const candidate = pickPdfFromOmieResponse(response, {
        documentNumber: item.documentNumber,
        fallbackName: `nfse-${nIdNf ?? nCodOS}`,
      });
      // ObterOS usa cPdfOs
      const osPdf =
        typeof response["cPdfOs"] === "string" && response["cPdfOs"].trim()
          ? response["cPdfOs"].trim()
          : null;
      const enriched = candidate
        ? candidate
        : osPdf
          ? {
              filename: `${safeFilename(item.documentNumber?.trim() || `nfse-${nCodOS}`)}.pdf`,
              mimetype: "application/pdf",
              ...(isHttpUrl(osPdf) ? { url: osPdf } : { base64: osPdf }),
            }
          : null;

      const link = pickLinkFromResponse(response) ?? enriched?.url ?? null;
      if (link) fallbackLink = link;

      const document = enriched ? await materializePdfDocument(enriched) : null;
      if (document?.base64) {
        return {
          document,
          status: null,
          link: link ?? document.url ?? null,
          barcode: null,
          documentNumber:
            (typeof response["cNumNFSe"] === "string" && response["cNumNFSe"].trim()) ||
            item.documentNumber,
        };
      }

      if (typeof response["cDesStatus"] === "string" && response["cDesStatus"].trim()) {
        lastStatus = response["cDesStatus"].trim();
      }
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : "Falha ao consultar NFS-e no Omie.";
    }
  }

  if (fallbackLink) {
    const document = await materializePdfDocument({
      filename: `${safeFilename(item.documentNumber?.trim() || `nfse-${nIdNf ?? nCodOS}`)}.pdf`,
      mimetype: "application/pdf",
      url: fallbackLink,
    });
    return {
      document,
      status: document ? null : lastStatus ?? "Link da NFS-e disponível.",
      link: fallbackLink,
      barcode: null,
      documentNumber: item.documentNumber,
    };
  }

  return {
    document: null,
    status:
      lastStatus && !/nenhum registro/i.test(lastStatus)
        ? lastStatus
        : nCodOS
          ? "NFS-e não encontrada para a ordem de serviço vinculada ao título."
          : "PDF/link da NFS-e indisponível no Omie.",
    link: null,
    barcode: null,
    documentNumber: item.documentNumber,
  };
}

export async function resolveDueItemPdfWithStatus(app: OmieAppConfig, item: DueItem): Promise<DocumentPdfResult> {
  if (item.itemType === "boleto") {
    return resolveBoletoPdfWithStatus(app, {
      omieCode: item.omieCode ?? 0,
      integrationCode: item.integrationCode,
      documentNumber: item.documentNumber,
    });
  }
  if (item.itemType === "nfe") {
    return resolveNfePdfWithStatus(app, item);
  }
  if (item.itemType === "nfse") {
    return resolveNfsePdfWithStatus(app, item);
  }
  return {
    document: null,
    status: "Tipo de documento não suportado.",
    link: null,
    barcode: null,
    documentNumber: item.documentNumber,
  };
}

export async function resolveDueItemDocument(app: OmieAppConfig, item: DueItem) {
  const result = await resolveDueItemPdfWithStatus(app, item);
  return result.document;
}

export async function resolveBoletoPdfByOmieCode(
  app: OmieAppConfig,
  input: { omieCode: number; integrationCode?: string | null; documentNumber?: string | null },
) {
  const result = await resolveBoletoPdfWithStatus(app, input);
  return result.document;
}
