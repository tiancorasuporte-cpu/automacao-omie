import "@tanstack/react-start/server-only";

import { getSetting, setSetting } from "@/db/settings";
import { sendDueReminders } from "@/server/omie/notifications";
import { syncAllOmieApps } from "@/server/omie/sync";

let schedulerStarted = false;

const SCHEDULER_KEY = "__omie_scheduler_started__";

function isSchedulerStarted() {
  return schedulerStarted || Boolean((globalThis as Record<string, unknown>)[SCHEDULER_KEY]);
}

function markSchedulerStarted() {
  schedulerStarted = true;
  (globalThis as Record<string, unknown>)[SCHEDULER_KEY] = true;
}

let notifyInProgress = false;

async function runNotificationsOnce() {
  if (notifyInProgress) return;
  notifyInProgress = true;
  try {
    await sendDueReminders();
  } finally {
    notifyInProgress = false;
  }
}
let lastSyncAt = 0;
let lastNotifySlot = "";

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function currentHourMinute() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function currentHourSlot() {
  const now = new Date();
  return `${todayKey()}-${String(now.getHours()).padStart(2, "0")}`;
}

async function tick() {
  const { isDatabaseConfigured } = await import("@/db/client");
  if (!isDatabaseConfigured()) return;

  if (process.env["WAHA_BOT_IN_DEV"] !== "true") {
    try {
      const { stopWahaEventsSocket } = await import("@/server/waha-events");
      const { stopWahaWebhookHttpServer } = await import("@/server/waha-webhook-http");
      stopWahaEventsSocket();
      stopWahaWebhookHttpServer();
    } catch {
      // ignore
    }
  }

  try {
    const now = Date.now();
    if (now - lastSyncAt > 6 * 60 * 60 * 1000) {
      lastSyncAt = now;
      await syncAllOmieApps();
    }

    const notifyTime = (await getSetting("notification_time")) ?? "09:00";
    const slot = currentHourSlot();
    // Depois do horário configurado, tenta a cada hora (respeita limite horário / remanescentes).
    if (currentHourMinute() >= notifyTime && lastNotifySlot !== slot) {
      lastNotifySlot = slot;
      await runNotificationsOnce();
    }
  } catch (error) {
    console.error("[scheduler]", error);
  }
}

export function startScheduler() {
  if (isSchedulerStarted()) {
    void ensureWahaWebhook();
    return;
  }
  markSchedulerStarted();

  void tick();
  void ensureWahaWebhook();
  setInterval(() => {
    void tick();
  }, 60_000);
}

async function ensureWahaWebhook() {
  // Bot inbound roda via `npm run bot:listen` — derruba conexões legadas do dev.
  if (process.env["WAHA_BOT_IN_DEV"] !== "true") {
    try {
      const { stopWahaEventsSocket } = await import("@/server/waha-events");
      const { stopWahaWebhookHttpServer } = await import("@/server/waha-webhook-http");
      stopWahaEventsSocket();
      stopWahaWebhookHttpServer();
    } catch {
      // ignore
    }
    return;
  }

  try {
    const { getSetting } = await import("@/db/settings");
    const { isWahaConfigured, registerWahaInboundWebhook } = await import("@/server/waha");
    const { startWahaWebhookHttpServer } = await import("@/server/waha-webhook-http");
    const { startWahaEventsSocket } = await import("@/server/waha-events");
    if (!isWahaConfigured()) return;

    const botEnabled = (await getSetting("whatsapp_bot_enabled")) !== "false";
    if (!botEnabled) return;

    void startWahaEventsSocket();
    startWahaWebhookHttpServer();

    if (process.env["WAHA_BOT_REGISTER_WEBHOOK"] !== "true") {
      console.info("[waha-bot] WebSocket ativo no dev (webhook WAHA desligado).");
      return;
    }

    const publicUrl =
      (await getSetting("public_app_url"))?.trim() ||
      process.env["PUBLIC_APP_URL"]?.trim() ||
      "";
    if (!publicUrl) return;

    const result = await registerWahaInboundWebhook(publicUrl);
    if (!result.ok) {
      console.warn("[waha-bot]", result.error);
      return;
    }
    console.info("[waha-bot] Webhook registrado:", result.webhookUrl);
  } catch (error) {
    console.warn("[waha-bot] Falha ao registrar webhook:", error);
  }
}

export async function runManualSync() {
  lastSyncAt = Date.now();
  return syncAllOmieApps();
}

export async function runManualNotifications() {
  lastNotifySlot = currentHourSlot();
  return sendDueReminders();
}

export async function ensureDefaultSettings() {
  const { isDatabaseConfigured } = await import("@/db/client");
  if (!isDatabaseConfigured()) return;

  const defaults: Record<string, string> = {
    notifications_enabled: "true",
    notification_time: "09:00",
    default_notify_phone: "",
    test_mode_enabled: "true",
    test_notify_phone: "",
    notification_hourly_limit: "12",
    whatsapp_bot_enabled: "true",
  };

  for (const [key, value] of Object.entries(defaults)) {
    const current = await getSetting(key);
    if (current == null) await setSetting(key, value);
  }

  const envTestPhone = process.env["TEST_NOTIFY_PHONE"]?.trim();
  if (envTestPhone) {
    const current = await getSetting("test_notify_phone");
    if (!current) await setSetting("test_notify_phone", envTestPhone);
  }
}
