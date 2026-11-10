import {
  findTecnicoUserIdsByNome,
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
};

async function sendExpoPush(messages: ExpoPushMessage[]) {
  if (!messages.length) return { ok: true as const, sent: 0 };
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[mobile-push] Expo error", res.status, text);
      return { ok: false as const, sent: 0, error: text || String(res.status) };
    }
    return { ok: true as const, sent: messages.length };
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
  tecnicoNome: string | null | undefined;
  osId: number;
  osNum: string;
  clientName: string;
  agDate?: string | null;
  periodo?: string | null;
}) {
  const userIds = await findTecnicoUserIdsByNome(input.tecnicoNome);
  if (!userIds.length) return { ok: true as const, sent: 0 };

  const tokens = (
    await Promise.all(userIds.map((id) => listExpoPushTokensForUser(id)))
  ).flat();
  const unique = [...new Set(tokens.filter(Boolean))];
  if (!unique.length) return { ok: true as const, sent: 0 };

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
      data: {
        type: "os_assigned",
        osId: input.osId,
        osNum: input.osNum,
      },
    })),
  );
}
