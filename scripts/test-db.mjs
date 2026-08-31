import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  let value = t.slice(i + 1).trim();
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  process.env[t.slice(0, i).trim()] = value;
}

const { ensureSchema } = await import("../src/db/schema.ts");
const { getSql } = await import("../src/db/client.ts");

try {
  await ensureSchema();
  const sql = getSql();
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by 1
  `;
  console.log("tables:", tables.map((t) => t.table_name).join(", "));
  const count = await sql`select count(*)::int as c from due_items`;
  console.log("due_items count:", count[0]?.c);
  const { listDueItems } = await import("../src/db/due-items.ts");
  const items = await listDueItems();
  console.log("listDueItems:", items.length, items[0] ?? null);
} catch (error) {
  console.error("ERR:", error);
} finally {
  process.exit(0);
}
