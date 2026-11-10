import type { ReactNode } from "react";

import {
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Painel Soft10: header preto colado, sem padding padrão do dialog. */
export const softDialogContentClass = cn(
  "gap-0 overflow-hidden p-0",
  "[&>button]:right-4 [&>button]:top-4 [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:opacity-100 [&>button]:focus:ring-amber-300",
);

export const softFieldLabelClass =
  "flex flex-col gap-2xs text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant";

export const softInputClass =
  "w-full rounded-md border border-neutral-300 bg-white px-md py-sm text-body-md font-normal normal-case tracking-normal text-on-surface outline-none focus:border-neutral-800 focus:ring-1 focus:ring-neutral-800";

export const softPrimaryBtnClass =
  "inline-flex items-center justify-center gap-xs rounded-lg bg-[#F5C518] px-md py-sm text-label-md font-semibold text-neutral-950 hover:bg-[#e6b800] disabled:opacity-50";

export const softCancelBtnClass =
  "inline-flex items-center justify-center gap-xs rounded-lg border border-neutral-800 bg-white px-md py-sm text-label-md font-semibold text-on-surface hover:bg-neutral-50 disabled:opacity-50";

export function SoftDialogContent({
  className,
  children,
  size = "md",
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogContent> & {
  size?: "md" | "lg";
}) {
  return (
    <DialogContent
      className={cn(
        softDialogContentClass,
        size === "lg" && "dialog-lg",
        className,
      )}
      {...props}
    >
      {children}
    </DialogContent>
  );
}

export function SoftDialogHeader({
  eyebrow,
  title,
}: {
  eyebrow?: string | null;
  title: string;
}) {
  return (
    <DialogHeader className="gap-0 border-b-2 border-[#F5C518] bg-neutral-950 px-xl py-md pr-3xl text-left">
      {eyebrow ? (
        <p className="text-label-sm font-bold tracking-wide text-[#F5C518]">{eyebrow}</p>
      ) : null}
      <DialogTitle className="text-title-md font-bold uppercase tracking-wide text-white">
        {title}
      </DialogTitle>
    </DialogHeader>
  );
}

export function SoftDialogBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex max-h-[min(70vh,42rem)] flex-col gap-md overflow-y-auto px-xl py-md",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SoftDialogFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <DialogFooter
      className={cn("mt-0 border-t border-outline-variant/50 px-xl py-md", className)}
    >
      {children}
    </DialogFooter>
  );
}

export function SoftSummaryCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-outline-variant bg-surface px-md py-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}
