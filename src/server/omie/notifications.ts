import "@tanstack/react-start/server-only";

import { getSetting } from "@/db/settings";
import {
  countSuccessfulNotifyPhonesLastHour,
  getDueItemById,
  getDueItemsForNotification,
  insertNotificationLog,
  markDueItemNotified,
} from "@/db/due-items";
import type { DueItem } from "@/db/schema";
import { formatDisplayDate, listOmieApps } from "@/server/omie/client";
import { resolveDueItemDocument } from "@/server/omie/documents";
import { clientDisplayName, clientPhones, getCliente } from "@/server/omie/clients";
import { sendWahaDocument, sendWahaText } from "@/server/waha";

const DEFAULT_SEND_DELAY_MS = 5_000;

let notifyInProgress = false;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendDelayMs() {
  const raw = process.env["NOTIFICATION_SEND_DELAY_MS"]?.trim();
  const parsed = raw ? Number(raw) : DEFAULT_SEND_DELAY_MS;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_SEND_DELAY_MS;
}

const DEFAULT_HOURLY_LIMIT = 20;

async function hourlyLimit() {
  const fromSetting = (await getSetting("notification_hourly_limit"))?.trim();
  const fromEnv = process.env["NOTIFICATION_HOURLY_LIMIT"]?.trim();
  const raw = fromSetting || fromEnv || String(DEFAULT_HOURLY_LIMIT);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_HOURLY_LIMIT;
  return Math.min(Math.floor(parsed), 200);
}

async function remainingHourlyQuota() {
  const limit = await hourlyLimit();
  const used = await countSuccessfulNotifyPhonesLastHour();
  return { limit, used, remaining: Math.max(0, limit - used) };
}

function phoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function toWhatsAppChatId(value: string | null | undefined) {
  if (!value) return null;
  let digits = phoneDigits(value);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (digits.length < 12 || digits.length > 15) return null;
  return `${digits}@c.us`;
}

function formatCurrency(amount: number | null) {
  if (amount == null || Number.isNaN(amount)) return "—";
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function typeLabel(_type: DueItem["itemType"]) {
  return "Boleto";
}

export function buildDueReminderMessage(
  item: DueItem,
  dueDateLabel: string,
  options?: { testMode?: boolean; originalPhone?: string | null; manual?: boolean },
) {
  const client = item.clientName?.trim() || "Cliente não identificado";
  const intro = options?.manual
    ? `Olá! Segue lembrete do boleto com vencimento em *${dueDateLabel}*:`
    : options?.testMode
      ? `Este alerta seria enviado ao cliente *${client}*, mas está em modo teste.`
      : `Olá! O documento abaixo vence amanhã (*${dueDateLabel}*):`;
  const lines = [
    options?.testMode ? "🧪 *[MODO TESTE]*" : "🔔 *Lembrete de vencimento*",
    "",
    intro,
    "",
    `🏢 *Empresa:* ${item.omieAppName}`,
    `📄 *Tipo:* ${typeLabel(item.itemType)}`,
    item.documentNumber ? `🔢 *Documento:* ${item.documentNumber}` : null,
    `👤 *Cliente:* ${client}`,
    `📅 *Vencimento:* ${dueDateLabel}`,
    `💰 *Valor:* ${formatCurrency(item.amount)}`,
    options?.testMode && options.originalPhone
      ? `📱 *Telefone original:* ${options.originalPhone}`
      : null,
    "",
    "_Mensagem automática — Automação Omie._",
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildGroupedDueReminderMessage(
  items: DueItem[],
  options?: { testMode?: boolean; originalPhone?: string | null },
) {
  if (items.length === 1) {
    const item = items[0]!;
    return buildDueReminderMessage(item, formatDisplayDate(item.dueDate), options);
  }

  const lines = [
    options?.testMode ? "🧪 *[MODO TESTE]*" : "🔔 *Lembretes de vencimento*",
    "",
    options?.testMode
      ? `Seriam enviados *${items.length}* alertas para este número, mas está em modo teste:`
      : `Olá! Os *${items.length}* documentos abaixo vencem amanhã:`,
    "",
  ];

  items.forEach((item, index) => {
    lines.push(
      `*${index + 1}.* ${item.clientName?.trim() || "Cliente não identificado"} — ${typeLabel(item.itemType)}`,
      `   📅 ${formatDisplayDate(item.dueDate)} · 💰 ${formatCurrency(item.amount)}${item.documentNumber ? ` · 📄 ${item.documentNumber}` : ""}`,
      `   🏢 ${item.omieAppName}`,
      "",
    );
  });

  if (options?.testMode && options.originalPhone) {
    lines.push(`📱 *Telefone original:* ${options.originalPhone}`);
    lines.push("");
  }

  lines.push("_Mensagem automática — Automação Omie._");
  return lines.join("\n");
}

async function enrichDueItem(item: DueItem): Promise<DueItem> {
  if (!item.clientCode) return item;

  const app = listOmieApps().find((entry) => entry.id === item.omieAppId);
  if (!app) return item;

  const client = await getCliente(app, item.clientCode);
  const name = clientDisplayName(client);
  const phones = clientPhones(client);
  const primaryPhone = phones[0] ?? item.clientPhone;

  if (!name && !primaryPhone) return item;

  return {
    ...item,
    clientName: name ?? item.clientName,
    clientPhone: primaryPhone ?? item.clientPhone,
  };
}

async function resolveItemNotifyPhones(item: DueItem) {
  const testMode = (await getSetting("test_mode_enabled")) === "true";
  const testPhone = (await getSetting("test_notify_phone"))?.trim() ?? "";
  const fallbackPhone = (await getSetting("default_notify_phone"))?.trim() ?? "";

  let originalPhones: string[] = [];
  if (item.clientCode) {
    const app = listOmieApps().find((entry) => entry.id === item.omieAppId);
    if (app) {
      const client = await getCliente(app, item.clientCode);
      originalPhones = clientPhones(client);
    }
  }
  if (originalPhones.length === 0 && item.clientPhone) {
    originalPhones = [item.clientPhone];
  }
  if (originalPhones.length === 0 && fallbackPhone) {
    originalPhones = [fallbackPhone];
  }

  if (testMode && testPhone) {
    return {
      phones: [testPhone],
      testMode: true,
      originalPhones,
    };
  }

  return {
    phones: originalPhones,
    testMode: false,
    originalPhones,
  };
}

async function sendItemPdf(chatId: string, item: DueItem, errors: string[]) {
  if (item.itemType !== "boleto") return;

  const app = listOmieApps().find((entry) => entry.id === item.omieAppId);
  if (!app) return;

  const document = await resolveDueItemDocument(app, item);
  if (!document) return;

  const caption = [
    item.clientName?.trim(),
    item.documentNumber ? `Doc. ${item.documentNumber}` : null,
    `Venc. ${formatDisplayDate(item.dueDate)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  try {
    await sendWahaDocument(chatId, document, caption);
  } catch (pdfError) {
    const pdfErr = pdfError instanceof Error ? pdfError.message : "Falha ao enviar PDF";
    errors.push(`${item.clientName ?? "Sem cliente"} (PDF): ${pdfErr}`);
  }
}

async function sendItemToPhone(
  item: DueItem,
  chatId: string,
  message: string,
  errors: string[],
) {
  await sendWahaText(chatId, message);
  await sendItemPdf(chatId, item, errors);
}

export async function sendDueItemReminder(dueItemId: number) {
  const row = await getDueItemById(dueItemId);
  if (!row) {
    return { ok: false as const, error: "Boleto não encontrado." };
  }

  const closed = new Set(["RECEBIDO", "CANCELADO", "BAIXADO", "LIQUIDADO", "PAGO"]);
  if (row.status && closed.has(row.status.toUpperCase())) {
    return { ok: false as const, error: "Este boleto já está quitado ou cancelado." };
  }

  const quota = await remainingHourlyQuota();
  if (quota.remaining <= 0) {
    return {
      ok: false as const,
      error: `Limite horário atingido (${quota.used}/${quota.limit} contatos na última hora). Aguarde antes de enviar de novo.`,
    };
  }

  const item = await enrichDueItem(row);
  const target = await resolveItemNotifyPhones(item);

  if (target.phones.length === 0) {
    return { ok: false as const, error: "Telefone inválido ou ausente no cadastro Omie." };
  }

  const dueDateLabel = formatDisplayDate(item.dueDate);
  const message = buildDueReminderMessage(item, dueDateLabel, {
    testMode: target.testMode,
    originalPhone: target.originalPhones.join(", ") || null,
    manual: !target.testMode,
  });

  const errors: string[] = [];
  let sentPhones = 0;
  let remaining = quota.remaining;

  for (const phone of target.phones) {
    if (remaining <= 0) {
      errors.push(`Limite horário atingido após ${sentPhones} envio(s).`);
      break;
    }

    const chatId = toWhatsAppChatId(phone);
    if (!chatId) {
      errors.push(`Telefone inválido: ${phone}`);
      continue;
    }

    try {
      await sendItemToPhone(item, chatId, message, errors);
      await insertNotificationLog({
        dueItemId: item.id,
        phone,
        message,
        success: true,
      });
      sentPhones += 1;
      remaining -= 1;
    } catch (error) {
      const err = error instanceof Error ? error.message : "Falha ao enviar";
      await insertNotificationLog({
        dueItemId: item.id,
        phone,
        message,
        success: false,
        error: err,
      });
      errors.push(err);
    }
  }

  if (sentPhones === 0) {
    return { ok: false as const, error: errors.join(" | ") || "Falha ao enviar." };
  }

  if (!target.testMode) {
    await markDueItemNotified(item.id);
  }

  return {
    ok: true as const,
    sentPhones,
    testMode: target.testMode,
    errors,
  };
}

export async function sendDueReminders(targetDate = new Date()) {
  if (notifyInProgress) {
    return {
      ok: true as const,
      sent: 0,
      skipped: 0,
      errors: ["Envio já em andamento. Aguarde a conclusão do lote anterior."],
      testMode: false,
    };
  }

  notifyInProgress = true;

  try {
    const enabled = (await getSetting("notifications_enabled")) ?? "true";
    if (enabled === "false") {
      return { ok: true as const, sent: 0, skipped: 0, errors: [] as string[], testMode: false };
    }

    const testMode = (await getSetting("test_mode_enabled")) === "true";
    const delayMs = sendDelayMs();
    let quota = await remainingHourlyQuota();

    const tomorrow = new Date(targetDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const targetIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

    const items = await getDueItemsForNotification(targetIso);
    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    if (quota.remaining <= 0) {
      return {
        ok: true as const,
        sent: 0,
        skipped: items.length,
        errors: [
          `Limite horário atingido (${quota.used}/${quota.limit} contatos na última hora). Os alertas restantes ficam para a próxima hora.`,
        ],
        testMode,
      };
    }

    type PendingGroup = {
      chatId: string;
      phone: string;
      testMode: boolean;
      originalPhones: string[];
      items: DueItem[];
    };

    const groups = new Map<string, PendingGroup>();

    for (const rawItem of items) {
      const item = await enrichDueItem(rawItem);
      const target = await resolveItemNotifyPhones(item);

      if (target.phones.length === 0) {
        skipped += 1;
        errors.push(`${item.clientName ?? "Sem cliente"}: telefone inválido ou ausente`);
        continue;
      }

      for (const phone of target.phones) {
        const chatId = toWhatsAppChatId(phone);
        if (!chatId) {
          skipped += 1;
          errors.push(`${item.clientName ?? "Sem cliente"}: telefone inválido (${phone})`);
          continue;
        }

        const existing = groups.get(chatId);
        if (existing) {
          if (!existing.items.some((entry) => entry.id === item.id)) {
            existing.items.push(item);
          }
        } else {
          groups.set(chatId, {
            chatId,
            phone,
            testMode: target.testMode,
            originalPhones: target.originalPhones,
            items: [item],
          });
        }
      }
    }

    let groupIndex = 0;
    for (const group of groups.values()) {
      if (quota.remaining <= 0) {
        const pendingItems = [...groups.values()]
          .slice(groupIndex)
          .reduce((sum, entry) => sum + entry.items.length, 0);
        skipped += pendingItems;
        errors.push(
          `Limite horário atingido (${quota.used}/${quota.limit}). ${pendingItems} alerta(s) ficaram para a próxima hora.`,
        );
        break;
      }

      groupIndex += 1;
      const message = buildGroupedDueReminderMessage(group.items, {
        testMode: group.testMode,
        originalPhone: group.originalPhones.join(", ") || null,
      });

      try {
        await sendWahaText(group.chatId, message);

        for (const item of group.items) {
          await sendItemPdf(group.chatId, item, errors);
          if (delayMs > 0) await sleep(Math.min(delayMs, 3_000));
        }

        for (const item of group.items) {
          if (!group.testMode) {
            await markDueItemNotified(item.id);
          }
          await insertNotificationLog({
            dueItemId: item.id,
            phone: group.phone,
            message,
            success: true,
          });
        }
        sent += group.items.length;
        quota = { ...quota, used: quota.used + 1, remaining: Math.max(0, quota.remaining - 1) };

        if (delayMs > 0 && groupIndex < groups.size && quota.remaining > 0) {
          await sleep(delayMs);
        }
      } catch (error) {
        const err = error instanceof Error ? error.message : "Falha ao enviar";
        for (const item of group.items) {
          await insertNotificationLog({
            dueItemId: item.id,
            phone: group.phone,
            message,
            success: false,
            error: err,
          });
          errors.push(`${item.clientName ?? "Sem cliente"}: ${err}`);
        }
      }
    }

    return { ok: true as const, sent, skipped, errors, testMode };
  } finally {
    notifyInProgress = false;
  }
}
