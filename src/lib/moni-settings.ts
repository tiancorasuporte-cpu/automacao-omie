import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const saveSchema = z.object({
  baseUrl: z.string().trim(),
  username: z.string().trim(),
  password: z.string(),
  defaultEmpresa: z.coerce.number().int().positive().optional().nullable(),
});

export const getMoniSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/require-auth");
  await requireAdmin();
  const { getDefaultMoniEmpresa, getMoniConfig } = await import("@/server/moni/client");
  const { reloadEnvFromFile } = await import("@/db/client");
  reloadEnvFromFile();
  const cfg = getMoniConfig();
  return {
    baseUrl: (process.env["MONI_BASE_URL"] ?? "").trim(),
    username: (process.env["MONI_USERNAME"] ?? "").trim(),
    hasPassword: Boolean((process.env["MONI_PASSWORD"] ?? "").trim()),
    defaultEmpresa: getDefaultMoniEmpresa(1),
    configured: Boolean(cfg),
  };
});

export const saveMoniSettingsFn = createServerFn({ method: "POST" })
  .validator(saveSchema)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/require-auth");
    await requireAdmin();
    const { upsertEnv } = await import("@/db/client");
    const baseUrl = data.baseUrl.trim().replace(/\/+$/, "");
    const username = data.username.trim();
    const defaultEmpresa =
      data.defaultEmpresa != null && Number(data.defaultEmpresa) > 0
        ? String(Math.trunc(Number(data.defaultEmpresa)))
        : "1";
    const updates: Record<string, string> = {
      MONI_BASE_URL: baseUrl,
      MONI_USERNAME: username,
      MONI_DEFAULT_EMPRESA: defaultEmpresa,
    };
    if (data.password.trim()) {
      updates.MONI_PASSWORD = data.password.trim();
    }
    upsertEnv(updates);
    return { ok: true as const };
  });

export const testMoniFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/require-auth");
  await requireAdmin();
  try {
    const { getMoniConfig, moniLerDados } = await import("@/server/moni/client");
    if (!getMoniConfig()) {
      return {
        ok: false as const,
        error: "Salve URL, usuário e senha do Moni antes de testar.",
      };
    }
    let rows: Array<{ CODIGO?: number; NOME?: string; EMPRESA?: number }> = [];
    try {
      rows = await moniLerDados(
        "SELECT FIRST 5 EMPRESA, CODIGO, NOME FROM Clientes WHERE CODIGO > 0 ORDER BY EMPRESA, CODIGO",
      );
    } catch {
      try {
        rows = await moniLerDados(
          "SELECT TOP 5 EMPRESA, CODIGO, NOME FROM Clientes WHERE CODIGO > 0 ORDER BY EMPRESA, CODIGO",
        );
      } catch {
        rows = await moniLerDados(
          "SELECT EMPRESA, CODIGO, NOME FROM Clientes WHERE CODIGO > 0 ORDER BY EMPRESA, CODIGO",
        );
        rows = rows.slice(0, 5);
      }
    }
    const sample = rows.slice(0, 3).map((r) => ({
      empresa: Number(r.EMPRESA ?? 0) || null,
      codigo: Number(r.CODIGO ?? 0),
      nome: String(r.NOME ?? "").trim(),
    }));
    return {
      ok: true as const,
      countHint: rows.length,
      sample,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Falha ao conectar no Moni.",
    };
  }
});
