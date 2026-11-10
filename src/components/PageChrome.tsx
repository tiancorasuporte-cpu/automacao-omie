import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Painel padrão Orçamentos: borda + surface-container-lowest. */
export function PageSection({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  /** Quando false, útil para tabelas full-bleed (só overflow + borda). */
  padded?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-outline-variant bg-surface-container-lowest",
        padded && "p-md",
        className,
      )}
    >
      {children}
    </section>
  );
}

/**
 * Banner de título das páginas (padrão Orçamentos):
 * faixa preta, título branco em caixa alta, ações à direita.
 */
export function PageTitle({
  title,
  subtitle,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-md rounded-xl bg-primary px-md py-md text-on-primary md:px-lg",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-headline-md font-bold uppercase tracking-wide text-on-primary md:text-headline-lg">
          {title}
        </h1>
        {subtitle != null ? (
          <p className="mt-xs text-label-md text-white/70 md:text-body-md">{subtitle}</p>
        ) : null}
      </div>
      {children ? (
        <div className="flex w-full flex-wrap items-center gap-sm sm:w-auto">{children}</div>
      ) : null}
    </div>
  );
}

/** Título + subtítulo + slot direito (filtros/ações). */
export function SectionHeader({
  title,
  subtitle,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-sm flex flex-wrap items-end justify-between gap-md", className)}>
      <div className="min-w-0">
        <p className="text-title-md text-on-surface">{title}</p>
        {subtitle != null ? (
          <p className="text-label-md text-on-surface-variant">{subtitle}</p>
        ) : null}
      </div>
      {children ? (
        <div className="flex w-full flex-wrap items-end gap-sm sm:w-auto">{children}</div>
      ) : null}
    </div>
  );
}

export const fieldClass =
  "mt-xs w-full rounded-lg border border-outline-variant bg-surface px-sm py-xs text-body-md outline-none focus:border-primary disabled:opacity-60";

export const filterControlClass =
  "rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md";

/** Outline cinza — Editar / Duplicar / Ver */
export const btnOutline =
  "inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary hover:bg-surface-container-high disabled:opacity-50";

/** Outline claro — ações secundárias no PageTitle (faixa preta). */
export const btnOnPrimaryOutline =
  "inline-flex items-center gap-xs rounded-lg border border-white/40 px-sm py-xs text-label-md text-on-primary hover:bg-white/10 disabled:opacity-50";

/** Botão preto sólido — Salvar / ação principal escura (como Orçamentos). */
export const btnDark =
  "inline-flex items-center gap-xs rounded-lg bg-primary px-sm py-xs text-label-md font-semibold text-on-primary disabled:opacity-50";

/** CTA amarelo Âncora — Novo / Omie / Adicionar (como Orçamentos). */
export const btnPrimary =
  "inline-flex items-center gap-xs rounded-lg bg-secondary-container px-sm py-xs text-label-md font-semibold text-on-secondary-container disabled:opacity-50";

/** Alias: amarelo brand */
export const btnSecondary = btnPrimary;

export const btnMuted =
  "inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50";

export const btnDanger =
  "inline-flex items-center gap-xs rounded-lg border border-red-200 bg-red-50 px-sm py-xs text-label-md text-red-700 hover:bg-red-100 disabled:opacity-50";

export const mobileCardClass =
  "rounded-xl border border-outline-variant bg-surface p-md";

/** Cabeçalho de tabela escuro com texto branco (como Orçamentos). */
export const tableHeadClass =
  "bg-primary text-label-md font-semibold uppercase tracking-wide text-on-primary";

export const tableHeadCellClass = "px-sm py-xs";

export const feedbackOkClass =
  "rounded-lg border border-emerald-300 bg-emerald-50 px-md py-sm text-body-md text-emerald-900";

export const feedbackErrClass =
  "rounded-lg border border-red-300 bg-red-50 px-md py-sm text-body-md text-red-900";

/** Badges de status no contraste amarelo/preto Âncora. */
export function statusBadgeClass(kind: "yellow" | "dark" | "blue" | "green" | "neutral" | "red") {
  switch (kind) {
    case "yellow":
      return "rounded px-sm py-2xs text-label-sm font-bold uppercase tracking-wide bg-secondary-container text-on-secondary-container";
    case "dark":
      return "rounded px-sm py-2xs text-label-sm font-bold uppercase tracking-wide bg-primary text-secondary-container";
    case "blue":
      return "rounded px-sm py-2xs text-label-sm font-bold uppercase tracking-wide bg-sky-100 text-sky-900 ring-1 ring-sky-700/30";
    case "green":
      return "rounded px-sm py-2xs text-label-sm font-bold uppercase tracking-wide bg-emerald-100 text-emerald-900";
    case "red":
      return "rounded px-sm py-2xs text-label-sm font-bold uppercase tracking-wide bg-red-100 text-red-800";
    default:
      return "rounded px-sm py-2xs text-label-sm font-bold uppercase tracking-wide bg-surface-container text-on-surface-variant";
  }
}
