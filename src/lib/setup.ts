import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const setupSchema = z.object({
  host: z.string().trim().min(1, "Informe o host"),
  port: z.coerce.number().int().min(1).max(65535),
  username: z.string().trim().min(1, "Informe o usuário do banco"),
  password: z.string().min(1, "Informe a senha do banco"),
  database: z.string().trim().min(1, "Informe o nome do banco"),
});

function setupErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/password authentication failed/i.test(message)) {
    return "Usuário ou senha do banco inválidos.";
  }
  if (/database .+ does not exist/i.test(message)) {
    return "O banco informado não existe neste servidor.";
  }
  if (/ECONNREFUSED|ETIMEDOUT|timeout|ENOTFOUND|getaddrinfo|connect_timeout/i.test(message)) {
    return "Não foi possível conectar. Confira o host e a porta.";
  }
  return "Não foi possível conectar ao banco de dados. Confira os dados e tente novamente.";
}

export const getSetupStatusFn = createServerFn({ method: "GET" }).handler(async () => {
  const { isDatabaseConfigured } = await import("@/db/client");
  return { configured: isDatabaseConfigured() };
});

export const setupDatabaseFn = createServerFn({ method: "POST" })
  .validator(setupSchema)
  .handler(async ({ data }) => {
    try {
      const { isDatabaseConfigured, saveAndConnectDatabase } = await import("@/db/client");
      if (isDatabaseConfigured()) {
        return { ok: false as const, error: "O banco de dados já está configurado." };
      }
      const { getDb, resetSchemaReady } = await import("@/db/schema");
      await saveAndConnectDatabase({
        host: data.host,
        port: data.port,
        username: data.username,
        password: data.password,
        database: data.database,
      });
      resetSchemaReady();
      await getDb();
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: setupErrorMessage(error) };
    }
  });
