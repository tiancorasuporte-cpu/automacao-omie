import "@tanstack/react-start/server-only";

import { reloadEnvFromFile } from "@/db/client";

export type MoniConfig = {
  baseUrl: string;
  username: string;
  password: string;
};

/** Remove aspas e caracteres que quebram o SQL embutido no JSON do Moni. */
export function sanitizeMoniSqlLiteral(value: string) {
  return value.replace(/['";\\]/g, "").trim();
}

export function getMoniConfig(): MoniConfig | null {
  reloadEnvFromFile();
  const baseUrl = (process.env["MONI_BASE_URL"] ?? "").trim().replace(/\/+$/, "");
  const username = (process.env["MONI_USERNAME"] ?? "").trim();
  const password = process.env["MONI_PASSWORD"] ?? "";
  if (!baseUrl || !username || !password) return null;
  return { baseUrl, username, password };
}

/** Empresa (tenant) Moni padrão para busca/vínculo. */
export function getDefaultMoniEmpresa(fallback = 1) {
  reloadEnvFromFile();
  const n = Number((process.env["MONI_DEFAULT_EMPRESA"] ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.trunc(n);
}

export function requireMoniConfig(): MoniConfig {
  const cfg = getMoniConfig();
  if (!cfg) {
    throw new Error(
      "Moni não configurado. Defina MONI_BASE_URL, MONI_USERNAME e MONI_PASSWORD no .env.",
    );
  }
  return cfg;
}

function basicAuthHeader(username: string, password: string) {
  const token = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

function isEmptyResult(rows: unknown[]) {
  if (!rows.length) return true;
  const first = rows[0];
  if (!first || typeof first !== "object") return false;
  const resultado = String((first as Record<string, unknown>)["Resultado"] ?? "").toLowerCase();
  return resultado.includes("sem registros");
}

/**
 * POST /LerDados — executa SELECT no Moni Integração.
 * Docs: Padrões Gerais + Clientes.
 */
export async function moniLerDados<T extends Record<string, unknown> = Record<string, unknown>>(
  comando: string,
): Promise<T[]> {
  const cfg = requireMoniConfig();
  const sql = comando.trim();
  if (!sql) throw new Error("Comando Moni vazio.");

  const response = await fetch(`${cfg.baseUrl}/LerDados`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json; charset=UTF-8",
      Authorization: basicAuthHeader(cfg.username, cfg.password),
    },
    body: JSON.stringify({ comando: sql }),
  });

  if (response.status === 401) throw new Error("Moni: usuário ou senha inválidos.");
  if (response.status === 403) throw new Error("Moni: IP não autorizado.");
  if (response.status === 404) throw new Error("Moni: URL inválida (verifique MONI_BASE_URL).");

  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 280) || `Moni retornou ${response.status}`);
  }

  if (!response.ok) {
    throw new Error(
      typeof body === "object" && body && "message" in body
        ? String((body as { message: unknown }).message)
        : text.slice(0, 280) || `Moni retornou ${response.status}`,
    );
  }

  const rows = Array.isArray(body) ? body : [];
  if (isEmptyResult(rows)) return [];
  return rows as T[];
}
