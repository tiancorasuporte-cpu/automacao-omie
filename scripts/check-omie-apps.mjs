import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const envPath = resolve(process.cwd(), ".env");

function loadEnv() {
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    process.env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1");
  }
}

function envKey(prefix, suffix) {
  return `OMIE_${prefix.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}_${suffix}`;
}

function listApps() {
  const raw = (process.env.OMIE_APPS ?? "").trim();
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((id) => {
      const prefix = id.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
      return {
        id,
        name: process.env[envKey(prefix, "NAME")] ?? id,
        appKey: process.env[envKey(prefix, "APP_KEY")] ?? "",
        appSecret: process.env[envKey(prefix, "APP_SECRET")] ?? "",
      };
    })
    .filter((app) => app.appKey && app.appSecret);
}

async function testOmie(app) {
  const res = await fetch("https://app.omie.com.br/api/v1/geral/clientes/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      call: "ListarClientes",
      app_key: app.appKey,
      app_secret: app.appSecret,
      param: [{ pagina: 1, registros_por_pagina: 1 }],
    }),
  });
  const body = await res.json();
  if (body.faultstring) return { ok: false, error: body.faultstring };
  return { ok: true, total: body.total_de_registros ?? "?" };
}

loadEnv();
const apps = listApps();
console.log("OMIE_APPS:", process.env.OMIE_APPS);
console.log("Apps configurados:", apps.length);
for (const app of apps) {
  console.log(`- ${app.id}: ${app.name}`);
}

const sql = postgres({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT ?? 5432),
  username: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

const rows = await sql`
  select omie_app_id, omie_app_name, count(*)::int as total
  from due_items
  group by omie_app_id, omie_app_name
  order by omie_app_name
`;
console.log("\nRegistros no banco por empresa:");
if (rows.length === 0) console.log("(nenhum)");
else for (const row of rows) console.log(`- ${row.omie_app_name} (${row.omie_app_id}): ${row.total}`);

console.log("\nTeste API Omie:");
for (const app of apps) {
  try {
    const result = await testOmie(app);
    console.log(`- ${app.name}:`, result.ok ? `OK (${result.total} clientes)` : `ERRO: ${result.error}`);
  } catch (error) {
    console.log(`- ${app.name}: ERRO ${error instanceof Error ? error.message : error}`);
  }
}

await sql.end();
