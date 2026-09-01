import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

import postgres from "postgres";

import "@tanstack/react-start/server-only";

const envPath = resolve(process.cwd(), ".env");

const ENV_RELOAD_PREFIXES = ["OMIE_", "PG", "WAHA_", "TEST_", "APP_", "PUBLIC_", "WHATSAPP_"];

function shouldReloadEnvKey(key: string) {
  return key.startsWith("GROQ_") || ENV_RELOAD_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function loadEnvFile(force = false) {
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = decodeEnvValue(trimmed.slice(eq + 1).trim());
    if (force || process.env[key] == null || shouldReloadEnvKey(key)) {
      process.env[key] = value;
    }
  }
}

export function reloadEnvFromFile() {
  loadEnvFile(true);
}

loadEnvFile();

function decodeEnvValue(value: string) {
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

function encodeEnvValue(value: string) {
  if (value === "" || /[\s#"'$\\]/.test(value)) return JSON.stringify(value);
  return value;
}

if (!process.env["SESSION_SECRET"] || process.env["SESSION_SECRET"].length < 32) {
  process.env["SESSION_SECRET"] = randomBytes(32).toString("hex");
}

export type DatabaseConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
};

export function isDatabaseConfigured() {
  return Boolean(process.env["PGHOST"]?.trim() && process.env["PGUSER"]?.trim());
}

function readConfig(): DatabaseConfig {
  const port = Number(process.env["PGPORT"] ?? "5432");
  return {
    host: process.env["PGHOST"] ?? "",
    port: Number.isFinite(port) ? port : 5432,
    username: process.env["PGUSER"] ?? "",
    password: process.env["PGPASSWORD"] ?? "",
    database: process.env["PGDATABASE"] ?? "postgres",
  };
}

function createClient(config: DatabaseConfig) {
  return postgres({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.database,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

let client: ReturnType<typeof postgres> | undefined;

export function getSql() {
  if (!isDatabaseConfigured()) {
    throw new Error("Banco de dados ainda não configurado");
  }
  if (!client) client = createClient(readConfig());
  return client;
}

export function upsertEnv(updates: Record<string, string>) {
  let text = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  if (text && !text.endsWith("\n")) text += "\n";
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${encodeEnvValue(value)}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(text)) text = text.replace(pattern, line);
    else text += `${line}\n`;
    process.env[key] = value;
  }
  writeFileSync(envPath, text);
}

export async function saveAndConnectDatabase(config: DatabaseConfig) {
  const probe = createClient(config);
  try {
    await probe`select 1 as ok`;
  } finally {
    await probe.end({ timeout: 2 }).catch(() => undefined);
  }

  if (client) {
    await client.end({ timeout: 2 }).catch(() => undefined);
    client = undefined;
  }

  upsertEnv({
    PGHOST: config.host,
    PGPORT: String(config.port),
    PGUSER: config.username,
    PGPASSWORD: config.password,
    PGDATABASE: config.database,
    SESSION_SECRET: process.env["SESSION_SECRET"] ?? randomBytes(32).toString("hex"),
    APP_SUPERADMIN_USERNAME: process.env["APP_SUPERADMIN_USERNAME"] ?? "superadmin",
    APP_SUPERADMIN_PASSWORD: process.env["APP_SUPERADMIN_PASSWORD"] ?? "ancora",
    APP_SUPERADMIN_NAME: process.env["APP_SUPERADMIN_NAME"] ?? "Super Admin",
  });

  client = createClient(readConfig());
  return client;
}
