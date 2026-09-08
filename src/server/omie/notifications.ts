import "@tanstack/react-start/server-only";

import { getSetting } from "@/db/settings";
import {
  countSuccessfulNotifyPhonesLastHour,
  DEFAULT_OVERDUE_NOTIFICATION_DAYS,
  getDueItemById,
  getDueItemsForNotification,
  getDueItemsForOverdueNotification,
  insertNotificationLog,
  markDueItemNotified,
  markDueItemOverdueNotified,
} from "@/db/due-items";
import type { DueItem } from "@/db/schema";
import type { NotificationKind } from "@/db/schema";
import { APP_NAME } from "@/lib/brand";
import { formatDisplayDate, listOmieApps } from "@/server/omie/client";
import { resolveDueItemPdfWithStatus } from "@/server/omie/documents";
import { clientDisplayName, clientPhones, getCliente } from "@/server/omie/clients";
import { isOpenReceivableStatus } from "@/server/omie/status";
import { sendWhatsAppDocument, sendWhatsAppText } from "@/server/whatsapp";

const DEFAULT_SEND_DELAY_MS = 10_000;
const DEFAULT_HOURLY_LIMIT = 12;
const DEFAULT_MAX_CONTACTS_PER_RUN = 8;
const HARD_MAX_HOURLY_LIMIT = 40;

let notifyInProgress = false;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendDelayMs() {
  const raw = process.env["NOTIFICATION_SEND_DELAY_MS"]?.trim();
  const parsed = raw ? Number(raw) : DEFAULT_SEND_DELAY_MS;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_SEND_DELAY_MS;
}

function maxContactsPerRun() {
  const raw = process.env["NOTIFICATION_MAX_CONTACTS_PER_RUN"]?.trim();
  const parsed = raw ? Number(raw) : DEFAULT_MAX_CONTACTS_PER_RUN;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_CONTACTS_PER_RUN;
  return Math.min(Math.floor(parsed), HARD_MAX_HOURLY_LIMIT);
}

async function hourlyLimit() {
  const fromSetting = (await getSetting("notification_hourly_limit"))?.trim();
  const fromEnv = process.env["NOTIFICATION_HOURLY_LIMIT"]?.trim();
  const raw = fromSetting || fromEnv || String(DEFAULT_HOURLY_LIMIT);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_HOURLY_LIMIT;
  return Math.min(Math.floor(parsed), HARD_MAX_HOURLY_LIMIT);
}

async function remainingHourlyQuota() {
  const limit = await hourlyLimit();
  const used = await countSuccessfulNotifyPhonesLastHour();
  return { limit, used, remaining: Math.max(0, limit - used) };
}

function phoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

/** Celular BR com 9 após o DDD — evita disparo em telefone fixo (piora qualidade Meta). */
export function isLikelyWhatsAppMobile(value: string | null | undefined) {
  if (!value) return false;
  let digits = phoneDigits(value);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  return digits.length === 11 && digits[2] === "9";
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

const TYPE_LABELS: Record<DueItem["itemType"], string> = {
  boleto: "Boleto",
  nfe: "NF-e",
  nfse: "NFS-e",
};

function typeLabel(type: DueItem["itemType"]) {
  return TYPE_LABELS[type] ?? "Documento";
}

export function buildDueReminderMessage(
  item: DueItem,
  dueDateLabel: string,
  options?: {
    testMode?: boolean;
    originalPhone?: string | null;
    manual?: boolean;
    kind?: NotificationKind;
    overdueDays?: number;
  },
) {
  const client = item.clientName?.trim() || "Cliente não identificado";
  const kind = options?.kind ?? "pre_due";
  const overdueDays = options?.overdueDays ?? DEFAULT_OVERDUE_NOTIFICATION_DAYS;

  const intro =
    options?.manual
      ? `Olá! Segue lembrete do documento com vencimento em *${dueDateLabel}*:`
      : options?.testMode
        ? kind === "overdue"
          ? `Este alerta de atraso seria enviado ao cliente *${client}*, mas está em modo teste.`
          : `Este alerta seria enviado ao cliente *${client}*, mas está em modo teste.`
        : kind === "overdue"
          ? `Olá! O documento abaixo venceu em *${dueDateLabel}* (*${overdueDays} dias atrás*) e ainda consta em aberto:`
          : `Olá! O documento abaixo vence amanhã (*${dueDateLabel}*):`;

  const title =
    options?.testMode
      ? "🧪 *[MODO TESTE]*"
      : kind === "overdue"
        ? "⚠️ *Lembrete de documento em atraso*"
        : "🔔 *Lembrete de vencimento*";

  const lines = [
    title,
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
    `_Mensagem automática — ${APP_NAME}._`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildGroupedDueReminderMessage(
  items: DueItem[],
  options?: {
    testMode?: boolean;
    originalPhone?: string | null;
    kind?: NotificationKind;
    overdueDays?: number;
  },
) {
  if (items.length === 1) {
    const item = items[0]!;
    return buildDueReminderMessage(item, formatDisplayDate(item.dueDate), options);
  }

  const kind = options?.kind ?? "pre_due";
  const overdueDays = options?.overdueDays ?? DEFAULT_OVERDUE_NOTIFICATION_DAYS;

  const lines = [
    options?.testMode ? "🧪 *[MODO TESTE]*" : kind === "overdue"
      ? "⚠️ *Lembretes de documentos em atraso*"
      : "🔔 *Lembretes de vencimento*",
    "",
    options?.testMode
      ? `Seriam enviados *${items.length}* alertas para este número, mas está em modo teste:`
      : kind === "overdue"
        ? `Olá! Os *${items.length}* documentos abaixo venceram há *${overdueDays} dias* e ainda constam em aberto:`
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

  lines.push(`_Mensagem automática — ${APP_NAME}._`);
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

  const mobilePhones = originalPhones.filter((phone) => isLikelyWhatsAppMobile(phone));
  return {
    phones: mobilePhones,
    testMode: false,
    originalPhones,
  };
}

async function sendItemPdf(chatId: string, item: DueItem, errors: string[]) {
  const app = listOmieApps().find((entry) => entry.id === item.omieAppId);
  if (!app) return;

  const result = await resolveDueItemPdfWithStatus(app, item);
  const label = TYPE_LABELS[item.itemType] ?? "Documento";

  const caption = [
    item.clientName?.trim(),
    (result.documentNumber ?? item.documentNumber) ? `Doc. ${result.documentNumber ?? item.documentNumber}` : null,
    `Venc. ${formatDisplayDate(item.dueDate)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  try {
    if (result.document) {
      await sendWhatsAppDocument(chatId, result.document, caption);
      return;
    }
    if (result.link) {
      const lines = [`📎 *${label}*`, caption, "", result.link];
      if (result.barcode) lines.push("", `Linha digitável:\n${result.barcode}`);
      await sendWhatsAppText(chatId, lines.filter(Boolean).join("\n"));
      return;
    }
    if (result.status) {
      errors.push(`${item.clientName ?? "Sem cliente"} (${label}): ${result.status}`);
    }
  } catch (pdfError) {
    if (result.link) {
      try {
        await sendWhatsAppText(chatId, [`📎 *${label}*`, caption, "", result.link].join("\n"));
        return;
      } catch {
        // fallthrough
      }
    }
    const pdfErr = pdfError instanceof Error ? pdfError.message : "Falha ao enviar PDF";
    errors.push(`${item.clientName ?? "Sem cliente"} (${label}): ${pdfErr}`);
  }
}

async function sendItemToPhone(
  item: DueItem,
  chatId: string,
  message: string,
  errors: string[],
) {
  await sendWhatsAppText(chatId, message);
  await sendItemPdf(chatId, item, errors);
}

export async function sendDueItemReminder(dueItemId: number) {
  const row = await getDueItemById(dueItemId);
  if (!row) {
    return { ok: false as const, error: "Documento não encontrado." };
  }

  const closed = !isOpenReceivableStatus(row.status);
  if (closed) {
    return { ok: false as const, error: "Este documento já está quitado, cancelado ou sem status em aberto." };
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
        kind: "pre_due",
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
        kind: "pre_due",
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

type ReminderBatchResult = {
  sent: number;
  skipped: number;
  errors: string[];
};

type PendingGroup = {
  chatId: string;
  phone: string;
  testMode: boolean;
  originalPhones: string[];
  items: DueItem[];
};

async function sendReminderBatch(
  items: DueItem[],
  kind: NotificationKind,
  options: {
    testMode: boolean;
    delayMs: number;
    overdueDays?: number;
    contactBudget: number;
  },
): Promise<ReminderBatchResult & { quotaUsed: number }> {
  let quota = await remainingHourlyQuota();
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];
  const contactBudget = Math.max(0, Math.min(options.contactBudget, quota.remaining));

  if (contactBudget <= 0) {
    return {
      sent: 0,
      skipped: items.length,
      errors:
        quota.remaining <= 0
          ? [
              `Limite horário atingido (${quota.used}/${quota.limit} contatos na última hora). Os alertas restantes ficam para a próxima hora.`,
            ]
          : [
              "Limite deste lote atingido (anti-spam Meta). Os alertas restantes ficam para a próxima hora.",
            ],
      quotaUsed: 0,
    };
  }

  const groups = new Map<string, PendingGroup>();

  for (const rawItem of items) {
    if (!isOpenReceivableStatus(rawItem.status)) {
      skipped += 1;
      errors.push(`${rawItem.clientName ?? "Sem cliente"}: documento não está em aberto (${rawItem.status ?? "sem status"})`);
      continue;
    }
    const item = await enrichDueItem(rawItem);
    const target = await resolveItemNotifyPhones(item);

    if (target.phones.length === 0) {
      skipped += 1;
      const reason =
        target.originalPhones.length > 0
          ? "sem celular WhatsApp válido (telefone fixo ignorado)"
          : "telefone inválido ou ausente";
      errors.push(`${item.clientName ?? "Sem cliente"}: ${reason}`);
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
  let quotaUsed = 0;
  let contactsLeft = contactBudget;

  for (const group of groups.values()) {
    if (contactsLeft <= 0 || quota.remaining <= 0) {
      const pendingItems = [...groups.values()]
        .slice(groupIndex)
        .reduce((sum, entry) => sum + entry.items.length, 0);
      skipped += pendingItems;
      errors.push(
        quota.remaining <= 0
          ? `Limite horário atingido (${quota.used}/${quota.limit}). ${pendingItems} alerta(s) ficaram para a próxima hora.`
          : `Limite deste lote (anti-spam Meta). ${pendingItems} alerta(s) ficaram para a próxima hora.`,
      );
      break;
    }

    groupIndex += 1;
    const message = buildGroupedDueReminderMessage(group.items, {
      testMode: group.testMode,
      originalPhone: group.originalPhones.join(", ") || null,
      kind,
      overdueDays: options.overdueDays,
    });

    try {
      await sendWhatsAppText(group.chatId, message);

      for (const item of group.items) {
        await sendItemPdf(group.chatId, item, errors);
        if (options.delayMs > 0) await sleep(options.delayMs);
      }

      for (const item of group.items) {
        if (!group.testMode) {
          if (kind === "overdue") {
            await markDueItemOverdueNotified(item.id);
          } else {
            await markDueItemNotified(item.id);
          }
        }
        await insertNotificationLog({
          dueItemId: item.id,
          phone: group.phone,
          message,
          success: true,
          kind,
        });
      }
      sent += group.items.length;
      quota = { ...quota, used: quota.used + 1, remaining: Math.max(0, quota.remaining - 1) };
      quotaUsed += 1;
      contactsLeft -= 1;

      if (options.delayMs > 0 && groupIndex < groups.size && contactsLeft > 0 && quota.remaining > 0) {
        await sleep(options.delayMs);
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
          kind,
        });
        errors.push(`${item.clientName ?? "Sem cliente"}: ${err}`);
      }
      // Pausa extra em erro (rate limit / política Meta)
      if (options.delayMs > 0) await sleep(options.delayMs * 2);
    }
  }

  return { sent, skipped, errors, quotaUsed };
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
    const overdueDays = DEFAULT_OVERDUE_NOTIFICATION_DAYS;
    const runBudget = maxContactsPerRun();

    const tomorrow = new Date(targetDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const targetIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

    const preDueItems = await getDueItemsForNotification(targetIso);
    const overdueItems = await getDueItemsForOverdueNotification(overdueDays, targetDate);

    // Pré-vencimento primeiro; atraso só com sobra do lote (evita rajada após downtime).
    const preDue = await sendReminderBatch(preDueItems, "pre_due", {
      testMode,
      delayMs,
      contactBudget: runBudget,
    });
    const overdueBudget = Math.max(0, runBudget - preDue.quotaUsed);
    const overdue = await sendReminderBatch(overdueItems, "overdue", {
      testMode,
      delayMs,
      overdueDays,
      contactBudget: overdueBudget,
    });

    return {
      ok: true as const,
      sent: preDue.sent + overdue.sent,
      skipped: preDue.skipped + overdue.skipped,
      errors: [...preDue.errors, ...overdue.errors],
      testMode,
      preDueSent: preDue.sent,
      overdueSent: overdue.sent,
    };
  } finally {
    notifyInProgress = false;
  }
}
