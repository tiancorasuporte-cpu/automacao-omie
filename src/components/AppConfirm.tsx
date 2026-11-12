import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import {
  softCancelBtnClass,
  softPrimaryBtnClass,
} from "@/components/SoftOsDialog";
import { cn } from "@/lib/utils";

export type AppConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Botão de confirmação em vermelho (exclusões). */
  danger?: boolean;
};

type PendingConfirm = AppConfirmOptions & {
  resolve: (ok: boolean) => void;
};

/**
 * Confirmação no visual Soft10 (substitui window.confirm do browser).
 * Porta para document.body — evita faixa fina por containing-block/overflow do AppShell.
 */
export function useAppConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const titleId = useId();
  const descId = useId();

  const confirm = useCallback((opts: AppConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const finish = useCallback((ok: boolean) => {
    setPending((cur) => {
      cur?.resolve(ok);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [pending, finish]);

  const ConfirmHost: ReactNode =
    pending && typeof document !== "undefined"
      ? createPortal(
          <div
            className="ancora-confirm-overlay"
            role="presentation"
            onClick={() => finish(false)}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={descId}
              className="ancora-confirm-panel flex flex-col overflow-hidden rounded-lg border border-neutral-800 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shrink-0 border-b-2 border-[#F5C518] bg-neutral-950 px-xl py-md">
                <h2
                  id={titleId}
                  className="text-title-md font-bold uppercase tracking-wide text-white"
                >
                  {pending.title}
                </h2>
              </div>
              <div className="px-xl py-md">
                <p id={descId} className="text-body-md text-on-surface">
                  {pending.description}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-sm border-t border-neutral-200 px-xl py-md">
                <button
                  type="button"
                  className={softCancelBtnClass}
                  onClick={() => finish(false)}
                >
                  {pending.cancelLabel ?? "Cancelar"}
                </button>
                <button
                  type="button"
                  className={cn(
                    softPrimaryBtnClass,
                    pending.danger && "bg-red-600 text-white hover:bg-red-700",
                  )}
                  onClick={() => finish(true)}
                  autoFocus
                >
                  {pending.confirmLabel ?? "OK"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return { confirm, ConfirmHost };
}
