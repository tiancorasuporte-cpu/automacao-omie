import "@tanstack/react-start/server-only";



import type { DueItem } from "@/db/schema";

import { omieCall, type OmieAppConfig } from "@/server/omie/client";



export type DueItemDocument = {

  filename: string;

  mimetype: string;

  url?: string;

  base64?: string;

};



function safeFilename(value: string) {

  return value.replace(/[^\w.-]+/g, "_").slice(0, 80) || "documento";

}



async function resolveBoletoDocument(app: OmieAppConfig, item: DueItem) {

  if (!item.omieCode) return null;

  const result = await resolveBoletoPdfWithStatus(app, {

    omieCode: item.omieCode,

    integrationCode: item.integrationCode,

    documentNumber: item.documentNumber,

  });

  return result.document;

}



export type BoletoPdfResult = {

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



function metaFromBoletoResponse(response: BoletoOmieResponse) {

  const link = response.cLinkBoleto?.trim() || null;

  const barcode = response.cCodBarras?.trim() || null;

  const documentNumber = response.cNumBoleto?.trim() || null;

  return { link, barcode, documentNumber };

}



async function fetchBoletoFromOmie(app: OmieAppConfig, omieCode: number, integrationCode?: string | null) {

  return omieCall<BoletoOmieResponse>(app, "/financas/contareceberboleto/", "ObterBoleto", {

    nCodTitulo: omieCode,

    cCodIntTitulo: integrationCode ?? "",

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

        cCodIntTitulo: integrationCode ?? "",

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

): Promise<BoletoPdfResult> {

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

      response.cCodStatus === "1998" ||

      /nenhum boleto foi gerado/i.test(response.cDesStatus ?? "");



    if (notGenerated) {

      try {

        await omieCall(app, "/financas/contareceberboleto/", "GerarBoleto", {

          nCodTitulo: input.omieCode,

          cCodIntTitulo: input.integrationCode ?? "",

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



export async function resolveBoletoPdfByOmieCode(

  app: OmieAppConfig,

  input: { omieCode: number; integrationCode?: string | null; documentNumber?: string | null },

) {

  const result = await resolveBoletoPdfWithStatus(app, input);

  return result.document;

}



export async function resolveDueItemDocument(app: OmieAppConfig, item: DueItem) {

  if (item.itemType !== "boleto") return null;



  try {

    return await resolveBoletoDocument(app, item);

  } catch {

    return null;

  }

}


