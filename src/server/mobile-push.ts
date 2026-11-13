import {
  findTecnicoUserIdsForAssignment,
  listExpoPushTokensForUser,
} from "@/db/mobile";

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  priority?: "default" | "normal" | "high";
  channelId?: string;
  ttl?: number;
};

type ExpoPushTicket = {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
};

async function sendExpoPush(messages: ExpoPushMessage[]) {
  if (!messages.length) return { ok: true as const, sent: 0 };
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    };
    const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers,
      body: JSON.stringify(messages),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      console.error("[mobile-push] Expo error", res.status, text);
      return { ok: false as const, sent: 0, error: text || String(res.status) };
    }

    let tickets: ExpoPushTicket[] = [];
    try {
      const parsed = JSON.parse(text) as {
        data?: ExpoPushTicket | ExpoPushTicket[];
      };
      tickets = Array.isArray(parsed.data)
        ? parsed.data
        : parsed.data
          ? [parsed.data]
          : [];
    } catch {
      // corpo não-JSON: trata como ok HTTP
    }

    const errors = tickets.filter((t) => t.status === "error");
    if (errors.length) {
      console.error(
        "[mobile-push] tickets com erro",
        errors.map((e) => ({
          message: e.message,
          error: e.details?.error,
        })),
      );
    }

    const sent = tickets.filter((t) => t.status === "ok").length || messages.length - errors.length;
    return {
      ok: errors.length === 0,
      sent: Math.max(0, sent),
      error: errors[0]?.message ?? errors[0]?.details?.error,
    };
  } catch (error) {
    console.error("[mobile-push]", error);
    return {
      ok: false as const,
      sent: 0,
      error: error instanceof Error ? error.message : "Falha no push",
    };
  }
}

export async function notifyTecnicoOsAssigned(input: {
  tecnicoNome?: string | null;
  teamId?: number | null;
  osId: number;
  osNum: string;
  clientName: string;
  agDate?: string | null;
  periodo?: string | null;
}) {
  const userIds = await findTecnicoUserIdsForAssignment({
    tecnicoNome: input.tecnicoNome,
    teamId: input.teamId,
  });
  if (!userIds.length) {
    console.warn("[mobile-push] nenhum usuário para notificar", {
      tecnicoNome: input.tecnicoNome,
      teamId: input.teamId,
      osId: input.osId,
    });
    return { ok: true as const, sent: 0 };
  }

  const tokens = (
    await Promise.all(userIds.map((id) => listExpoPushTokensForUser(id)))
  ).flat();
  const unique = [...new Set(tokens.filter(Boolean))];
  if (!unique.length) {
    console.warn("[mobile-push] usuários sem token Expo", {
      userIds,
      osId: input.osId,
    });
    return { ok: true as const, sent: 0 };
  }

  const when = [input.agDate, input.periodo].filter(Boolean).join(" · ");
  const body = when
    ? `${input.osNum} · ${input.clientName} · ${when}`
    : `${input.osNum} · ${input.clientName}`;

  return sendExpoPush(
    unique.map((to) => ({
      to,
      title: "Nova O.S. direcionada",
      body,
      sound: "default",
      priority: "high",
      channelId: "os-tecnico",
      // Ajuda entrega com tela apagada / app em background no Android.
      ttl: 86_400,
      data: {
        type: "os_assigned",
        osId: input.osId,
        osNum: input.osNum,
      },
    })),
  );
}
