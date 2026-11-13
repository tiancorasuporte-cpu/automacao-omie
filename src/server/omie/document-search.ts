import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";
import { formatDisplayDate } from "@/server/omie/client";
import { formatBoletoStatusLabel } from "@/server/omie/boleto-lookup";

export type DueDocumentHit = {
  id: number;
  omieAppName: string;
  itemType: string;
  documentNumber: string | null;
  omieCode: number | null;
  clientName: string | null;
  dueDate: string | null;
  issueDate: string | null;
  amount: number | null;
  status: string | null;
};

const STOP_WORDS = new Set([
  "a",
  "as",
  "o",
  "os",
  "um",
  "uma",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "para",
  "por",
  "com",
  "sem",
  "que",
  "qual",
  "quais",
  "meu",
  "minha",
  "seu",
  "sua",
  "boleto",
  "boletos",
  "titulo",
  "título",
  "titulos",
  "títulos",
  "nf",
  "nfe",
  "nfse",
  "nota",
  "notas",
  "fiscal",
  "fiscais",
  "numero",
  "número",
  "num",
  "nro",
  "doc",
  "documento",
  "cliente",
  "empresa",
  "localizar",
  "localiza",
  "encontrar",
  "encontrei",
  "procurar",
  "procura",
  "buscar",
  "busca",
  "achar",
  "acho",
  "achei",
  "nao",
  "não",
  "tem",
  "temos",
  "existe",
  "favor",
  "por",
  "gentileza",
  "ajuda",
  "ajudar",
  "me",
  "pra",
  "pro",
  "quero",
  "consultar",
  "consulta",
  "como",
  "funciona",
  "abrir",
  "via",
  "cnpj",
  "cpf",
]);

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function stripLeadingZeros(value: string) {
  return value.replace(/^0+/, "") || "0";
}

function decodeDisplayText(value: string | null | undefined) {
  if (!value) return value ?? "";
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function money(value: number | null) {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function itemTypeLabel(itemType: string) {
  const t = itemType.toLowerCase();
  if (t === "boleto") return "Boleto";
  if (t === "nfe") return "NF-e";
  if (t === "nfse") return "NFS-e";
  return itemType.toUpperCase();
}

/** Extrai números de documento (boleto/NF) e dica de cliente da mensagem. */
export function extractDocumentQuery(text: string) {
  const wantsLocate =
    /\b(localiz|encontr|procur|buscar?|busca|achar?|acho|achei|nao\s+acho|não\s+acho|nao\s+encont|não\s+encont|nfse?|nfe|nota\s*fiscal|boleto|titulo|título)\b/i.test(
      text,
    );

  const numbers = new Set<string>();
  for (const match of text.matchAll(/\d[\d./-]{2,}\d/g)) {
    const digits = digitsOnly(match[0] ?? "");
    if (digits.length < 4 || digits.length > 20) continue;
    // CPF/CNPJ ficam no fluxo de consulta por documento fiscal.
    if (digits.length === 11 || digits.length === 14) continue;
    numbers.add(stripLeadingZeros(digits));
  }

  let clientHint: string | null = null;
  const afterDash = text.match(/[-–—]\s*([A-Za-zÀ-ÿ0-9][\wÀ-ÿ .&']{2,80})\s*$/);
  if (afterDash?.[1]) {
    clientHint = afterDash[1].trim();
  } else {
    const afterClient = text.match(
      /\b(?:cliente|da|do|de|para|pra)\s+([A-Za-zÀ-ÿ][\wÀ-ÿ .&']{2,80})/i,
    );
    if (afterClient?.[1]) {
      clientHint = afterClient[1].trim();
    }
  }

  if (!clientHint) {
    const words = text
      .replace(/[\d./-]+/g, " ")
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w.toLowerCase()));
    if (words.length > 0) {
      clientHint = words.slice(0, 6).join(" ");
    }
  }

  if (clientHint) {
    clientHint = clientHint.replace(/[?,!;:]+$/g, "").trim() || null;
  }

  return {
    numbers: [...numbers],
    clientHint,
    wantsLocate: wantsLocate || numbers.length > 0,
  };
}

type DueRow = {
  id: number;
  omie_app_name: string;
  item_type: string;
  document_number: string | null;
  omie_code: number | null;
  client_name: string | null;
  due_date: string | null;
  issue_date: string | null;
  amount: string | null;
  status: string | null;
};

function mapRow(row: DueRow): DueDocumentHit {
  return {
    id: row.id,
    omieAppName: row.omie_app_name,
    itemType: row.item_type,
    documentNumber: row.document_number,
    omieCode: row.omie_code == null ? null : Number(row.omie_code),
    clientName: row.client_name ? decodeDisplayText(row.client_name) : null,
    dueDate: row.due_date?.slice(0, 10) ?? null,
    issueDate: row.issue_date?.slice(0, 10) ?? null,
    amount: row.amount == null ? null : Number(row.amount),
    status: row.status,
  };
}

async function findExactByNumber(number: string) {
  const db = await getDb();
  const rows = await db<DueRow[]>`
    select id, omie_app_name, item_type, document_number, omie_code,
           client_name, due_date::text, issue_date::text, amount::text, status
    from due_items
    where nullif(regexp_replace(coalesce(document_number, ''), '[^0-9]', '', 'g'), '') is not null
      and ltrim(regexp_replace(coalesce(document_number, ''), '[^0-9]', '', 'g'), '0') = ${number}
    order by
      case when lower(item_type) = 'boleto' then 0
           when lower(item_type) in ('nfe', 'nfse') then 1
           else 2 end,
      due_date desc nulls last
    limit 30
  `;
  return rows.map(mapRow);
}

async function findByClientHint(clientHint: string, limit = 20) {
  const db = await getDb();
  const pattern = `%${clientHint.trim()}%`;
  const rows = await db<DueRow[]>`
    select id, omie_app_name, item_type, document_number, omie_code,
           client_name, due_date::text, issue_date::text, amount::text, status
    from due_items
    where client_name ilike ${pattern}
      and lower(item_type) in ('boleto', 'nfe', 'nfse')
    order by due_date desc nulls last, id desc
    limit ${limit}
  `;
  return rows.map(mapRow);
}

async function findNearbyBoletos(number: string) {
  const asInt = Number(number);
  if (!Number.isFinite(asInt) || asInt <= 0) return [] as DueDocumentHit[];
  const db = await getDb();
  const from = Math.max(1, asInt - 5);
  const to = asInt + 5;
  const rows = await db<DueRow[]>`
    select id, omie_app_name, item_type, document_number, omie_code,
           client_name, due_date::text, issue_date::text, amount::text, status
    from due_items
    where lower(item_type) = 'boleto'
      and nullif(regexp_replace(coalesce(document_number, ''), '[^0-9]', '', 'g'), '') ~ '^[0-9]+$'
      and ltrim(regexp_replace(coalesce(document_number, ''), '[^0-9]', '', 'g'), '0')::bigint
          between ${from} and ${to}
    order by ltrim(regexp_replace(coalesce(document_number, ''), '[^0-9]', '', 'g'), '0')::bigint
    limit 20
  `;
  return rows.map(mapRow);
}

function formatHitLine(hit: DueDocumentHit) {
  const bits = [
    `*${itemTypeLabel(hit.itemType)}* ${hit.documentNumber ?? "—"}`,
    hit.omieAppName,
    hit.clientName ?? "—",
    hit.dueDate ? `venc. ${formatDisplayDate(hit.dueDate)}` : null,
    money(hit.amount),
    formatBoletoStatusLabel(hit.status),
  ].filter(Boolean);
  return `• ${bits.join(" · ")}`;
}

function uniqueById(hits: DueDocumentHit[]) {
  const seen = new Set<number>();
  const out: DueDocumentHit[] = [];
  for (const hit of hits) {
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    out.push(hit);
  }
  return out;
}

export async function searchDueDocuments(input: {
  numbers?: string[];
  clientHint?: string | null;
}) {
  const numbers = (input.numbers ?? []).map(stripLeadingZeros).filter(Boolean);
  const clientHint = input.clientHint?.trim() || null;

  const exact: DueDocumentHit[] = [];
  const missingNumbers: string[] = [];

  for (const number of numbers) {
    const hits = await findExactByNumber(number);
    if (hits.length === 0) missingNumbers.push(number);
    else exact.push(...hits);
  }

  let clientHits: DueDocumentHit[] = [];
  if (clientHint) {
    clientHits = await findByClientHint(clientHint, numbers.length > 0 ? 25 : 15);
  }

  let nearby: DueDocumentHit[] = [];
  if (missingNumbers.length > 0) {
    const first = missingNumbers[0]!;
    nearby = await findNearbyBoletos(first);
  }

  // Se pediu número + cliente e o número não bateu, filtra sugestões do cliente.
  let clientRelated = clientHits;
  if (numbers.length > 0 && clientHits.length > 0) {
    const boletos = clientHits.filter((h) => h.itemType.toLowerCase() === "boleto").slice(0, 8);
    const nfs = clientHits.filter((h) => ["nfe", "nfse"].includes(h.itemType.toLowerCase())).slice(0, 6);
    clientRelated = uniqueById([...boletos, ...nfs]);
  }

  return {
    numbers,
    clientHint,
    exact: uniqueById(exact),
    missingNumbers,
    clientRelated: uniqueById(clientRelated),
    nearby: uniqueById(nearby),
  };
}

export function formatDocumentSearchAnswer(
  result: Awaited<ReturnType<typeof searchDueDocuments>>,
) {
  const lines: string[] = [];
  const queryBits: string[] = [];
  if (result.numbers.length) queryBits.push(result.numbers.map((n) => `*${n}*`).join(", "));
  if (result.clientHint) queryBits.push(`cliente *${result.clientHint}*`);

  if (result.exact.length > 0) {
    lines.push(`Encontrei ${result.exact.length} registro(s) para ${queryBits.join(" · ") || "sua busca"}:`);
    lines.push("");
    for (const hit of result.exact.slice(0, 12)) {
      lines.push(formatHitLine(hit));
    }
  } else if (result.numbers.length > 0) {
    lines.push(
      `Não encontrei o(s) documento(s) ${result.numbers.map((n) => `*${n}*`).join(", ")} no sistema (base sincronizada do Omie).`,
    );
  } else if (result.clientHint) {
    lines.push(`Busca por cliente *${result.clientHint}*:`);
  } else {
    return [
      "Para localizar, envie o *número do boleto* e/ou da *NF*, e se puder o *nome do cliente*.",
      "",
      "Exemplos:",
      "• boleto 1675823 Lampa",
      "• nf 6410 — Lampa Tratores",
      "",
      "(Digite *menu* para voltar.)",
    ].join("\n");
  }

  if (result.missingNumbers.length > 0 && result.clientRelated.length > 0) {
    lines.push("");
    lines.push(
      `Para *${result.clientHint ?? "esse cliente"}*, o que existe de perto:`,
    );
    for (const hit of result.clientRelated.slice(0, 10)) {
      lines.push(formatHitLine(hit));
    }
  } else if (result.numbers.length === 0 && result.clientRelated.length > 0) {
    lines.push("");
    for (const hit of result.clientRelated.slice(0, 12)) {
      lines.push(formatHitLine(hit));
    }
  }

  if (
    result.missingNumbers.length > 0 &&
    result.nearby.length > 0 &&
    result.clientRelated.length === 0
  ) {
    lines.push("");
    lines.push("Números vizinhos na sequência de boletos:");
    for (const hit of result.nearby.slice(0, 10)) {
      lines.push(formatHitLine(hit));
    }
  }

  if (result.exact.length === 0 && result.clientRelated.length === 0 && result.nearby.length === 0) {
    if (result.clientHint && result.numbers.length > 0) {
      lines.push("");
      lines.push(
        "Também não achei títulos recentes com esse nome de cliente. Confira se o número/nome estão certos ou se o Omie já sincronizou.",
      );
    } else if (result.clientHint && result.numbers.length === 0) {
      lines.push("");
      lines.push("Nenhum boleto/NF encontrado com esse nome. Tente um trecho maior do nome.");
    }
  }

  lines.push("");
  lines.push("Digite *menu* para voltar às opções.");
  return lines.join("\n");
}

export function locateModePrompt() {
  return [
    "Ok! Vou *localizar* boleto ou NF na base sincronizada.",
    "",
    "Envie o número (e o cliente, se souber).",
    "Exemplos: *boleto 1675821 Lampa* · *nf 6410*",
    "",
    "(Digite *menu* para voltar.)",
  ].join("\n");
}
