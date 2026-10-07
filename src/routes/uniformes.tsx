import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { z } from "zod";

import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { PhotoCapture, type CapturedPhoto } from "@/components/PhotoCapture";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import { TablePager, paginateList } from "@/components/TablePager";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_NAME } from "@/lib/brand";
import { requireModule } from "@/lib/require-auth";
import { matchesQuery } from "@/lib/text-search";
import {
  adjustUniformItemFn,
  createUniformMovementFn,
  getUniformItemPhotoFn,
  getUniformMovementMediaFn,
  getUniformesBootstrapFn,
  importUniformCollaboratorsFn,
  removeUniformCollaboratorFn,
  removeUniformItemFn,
  restockUniformItemFn,
  reverseUniformMovementFn,
  saveUniformCollaboratorFn,
  saveUniformItemFn,
} from "@/lib/uniformes";
import {
  downloadUniformesExcel,
  printUniformFicha,
  printUniformTermo,
} from "@/lib/uniformes-docs";
import {
  UNIFORM_CATEGORIES,
  UNIFORM_MOVEMENT_TYPES,
  UNIFORM_REPLACEMENT_WARNING_DAYS,
  UNIFORM_STOCK_MOVE_TYPES,
  formatBRL,
  itemLabel,
  uniformConditionLabel,
  type UniformCondition,
  type UniformMovementType,
} from "@/lib/uniformes-domain";
import { cn } from "@/lib/utils";

const TAB_IDS = ["painel", "movimentar", "historico", "estoque", "colaboradores", "relatorios"] as const;

const searchSchema = z.object({
  tab: z.enum(TAB_IDS).catch("painel"),
});

export const Route = createFileRoute("/uniformes")({
  validateSearch: searchSchema,
  beforeLoad: () => requireModule("uniformes"),
  loader: () => getUniformesBootstrapFn(),
  head: () => ({
    meta: [{ title: `Uniformes — ${APP_NAME}` }],
  }),
  component: UniformesPage,
});

type TabId = (typeof TAB_IDS)[number];
type Boot = Awaited<ReturnType<typeof getUniformesBootstrapFn>>;
type Collaborator = Boot["collaborators"][number];
type Item = Boot["items"][number];
type Movement = Boot["movements"][number];
type Holding = Boot["holdings"][number];
type PageSize = 10 | 20 | 50 | 100;
type MovementPreset = { collaboratorId?: number; tipo?: UniformMovementType; itemId?: number };

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "painel", label: "Painel", icon: "dashboard" },
  { id: "movimentar", label: "Movimentar", icon: "swap_horiz" },
  { id: "historico", label: "Histórico", icon: "history" },
  { id: "estoque", label: "Estoque", icon: "inventory_2" },
  { id: "colaboradores", label: "Colaboradores", icon: "badge" },
  { id: "relatorios", label: "Relatórios", icon: "bar_chart" },
];

const INPUT =
  "w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md disabled:opacity-60";
const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-xs rounded-lg bg-primary px-md py-sm text-label-md font-semibold text-on-primary disabled:opacity-50";
const BTN_ACCENT =
  "inline-flex items-center justify-center gap-xs rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container disabled:opacity-50";
const BTN_OUTLINE =
  "inline-flex items-center justify-center gap-xs rounded-lg border border-outline-variant bg-surface px-md py-sm text-label-md font-semibold text-primary hover:bg-surface-container-high disabled:opacity-50";
const BTN_SMALL =
  "inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary hover:bg-surface-container-high disabled:opacity-50";
const CARD = "rounded-xl border border-outline-variant bg-surface-container-lowest";

// ---------- helpers ----------

function localIsoDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthStartIso() {
  const now = new Date();
  return localIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

function isoOf(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value.slice(0, 10) : localIsoDate(d);
}

function dateBr(value: string | null | undefined) {
  if (!value) return "—";
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("pt-BR");
}

function dateTimeBr(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function daysUntil(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y!, (m ?? 1) - 1, d ?? 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function sizesHint(c: Collaborator) {
  const parts = [
    c.tamanhoCamisa ? `Camisa ${c.tamanhoCamisa}` : null,
    c.tamanhoCalca ? `Calça ${c.tamanhoCalca}` : null,
    c.tamanhoCalcado ? `Calçado ${c.tamanhoCalcado}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function movementTone(tipo: string) {
  if (tipo === "entrega") return "bg-sky-100 text-sky-900";
  if (tipo === "troca") return "bg-amber-100 text-amber-900";
  return "bg-emerald-100 text-emerald-900";
}

// ---------- shared UI ----------

type PickOption = { id: string; title: string; subtitle?: string | null; thumb?: string | null; disabled?: boolean };

function SearchPick({
  label,
  value,
  options,
  placeholder,
  onChange,
  keepOpenOnSelect,
}: {
  label: string;
  value: string;
  options: PickOption[];
  placeholder: string;
  onChange: (id: string) => void;
  keepOpenOnSelect?: boolean;
}) {
  const selected = keepOpenOnSelect ? null : (options.find((o) => o.id === value) ?? null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(
    () => options.filter((o) => matchesQuery(query, [o.title, o.subtitle])).slice(0, 40),
    [options, query],
  );

  if (selected) {
    return (
      <div className="space-y-xs">
        <span className="text-label-md text-primary">{label}</span>
        <div className="flex min-h-11 items-center justify-between gap-sm rounded-lg border border-outline-variant bg-surface px-sm py-sm">
          <div className="min-w-0">
            <p className="truncate text-body-md text-on-surface">{selected.title}</p>
            {selected.subtitle ? (
              <p className="truncate text-label-md text-on-surface-variant">{selected.subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg px-sm py-xs text-label-md font-semibold text-primary hover:bg-surface-container-high"
            onClick={() => {
              onChange("");
              setQuery("");
              setOpen(true);
            }}
          >
            Trocar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-xs" ref={rootRef}>
      <span className="text-label-md text-primary">{label}</span>
      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute left-sm top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant"
        />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-outline-variant bg-surface py-sm pl-[40px] pr-sm text-body-md"
        />
        {open ? (
          <ul className="absolute z-30 mt-xs max-h-72 w-full overflow-auto rounded-lg border border-outline-variant bg-surface shadow-lg">
            {filtered.length === 0 ? (
              <li className="px-sm py-md text-body-md text-on-surface-variant">Nenhum resultado</li>
            ) : (
              filtered.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    disabled={option.disabled}
                    className="flex w-full items-center gap-sm px-sm py-sm text-left hover:bg-surface-container-high disabled:opacity-50"
                    onClick={() => {
                      onChange(option.id);
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    {option.thumb !== undefined ? (
                      <Thumb src={option.thumb ?? null} className="h-10 w-10" />
                    ) : null}
                    <span className="min-w-0">
                      <span className="block truncate text-body-md text-on-surface">{option.title}</span>
                      {option.subtitle ? (
                        <span className="block truncate text-label-md text-on-surface-variant">
                          {option.subtitle}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function Thumb({ src, className }: { src: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-container text-on-surface-variant",
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <Icon name="checkroom" className="text-[22px]" />
      )}
    </span>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-xs">
      <span className="text-label-md text-primary">{label}</span>
      {children}
      {hint ? <span className="block text-label-md text-on-surface-variant">{hint}</span> : null}
    </label>
  );
}

function PageSizeSelect({ value, onChange }: { value: PageSize; onChange: (v: PageSize) => void }) {
  return (
    <Field label="Por página">
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as PageSize)}
        className={cn(INPUT, "sm:w-24")}
      >
        {[10, 20, 50, 100].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </Field>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="inline-flex items-center overflow-hidden rounded-lg border border-outline-variant">
      <button
        type="button"
        aria-label="Diminuir"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-9 w-9 items-center justify-center hover:bg-surface-container-high disabled:opacity-40"
      >
        <Icon name="remove" className="text-[18px]" />
      </button>
      <span className="min-w-8 text-center text-body-md font-semibold">{value}</span>
      <button
        type="button"
        aria-label="Aumentar"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex h-9 w-9 items-center justify-center hover:bg-surface-container-high disabled:opacity-40"
      >
        <Icon name="add" className="text-[18px]" />
      </button>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-xs px-md py-xl text-center text-on-surface-variant">
      <Icon name={icon} className="text-[32px]" />
      <p className="text-body-md">{text}</p>
    </div>
  );
}

function ImageViewer({ src, onClose }: { src: string | null; onClose: () => void }) {
  return (
    <Dialog open={src != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[min(56rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>Foto</DialogTitle>
        </DialogHeader>
        {src ? (
          <img src={src} alt="Foto ampliada" className="max-h-[75vh] w-full rounded-lg object-contain" />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ---------- page ----------

function UniformesPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<{ key: number; value: MovementPreset }>({ key: 0, value: {} });

  const setTab = (tab: TabId) => {
    void navigate({ search: (prev) => ({ ...prev, tab }) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const flash = (ok: string | null, err: string | null = null) => {
    setMessage(ok);
    setError(err);
  };

  const refresh = async () => {
    await router.invalidate();
  };

  const startMovement = (value: MovementPreset) => {
    setPreset((prev) => ({ key: prev.key + 1, value }));
    flash(null);
    setTab("movimentar");
  };

  const ctx: SectionCtx = { data, flash, refresh, startMovement, setTab };

  return (
    <AppShell mobileTitle="Uniformes">
      <main className="relative flex-1 p-margin-mobile md:p-margin-desktop">
        <div className="mx-auto max-w-6xl space-y-lg">
          <div className="flex flex-col gap-md lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-label-md font-semibold uppercase tracking-wide text-secondary">
                Almoxarifado
              </p>
              <h2 className="mt-xs text-headline-md tracking-tight text-primary sm:text-headline-lg">
                Gestão de uniformes
              </h2>
              <p className="mt-xs hidden max-w-[42rem] text-body-lg text-on-surface-variant sm:block">
                Estoque com foto das peças, entregas, trocas e devoluções com assinatura, termo de
                responsabilidade e alerta de troca por vida útil.
              </p>
            </div>
            <div className="flex gap-sm">
              <button type="button" className={BTN_OUTLINE} onClick={() => setTab("estoque")}>
                <Icon name="add_a_photo" className="text-[18px]" />
                Nova peça
              </button>
              <button
                type="button"
                className={BTN_ACCENT}
                onClick={() => startMovement({ tipo: "entrega" })}
              >
                <Icon name="outbox" className="text-[18px]" />
                Nova entrega
              </button>
            </div>
          </div>

          <div className="sticky top-0 z-20 -mx-margin-mobile border-b border-outline-variant/70 bg-background/95 px-margin-mobile py-sm backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
            <div className="flex gap-sm overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] md:flex-wrap md:overflow-visible [&::-webkit-scrollbar]:hidden">
              {TABS.map((tab) => {
                const active = search.tab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTab(tab.id)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-xs rounded-lg px-md py-sm text-label-md font-semibold transition-colors",
                      active
                        ? "bg-secondary-container text-primary"
                        : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container",
                    )}
                  >
                    <Icon name={tab.icon} className="text-[18px]" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {message || error ? (
            <div
              className={cn(
                "flex items-start justify-between gap-sm rounded-xl border px-md py-sm text-body-md",
                error
                  ? "border-error/40 bg-error/10 text-error"
                  : "border-secondary/30 bg-secondary-container/40 text-primary",
              )}
            >
              <span>{error ?? message}</span>
              <button type="button" aria-label="Fechar aviso" onClick={() => flash(null)}>
                <Icon name="close" className="text-[18px]" />
              </button>
            </div>
          ) : null}

          {search.tab === "painel" ? <PainelSection ctx={ctx} /> : null}
          {search.tab === "movimentar" ? (
            <MovimentarSection key={preset.key} ctx={ctx} preset={preset.value} />
          ) : null}
          {search.tab === "historico" ? <HistoricoSection ctx={ctx} /> : null}
          {search.tab === "estoque" ? <EstoqueSection ctx={ctx} /> : null}
          {search.tab === "colaboradores" ? <ColaboradoresSection ctx={ctx} /> : null}
          {search.tab === "relatorios" ? <RelatoriosSection ctx={ctx} /> : null}
        </div>
      </main>
    </AppShell>
  );
}

type SectionCtx = {
  data: Boot;
  flash: (ok: string | null, err?: string | null) => void;
  refresh: () => Promise<void>;
  startMovement: (preset: MovementPreset) => void;
  setTab: (tab: TabId) => void;
};

async function openTermo(movement: Movement, flash: SectionCtx["flash"]) {
  try {
    const media = await getUniformMovementMediaFn({ data: { id: movement.id } });
    printUniformTermo(movement, media.assinatura, APP_NAME);
  } catch (err) {
    flash(null, err instanceof Error ? err.message : "Falha ao abrir o termo.");
  }
}

// ---------- Painel ----------

function PainelSection({ ctx }: { ctx: SectionCtx }) {
  const { data, startMovement, setTab } = ctx;
  const collabById = useMemo(
    () => new Map(data.collaborators.map((c) => [c.id, c])),
    [data.collaborators],
  );

  const stats = useMemo(() => {
    const active = data.items.filter((i) => i.active);
    const monthStart = monthStartIso();
    const monthMovs = data.movements.filter(
      (m) => m.status === "ativo" && isoOf(m.createdAt) >= monthStart,
    );
    const saidasMes = monthMovs.flatMap((m) => m.items.filter((i) => i.direcao === "saida"));
    return {
      pecas: active.reduce((s, i) => s + i.quantidade, 0),
      valor: active.reduce((s, i) => s + i.quantidade * i.custo, 0),
      comUniforme: new Set(data.holdings.map((h) => h.collaboratorId)).size,
      ativos: data.collaborators.filter((c) => c.active).length,
      entreguesMes: saidasMes.reduce((s, i) => s + i.quantidade, 0),
      custoMes: saidasMes.reduce((s, i) => s + i.quantidade * i.custoUnitario, 0),
    };
  }, [data]);

  const lowStock = data.items.filter((i) => i.baixo);
  const replacements = useMemo(
    () =>
      data.holdings
        .filter((h) => h.proximaTroca && daysUntil(h.proximaTroca) <= UNIFORM_REPLACEMENT_WARNING_DAYS)
        .sort((a, b) => (a.proximaTroca! < b.proximaTroca! ? -1 : 1)),
    [data.holdings],
  );

  const cards = [
    { label: "Peças em estoque", value: stats.pecas.toLocaleString("pt-BR"), icon: "inventory_2" },
    { label: "Valor em estoque", value: formatBRL(stats.valor), icon: "payments" },
    { label: "Com uniforme", value: `${stats.comUniforme} / ${stats.ativos}`, icon: "groups" },
    {
      label: "Entregues no mês",
      value: `${stats.entreguesMes}`,
      sub: formatBRL(stats.custoMes),
      icon: "outbox",
    },
  ];

  return (
    <section className="space-y-lg">
      <div className="grid grid-cols-2 gap-sm xl:grid-cols-4 xl:gap-md">
        {cards.map((card) => (
          <div key={card.label} className={cn(CARD, "p-sm sm:p-md")}>
            <div className="flex items-start justify-between gap-xs">
              <p className="text-label-md text-on-surface-variant">{card.label}</p>
              <Icon name={card.icon} className="hidden text-[22px] text-secondary sm:inline" />
            </div>
            <p className="mt-sm text-title-lg font-semibold text-primary sm:text-headline-md">
              {card.value}
            </p>
            {card.sub ? <p className="text-label-md text-on-surface-variant">{card.sub}</p> : null}
          </div>
        ))}
      </div>

      <div className="grid gap-lg lg:grid-cols-2">
        <div className={cn(CARD, "overflow-hidden")}>
          <div className="flex items-center justify-between gap-sm border-b border-outline-variant px-md py-sm">
            <div>
              <h3 className="text-title-md text-primary">Trocas previstas</h3>
              <p className="text-label-md text-on-surface-variant">
                Peças vencidas ou vencendo em até {UNIFORM_REPLACEMENT_WARNING_DAYS} dias
              </p>
            </div>
            <Icon name="event_repeat" className="text-[22px] text-secondary" />
          </div>
          {replacements.length === 0 ? (
            <EmptyState icon="task_alt" text="Nenhuma troca prevista. Defina a vida útil das peças no estoque." />
          ) : (
            <ul className="max-h-96 divide-y divide-outline-variant/60 overflow-auto">
              {replacements.slice(0, 30).map((h) => {
                const days = daysUntil(h.proximaTroca!);
                const collab = collabById.get(h.collaboratorId);
                return (
                  <li key={`${h.collaboratorId}-${h.itemId}`} className="flex items-center gap-sm px-md py-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-md text-on-surface">{collab?.nome ?? "—"}</p>
                      <p className="truncate text-label-md text-on-surface-variant">
                        {h.quantidade}× {itemLabel(h.descricao, h.tamanho)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-sm py-0.5 text-label-md font-semibold",
                        days < 0 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900",
                      )}
                    >
                      {days < 0 ? `Vencida há ${-days}d` : days === 0 ? "Vence hoje" : `Em ${days}d`}
                    </span>
                    <button
                      type="button"
                      className={BTN_SMALL}
                      onClick={() => startMovement({ collaboratorId: h.collaboratorId, tipo: "troca" })}
                    >
                      Trocar
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className={cn(CARD, "overflow-hidden")}>
          <div className="flex items-center justify-between gap-sm border-b border-outline-variant px-md py-sm">
            <div>
              <h3 className="text-title-md text-primary">Estoque baixo</h3>
              <p className="text-label-md text-on-surface-variant">Saldo igual ou abaixo do mínimo</p>
            </div>
            <Icon name="warning" className="text-[22px] text-error" />
          </div>
          {lowStock.length === 0 ? (
            <EmptyState icon="check_circle" text="Nenhuma peça abaixo do mínimo." />
          ) : (
            <ul className="max-h-96 divide-y divide-outline-variant/60 overflow-auto">
              {lowStock.map((item) => (
                <li key={item.id} className="flex items-center gap-sm px-md py-sm">
                  <Thumb src={item.fotoThumb} className="h-10 w-10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-md text-on-surface">
                      {itemLabel(item.nome, item.tamanho)}
                    </p>
                    <p className="text-label-md text-on-surface-variant">
                      Saldo {item.quantidade} · mínimo {item.estoqueMinimo}
                    </p>
                  </div>
                  <button type="button" className={BTN_SMALL} onClick={() => setTab("estoque")}>
                    Abastecer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className={cn(CARD, "overflow-hidden")}>
        <div className="flex items-center justify-between gap-sm border-b border-outline-variant px-md py-sm">
          <h3 className="text-title-md text-primary">Últimas movimentações</h3>
          <button type="button" className={BTN_SMALL} onClick={() => setTab("historico")}>
            Ver todas
          </button>
        </div>
        {data.movements.length === 0 ? (
          <EmptyState icon="swap_horiz" text="Nenhuma movimentação registrada ainda." />
        ) : (
          <ul className="divide-y divide-outline-variant/60">
            {data.movements.slice(0, 6).map((m) => (
              <li key={m.id} className="flex items-center gap-sm px-md py-sm">
                <span className={cn("rounded-full px-sm py-0.5 text-label-md font-semibold", movementTone(m.tipo))}>
                  {m.tipoLabel}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-body-md", m.status === "estornado" && "line-through opacity-60")}>
                    {m.collaboratorNome}
                  </p>
                  <p className="truncate text-label-md text-on-surface-variant">
                    {m.items.map((i) => `${i.quantidade}× ${itemLabel(i.descricao, i.tamanho)}`).join(", ")}
                  </p>
                </div>
                <span className="shrink-0 text-label-md text-on-surface-variant">{dateTimeBr(m.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ---------- Movimentar ----------

function MovimentarSection({ ctx, preset }: { ctx: SectionCtx; preset: MovementPreset }) {
  const { data, flash, refresh, setTab } = ctx;
  const [tipo, setTipo] = useState<UniformMovementType>(preset.tipo ?? "entrega");
  const [collaboratorId, setCollaboratorId] = useState(
    preset.collaboratorId ? String(preset.collaboratorId) : "",
  );
  const [saidas, setSaidas] = useState<Array<{ itemId: number; quantidade: number }>>(
    preset.itemId ? [{ itemId: preset.itemId, quantidade: 1 }] : [],
  );
  const [devolver, setDevolver] = useState<Record<number, { quantidade: number; condicao: UniformCondition }>>({});
  const [fotos, setFotos] = useState<CapturedPhoto[]>([]);
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ id: number; nome: string } | null>(null);
  const sigRef = useRef<SignaturePadHandle>(null);

  const itemById = useMemo(() => new Map(data.items.map((i) => [i.id, i])), [data.items]);
  const collaborator = data.collaborators.find((c) => String(c.id) === collaboratorId) ?? null;
  const holdings = useMemo(
    () => data.holdings.filter((h) => String(h.collaboratorId) === collaboratorId),
    [data.holdings, collaboratorId],
  );

  const showSaidas = tipo !== "devolucao";
  const showEntradas = tipo !== "entrega";
  const defaultCondition: UniformCondition = tipo === "troca" ? "descarte" : "reaproveitavel";

  useEffect(() => {
    setDevolver({});
    if (tipo === "devolucao") setSaidas([]);
  }, [tipo, collaboratorId]);

  const collabOptions = useMemo<PickOption[]>(
    () =>
      data.collaborators
        .filter((c) => c.active)
        .map((c) => ({
          id: String(c.id),
          title: c.nome,
          subtitle: [c.matricula ? `Mat. ${c.matricula}` : null, c.departamento, c.cargo]
            .filter(Boolean)
            .join(" · ") || null,
        })),
    [data.collaborators],
  );

  const itemOptions = useMemo<PickOption[]>(
    () =>
      data.items
        .filter((i) => i.active)
        .map((i) => ({
          id: String(i.id),
          title: itemLabel(i.nome, i.tamanho),
          subtitle: `${i.quantidade > 0 ? `Saldo ${i.quantidade}` : "Sem estoque"}${i.categoria ? ` · ${i.categoria}` : ""}`,
          thumb: i.fotoThumb,
          disabled: i.quantidade <= 0,
        })),
    [data.items],
  );

  const addItem = (id: string) => {
    const itemId = Number(id);
    if (!itemId) return;
    setSaidas((prev) =>
      prev.some((s) => s.itemId === itemId)
        ? prev.map((s) => (s.itemId === itemId ? { ...s, quantidade: s.quantidade + 1 } : s))
        : [...prev, { itemId, quantidade: 1 }],
    );
  };

  const entradasList = Object.entries(devolver)
    .map(([itemId, v]) => ({ itemId: Number(itemId), ...v }))
    .filter((e) => e.quantidade > 0);

  const totalSaida = saidas.reduce(
    (s, l) => s + l.quantidade * (itemById.get(l.itemId)?.custo ?? 0),
    0,
  );

  const reset = () => {
    setSaidas([]);
    setDevolver({});
    setFotos([]);
    setObservacao("");
    sigRef.current?.clear();
  };

  const submit = async () => {
    flash(null);
    if (!collaborator) return flash(null, "Selecione o colaborador.");
    if (showSaidas && saidas.length === 0) return flash(null, "Adicione ao menos uma peça entregue.");
    if (showEntradas && entradasList.length === 0) {
      return flash(null, "Informe as peças devolvidas pelo colaborador.");
    }
    const assinatura = sigRef.current?.toDataUrl() ?? null;
    if (!assinatura) return flash(null, "Colete a assinatura do colaborador.");
    setSaving(true);
    try {
      const result = await createUniformMovementFn({
        data: {
          collaboratorId: collaborator.id,
          tipo,
          observacao: observacao.trim() || null,
          assinatura,
          fotos,
          saidas: showSaidas ? saidas : [],
          entradas: showEntradas ? entradasList : [],
        },
      });
      if (!result.ok) return flash(null, result.error);
      setSaved({ id: result.movementId, nome: collaborator.nome });
      reset();
      await refresh();
      flash(`${UNIFORM_MOVEMENT_TYPES.find((t) => t.id === tipo)?.label} registrada para ${collaborator.nome}.`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      flash(null, err instanceof Error ? err.message : "Falha ao registrar.");
    } finally {
      setSaving(false);
    }
  };

  const savedMovement = saved ? data.movements.find((m) => m.id === saved.id) : undefined;

  return (
    <section className="space-y-lg">
      {saved ? (
        <div className="flex flex-col gap-sm rounded-xl border border-emerald-300 bg-emerald-50 p-md text-emerald-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-sm">
            <Icon name="task_alt" className="text-[28px]" />
            <div>
              <p className="font-semibold">Movimentação nº {saved.id} registrada</p>
              <p className="text-label-md">Imprima o termo para arquivar ou enviar ao colaborador.</p>
            </div>
          </div>
          <div className="flex gap-sm">
            <button
              type="button"
              className={BTN_OUTLINE}
              disabled={!savedMovement}
              onClick={() => savedMovement && void openTermo(savedMovement, flash)}
            >
              <Icon name="print" className="text-[18px]" />
              Imprimir termo
            </button>
            <button type="button" className={BTN_SMALL} onClick={() => setSaved(null)}>
              Nova
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-sm sm:grid-cols-3">
        {UNIFORM_MOVEMENT_TYPES.map((t) => {
          const active = tipo === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTipo(t.id)}
              className={cn(
                "flex items-start gap-sm rounded-xl border p-md text-left transition-colors",
                active
                  ? "border-secondary bg-secondary-container/50"
                  : "border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low",
              )}
            >
              <Icon name={t.icon} filled={active} className="text-[26px] text-primary" />
              <span>
                <span className="block text-title-md text-primary">{t.label}</span>
                <span className="block text-label-md text-on-surface-variant">{t.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-lg lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-lg">
          <div className={cn(CARD, "space-y-sm p-md")}>
            <SearchPick
              label="Colaborador"
              value={collaboratorId}
              options={collabOptions}
              placeholder="Buscar por nome, matrícula ou setor..."
              onChange={setCollaboratorId}
            />
            {collaboratorId === "" ? (
              <button type="button" className="text-label-md font-semibold text-primary underline" onClick={() => setTab("colaboradores")}>
                Colaborador não está na lista? Cadastre em Colaboradores
              </button>
            ) : null}
            {collaborator ? (
              <div className="flex flex-wrap gap-xs text-label-md">
                {sizesHint(collaborator) ? (
                  <span className="rounded-full bg-surface-container-high px-sm py-0.5">
                    <Icon name="straighten" className="mr-1 align-middle text-[14px]" />
                    {sizesHint(collaborator)}
                  </span>
                ) : null}
                <span className="rounded-full bg-surface-container-high px-sm py-0.5">
                  {holdings.reduce((s, h) => s + h.quantidade, 0)} peça(s) em posse
                </span>
              </div>
            ) : null}
          </div>

          {showEntradas ? (
            <div className={cn(CARD, "space-y-sm p-md")}>
              <div>
                <h3 className="text-title-md text-primary">Peças devolvidas</h3>
                <p className="text-label-md text-on-surface-variant">
                  Só aparecem peças que o colaborador tem em posse.
                </p>
              </div>
              {!collaborator ? (
                <p className="text-body-md text-on-surface-variant">Selecione o colaborador.</p>
              ) : holdings.length === 0 ? (
                <p className="text-body-md text-on-surface-variant">Este colaborador não tem peças em posse.</p>
              ) : (
                <ul className="space-y-sm">
                  {holdings.map((h) => {
                    const current = devolver[h.itemId] ?? { quantidade: 0, condicao: defaultCondition };
                    return (
                      <li key={h.itemId} className="flex flex-wrap items-center gap-sm rounded-lg border border-outline-variant p-sm">
                        <Thumb src={itemById.get(h.itemId)?.fotoThumb ?? null} className="h-12 w-12" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body-md">{itemLabel(h.descricao, h.tamanho)}</p>
                          <p className="text-label-md text-on-surface-variant">
                            Em posse: {h.quantidade}
                            {h.ultimaEntrega ? ` · entregue ${dateBr(h.ultimaEntrega)}` : ""}
                          </p>
                        </div>
                        <Stepper
                          value={current.quantidade}
                          min={0}
                          max={h.quantidade}
                          onChange={(quantidade) =>
                            setDevolver((prev) => ({ ...prev, [h.itemId]: { ...current, quantidade } }))
                          }
                        />
                        {current.quantidade > 0 ? (
                          <select
                            value={current.condicao}
                            onChange={(e) =>
                              setDevolver((prev) => ({
                                ...prev,
                                [h.itemId]: { ...current, condicao: e.target.value as UniformCondition },
                              }))
                            }
                            className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-xs text-label-md sm:w-auto"
                          >
                            <option value="reaproveitavel">Reaproveitável (volta ao estoque)</option>
                            <option value="descarte">Descarte (desgastada/danificada)</option>
                          </select>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}

          {showSaidas ? (
            <div className={cn(CARD, "space-y-sm p-md")}>
              <div className="flex items-center justify-between gap-sm">
                <h3 className="text-title-md text-primary">
                  {tipo === "troca" ? "Peças novas entregues" : "Peças entregues"}
                </h3>
                <span className="text-label-md text-on-surface-variant">{formatBRL(totalSaida)}</span>
              </div>
              <SearchPick
                label="Adicionar peça do estoque"
                value=""
                options={itemOptions}
                placeholder="Buscar peça ou tamanho..."
                onChange={addItem}
                keepOpenOnSelect
              />
              {saidas.length === 0 ? (
                <p className="rounded-lg border border-dashed border-outline-variant px-md py-md text-center text-body-md text-on-surface-variant">
                  Nenhuma peça adicionada.
                </p>
              ) : (
                <ul className="space-y-sm">
                  {saidas.map((line) => {
                    const item = itemById.get(line.itemId);
                    if (!item) return null;
                    return (
                      <li key={line.itemId} className="flex items-center gap-sm rounded-lg border border-outline-variant p-sm">
                        <Thumb src={item.fotoThumb} className="h-12 w-12" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body-md">{itemLabel(item.nome, item.tamanho)}</p>
                          <p className="text-label-md text-on-surface-variant">
                            Disponível {item.quantidade} · {formatBRL(item.custo)}
                            {item.vidaUtilMeses ? ` · troca em ${item.vidaUtilMeses} meses` : ""}
                          </p>
                        </div>
                        <Stepper
                          value={line.quantidade}
                          min={1}
                          max={item.quantidade}
                          onChange={(quantidade) =>
                            setSaidas((prev) => prev.map((s) => (s.itemId === line.itemId ? { ...s, quantidade } : s)))
                          }
                        />
                        <button
                          type="button"
                          aria-label="Remover peça"
                          className="rounded-lg p-xs text-error hover:bg-error/10"
                          onClick={() => setSaidas((prev) => prev.filter((s) => s.itemId !== line.itemId))}
                        >
                          <Icon name="delete" className="text-[20px]" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        <div className="space-y-lg">
          <div className={cn(CARD, "space-y-md p-md")}>
            <PhotoCapture
              photos={fotos}
              onChange={setFotos}
              max={6}
              label="Fotos das peças (opcional)"
            />
            <Field label="Observação">
              <textarea
                rows={2}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex.: peça rasgada na manga, entrega de admissão..."
                className={INPUT}
              />
            </Field>
          </div>

          <div className={cn(CARD, "space-y-sm p-md")}>
            <div>
              <h3 className="text-title-md text-primary">Assinatura do colaborador</h3>
              <p className="text-label-md text-on-surface-variant">
                Obrigatória. Vai impressa no termo de responsabilidade.
              </p>
            </div>
            <SignaturePad ref={sigRef} />
          </div>

          <button type="button" disabled={saving} onClick={() => void submit()} className={cn(BTN_PRIMARY, "w-full py-md")}>
            <Icon name={saving ? "hourglass_empty" : "check"} className="text-[20px]" />
            {saving ? "Registrando..." : `Registrar ${UNIFORM_MOVEMENT_TYPES.find((t) => t.id === tipo)?.label.toLowerCase()}`}
          </button>
        </div>
      </div>
    </section>
  );
}

// ---------- Histórico ----------

function HistoricoSection({ ctx }: { ctx: SectionCtx }) {
  const { data, flash, refresh } = ctx;
  const [query, setQuery] = useState("");
  const [tipo, setTipo] = useState<"" | UniformMovementType>("");
  const [status, setStatus] = useState<"ativo" | "estornado" | "">("");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [detail, setDetail] = useState<Movement | null>(null);
  const [reverseTarget, setReverseTarget] = useState<Movement | null>(null);

  const filtered = useMemo(
    () =>
      data.movements.filter((m) => {
        if (tipo && m.tipo !== tipo) return false;
        if (status && m.status !== status) return false;
        const day = isoOf(m.createdAt);
        if (dataDe && day < dataDe) return false;
        if (dataAte && day > dataAte) return false;
        return matchesQuery(query, [
          m.id,
          m.collaboratorNome,
          m.collaboratorMatricula,
          m.collaboratorDepartamento,
          m.createdByName,
          ...m.items.map((i) => itemLabel(i.descricao, i.tamanho)),
        ]);
      }),
    [data.movements, query, tipo, status, dataDe, dataAte],
  );

  useEffect(() => setPage(1), [query, tipo, status, dataDe, dataAte, pageSize]);
  const paged = paginateList(filtered, page, pageSize);

  return (
    <section className="space-y-md">
      <div className={cn(CARD, "grid gap-sm p-md sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]")}>
        <Field label="Buscar">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nº, colaborador, peça..." className={INPUT} />
        </Field>
        <Field label="Tipo">
          <select value={tipo} onChange={(e) => setTipo(e.target.value as "" | UniformMovementType)} className={INPUT}>
            <option value="">Todos</option>
            {UNIFORM_MOVEMENT_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as "" | "ativo" | "estornado")} className={INPUT}>
            <option value="">Todos</option>
            <option value="ativo">Ativos</option>
            <option value="estornado">Estornados</option>
          </select>
        </Field>
        <Field label="De">
          <input type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Até">
          <input type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} className={INPUT} />
        </Field>
        <PageSizeSelect value={pageSize} onChange={setPageSize} />
      </div>

      <div className={cn(CARD, "overflow-hidden")}>
        {paged.totalItems === 0 ? (
          <EmptyState icon="search_off" text="Nenhuma movimentação neste filtro." />
        ) : (
          <ul className="divide-y divide-outline-variant/60">
            {paged.items.map((m) => (
              <li key={m.id} className={cn("space-y-sm p-md", m.status === "estornado" && "bg-surface-container-low/60")}>
                <div className="flex flex-wrap items-start justify-between gap-sm">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-xs">
                      <span className="text-label-md text-on-surface-variant">nº {m.id}</span>
                      <span className={cn("rounded-full px-sm py-0.5 text-label-md font-semibold", movementTone(m.tipo))}>
                        {m.tipoLabel}
                      </span>
                      {m.status === "estornado" ? (
                        <span className="rounded-full bg-red-100 px-sm py-0.5 text-label-md font-semibold text-red-800">
                          Estornado
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-xs text-title-md text-primary">{m.collaboratorNome}</p>
                    <p className="text-label-md text-on-surface-variant">
                      {dateTimeBr(m.createdAt)}
                      {m.createdByName ? ` · por ${m.createdByName}` : ""}
                      {m.collaboratorDepartamento ? ` · ${m.collaboratorDepartamento}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    {m.totalSaida > 0 ? <p className="text-title-md font-semibold text-primary">{formatBRL(m.totalSaida)}</p> : null}
                    <p className="text-label-md text-on-surface-variant">
                      {m.hasAssinatura ? "✍ assinado" : "sem assinatura"}
                      {m.photoCount > 0 ? ` · 📷 ${m.photoCount}` : ""}
                    </p>
                  </div>
                </div>
                <ul className="grid gap-xs text-body-md sm:grid-cols-2">
                  {m.items.map((i) => (
                    <li key={i.id} className="flex items-center gap-xs">
                      <Icon
                        name={i.direcao === "saida" ? "north_east" : "south_west"}
                        className={cn("text-[16px]", i.direcao === "saida" ? "text-sky-700" : "text-emerald-700")}
                      />
                      <span className="truncate">
                        {i.quantidade}× {itemLabel(i.descricao, i.tamanho)}
                        {i.condicao ? ` (${uniformConditionLabel(i.condicao)})` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                {m.observacao ? <p className="text-label-md italic text-on-surface-variant">{m.observacao}</p> : null}
                {m.status === "estornado" ? (
                  <p className="text-label-md text-red-800">
                    Estornado {m.estornadoEm ? dateTimeBr(m.estornadoEm) : ""}
                    {m.estornadoPorNome ? ` por ${m.estornadoPorNome}` : ""}: {m.estornoMotivo}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-xs">
                  <button type="button" className={BTN_SMALL} onClick={() => setDetail(m)}>
                    <Icon name="visibility" className="text-[16px]" />
                    Detalhes
                  </button>
                  <button type="button" className={BTN_SMALL} onClick={() => void openTermo(m, flash)}>
                    <Icon name="print" className="text-[16px]" />
                    Termo
                  </button>
                  {m.status === "ativo" ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-xs rounded-lg border border-red-200 bg-red-50 px-sm py-xs text-label-md text-red-700 hover:bg-red-100"
                      onClick={() => setReverseTarget(m)}
                    >
                      <Icon name="undo" className="text-[16px]" />
                      Estornar
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        <TablePager
          page={paged.page}
          totalPages={paged.totalPages}
          totalItems={paged.totalItems}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>

      <MovementDetailDialog movement={detail} onClose={() => setDetail(null)} flash={flash} />
      <ReverseDialog
        movement={reverseTarget}
        onClose={() => setReverseTarget(null)}
        onDone={async (msg) => {
          setReverseTarget(null);
          await refresh();
          flash(msg);
        }}
        onError={(msg) => flash(null, msg)}
      />
    </section>
  );
}

function MovementDetailDialog({
  movement,
  onClose,
  flash,
}: {
  movement: Movement | null;
  onClose: () => void;
  flash: SectionCtx["flash"];
}) {
  const [media, setMedia] = useState<{ assinatura: string | null; photos: Array<{ id: number; foto: string }> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const flashRef = useRef(flash);
  flashRef.current = flash;
  const movementId = movement?.id ?? null;

  useEffect(() => {
    setMedia(null);
    if (movementId == null) return;
    let cancelled = false;
    setLoading(true);
    getUniformMovementMediaFn({ data: { id: movementId } })
      .then((result) => {
        if (!cancelled) setMedia(result);
      })
      .catch(() => {
        if (!cancelled) flashRef.current(null, "Falha ao carregar assinatura e fotos.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [movementId]);

  return (
    <>
      <Dialog open={movement != null} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {movement?.tipoLabel} nº {movement?.id}
            </DialogTitle>
            <DialogDescription>
              {movement ? `${movement.collaboratorNome} · ${dateTimeBr(movement.createdAt)}` : ""}
            </DialogDescription>
          </DialogHeader>
          {movement ? (
            <div className="space-y-md">
              <ul className="space-y-xs text-body-md">
                {movement.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-sm">
                    <span>
                      {i.direcao === "saida" ? "Entregue" : "Devolvida"}: {i.quantidade}× {itemLabel(i.descricao, i.tamanho)}
                      {i.condicao ? ` (${uniformConditionLabel(i.condicao)})` : ""}
                      {i.proximaTroca ? ` · troca ${dateBr(i.proximaTroca)}` : ""}
                    </span>
                    <span className="shrink-0 text-on-surface-variant">{formatBRL(i.quantidade * i.custoUnitario)}</span>
                  </li>
                ))}
              </ul>
              {loading ? <p className="text-label-md text-on-surface-variant">Carregando mídia...</p> : null}
              {media?.photos.length ? (
                <div className="grid grid-cols-3 gap-sm">
                  {media.photos.map((p) => (
                    <button key={p.id} type="button" onClick={() => setZoom(p.foto)} className="aspect-square overflow-hidden rounded-lg border border-outline-variant">
                      <img src={p.foto} alt="Foto da peça" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
              {media?.assinatura ? (
                <div>
                  <p className="text-label-md text-on-surface-variant">Assinatura</p>
                  <img src={media.assinatura} alt="Assinatura" className="mt-xs w-full rounded-lg border border-outline-variant bg-white" />
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <button
              type="button"
              className={BTN_OUTLINE}
              disabled={!movement}
              onClick={() => movement && printUniformTermo(movement, media?.assinatura ?? null, APP_NAME)}
            >
              <Icon name="print" className="text-[18px]" />
              Imprimir termo
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ImageViewer src={zoom} onClose={() => setZoom(null)} />
    </>
  );
}

function ReverseDialog({
  movement,
  onClose,
  onDone,
  onError,
}: {
  movement: Movement | null;
  onClose: () => void;
  onDone: (msg: string) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setMotivo(""), [movement]);

  return (
    <Dialog open={movement != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Estornar movimentação nº {movement?.id}</DialogTitle>
          <DialogDescription>
            O estoque volta ao que era antes e o registro fica marcado como estornado (não é apagado).
          </DialogDescription>
        </DialogHeader>
        <Field label="Motivo do estorno">
          <textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={INPUT} placeholder="Ex.: lançado para o colaborador errado" />
        </Field>
        <DialogFooter>
          <button type="button" className={BTN_OUTLINE} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || !motivo.trim() || !movement}
            className="inline-flex items-center justify-center gap-xs rounded-lg bg-error px-md py-sm text-label-md font-semibold text-on-error disabled:opacity-50"
            onClick={async () => {
              if (!movement) return;
              setSaving(true);
              try {
                const result = await reverseUniformMovementFn({ data: { id: movement.id, motivo } });
                if (!result.ok) onError(result.error);
                else await onDone(`Movimentação nº ${movement.id} estornada.`);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Estornando..." : "Confirmar estorno"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Estoque ----------

type ItemForm = {
  id: number;
  nome: string;
  categoria: string;
  tamanho: string;
  custo: string;
  estoqueMinimo: string;
  vidaUtilMeses: string;
  quantidadeInicial: string;
  active: boolean;
  photos: CapturedPhoto[];
  existingThumb: string | null;
  photoChanged: boolean;
};

const EMPTY_ITEM: ItemForm = {
  id: 0,
  nome: "",
  categoria: "",
  tamanho: "",
  custo: "",
  estoqueMinimo: "0",
  vidaUtilMeses: "",
  quantidadeInicial: "0",
  active: true,
  photos: [],
  existingThumb: null,
  photoChanged: false,
};

function parseMoney(value: string) {
  const n = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function EstoqueSection({ ctx }: { ctx: SectionCtx }) {
  const { data, flash, refresh, startMovement } = ctx;
  const [view, setView] = useState<"pecas" | "historico">("pecas");
  const [query, setQuery] = useState("");
  const [categoria, setCategoria] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(20);
  const [itemForm, setItemForm] = useState<ItemForm | null>(null);
  const [restock, setRestock] = useState<Item | null>(null);
  const [adjust, setAdjust] = useState<Item | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set([...UNIFORM_CATEGORIES, ...data.items.map((i) => i.categoria).filter((c): c is string => !!c)])],
    [data.items],
  );

  const filtered = useMemo(
    () =>
      data.items.filter((i) => {
        if (!showInactive && !i.active) return false;
        if (onlyLow && !i.baixo) return false;
        if (categoria && i.categoria !== categoria) return false;
        return matchesQuery(query, [i.nome, i.tamanho, i.categoria]);
      }),
    [data.items, query, categoria, onlyLow, showInactive],
  );
  useEffect(() => setPage(1), [query, categoria, onlyLow, showInactive, pageSize]);
  const paged = paginateList(filtered, page, pageSize);
  const lowCount = data.items.filter((i) => i.baixo).length;

  const openPhoto = async (item: Item) => {
    if (!item.hasFoto) return;
    setZoom(item.fotoThumb);
    const result = await getUniformItemPhotoFn({ data: { id: item.id } });
    if (result.foto) setZoom(result.foto);
  };

  const remove = async (item: Item) => {
    if (!confirm(`Remover ${itemLabel(item.nome, item.tamanho)}?`)) return;
    const result = await removeUniformItemFn({ data: { id: item.id } });
    if (!result.ok) return flash(null, result.error);
    await refresh();
    flash(result.deactivated ? "Peça tinha movimentações e foi desativada (histórico preservado)." : "Peça removida.");
  };

  return (
    <section className="space-y-md">
      <div className="flex flex-wrap items-center gap-sm">
        {(["pecas", "historico"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={cn(
              "rounded-lg px-md py-sm text-label-md font-semibold",
              view === v ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant",
            )}
          >
            {v === "pecas" ? `Peças (${data.items.filter((i) => i.active).length})` : "Histórico de estoque"}
          </button>
        ))}
        <div className="flex-1" />
        {view === "pecas" ? (
          <button type="button" className={BTN_ACCENT} onClick={() => setItemForm({ ...EMPTY_ITEM })}>
            <Icon name="add_a_photo" className="text-[18px]" />
            Nova peça
          </button>
        ) : null}
      </div>

      {view === "historico" ? (
        <StockHistory ctx={ctx} />
      ) : (
        <>
          <div className={cn(CARD, "grid gap-sm p-md sm:grid-cols-2 lg:grid-cols-[2fr_1fr_auto_auto]")}>
            <Field label="Buscar peça">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome ou tamanho..." className={INPUT} />
            </Field>
            <Field label="Categoria">
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={INPUT}>
                <option value="">Todas</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex flex-wrap items-end gap-sm">
              <button
                type="button"
                onClick={() => setOnlyLow((v) => !v)}
                className={cn(BTN_OUTLINE, onlyLow && "border-error bg-error/10 text-error")}
              >
                <Icon name="warning" className="text-[18px]" />
                Baixo ({lowCount})
              </button>
              <label className="flex items-center gap-xs py-sm text-label-md text-on-surface-variant">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                Inativas
              </label>
            </div>
            <PageSizeSelect value={pageSize} onChange={setPageSize} />
          </div>

          {paged.totalItems === 0 ? (
            <div className={CARD}>
              <EmptyState icon="checkroom" text="Nenhuma peça. Cadastre com foto em Nova peça." />
            </div>
          ) : (
            <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-3">
              {paged.items.map((item) => (
                <article key={item.id} className={cn(CARD, "flex flex-col overflow-hidden", !item.active && "opacity-60")}>
                  <button
                    type="button"
                    onClick={() => void openPhoto(item)}
                    className="relative aspect-[4/3] w-full bg-surface-container"
                    aria-label="Ver foto"
                  >
                    {item.fotoThumb ? (
                      <img src={item.fotoThumb} alt={item.nome} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full flex-col items-center justify-center gap-xs text-on-surface-variant">
                        <Icon name="checkroom" className="text-[40px]" />
                        <span className="text-label-md">Sem foto</span>
                      </span>
                    )}
                    <span
                      className={cn(
                        "absolute right-sm top-sm rounded-full px-sm py-0.5 text-label-md font-bold shadow",
                        item.baixo ? "bg-red-600 text-white" : "bg-emerald-600 text-white",
                      )}
                    >
                      {item.quantidade} em estoque
                    </span>
                  </button>
                  <div className="flex flex-1 flex-col gap-xs p-md">
                    <p className="text-title-md text-primary">{itemLabel(item.nome, item.tamanho)}</p>
                    <p className="text-label-md text-on-surface-variant">
                      {[item.categoria, `mín. ${item.estoqueMinimo}`, `custo ${formatBRL(item.custo)}`,
                        item.vidaUtilMeses ? `vida útil ${item.vidaUtilMeses}m` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="text-label-md text-on-surface-variant">
                      Valor em estoque: <strong>{formatBRL(item.custo * item.quantidade)}</strong>
                    </p>
                    <div className="mt-auto flex flex-wrap gap-xs pt-sm">
                      <button type="button" className={BTN_SMALL} disabled={!item.active} onClick={() => setRestock(item)}>
                        <Icon name="add_box" className="text-[16px]" />
                        Entrada
                      </button>
                      <button
                        type="button"
                        className={BTN_SMALL}
                        disabled={!item.active || item.quantidade === 0}
                        onClick={() => startMovement({ tipo: "entrega", itemId: item.id })}
                      >
                        <Icon name="outbox" className="text-[16px]" />
                        Entregar
                      </button>
                      <button type="button" className={BTN_SMALL} onClick={() => setAdjust(item)}>
                        <Icon name="tune" className="text-[16px]" />
                        Ajuste
                      </button>
                      <button
                        type="button"
                        className={BTN_SMALL}
                        onClick={() =>
                          setItemForm({
                            id: item.id,
                            nome: item.nome,
                            categoria: item.categoria ?? "",
                            tamanho: item.tamanho ?? "",
                            custo: String(item.custo).replace(".", ","),
                            estoqueMinimo: String(item.estoqueMinimo),
                            vidaUtilMeses: item.vidaUtilMeses ? String(item.vidaUtilMeses) : "",
                            quantidadeInicial: "0",
                            active: item.active,
                            photos: [],
                            existingThumb: item.fotoThumb,
                            photoChanged: false,
                          })
                        }
                      >
                        <Icon name="edit" className="text-[16px]" />
                      </button>
                      <button type="button" className={cn(BTN_SMALL, "text-error")} onClick={() => void remove(item)}>
                        <Icon name="delete" className="text-[16px]" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className={CARD}>
            <TablePager
              page={paged.page}
              totalPages={paged.totalPages}
              totalItems={paged.totalItems}
              pageSize={pageSize}
              onPageChange={setPage}
              className="border-t-0"
            />
          </div>
        </>
      )}

      <ItemDialog
        form={itemForm}
        categories={categories}
        onChange={setItemForm}
        onDone={async (msg) => {
          setItemForm(null);
          await refresh();
          flash(msg);
        }}
      />
      <RestockDialog
        item={restock}
        onClose={() => setRestock(null)}
        onDone={async (msg) => {
          setRestock(null);
          await refresh();
          flash(msg);
        }}
      />
      <AdjustDialog
        item={adjust}
        onClose={() => setAdjust(null)}
        onDone={async (msg) => {
          setAdjust(null);
          await refresh();
          flash(msg);
        }}
      />
      <ImageViewer src={zoom} onClose={() => setZoom(null)} />
    </section>
  );
}

function ItemDialog({
  form,
  categories,
  onChange,
  onDone,
}: {
  form: ItemForm | null;
  categories: string[];
  onChange: (form: ItemForm | null) => void;
  onDone: (msg: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [form?.id]);
  if (!form) return null;
  const set = (patch: Partial<ItemForm>) => onChange({ ...form, ...patch });
  const isNew = form.id === 0;

  const save = async () => {
    const custo = form.custo.trim() ? parseMoney(form.custo) : 0;
    if (!form.nome.trim()) return setError("Informe o nome da peça.");
    if (!Number.isFinite(custo) || custo < 0) return setError("Custo inválido.");
    setSaving(true);
    setError(null);
    try {
      const photo = form.photos[0] ?? null;
      const result = await saveUniformItemFn({
        data: {
          id: form.id,
          nome: form.nome,
          categoria: form.categoria || null,
          tamanho: form.tamanho || null,
          custo,
          estoqueMinimo: Math.max(0, Math.floor(Number(form.estoqueMinimo) || 0)),
          vidaUtilMeses: form.vidaUtilMeses ? Math.max(1, Math.floor(Number(form.vidaUtilMeses))) : null,
          active: form.active,
          ...(isNew ? { quantidadeInicial: Math.max(0, Math.floor(Number(form.quantidadeInicial) || 0)) } : {}),
          ...(isNew || form.photoChanged ? { photo } : {}),
        },
      });
      if (!result.ok) return setError(result.error);
      await onDone(isNew ? "Peça cadastrada." : "Peça atualizada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onChange(null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Nova peça" : "Editar peça"}</DialogTitle>
          <DialogDescription>Cada tamanho é uma peça separada no estoque.</DialogDescription>
        </DialogHeader>
        <div className="space-y-md">
          {form.existingThumb && !form.photoChanged ? (
            <div className="flex items-center gap-sm">
              <Thumb src={form.existingThumb} className="h-20 w-20" />
              <button type="button" className={BTN_SMALL} onClick={() => set({ photoChanged: true, photos: [] })}>
                Trocar foto
              </button>
            </div>
          ) : (
            <PhotoCapture
              photos={form.photos}
              onChange={(photos) => set({ photos, photoChanged: true })}
              max={1}
              label="Foto da peça"
            />
          )}
          <Field label="Nome da peça *">
            <input value={form.nome} onChange={(e) => set({ nome: e.target.value })} placeholder="Ex.: Camisa polo manga curta" className={INPUT} />
          </Field>
          <div className="grid grid-cols-2 gap-sm">
            <Field label="Categoria">
              <input list="uniform-categories" value={form.categoria} onChange={(e) => set({ categoria: e.target.value })} className={INPUT} />
              <datalist id="uniform-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Tamanho">
              <input value={form.tamanho} onChange={(e) => set({ tamanho: e.target.value })} placeholder="P, M, G, 42..." className={INPUT} />
            </Field>
            <Field label="Custo unitário (R$)">
              <input inputMode="decimal" value={form.custo} onChange={(e) => set({ custo: e.target.value })} placeholder="0,00" className={INPUT} />
            </Field>
            <Field label="Estoque mínimo">
              <input type="number" min={0} value={form.estoqueMinimo} onChange={(e) => set({ estoqueMinimo: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Vida útil (meses)" hint="Gera o alerta de troca">
              <input type="number" min={1} value={form.vidaUtilMeses} onChange={(e) => set({ vidaUtilMeses: e.target.value })} placeholder="Opcional" className={INPUT} />
            </Field>
            {isNew ? (
              <Field label="Quantidade inicial">
                <input type="number" min={0} value={form.quantidadeInicial} onChange={(e) => set({ quantidadeInicial: e.target.value })} className={INPUT} />
              </Field>
            ) : (
              <label className="flex items-end gap-xs pb-sm text-body-md">
                <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
                Ativa
              </label>
            )}
          </div>
          {!isNew ? (
            <p className="text-label-md text-on-surface-variant">
              O saldo muda só por Entrada ou Ajuste, para manter o histórico correto.
            </p>
          ) : null}
          {error ? <p className="rounded-lg bg-error/10 px-sm py-xs text-label-md text-error">{error}</p> : null}
        </div>
        <DialogFooter>
          <button type="button" className={BTN_OUTLINE} onClick={() => onChange(null)}>
            Cancelar
          </button>
          <button type="button" className={BTN_PRIMARY} disabled={saving} onClick={() => void save()}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RestockDialog({ item, onClose, onDone }: { item: Item | null; onClose: () => void; onDone: (msg: string) => Promise<void> }) {
  const [qtd, setQtd] = useState("1");
  const [custo, setCusto] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [documento, setDocumento] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQtd("1");
    setCusto(item ? String(item.custo).replace(".", ",") : "");
    setFornecedor("");
    setDocumento("");
    setError(null);
  }, [item]);

  if (!item) return null;
  const q = Math.floor(Number(qtd) || 0);
  const c = custo.trim() ? parseMoney(custo) : item.custo;
  const media = q > 0 && Number.isFinite(c) ? (item.quantidade * item.custo + q * c) / (item.quantidade + q) : item.custo;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Entrada de estoque</DialogTitle>
          <DialogDescription>{itemLabel(item.nome, item.tamanho)} · saldo atual {item.quantidade}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-sm">
          <Field label="Quantidade *">
            <input type="number" min={1} value={qtd} onChange={(e) => setQtd(e.target.value)} className={INPUT} />
          </Field>
          <Field label="Custo unitário (R$)">
            <input inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} className={INPUT} />
          </Field>
          <Field label="Fornecedor">
            <input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} className={INPUT} />
          </Field>
          <Field label="Nota fiscal / documento">
            <input value={documento} onChange={(e) => setDocumento(e.target.value)} className={INPUT} />
          </Field>
        </div>
        <p className="text-label-md text-on-surface-variant">
          Novo saldo: <strong>{item.quantidade + Math.max(0, q)}</strong> · custo médio: <strong>{formatBRL(media)}</strong>
        </p>
        {error ? <p className="rounded-lg bg-error/10 px-sm py-xs text-label-md text-error">{error}</p> : null}
        <DialogFooter>
          <button type="button" className={BTN_OUTLINE} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={saving || q <= 0 || !Number.isFinite(c)}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                const result = await restockUniformItemFn({
                  data: {
                    itemId: item.id,
                    quantidade: q,
                    custoUnitario: c,
                    fornecedor: fornecedor || null,
                    documento: documento || null,
                  },
                });
                if (!result.ok) return setError(result.error);
                await onDone(`Entrada de ${q} un. registrada. Saldo: ${result.saldo}.`);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Salvando..." : "Registrar entrada"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustDialog({ item, onClose, onDone }: { item: Item | null; onClose: () => void; onDone: (msg: string) => Promise<void> }) {
  const [nova, setNova] = useState("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNova(item ? String(item.quantidade) : "");
    setMotivo("");
    setError(null);
  }, [item]);

  if (!item) return null;
  const n = Math.floor(Number(nova));
  const delta = Number.isFinite(n) ? n - item.quantidade : 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajuste de inventário</DialogTitle>
          <DialogDescription>
            {itemLabel(item.nome, item.tamanho)} · saldo no sistema {item.quantidade}
          </DialogDescription>
        </DialogHeader>
        <Field label="Quantidade contada *">
          <input type="number" min={0} value={nova} onChange={(e) => setNova(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Motivo *">
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: contagem mensal, peça extraviada" className={INPUT} />
        </Field>
        {delta !== 0 ? (
          <p className={cn("text-label-md font-semibold", delta > 0 ? "text-emerald-700" : "text-error")}>
            Diferença: {delta > 0 ? "+" : ""}
            {delta}
          </p>
        ) : null}
        {error ? <p className="rounded-lg bg-error/10 px-sm py-xs text-label-md text-error">{error}</p> : null}
        <DialogFooter>
          <button type="button" className={BTN_OUTLINE} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={saving || !Number.isFinite(n) || n < 0 || !motivo.trim() || delta === 0}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                const result = await adjustUniformItemFn({ data: { itemId: item.id, novaQuantidade: n, motivo } });
                if (!result.ok) return setError(result.error);
                await onDone(`Estoque ajustado para ${result.saldo}.`);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Salvando..." : "Ajustar"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StockHistory({ ctx }: { ctx: SectionCtx }) {
  const { data } = ctx;
  const [query, setQuery] = useState("");
  const [tipo, setTipo] = useState("");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(20);

  const filtered = useMemo(
    () =>
      data.stockMoves.filter((s) => {
        if (tipo && s.tipo !== tipo) return false;
        const day = isoOf(s.createdAt);
        if (dataDe && day < dataDe) return false;
        if (dataAte && day > dataAte) return false;
        return matchesQuery(query, [s.itemNome, s.itemTamanho, s.fornecedor, s.documento, s.motivo, s.createdByName]);
      }),
    [data.stockMoves, query, tipo, dataDe, dataAte],
  );
  useEffect(() => setPage(1), [query, tipo, dataDe, dataAte, pageSize]);
  const paged = paginateList(filtered, page, pageSize);

  return (
    <div className="space-y-md">
      <div className={cn(CARD, "grid gap-sm p-md sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]")}>
        <Field label="Buscar">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Peça, fornecedor, NF, motivo..." className={INPUT} />
        </Field>
        <Field label="Tipo">
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={INPUT}>
            <option value="">Todos</option>
            {UNIFORM_STOCK_MOVE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="De">
          <input type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Até">
          <input type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} className={INPUT} />
        </Field>
        <PageSizeSelect value={pageSize} onChange={setPageSize} />
      </div>
      <div className={cn(CARD, "overflow-hidden")}>
        {paged.totalItems === 0 ? (
          <EmptyState icon="receipt_long" text="Nenhum lançamento de estoque neste filtro." />
        ) : (
          <ul className="divide-y divide-outline-variant/60">
            {paged.items.map((s) => (
              <li key={s.id} className="flex items-center gap-sm px-md py-sm">
                <span
                  className={cn(
                    "w-14 shrink-0 text-center text-title-md font-semibold",
                    s.quantidade > 0 ? "text-emerald-700" : "text-amber-700",
                  )}
                >
                  {s.quantidade > 0 ? "+" : ""}
                  {s.quantidade}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-md">{itemLabel(s.itemNome, s.itemTamanho)}</p>
                  <p className="truncate text-label-md text-on-surface-variant">
                    {[
                      s.tipoLabel,
                      `saldo ${s.saldoApos}`,
                      s.custoUnitario != null && s.tipo === "entrada" ? formatBRL(s.custoUnitario) : null,
                      s.fornecedor,
                      s.documento ? `NF ${s.documento}` : null,
                      s.movementId ? `mov. nº ${s.movementId}` : null,
                      s.motivo,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="shrink-0 text-right text-label-md text-on-surface-variant">
                  <p>{dateTimeBr(s.createdAt)}</p>
                  {s.createdByName ? <p>{s.createdByName}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        <TablePager page={paged.page} totalPages={paged.totalPages} totalItems={paged.totalItems} pageSize={pageSize} onPageChange={setPage} />
      </div>
    </div>
  );
}

// ---------- Colaboradores ----------

type CollabForm = {
  id: number;
  nome: string;
  matricula: string;
  departamento: string;
  cargo: string;
  telefone: string;
  tamanhoCamisa: string;
  tamanhoCalca: string;
  tamanhoCalcado: string;
  observacao: string;
  active: boolean;
};

const EMPTY_COLLAB: CollabForm = {
  id: 0,
  nome: "",
  matricula: "",
  departamento: "",
  cargo: "",
  telefone: "",
  tamanhoCamisa: "",
  tamanhoCalca: "",
  tamanhoCalcado: "",
  observacao: "",
  active: true,
};

function ColaboradoresSection({ ctx }: { ctx: SectionCtx }) {
  const { data, flash, refresh, startMovement } = ctx;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ativos" | "inativos" | "todos" | "com_pecas" | "sem_pecas">("ativos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(20);
  const [form, setForm] = useState<CollabForm | null>(null);
  const [detail, setDetail] = useState<Collaborator | null>(null);
  const [importing, setImporting] = useState(false);

  const filtered = useMemo(
    () =>
      data.collaborators.filter((c) => {
        if (status === "ativos" && !c.active) return false;
        if (status === "inativos" && c.active) return false;
        if (status === "com_pecas" && c.pecasEmPosse <= 0) return false;
        if (status === "sem_pecas" && (c.pecasEmPosse > 0 || !c.active)) return false;
        return matchesQuery(query, [c.nome, c.matricula, c.departamento, c.cargo, c.telefone]);
      }),
    [data.collaborators, query, status],
  );
  useEffect(() => setPage(1), [query, status, pageSize]);
  const paged = paginateList(filtered, page, pageSize);

  const importFacilities = async () => {
    setImporting(true);
    try {
      const result = await importUniformCollaboratorsFn();
      if (!result.ok) return flash(null, result.error);
      await refresh();
      flash(result.imported > 0 ? `${result.imported} colaborador(es) importado(s) do Facilities.` : "Nenhum colaborador novo no Facilities.");
    } finally {
      setImporting(false);
    }
  };

  const remove = async (c: Collaborator) => {
    if (!confirm(`Remover ${c.nome}?`)) return;
    const result = await removeUniformCollaboratorFn({ data: { id: c.id } });
    if (!result.ok) return flash(null, result.error);
    await refresh();
    flash(result.deactivated ? `${c.nome} tem histórico e foi desativado.` : `${c.nome} removido.`);
  };

  return (
    <section className="space-y-md">
      <div className="flex flex-wrap items-end gap-sm">
        <div className={cn(CARD, "grid flex-1 gap-sm p-md sm:grid-cols-[2fr_1fr_auto]")}>
          <Field label="Buscar">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome, matrícula, setor..." className={INPUT} />
          </Field>
          <Field label="Mostrar">
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={INPUT}>
              <option value="ativos">Ativos</option>
              <option value="com_pecas">Com peças em posse</option>
              <option value="sem_pecas">Sem uniforme</option>
              <option value="inativos">Inativos</option>
              <option value="todos">Todos</option>
            </select>
          </Field>
          <PageSizeSelect value={pageSize} onChange={setPageSize} />
        </div>
      </div>
      <div className="flex flex-wrap gap-sm">
        <button type="button" className={BTN_ACCENT} onClick={() => setForm({ ...EMPTY_COLLAB })}>
          <Icon name="person_add" className="text-[18px]" />
          Novo colaborador
        </button>
        <button type="button" className={BTN_OUTLINE} disabled={importing} onClick={() => void importFacilities()}>
          <Icon name="group_add" className="text-[18px]" />
          {importing ? "Importando..." : "Importar do Facilities"}
        </button>
      </div>

      <div className={cn(CARD, "overflow-hidden")}>
        {paged.totalItems === 0 ? (
          <EmptyState icon="groups" text="Nenhum colaborador neste filtro." />
        ) : (
          <ul className="divide-y divide-outline-variant/60">
            {paged.items.map((c) => (
              <li key={c.id} className={cn("flex flex-wrap items-center gap-sm px-md py-sm", !c.active && "opacity-60")}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-container text-label-md font-bold text-on-secondary-container">
                  {c.nome
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join("")
                    .toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-md text-on-surface">
                    {c.nome}
                    {c.matricula ? <span className="text-on-surface-variant"> · Mat. {c.matricula}</span> : null}
                  </p>
                  <p className="truncate text-label-md text-on-surface-variant">
                    {[c.departamento, c.cargo, sizesHint(c)].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-sm py-0.5 text-label-md font-semibold",
                    c.pecasEmPosse > 0 ? "bg-sky-100 text-sky-900" : "bg-surface-container-high text-on-surface-variant",
                  )}
                >
                  {c.pecasEmPosse > 0 ? `${c.pecasEmPosse} em posse` : "Sem uniforme"}
                </span>
                <div className="flex gap-xs">
                  <button type="button" className={BTN_SMALL} onClick={() => setDetail(c)}>
                    <Icon name="checkroom" className="text-[16px]" />
                    Peças
                  </button>
                  <button type="button" className={BTN_SMALL} disabled={!c.active} onClick={() => startMovement({ collaboratorId: c.id, tipo: "entrega" })}>
                    <Icon name="outbox" className="text-[16px]" />
                  </button>
                  <button
                    type="button"
                    className={BTN_SMALL}
                    onClick={() =>
                      setForm({
                        id: c.id,
                        nome: c.nome,
                        matricula: c.matricula ?? "",
                        departamento: c.departamento ?? "",
                        cargo: c.cargo ?? "",
                        telefone: c.telefone ?? "",
                        tamanhoCamisa: c.tamanhoCamisa ?? "",
                        tamanhoCalca: c.tamanhoCalca ?? "",
                        tamanhoCalcado: c.tamanhoCalcado ?? "",
                        observacao: c.observacao ?? "",
                        active: c.active,
                      })
                    }
                  >
                    <Icon name="edit" className="text-[16px]" />
                  </button>
                  <button type="button" className={cn(BTN_SMALL, "text-error")} onClick={() => void remove(c)}>
                    <Icon name="delete" className="text-[16px]" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <TablePager page={paged.page} totalPages={paged.totalPages} totalItems={paged.totalItems} pageSize={pageSize} onPageChange={setPage} />
      </div>

      <CollabDialog
        form={form}
        onChange={setForm}
        onDone={async (msg) => {
          setForm(null);
          await refresh();
          flash(msg);
        }}
      />
      <CollabDetailDialog
        collaborator={detail}
        holdings={detail ? data.holdings.filter((h) => h.collaboratorId === detail.id) : []}
        movements={detail ? data.movements.filter((m) => m.collaboratorId === detail.id) : []}
        items={data.items}
        onClose={() => setDetail(null)}
        onStart={(preset) => {
          setDetail(null);
          startMovement(preset);
        }}
      />
    </section>
  );
}

function CollabDialog({
  form,
  onChange,
  onDone,
}: {
  form: CollabForm | null;
  onChange: (form: CollabForm | null) => void;
  onDone: (msg: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [form?.id]);
  if (!form) return null;
  const set = (patch: Partial<CollabForm>) => onChange({ ...form, ...patch });
  const text = (key: keyof CollabForm, label: string, placeholder?: string) => (
    <Field label={label}>
      <input
        value={String(form[key])}
        onChange={(e) => set({ [key]: e.target.value } as Partial<CollabForm>)}
        placeholder={placeholder}
        className={INPUT}
      />
    </Field>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onChange(null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar colaborador" : "Novo colaborador"}</DialogTitle>
          <DialogDescription>Os tamanhos ajudam a escolher a peça certa na entrega.</DialogDescription>
        </DialogHeader>
        <div className="space-y-sm">
          {text("nome", "Nome *")}
          <div className="grid grid-cols-2 gap-sm">
            {text("matricula", "Matrícula")}
            {text("telefone", "Celular", "(11) 90000-0000")}
            {text("departamento", "Setor / posto")}
            {text("cargo", "Cargo / função")}
          </div>
          <div className="grid grid-cols-3 gap-sm">
            {text("tamanhoCamisa", "Camisa", "M")}
            {text("tamanhoCalca", "Calça", "42")}
            {text("tamanhoCalcado", "Calçado", "40")}
          </div>
          <Field label="Observação">
            <textarea rows={2} value={form.observacao} onChange={(e) => set({ observacao: e.target.value })} className={INPUT} />
          </Field>
          {form.id ? (
            <label className="flex items-center gap-xs text-body-md">
              <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
              Ativo
            </label>
          ) : null}
          {error ? <p className="rounded-lg bg-error/10 px-sm py-xs text-label-md text-error">{error}</p> : null}
        </div>
        <DialogFooter>
          <button type="button" className={BTN_OUTLINE} onClick={() => onChange(null)}>
            Cancelar
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={saving || !form.nome.trim()}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                const result = await saveUniformCollaboratorFn({
                  data: {
                    id: form.id,
                    nome: form.nome,
                    matricula: form.matricula || null,
                    departamento: form.departamento || null,
                    cargo: form.cargo || null,
                    telefone: form.telefone || null,
                    tamanhoCamisa: form.tamanhoCamisa || null,
                    tamanhoCalca: form.tamanhoCalca || null,
                    tamanhoCalcado: form.tamanhoCalcado || null,
                    observacao: form.observacao || null,
                    active: form.active,
                  },
                });
                if (!result.ok) return setError(result.error);
                await onDone(form.id ? "Colaborador atualizado." : "Colaborador cadastrado.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CollabDetailDialog({
  collaborator,
  holdings,
  movements,
  items,
  onClose,
  onStart,
}: {
  collaborator: Collaborator | null;
  holdings: Holding[];
  movements: Movement[];
  items: Item[];
  onClose: () => void;
  onStart: (preset: MovementPreset) => void;
}) {
  const thumbs = useMemo(() => new Map(items.map((i) => [i.id, i.fotoThumb])), [items]);
  if (!collaborator) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{collaborator.nome}</DialogTitle>
          <DialogDescription>
            {[collaborator.matricula ? `Mat. ${collaborator.matricula}` : null, collaborator.departamento, sizesHint(collaborator)]
              .filter(Boolean)
              .join(" · ") || "Peças em posse e histórico"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-md">
          <div>
            <h4 className="text-title-md text-primary">Em posse</h4>
            {holdings.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">Nenhuma peça em posse.</p>
            ) : (
              <ul className="mt-xs space-y-xs">
                {holdings.map((h) => {
                  const days = h.proximaTroca ? daysUntil(h.proximaTroca) : null;
                  return (
                    <li key={h.itemId} className="flex items-center gap-sm rounded-lg border border-outline-variant p-sm">
                      <Thumb src={thumbs.get(h.itemId) ?? null} className="h-10 w-10" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body-md">
                          {h.quantidade}× {itemLabel(h.descricao, h.tamanho)}
                        </p>
                        <p className="text-label-md text-on-surface-variant">
                          Entregue {dateBr(h.ultimaEntrega)}
                          {h.proximaTroca ? ` · troca ${dateBr(h.proximaTroca)}` : ""}
                        </p>
                      </div>
                      {days != null && days <= UNIFORM_REPLACEMENT_WARNING_DAYS ? (
                        <span className={cn("rounded-full px-sm py-0.5 text-label-md font-semibold", days < 0 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900")}>
                          {days < 0 ? "Vencida" : `${days}d`}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div>
            <h4 className="text-title-md text-primary">Histórico</h4>
            {movements.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">Sem movimentações.</p>
            ) : (
              <ul className="mt-xs space-y-xs text-body-md">
                {movements.slice(0, 20).map((m) => (
                  <li key={m.id} className={cn("flex justify-between gap-sm", m.status === "estornado" && "line-through opacity-60")}>
                    <span className="min-w-0 truncate">
                      {m.tipoLabel}: {m.items.map((i) => `${i.quantidade}× ${itemLabel(i.descricao, i.tamanho)}`).join(", ")}
                    </span>
                    <span className="shrink-0 text-label-md text-on-surface-variant">{dateBr(m.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter className="flex-wrap gap-sm">
          <button
            type="button"
            className={BTN_OUTLINE}
            onClick={() =>
              printUniformFicha({ empresa: APP_NAME, collaborator, holdings, movements })
            }
          >
            <Icon name="print" className="text-[18px]" />
            Ficha
          </button>
          {holdings.length > 0 ? (
            <button type="button" className={BTN_OUTLINE} onClick={() => onStart({ collaboratorId: collaborator.id, tipo: "devolucao" })}>
              Devolução
            </button>
          ) : null}
          {collaborator.active ? (
            <button type="button" className={BTN_ACCENT} onClick={() => onStart({ collaboratorId: collaborator.id, tipo: "entrega" })}>
              Nova entrega
            </button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Relatórios ----------

function RelatoriosSection({ ctx }: { ctx: SectionCtx }) {
  const { data, flash } = ctx;
  const [dataDe, setDataDe] = useState(monthStartIso());
  const [dataAte, setDataAte] = useState(localIsoDate());

  const collabById = useMemo(() => new Map(data.collaborators.map((c) => [c.id, c])), [data.collaborators]);

  const movs = useMemo(
    () =>
      data.movements.filter((m) => {
        const day = isoOf(m.createdAt);
        return (!dataDe || day >= dataDe) && (!dataAte || day <= dataAte);
      }),
    [data.movements, dataDe, dataAte],
  );
  const active = movs.filter((m) => m.status === "ativo");
  const lines = active.flatMap((m) => m.items.map((i) => ({ ...i, m })));
  const saidas = lines.filter((l) => l.direcao === "saida");
  const devolvidas = lines.filter((l) => l.direcao === "entrada");
  const descartes = devolvidas.filter((l) => l.condicao === "descarte");

  const byItem = useMemo(() => {
    const map = new Map<string, { label: string; qtd: number; custo: number }>();
    for (const l of saidas) {
      const key = `${l.itemId}`;
      const prev = map.get(key) ?? { label: itemLabel(l.descricao, l.tamanho), qtd: 0, custo: 0 };
      prev.qtd += l.quantidade;
      prev.custo += l.quantidade * l.custoUnitario;
      map.set(key, prev);
    }
    return [...map.values()].sort((a, b) => b.custo - a.custo);
  }, [saidas]);

  const bySetor = useMemo(() => {
    const map = new Map<string, { qtd: number; custo: number }>();
    for (const l of saidas) {
      const key = l.m.collaboratorDepartamento ?? "Sem setor";
      const prev = map.get(key) ?? { qtd: 0, custo: 0 };
      prev.qtd += l.quantidade;
      prev.custo += l.quantidade * l.custoUnitario;
      map.set(key, prev);
    }
    return [...map.entries()].sort((a, b) => b[1].custo - a[1].custo);
  }, [saidas]);

  const cards = [
    { label: "Movimentações", value: String(active.length) },
    { label: "Peças entregues", value: String(saidas.reduce((s, l) => s + l.quantidade, 0)) },
    { label: "Custo entregue", value: formatBRL(saidas.reduce((s, l) => s + l.quantidade * l.custoUnitario, 0)) },
    { label: "Devolvidas / descartadas", value: `${devolvidas.reduce((s, l) => s + l.quantidade, 0)} / ${descartes.reduce((s, l) => s + l.quantidade, 0)}` },
  ];

  const exportExcel = () => {
    try {
      downloadUniformesExcel({
        periodo: `${dataDe || "inicio"}_a_${dataAte || "hoje"}`,
        movements: movs,
        items: data.items,
        holdings: data.holdings.map((h) => ({
          ...h,
          collaboratorNome: collabById.get(h.collaboratorId)?.nome ?? "—",
          departamento: collabById.get(h.collaboratorId)?.departamento ?? null,
        })),
        stockMoves: data.stockMoves.filter((s) => {
          const day = isoOf(s.createdAt);
          return (!dataDe || day >= dataDe) && (!dataAte || day <= dataAte);
        }),
      });
      flash("Excel de uniformes baixado.");
    } catch (err) {
      flash(null, err instanceof Error ? err.message : "Falha ao exportar.");
    }
  };

  return (
    <section className="space-y-lg">
      <div className={cn(CARD, "flex flex-wrap items-end gap-sm p-md")}>
        <Field label="De">
          <input type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Até">
          <input type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} className={INPUT} />
        </Field>
        <div className="flex-1" />
        <button type="button" className={BTN_PRIMARY} onClick={exportExcel}>
          <Icon name="download" className="text-[18px]" />
          Exportar Excel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-sm xl:grid-cols-4 xl:gap-md">
        {cards.map((card) => (
          <div key={card.label} className={cn(CARD, "p-sm sm:p-md")}>
            <p className="text-label-md text-on-surface-variant">{card.label}</p>
            <p className="mt-sm text-title-lg font-semibold text-primary">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-lg lg:grid-cols-2">
        <RankTable title="Consumo por peça" rows={byItem.map((r) => ({ label: r.label, qtd: r.qtd, custo: r.custo }))} />
        <RankTable title="Consumo por setor / posto" rows={bySetor.map(([label, v]) => ({ label, qtd: v.qtd, custo: v.custo }))} />
      </div>
    </section>
  );
}

function RankTable({ title, rows }: { title: string; rows: Array<{ label: string; qtd: number; custo: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.custo));
  return (
    <div className={cn(CARD, "overflow-hidden")}>
      <div className="border-b border-outline-variant px-md py-sm">
        <h3 className="text-title-md text-primary">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="bar_chart" text="Sem entregas no período." />
      ) : (
        <ul className="divide-y divide-outline-variant/60">
          {rows.slice(0, 15).map((r) => (
            <li key={r.label} className="space-y-xs px-md py-sm">
              <div className="flex justify-between gap-sm text-body-md">
                <span className="truncate">{r.label}</span>
                <span className="shrink-0 font-semibold">
                  {r.qtd} un · {formatBRL(r.custo)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-high">
                <div className="h-full rounded-full bg-secondary" style={{ width: `${(r.custo / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
