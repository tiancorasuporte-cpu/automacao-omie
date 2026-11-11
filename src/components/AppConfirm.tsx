import { useCallback, useState, type ReactNode } from "react";

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
 * z-index alto para aparecer acima de SoftDialog / sheets.
 */
export function useAppConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

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

  const ConfirmHost: ReactNode = pending ? (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={() => finish(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") finish(false);
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-confirm-title"
        aria-describedby="app-confirm-desc"
        className="w-full max-w-md overflow-hidden rounded-lg border border-neutral-800 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b-2 border-[#F5C518] bg-neutral-950 px-xl py-md">
          <h2
            id="app-confirm-title"
            className="text-title-md font-bold uppercase tracking-wide text-white"
          >
            {pending.title}
          </h2>
        </div>
        <div className="px-xl py-md">
          <p id="app-confirm-desc" className="text-body-md text-on-surface">
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
              pending.danger &&
                "bg-red-600 text-white hover:bg-red-700",
            )}
            onClick={() => finish(true)}
            autoFocus
          >
            {pending.confirmLabel ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, ConfirmHost };
}
