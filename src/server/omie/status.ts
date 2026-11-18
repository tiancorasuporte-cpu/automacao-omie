import "@tanstack/react-start/server-only";

/** Status Omie que consideramos quitado/cancelado (inclui códigos curtos). */
const CLOSED_EXACT = new Set([
  "RECEBIDO",
  "CANCELADO",
  "BAIXADO",
  "LIQUIDADO",
  "PAGO",
  "F", // finalizado / faturado fechado em várias telas Omie
  "C", // cancelado
  "R", // recebido (código curto)
  "L", // liquidado
]);

/** Status Omie em que o título ainda está cobrável. */
const OPEN_EXACT = new Set([
  "A VENCER",
  "ATRASADO",
  "ABERTO",
  "VENCE HOJE",
  "EM ABERTO",
  "A RECEBER",
]);

export function normalizeOmieStatus(status: string | null | undefined) {
  return String(status ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .trim();
}

export function isCancelledReceivableStatus(status: string | null | undefined) {
  const value = normalizeOmieStatus(status);
  if (!value) return false;
  if (value === "CANCELADO" || value === "C") return true;
  return value.includes("CANCEL");
}

export function isPaidReceivableStatus(status: string | null | undefined) {
  const value = normalizeOmieStatus(status);
  if (!value || isCancelledReceivableStatus(value)) return false;
  if (
    value === "RECEBIDO" ||
    value === "BAIXADO" ||
    value === "LIQUIDADO" ||
    value === "PAGO" ||
    value === "R" ||
    value === "L" ||
    value === "F"
  ) {
    return true;
  }
  return (
    value.includes("RECEBID") ||
    value.includes("LIQUID") ||
    value.includes("BAIXAD") ||
    value.includes("PAGO")
  );
}

export function isClosedReceivableStatus(status: string | null | undefined) {
  const value = normalizeOmieStatus(status);
  if (!value) return false;
  if (CLOSED_EXACT.has(value)) return true;
  if (value.includes("RECEBID") || value.includes("LIQUID") || value.includes("CANCEL") || value.includes("BAIXAD") || value.includes("PAGO")) {
    return true;
  }
  return false;
}

/** Mensagem amigável quando Omie/DB indicam título quitado ou cancelado (sem PDF renovável). */
export function closedReceivablePublicMessage(input: {
  itemType?: string | null;
  status?: string | null;
  omieStatus?: string | null;
  documentNumber?: string | null;
}) {
  const blob = `${input.status ?? ""} ${input.omieStatus ?? ""}`;
  const cancelled = isCancelledReceivableStatus(input.status) || isCancelledReceivableStatus(input.omieStatus) || /cancel/i.test(blob);
  const paid =
    !cancelled &&
    (isPaidReceivableStatus(input.status) ||
      isPaidReceivableStatus(input.omieStatus) ||
      /liquidada|liquidado|recebido|baixado|\bpago\b/i.test(blob));
  if (!cancelled && !paid) return null;

  const kind =
    String(input.itemType ?? "").toLowerCase() === "nfe"
      ? "documento"
      : String(input.itemType ?? "").toLowerCase() === "boleto"
        ? "boleto"
        : "título";
  const doc = input.documentNumber?.trim();
  const lines = cancelled
    ? [
        `Este ${kind} foi cancelado.`,
        "Por isso a Omie não gera mais o PDF para este link.",
      ]
    : [
        `Este ${kind} já foi pago.`,
        "A Omie liquidou o título e não gera mais o PDF.",
      ];
  if (doc) lines.push(`Documento: ${doc}`);
  const detail = input.omieStatus?.trim();
  if (detail && !cancelled) lines.push(detail);
  return lines.join("\n");
}

/** Só notifica/lista como aberto se o status for claramente cobrável. Null/F/NFe sem status = fora. */
export function isOpenReceivableStatus(status: string | null | undefined) {
  const value = normalizeOmieStatus(status);
  if (!value) return false;
  if (isClosedReceivableStatus(value)) return false;
  if (OPEN_EXACT.has(value)) return true;
  if (value.includes("VENC") || value.includes("ATRAS") || value.includes("ABERT") || value.includes("RECEBER")) {
    return true;
  }
  return false;
}

export const OPEN_STATUS_SQL_LIST = [
  "A VENCER",
  "ATRASADO",
  "ABERTO",
  "VENCE HOJE",
  "EM ABERTO",
  "A RECEBER",
] as const;
