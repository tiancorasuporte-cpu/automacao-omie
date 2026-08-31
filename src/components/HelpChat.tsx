import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { Icon } from "@/components/Icon";
import { askHelpChatFn, getHelpAiStatusFn } from "@/lib/help-ai";
import { contextTipForPath, HELP_TOPICS } from "@/lib/help-chat";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "bot" | "user";
  text: string;
};

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function HelpChat() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hintSeen, setHintSeen] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiStatusReady, setAiStatusReady] = useState(false);
  const [pending, setPending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setHintSeen(localStorage.getItem("ancora-help-hint") === "1");
    } catch {
      setHintSeen(true);
    }
  }, []);

  useEffect(() => {
    void getHelpAiStatusFn()
      .then((status) => setAiEnabled(status.enabled))
      .catch(() => setAiEnabled(false))
      .finally(() => setAiStatusReady(true));
  }, []);

  useEffect(() => {
    if (!open || !aiStatusReady) return;
    setMessages((prev) => {
      if (prev.length > 0) return prev;
      const tip = contextTipForPath(pathname);
      const extra = aiEnabled
        ? " Estou com IA ligada (Groq) e também conheço a suíte Âncora Access."
        : " Por enquanto respondo com a ajuda rápida da suíte. Configure GROQ_API_KEY no servidor para IA completa.";
      return [{ id: newId(), role: "bot", text: `${tip}${extra}` }];
    });
    const timer = window.setTimeout(() => inputRef.current?.focus(), 180);
    return () => window.clearTimeout(timer);
  }, [open, pathname, aiEnabled, aiStatusReady]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, open, pending]);

  function dismissHint() {
    setHintSeen(true);
    try {
      localStorage.setItem("ancora-help-hint", "1");
    } catch {
      // ignore
    }
  }

  function openChat() {
    dismissHint();
    setOpen(true);
  }

  function historyForApi(nextMessages: ChatMessage[]) {
    return nextMessages
      .filter((message) => message.role === "user" || message.role === "bot")
      .slice(-10)
      .map((message) => ({
        role: (message.role === "user" ? "user" : "assistant") as "user" | "assistant",
        content: message.text,
      }));
  }

  async function ask(raw: string) {
    const text = raw.trim();
    if (!text || pending) return;

    const userMessage: ChatMessage = { id: newId(), role: "user", text };
    const withUser = [...messages, userMessage];
    setMessages(withUser);
    setInput("");
    setPending(true);

    try {
      const result = await askHelpChatFn({
        data: {
          message: text,
          pathname,
          history: historyForApi(messages),
        },
      });
      if (!result.ok) {
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: "bot", text: result.error },
        ]);
        return;
      }
      setMessages((prev) => [...prev, { id: newId(), role: "bot", text: result.answer }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "bot",
          text: "Não consegui responder agora. Tente de novo em instantes.",
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="pointer-events-none fixed bottom-margin-mobile right-margin-mobile z-[55] flex flex-col items-end gap-sm md:bottom-margin-desktop md:right-margin-desktop">
      {open ? (
        <section
          className="pointer-events-auto flex h-[min(32rem,calc(100vh-7rem))] w-[min(22.5rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-surface-container-lowest shadow-[0_24px_60px_-28px_color-mix(in_oklch,var(--primary)_45%,transparent)] ring-1 ring-outline-variant/80 animate-[login-rise_0.35s_cubic-bezier(0.22,1,0.36,1)_both]"
          aria-label="Assistente Âncora Access"
        >
          <header className="flex items-center gap-sm border-b border-outline-variant bg-primary px-md py-sm text-on-primary">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-on-primary/10 p-1">
              <BrandLogo className="h-full w-full" alt="" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-label-md font-bold">Assistente Âncora</p>
              <p className="truncate text-[0.7rem] text-on-primary/75">
                {aiEnabled ? "IA Groq ativa" : "Ajuda rápida da suíte"}
              </p>
            </div>
            <button
              type="button"
              aria-label="Fechar assistente"
              onClick={() => setOpen(false)}
              className="rounded-full p-1 transition-colors hover:bg-on-primary/10"
            >
              <Icon name="close" className="text-[20px]" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-sm overflow-y-auto bg-surface-container-low/40 px-md py-md">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[90%] whitespace-pre-wrap rounded-2xl px-md py-sm text-body-md leading-relaxed",
                    message.role === "user"
                      ? "rounded-br-md bg-primary text-on-primary"
                      : "rounded-bl-md bg-surface-container-lowest text-on-surface ring-1 ring-outline-variant/70",
                  )}
                >
                  {message.text}
                </div>
              </div>
            ))}
            {pending ? (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-surface-container-lowest px-md py-sm text-label-md text-on-surface-variant ring-1 ring-outline-variant/70">
                  Pensando…
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-outline-variant bg-surface-container-lowest px-md py-sm">
            <div className="mb-sm flex gap-xs overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {HELP_TOPICS.slice(0, 6).map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  disabled={pending}
                  onClick={() => void ask(topic.label)}
                  className="shrink-0 rounded-full border border-outline-variant bg-surface-container-low px-sm py-1 text-label-md text-primary transition-colors hover:border-secondary-container hover:bg-secondary-container/40 disabled:opacity-60"
                >
                  {topic.label}
                </button>
              ))}
            </div>
            <form
              className="flex items-center gap-xs"
              onSubmit={(event) => {
                event.preventDefault();
                void ask(input);
              }}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Digite sua dúvida…"
                disabled={pending}
                className="input-glow min-w-0 flex-1 rounded-full border border-outline-variant bg-surface-container-low px-md py-sm text-body-md outline-none focus:border-primary disabled:opacity-70"
              />
              <button
                type="submit"
                aria-label="Enviar"
                disabled={pending || !input.trim()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container transition-colors hover:bg-secondary-fixed disabled:opacity-50"
              >
                <Icon name="send" className="text-[20px]" />
              </button>
            </form>
          </div>
        </section>
      ) : null}

      {!open && !hintSeen ? (
        <div className="pointer-events-auto relative mb-1 max-w-[14rem] rounded-2xl rounded-br-md bg-primary px-md py-sm text-label-md text-on-primary shadow-elevation-1 animate-[login-rise_0.45s_ease-out_both]">
          Precisa de ajuda? É só clicar aqui.
          <button
            type="button"
            aria-label="Dispensar dica"
            onClick={dismissHint}
            className="absolute -left-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-surface-container-lowest text-primary ring-1 ring-outline-variant"
          >
            <Icon name="close" className="text-[14px]" />
          </button>
        </div>
      ) : null}

      <button
        type="button"
        aria-label={open ? "Fechar assistente" : "Abrir assistente"}
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openChat())}
        className="pointer-events-auto group relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-[0_16px_32px_-12px_color-mix(in_oklch,var(--primary)_70%,transparent)] transition-[transform,background-color] hover:scale-105 hover:bg-primary-container active:scale-95"
      >
        {!open ? (
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-secondary-container/35 animate-[login-pulse_2.8s_ease-in-out_infinite]"
          />
        ) : null}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border border-secondary-container/50 animate-[login-orbit_8s_linear_infinite]"
        />
        <Icon name={open ? "close" : "chat"} className="relative text-[26px]" />
      </button>
    </div>
  );
}
