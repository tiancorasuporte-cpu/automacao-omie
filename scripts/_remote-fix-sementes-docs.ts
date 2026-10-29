import { readFileSync } from "node:fs";
import { listOmieApps, omieCall } from "../src/server/omie/client";
import { saveDueItemFromMovement } from "../src/server/omie/invoice-sync";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  let k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[k] = v;
}

const targets = [
  { appId: "EMPRESA_A", client: 854597460 },
  { appId: "EMPRESA_B", client: 854599079 },
];

for (const target of targets) {
  const app = listOmieApps().find((a) => a.id === target.appId);
  if (!app) continue;
  const byClient = await omieCall<{ conta_receber_cadastro?: Record<string, unknown>[] }>(
    app,
    "/financas/contareceber/",
    "ListarContasReceber",
    {
      pagina: 1,
      registros_por_pagina: 100,
      filtrar_apenas_titulos_em_aberto: "N",
      filtrar_cliente: target.client,
    },
  );
  const rows = (byClient.conta_receber_cadastro ?? []).filter((r) =>
    String(r["data_vencimento"] ?? "").startsWith("20/10"),
  );
  for (const r of rows) {
    const boleto = (r["boleto"] as Record<string, unknown> | undefined) ?? {};
    const tipoDocumento = String(r["codigo_tipo_documento"] ?? "").trim().toUpperCase();
    const mapped = {
      ...r,
      dDtVenc: r["data_vencimento"],
      dDtEmissao: r["data_emissao"],
      nCodTitulo: r["codigo_lancamento_omie"],
      nCodCliente: r["codigo_cliente_fornecedor"],
      nValorTitulo: r["valor_documento"],
      cStatus: r["status_titulo"] ?? "A VENCER",
      cNumBoleto: boleto["cNumBoleto"],
      cTipo: boleto["cGerado"] === "S" || tipoDocumento === "BOL" ? "BOL" : tipoDocumento,
      codigo_tipo_documento: tipoDocumento,
      cNumDocFiscal: r["numero_documento_fiscal"],
      numero_documento_fiscal: r["numero_documento_fiscal"],
      boleto,
    };
    const mappedWithOs = {
      ...mapped,
      nCodOS: r["nCodOS"],
      numero_documento: r["numero_documento"],
    };
    const saved = await saveDueItemFromMovement(app, mappedWithOs);
    console.log(
      app.name,
      r["codigo_lancamento_omie"],
      "fiscal",
      r["numero_documento_fiscal"],
      "bol",
      boleto["cNumBoleto"],
      "os",
      r["nCodOS"],
      "rps",
      r["numero_documento"],
      "=>",
      saved,
    );
  }
}
