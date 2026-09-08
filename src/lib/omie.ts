import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getDashboardStats, getDueItemById, getLastSyncLogs, listDueItems, listNotificationLogsPaginated } from "@/db/due-items";
import { getSettings, setSetting } from "@/db/settings";
import { listOmieApps } from "@/server/omie/client";
import { resolveBoletoPdfWithStatus, resolveDueItemPdfWithStatus } from "@/server/omie/documents";

async function fetchRemotePdfAsBase64(url: string) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { Accept: "application/pdf,application/octet-stream,*/*" },
    });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 100) return null;
    if (!(buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46)) {
      return null;
    }
    return buffer.toString("base64");
  } catch {
    return null;
  }
}
import { runManualNotifications, runManualSync } from "@/server/scheduler";
import { sendDueItemReminder } from "@/server/omie/notifications";

export const getOmieAppsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAuth } = await import("@/lib/require-auth");
  await requireAuth();
  return listOmieApps().map(({ id, name, notifyPhone }) => ({ id, name, notifyPhone }));
});

export const getDashboardFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAuth } = await import("@/lib/require-auth");
  await requireAuth();
  const [stats, syncLogs, apps] = await Promise.all([
    getDashboardStats(),
    getLastSyncLogs(5),
    Promise.resolve(listOmieApps()),
  ]);
  return { stats, syncLogs, appsConfigured: apps.length };
});

export const listDueItemsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAuth } = await import("@/lib/require-auth");
  await requireAuth();
  return listDueItems({ currentMonthOnly: true, openOnly: true });
});

export const listNotificationLogsFn = createServerFn({ method: "GET" })
  .validator((input) => z.object({ page: z.coerce.number().int().min(1).optional() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireAuth } = await import("@/lib/require-auth");
    await requireAuth();
    return listNotificationLogsPaginated(data.page ?? 1, 15);
  });

export const syncOmieFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/require-auth");
  await requireAdmin();
  return runManualSync();
});

export const sendNotificationsFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/require-auth");
  await requireAdmin();
  return runManualNotifications();
});

export const sendDueItemNotificationFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ dueItemId: z.number().int().positive() }).parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/require-auth");
    await requireAdmin();
    return sendDueItemReminder(data.dueItemId);
  });

export const getDueItemBoletoViewFn = createServerFn({ method: "GET" })
  .validator((input) => z.object({ dueItemId: z.coerce.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireAuth } = await import("@/lib/require-auth");
    await requireAuth();

    const item = await getDueItemById(data.dueItemId);
    if (!item) {
      return { ok: false as const, error: "Documento não encontrado." };
    }

    const app = listOmieApps().find((entry) => entry.id === item.omieAppId);
    if (!app) {
      return { ok: false as const, error: "App Omie não configurado." };
    }

    const filename =
      `${(item.documentNumber ?? "documento").replace(/[^\w.-]+/g, "_")}.pdf`;

    if (item.itemType === "boleto") {
      const result = await resolveBoletoPdfWithStatus(app, {
        omieCode: item.omieCode ?? 0,
        integrationCode: item.integrationCode,
        documentNumber: item.documentNumber,
      });
      const url = result.link ?? result.document?.url ?? null;
      if (url) {
        return { ok: true as const, mode: "link" as const, url, filename: result.document?.filename ?? filename };
      }
      return {
        ok: false as const,
        error: result.status ?? "Link do boleto indisponível no Omie.",
      };
    }

    const result = await resolveDueItemPdfWithStatus(app, item);
    const pdfFilename = result.document?.filename ?? filename;

    let base64 = result.document?.base64 ?? null;
    if (!base64) {
      const remoteUrl = result.document?.url ?? result.link;
      if (remoteUrl) {
        base64 = await fetchRemotePdfAsBase64(remoteUrl);
      }
    }

    if (base64) {
      return { ok: true as const, mode: "download" as const, filename: pdfFilename, base64 };
    }

    return {
      ok: false as const,
      error: result.status ?? "PDF do documento indisponível no Omie.",
    };
  });

const settingsSchema = z.object({
  notificationsEnabled: z.boolean(),
  notificationTime: z.string().regex(/^\d{2}:\d{2}$/),
  defaultNotifyPhone: z.string(),
  testModeEnabled: z.boolean(),
  testNotifyPhone: z.string(),
  hourlyLimit: z.number().int().min(1).max(40),
});

export const getNotificationSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/require-auth");
  await requireAdmin();
  const settings = await getSettings([
    "notifications_enabled",
    "notification_time",
    "default_notify_phone",
    "test_mode_enabled",
    "test_notify_phone",
    "notification_hourly_limit",
  ]);
  const hourlyParsed = Number(settings.notification_hourly_limit ?? "12");
  return {
    notificationsEnabled: settings.notifications_enabled !== "false",
    notificationTime: settings.notification_time ?? "09:00",
    defaultNotifyPhone: settings.default_notify_phone ?? "",
    testModeEnabled: settings.test_mode_enabled === "true",
    testNotifyPhone: settings.test_notify_phone ?? "",
    hourlyLimit: Number.isFinite(hourlyParsed) && hourlyParsed > 0 ? Math.min(hourlyParsed, 40) : 12,
  };
});

export const saveNotificationSettingsFn = createServerFn({ method: "POST" })
  .validator(settingsSchema)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/require-auth");
    await requireAdmin();
    await setSetting("notifications_enabled", data.notificationsEnabled ? "true" : "false");
    await setSetting("notification_time", data.notificationTime);
    await setSetting("default_notify_phone", data.defaultNotifyPhone.trim());
    await setSetting("test_mode_enabled", data.testModeEnabled ? "true" : "false");
    await setSetting("test_notify_phone", data.testNotifyPhone.trim());
    await setSetting("notification_hourly_limit", String(data.hourlyLimit));
    return { ok: true as const };
  });
