import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { readInteggriConfig, isInteggriConfigured } from "../src/server/integgri";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

const to = (process.argv[2] ?? "5516997266605").replace(/\D/g, "");
const templateName = process.argv[3] ?? "aviso_de_cobranca";
const config = readInteggriConfig();
if (!isInteggriConfigured(config)) throw new Error("Integgri não configurada");

const attempts = [
  {
    name: "template-only",
    body: {
      number: to,
      body: "aviso",
      templateName,
      ...(config.whatsappId ? { whatsappId: config.whatsappId } : {}),
    },
  },
  {
    name: "template-with-body-empty",
    body: {
      number: to,
      body: "",
      templateName,
      ...(config.whatsappId ? { whatsappId: config.whatsappId } : {}),
    },
  },
];

for (const attempt of attempts) {
  console.log(`\nTentando ${attempt.name}...`);
  const response = await fetch(`${config.url}/api/messages/send`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify(attempt.body),
  });
  const text = await response.text();
  console.log(`HTTP ${response.status}: ${text.slice(0, 800)}`);
  if (response.ok) {
    console.log("OK template enviado para", to);
    process.exit(0);
  }
}

process.exit(1);
