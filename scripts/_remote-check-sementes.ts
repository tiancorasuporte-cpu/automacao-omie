import { readFileSync } from "node:fs";
import postgres from "postgres";

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

const sql = postgres({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || "postgres",
  max: 1,
});

const rows = await sql`
  select id, omie_app_name, item_type, document_number, client_name, due_date, status, amount
  from due_items
  where client_name ilike ${"%sementes%"}
    and due_date = ${"2026-10-20"}::date
  order by amount desc
`;
console.log(JSON.stringify(rows, null, 2));
console.log("count", rows.length);

const openOct = await sql`
  select count(*)::int as total
  from due_items
  where due_date between '2026-10-01'::date and '2026-10-31'::date
    and upper(trim(coalesce(status,''))) in ('A VENCER','ATRASADO','ABERTO','VENCE HOJE','EM ABERTO','A RECEBER')
`;
console.log("open october", openOct[0]);

await sql.end();
