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
  if (isSchedulerStarted()) return;
  markSchedulerStarted();

  void tick();
  setInterval(() => {
    void tick();
  }, 60_000);
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
    notification_hourly_limit: "20",
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
