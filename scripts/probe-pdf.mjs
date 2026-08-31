import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
}

function envKey(prefix, suffix) {
  return `OMIE_${prefix.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}_${suffix}`;
}

async function omie(appId, endpoint, call, param) {
  const prefix = appId.toUpperCase();
  const res = await fetch(`https://app.omie.com.br/api/v1${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      call,
      app_key: process.env[envKey(prefix, "APP_KEY")],
      app_secret: process.env[envKey(prefix, "APP_SECRET")],
      param: [param],
    }),
  });
  return res.json();
}

const sql = postgres({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT ?? 5432),
  username: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

const boleto = await sql`
  select omie_app_id, omie_code, integration_code, document_number, item_type
  from due_items where item_type = 'boleto' and omie_code is not null limit 1
`;
const nfe = await sql`
  select omie_app_id, omie_code, integration_code, document_number, item_type
  from due_items where item_type = 'nfe' and omie_code is not null limit 1
`;

if (boleto[0]) {
  const row = boleto[0];
  console.log("BOLETO sample", row);
  const r = await omie(row.omie_app_id, "/financas/contareceberboleto/", "ObterBoleto", {
    nCodTitulo: row.omie_code,
    cCodIntTitulo: row.integration_code ?? "",
  });
  console.log("ObterBoleto keys:", Object.keys(r));
  console.log(JSON.stringify(r, null, 2).slice(0, 1200));
}

if (nfe[0]) {
  const row = nfe[0];
  console.log("\nNFE sample", row);
  for (const idField of ["nIdNfe", "nCodNF", "nIdNF"]) {
    const r = await omie(row.omie_app_id, "/produtos/dfedocs/", "ObterDanfeSimp", {
      [idField === "nIdNfe" ? "nIdNfe" : idField]: row.omie_code,
    });
    if (!r.faultstring && !r.error_message) {
      console.log(`ObterDanfeSimp via ${idField} keys:`, Object.keys(r));
      console.log(JSON.stringify(r, null, 2).slice(0, 1200));
      break;
    }
  }
}

await sql.end();
