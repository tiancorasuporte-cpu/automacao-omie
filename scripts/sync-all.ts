import { reloadEnvFromFile } from "../src/db/client";
import { syncAllOmieApps } from "../src/server/omie/sync";

reloadEnvFromFile();

console.log("Sincronizando empresas:", process.env.OMIE_APPS);
const result = await syncAllOmieApps();

if (!result.ok) {
  console.error("Falha:", result.error);
  process.exit(1);
}

for (const item of result.results) {
  if (!item.ok) {
    console.log(`- ${item.appId}: ERRO ${item.error}`);
    continue;
  }
  const breakdown = item.breakdown
    ? Object.entries(item.breakdown)
        .map(([key, value]) => `${key}=${value}`)
        .join(", ")
    : "";
  const warn = item.errors?.length ? ` | avisos: ${item.errors.join("; ")}` : "";
  console.log(`- ${item.appId}: ${item.itemsFound} registros [${breakdown}]${warn}`);
}

console.log("Concluido.");
