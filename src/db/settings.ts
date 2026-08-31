import { getDb } from "./schema";

export async function getSetting(key: string) {
  const db = await getDb();
  const rows = await db<{ value: string }[]>`
    select value from app_settings where key = ${key} limit 1
  `;
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  const db = await getDb();
  await db`
    insert into app_settings (key, value, updated_at)
    values (${key}, ${value}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
}

export async function getSettings(keys: string[]) {
  const db = await getDb();
  const rows = await db<{ key: string; value: string }[]>`
    select key, value from app_settings where key = any(${keys})
  `;
  const map = new Map(rows.map((row) => [row.key, row.value]));
  return keys.reduce<Record<string, string | null>>((acc, key) => {
    acc[key] = map.get(key) ?? null;
    return acc;
  }, {});
}
