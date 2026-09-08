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

export function isClosedReceivableStatus(status: string | null | undefined) {
  const value = normalizeOmieStatus(status);
  if (!value) return false;
  if (CLOSED_EXACT.has(value)) return true;
  if (value.includes("RECEBID") || value.includes("LIQUID") || value.includes("CANCEL") || value.includes("BAIXAD") || value.includes("PAGO")) {
    return true;
  }
  return false;
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
