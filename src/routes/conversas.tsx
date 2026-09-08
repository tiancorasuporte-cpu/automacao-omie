import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { AppShell, useShellSearch } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import {
  assumeInboxChatFn,
  getInboxMessagesFn,
  listInboxChatsFn,
  releaseInboxChatFn,
  sendInboxReplyFn,
} from "@/lib/inbox";
import { requireAuth } from "@/lib/require-auth";
import { APP_NAME } from "@/lib/brand";
import type { InboxChat, InboxMessage } from "@/server/waha-inbox";
import { cn } from "@/lib/utils";

const POLL_MS = 8_000;

const searchSchema = z.object({
  chat: z.string().catch(""),
});

export const Route = createFileRoute("/conversas")({
  validateSearch: searchSchema,
  beforeLoad: requireAuth,
  loader: async () => listInboxChatsFn({ data: { limit: 60 } }),
  head: () => ({
    meta: [{ title: `Conversas — ${APP_NAME}` }],
  }),
  component: ConversasPage,
});

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`.toUpperCase();
}

function formatTime(timestamp: number | null) {
  if (!timestamp) return "";
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatMessageTime(timestamp: number | null) {
  if (!timestamp) return "";
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ChatAvatar({ name, picture }: { name: string; picture: string | null }) {
  if (picture) {
    return (
      <img
        src={picture}
        alt=""
        className="h-10 w-10 shrink-0 rounded-full border border-outline-variant object-cover"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-container text-label-md font-bold text-on-secondary-container">
      {initials(name)}
    </span>
  );
}

function ConversasPage() {
  const initial = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const { chat: selectedChatId } = Route.useSearch();
  const { query } = useShellSearch();

  const [chats, setChats] = useState<InboxChat[]>(initial.ok ? initial.chats : []);
  const [configured, setConfigured] = useState(initial.configured ?? false);
  const [listError, setListError] = useState(initial.ok ? null : initial.error ?? null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [humanHandoff, setHumanHandoff] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "direct" | "handoff">("direct");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

  const filteredChats = useMemo(() => {
    const term = query.trim().toLowerCase();
    return chats.filter((chat) => {
      if (filter === "direct" && chat.isGroup) return false;
      if (filter === "handoff" && !chat.humanHandoff) return false;
      if (!term) return true;
      return (
        chat.name.toLowerCase().includes(term) ||
        chat.id.toLowerCase().includes(term) ||
        (chat.lastMessage?.body.toLowerCase().includes(term) ?? false)
      );
    });
  }, [chats, filter, query]);

  const refreshChats = useCallback(async () => {
    const result = await listInboxChatsFn({ data: { limit: 60 } });
    setConfigured(result.configured ?? false);
    if (!result.ok) {
      setListError(result.error ?? "Erro ao carregar conversas.");
      return;
    }
    setListError(null);
    setChats(result.chats);
  }, []);

  const refreshMessages = useCallback(async (chatId: string) => {
    setLoadingMessages(true);
    const result = await getInboxMessagesFn({ data: { chatId, limit: 50 } });
    setLoadingMessages(false);
    if (!result.ok) {
      setMessagesError(result.error ?? "Erro ao carregar mensagens.");
      setMessages([]);
      setHumanHandoff(false);
      return;
    }
    setMessagesError(null);
    setMessages(result.messages);
    setHumanHandoff(result.humanHandoff);
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === result.chatId ? { ...chat, humanHandoff: result.humanHandoff } : chat,
      ),
    );
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshChats();
      if (selectedChatId) void refreshMessages(selectedChatId);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refreshChats, refreshMessages, selectedChatId]);

  useEffect(() => {
    if (!selectedChatId) {
      setMessages([]);
      setHumanHandoff(false);
      setMessagesError(null);
      return;
    }
    void refreshMessages(selectedChatId);
  }, [selectedChatId, refreshMessages]);

  useEffect(() => {
    prevMessageCountRef.current = 0;
  }, [selectedChatId]);

  useEffect(() => {
    const count = messages.length;
    const shouldScroll =
      count > prevMessageCountRef.current || (count > 0 && prevMessageCountRef.current === 0);
    prevMessageCountRef.current = count;
    if (!shouldScroll) return;
    messagesEndRef.current?.scrollIntoView({ behavior: count <= 1 ? "auto" : "smooth" });
  }, [messages, selectedChatId]);

  const selectChat = (chatId: string) => {
    navigate({ search: { chat: chatId } });
  };

  const handleSend = async () => {
    if (!selectedChatId || !reply.trim() || sending) return;
    setSending(true);
    setSendError(null);
    const text = reply.trim();
    setReply("");
    const result = await sendInboxReplyFn({
      data: { chatId: selectedChatId, text, assumeHandoff: true },
    });
    setSending(false);
    if (!result.ok) {
      setReply(text);
      setSendError(result.error ?? "Não foi possível enviar.");
      return;
    }
    setHumanHandoff(true);
    setChats((prev) =>
      prev.map((chat) => (chat.id === selectedChatId ? { ...chat, humanHandoff: true } : chat)),
    );
    await Promise.all([refreshMessages(selectedChatId), refreshChats()]);
  };

  const toggleHandoff = async () => {
    if (!selectedChatId) return;
    if (humanHandoff) {
      const result = await releaseInboxChatFn({ data: { chatId: selectedChatId } });
      if (!result.ok) {
        setSendError(result.error ?? "Não foi possível devolver ao bot.");
        return;
      }
      setHumanHandoff(false);
      setChats((prev) =>
        prev.map((chat) => (chat.id === selectedChatId ? { ...chat, humanHandoff: false } : chat)),
      );
      return;
    }
    const result = await assumeInboxChatFn({ data: { chatId: selectedChatId } });
    if (!result.ok) {
      setSendError(result.error ?? "Não foi possível assumir a conversa.");
      return;
    }
    setHumanHandoff(true);
    setChats((prev) =>
      prev.map((chat) => (chat.id === selectedChatId ? { ...chat, humanHandoff: true } : chat)),
    );
  };

  return (
    <AppShell mobileTitle="Conversas" searchPlaceholder="Pesquisar conversas..." fullHeight>
      <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        {!configured ? (
          <div className="flex flex-1 items-center justify-center p-margin-mobile md:p-margin-desktop">
            <div className="max-w-md rounded-xl border border-outline-variant bg-surface-container-lowest p-xl text-center">
              <Icon name="chat" className="mb-md text-4xl text-on-surface-variant" />
              <h2 className="text-headline-md text-primary">WAHA não configurado</h2>
              <p className="mt-sm text-body-md text-on-surface-variant">
                Configure a URL do WAHA em Configurações para visualizar e responder conversas.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-1 overflow-hidden">
            <aside
              className={cn(
                "flex h-full min-h-0 w-full shrink-0 flex-col border-r border-outline-variant bg-surface md:w-[340px] lg:w-[380px]",
                selectedChatId ? "hidden md:flex" : "flex",
              )}
            >
              <div className="flex shrink-0 flex-wrap gap-xs border-b border-outline-variant px-md py-sm">
                {(
                  [
                    ["direct", "Diretas"],
                    ["all", "Todas"],
                    ["handoff", "Com atendente"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={cn(
                      "rounded-full px-md py-xs text-label-md transition-colors",
                      filter === key
                        ? "bg-secondary-container font-bold text-on-secondary-container"
                        : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {listError ? (
                  <p className="px-md py-lg text-body-md text-error">{listError}</p>
                ) : filteredChats.length === 0 ? (
                  <p className="px-md py-lg text-body-md text-on-surface-variant">
                    Nenhuma conversa encontrada.
                  </p>
                ) : (
                  <ul>
                    {filteredChats.map((chat) => {
                      const active = chat.id === selectedChatId;
                      return (
                        <li key={chat.id}>
                          <button
                            type="button"
                            onClick={() => selectChat(chat.id)}
                            className={cn(
                              "flex w-full items-start gap-sm border-b border-outline-variant/60 px-md py-md text-left transition-colors",
                              active
                                ? "bg-secondary-container/30"
                                : "hover:bg-surface-container-low",
                            )}
                          >
                            <ChatAvatar name={chat.name} picture={chat.picture} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-sm">
                                <p className="truncate text-title-md text-on-surface">{chat.name}</p>
                                <span className="shrink-0 text-label-md text-on-surface-variant">
                                  {formatTime(chat.lastMessage?.timestamp ?? null)}
                                </span>
                              </div>
                              <div className="mt-xs flex items-center gap-xs">
                                {chat.humanHandoff ? (
                                  <span className="rounded-full bg-secondary-container px-sm py-[2px] text-[0.65rem] font-bold uppercase tracking-wide text-on-secondary-container">
                                    Atendente
                                  </span>
                                ) : null}
                                {chat.isGroup ? (
                                  <span className="rounded-full bg-surface-container-high px-sm py-[2px] text-[0.65rem] uppercase tracking-wide text-on-surface-variant">
                                    Grupo
                                  </span>
                                ) : null}
                                <p className="truncate text-body-md text-on-surface-variant">
                                  {chat.lastMessage?.fromMe ? "Você: " : ""}
                                  {chat.lastMessage?.body || "Sem mensagens"}
                                </p>
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </aside>

            <section
              className={cn(
                "flex h-full min-h-0 min-w-0 flex-1 flex-col bg-surface-container-lowest",
                !selectedChatId ? "hidden md:flex" : "flex",
              )}
            >
              {!selectedChat ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-sm p-xl text-center">
                  <Icon name="forum" className="text-5xl text-on-surface-variant/60" />
                  <p className="text-title-lg text-on-surface-variant">Selecione uma conversa</p>
                  <p className="max-w-sm text-body-md text-on-surface-variant">
                    Escolha um contato à esquerda para ver o histórico e responder pelo WhatsApp.
                  </p>
                </div>
              ) : (
                <>
                  <header className="flex shrink-0 items-center gap-sm border-b border-outline-variant bg-surface px-md py-md">
                    <button
                      type="button"
                      aria-label="Voltar"
                      onClick={() => navigate({ search: { chat: "" } })}
                      className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container-high md:hidden"
                    >
                      <Icon name="arrow_back" />
                    </button>
                    <ChatAvatar name={selectedChat.name} picture={selectedChat.picture} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-title-lg text-primary">{selectedChat.name}</p>
                      <p className="truncate text-label-md text-on-surface-variant">{selectedChat.id}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleHandoff()}
                      className={cn(
                        "hidden shrink-0 rounded-full px-md py-sm text-label-md transition-colors sm:inline-flex",
                        humanHandoff
                          ? "bg-secondary-container font-semibold text-on-secondary-container"
                          : "border border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container-low",
                      )}
                    >
                      {humanHandoff ? "Devolver ao bot" : "Assumir conversa"}
                    </button>
                    <button
                      type="button"
                      aria-label={humanHandoff ? "Devolver ao bot" : "Assumir conversa"}
                      onClick={() => void toggleHandoff()}
                      className={cn(
                        "inline-flex shrink-0 rounded-full p-2 transition-colors sm:hidden",
                        humanHandoff
                          ? "bg-secondary-container text-on-secondary-container"
                          : "border border-outline-variant bg-surface text-on-surface-variant",
                      )}
                    >
                      <Icon name={humanHandoff ? "smart_toy" : "support_agent"} />
                    </button>
                  </header>

                  <div className="min-h-0 flex-1 overflow-y-auto px-md py-lg">
                    {loadingMessages && messages.length === 0 ? (
                      <p className="text-center text-body-md text-on-surface-variant">Carregando...</p>
                    ) : messagesError ? (
                      <p className="text-center text-body-md text-error">{messagesError}</p>
                    ) : messages.length === 0 ? (
                      <p className="text-center text-body-md text-on-surface-variant">
                        Nenhuma mensagem nesta conversa.
                      </p>
                    ) : (
                      <div className="mx-auto flex max-w-3xl flex-col gap-sm">
                        {messages.map((message) => (
                          <div
                            key={message.id}
                            className={cn("flex", message.fromMe ? "justify-end" : "justify-start")}
                          >
                            <div
                              className={cn(
                                "max-w-[85%] rounded-2xl px-md py-sm text-body-md shadow-sm",
                                message.fromMe
                                  ? "rounded-br-md bg-secondary-container text-on-secondary-container"
                                  : "rounded-bl-md border border-outline-variant/50 bg-surface text-on-surface",
                              )}
                            >
                              <p className="whitespace-pre-wrap break-words">
                                {message.body || (message.hasMedia ? "📎 Mídia" : "—")}
                              </p>
                              <p
                                className={cn(
                                  "mt-xs text-right text-[0.65rem]",
                                  message.fromMe
                                    ? "text-on-secondary-container/70"
                                    : "text-on-surface-variant",
                                )}
                              >
                                {formatMessageTime(message.timestamp)}
                              </p>
                            </div>
                          </div>
                        ))}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </div>

                  <footer className="shrink-0 border-t border-outline-variant bg-surface px-md py-md pb-[max(1rem,env(safe-area-inset-bottom))]">
                    {humanHandoff ? (
                      <p className="mb-sm rounded-lg bg-secondary-container/35 px-md py-sm text-center text-label-md text-on-secondary-container">
                        Bot silenciado nesta conversa. O cliente pode enviar &quot;menu&quot; para voltar ao
                        automático.
                      </p>
                    ) : null}
                    {sendError ? (
                      <p className="mb-sm text-center text-label-md text-error">{sendError}</p>
                    ) : null}
                    <form
                      className="mx-auto flex max-w-3xl items-end gap-sm"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleSend();
                      }}
                    >
                      <textarea
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            void handleSend();
                          }
                        }}
                        rows={2}
                        placeholder="Digite sua mensagem..."
                        className="min-h-[48px] flex-1 resize-none rounded-2xl border border-outline-variant bg-surface-container-low px-md py-sm text-body-md text-on-surface outline-none transition-colors placeholder:text-on-surface-variant focus:border-outline focus:bg-surface-container-lowest"
                      />
                      <button
                        type="submit"
                        disabled={sending || !reply.trim()}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-opacity disabled:opacity-40"
                        aria-label="Enviar"
                      >
                        <Icon name="send" className="text-xl" />
                      </button>
                    </form>
                  </footer>
                </>
              )}
            </section>
          </div>
        )}
      </main>
    </AppShell>
  );
}
