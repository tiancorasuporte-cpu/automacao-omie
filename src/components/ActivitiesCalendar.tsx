import { useMemo, useState } from "react";

import { Icon } from "@/components/Icon";
import { btnOutline, btnPrimary, PageSection } from "@/components/PageChrome";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export type ActivityCalendarItem = {
  id: number;
  date: string; // YYYY-MM-DD
  title: string;
  subtitle?: string | null;
  statusKey: string;
  statusLabel: string;
  /** Tailwind classes for the event bar background + text */
  barClass: string;
  meta?: string | null;
  initial?: string | null;
};

export type ActivityLegendItem = {
  key: string;
  label: string;
  /** Tailwind bg class for the legend dot */
  dotClass: string;
};

export type CalendarViewMode = "month" | "week" | "day";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
const MAX_VISIBLE = 3;

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfWeek(date: Date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function addDays(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);
}

function monthLabel(date: Date) {
  const raw = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function weekLabel(focus: Date) {
  const start = startOfWeek(focus);
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const left = start.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
  const right = end.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: sameMonth ? undefined : "short",
    year: "numeric",
  });
  return `${left} – ${right}`;
}

function dayLabel(focus: Date) {
  const raw = focus.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function buildMonthCells(month: Date) {
  const first = startOfMonth(month);
  const startPad = first.getDay(); // 0=Sun
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: Array<{ date: Date; inMonth: boolean; ymd: string }> = [];

  for (let i = startPad - 1; i >= 0; i--) {
    const d = new Date(first.getFullYear(), first.getMonth(), -i);
    cells.push({ date: d, inMonth: false, ymd: toYmd(d) });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(first.getFullYear(), first.getMonth(), day);
    cells.push({ date: d, inMonth: true, ymd: toYmd(d) });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]!.date;
    const d = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
    cells.push({ date: d, inMonth: false, ymd: toYmd(d) });
  }
  return cells;
}

function EventBar({
  item,
  onSelect,
  dense = true,
}: {
  item: ActivityCalendarItem;
  onSelect: (id: number) => void;
  dense?: boolean;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect(item.id);
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect(item.id);
      }}
      className={cn(
        "relative z-10 flex w-full cursor-pointer items-center gap-0.5 truncate rounded text-left text-white",
        dense
          ? "truncate px-1 py-0.5 text-[11px] leading-tight"
          : "gap-sm rounded-lg px-sm py-sm text-label-md",
        item.barClass,
      )}
      title={`${item.meta ? `${item.meta} · ` : ""}${item.title}${item.subtitle ? ` — ${item.subtitle}` : ""}`}
    >
      <span className="min-w-0 flex-1 truncate">
        {item.meta ? `${item.meta} ` : ""}
        {item.title}
        {!dense && item.subtitle ? (
          <span className="mt-2xs block truncate text-[11px] font-normal text-white/85">
            {item.subtitle}
          </span>
        ) : null}
      </span>
      {item.initial ? (
        <span
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full bg-white/25 font-bold",
            dense ? "size-4 text-[9px]" : "size-6 text-label-sm",
          )}
        >
          {item.initial}
        </span>
      ) : null}
    </button>
  );
}

export function ActivitiesCalendar({
  items,
  pendingItems,
  legend,
  month,
  onMonthChange,
  onSelect,
  onCreate,
  createLabel = "+ Nova OS",
  className,
}: {
  items: ActivityCalendarItem[];
  pendingItems: ActivityCalendarItem[];
  legend: ActivityLegendItem[];
  month: Date;
  onMonthChange: (next: Date) => void;
  onSelect: (id: number) => void;
  onCreate?: () => void;
  createLabel?: string;
  className?: string;
}) {
  const todayYmd = toYmd(new Date());
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");

  const focusDate = useMemo(
    () => new Date(month.getFullYear(), month.getMonth(), month.getDate()),
    [month],
  );
  const focusYmd = toYmd(focusDate);
  const monthStart = useMemo(() => startOfMonth(focusDate), [focusDate]);
  const monthKey = `${monthStart.getFullYear()}-${monthStart.getMonth()}`;
  const cells = useMemo(() => buildMonthCells(monthStart), [monthKey]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(focusDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      return { date: d, ymd: toYmd(d) };
    });
  }, [focusDate]);

  const byDate = useMemo(() => {
    const map = new Map<string, ActivityCalendarItem[]>();
    for (const item of items) {
      if (!item.date) continue;
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    return map;
  }, [items]);

  const dayItems = byDate.get(focusYmd) ?? [];

  function shiftFocus(delta: number) {
    if (viewMode === "month") {
      onMonthChange(addMonths(monthStart, delta));
      return;
    }
    if (viewMode === "week") {
      onMonthChange(addDays(focusDate, delta * 7));
      return;
    }
    onMonthChange(addDays(focusDate, delta));
  }

  const headerLabel =
    viewMode === "month"
      ? monthLabel(monthStart)
      : viewMode === "week"
        ? weekLabel(focusDate)
        : dayLabel(focusDate);

  return (
    <div className={cn("flex flex-col gap-md", className)}>
      <div className="flex flex-wrap items-center justify-end gap-sm">
        {onCreate ? (
          <button type="button" onClick={onCreate} className={btnPrimary}>
            {createLabel}
          </button>
        ) : null}
      </div>

      <div className="grid gap-md lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-md">
          <PageSection className="p-sm">
            <Calendar
              mode="single"
              month={monthStart}
              selected={focusDate}
              onMonthChange={(d) => onMonthChange(d)}
              onSelect={(d) => {
                if (d) onMonthChange(d);
              }}
              className="w-full [--cell-size:2rem]"
            />
          </PageSection>

          <PageSection padded={false} className="overflow-hidden">
            <div className="border-b border-outline-variant px-md py-sm">
              <h3 className="text-label-md font-semibold text-on-surface">
                Atividades pendentes ({pendingItems.length})
              </h3>
            </div>
            <div className="flex max-h-[420px] flex-col gap-xs overflow-auto p-sm">
              {pendingItems.length === 0 ? (
                <p className="px-xs py-sm text-label-md text-on-surface-variant">
                  Nenhuma pendente.
                </p>
              ) : (
                pendingItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onSelect(item.id);
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelect(item.id);
                    }}
                    className="truncate rounded-md bg-blue-600 px-sm py-xs text-left text-label-sm font-medium text-white hover:bg-blue-700"
                    title={item.title}
                  >
                    {item.title}
                  </button>
                ))
              )}
            </div>
          </PageSection>
        </aside>

        <PageSection padded={false} className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-sm border-b border-outline-variant px-md py-sm">
            <div className="flex items-center gap-xs">
              <button
                type="button"
                className={btnOutline}
                aria-label="Anterior"
                onClick={() => shiftFocus(-1)}
              >
                <Icon name="chevron_left" className="text-[18px]" />
              </button>
              <h2 className="min-w-[10rem] text-center text-title-md font-semibold capitalize text-on-surface">
                {headerLabel}
              </h2>
              <button
                type="button"
                className={btnOutline}
                aria-label="Próximo"
                onClick={() => shiftFocus(1)}
              >
                <Icon name="chevron_right" className="text-[18px]" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-xs">
              <button
                type="button"
                className={btnOutline}
                onClick={() => onMonthChange(new Date())}
              >
                Hoje
              </button>
              {(
                [
                  ["month", "Mês"],
                  ["week", "Semana"],
                  ["day", "Dia"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setViewMode(id)}
                  className={cn(viewMode === id ? btnPrimary : btnOutline)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {viewMode === "month" ? (
            <>
              <div className="grid grid-cols-7 border-b border-outline-variant bg-surface-container">
                {WEEKDAYS.map((d) => (
                  <div
                    key={d}
                    className="px-xs py-xs text-center text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant"
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 auto-rows-[minmax(7.5rem,1fr)]">
                {cells.map((cell) => {
                  const cellItems = byDate.get(cell.ymd) ?? [];
                  const isToday = cell.ymd === todayYmd;
                  const isFocus = cell.ymd === focusYmd;
                  const showAll = expandedDay === cell.ymd;
                  const visible = showAll ? cellItems : cellItems.slice(0, MAX_VISIBLE);
                  const extra = cellItems.length - MAX_VISIBLE;

                  return (
                    <div
                      key={cell.ymd}
                      role={cellItems.length === 1 ? "button" : undefined}
                      tabIndex={cellItems.length === 1 ? 0 : undefined}
                      onClick={() => {
                        onMonthChange(cell.date);
                        if (cellItems.length === 1) onSelect(cellItems[0]!.id);
                      }}
                      onKeyDown={(e) => {
                        if (cellItems.length !== 1) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onMonthChange(cell.date);
                          onSelect(cellItems[0]!.id);
                        }
                      }}
                      className={cn(
                        "min-h-[7.5rem] border-b border-r border-outline-variant p-xs",
                        !cell.inMonth && "bg-surface-container/40 text-on-surface-variant/60",
                        cellItems.length === 1 && "cursor-pointer hover:bg-surface-container-high/60",
                        isFocus && "bg-amber-50/70",
                      )}
                    >
                      <div className="mb-xs flex justify-end">
                        <span
                          className={cn(
                            "inline-flex size-7 items-center justify-center text-label-md",
                            isToday && "rounded-full bg-blue-600 font-semibold text-white",
                            !isToday && cell.inMonth && "text-on-surface",
                          )}
                        >
                          {cell.date.getDate()}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {visible.map((item) => (
                          <EventBar key={item.id} item={item} onSelect={onSelect} />
                        ))}
                        {!showAll && extra > 0 ? (
                          <button
                            type="button"
                            className="relative z-10 text-left text-[11px] font-medium text-blue-600 hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedDay(cell.ymd);
                            }}
                          >
                            Ver mais (+{extra})
                          </button>
                        ) : null}
                        {showAll && cellItems.length > MAX_VISIBLE ? (
                          <button
                            type="button"
                            className="relative z-10 text-left text-[11px] font-medium text-blue-600 hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedDay(null);
                            }}
                          >
                            Ver menos
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {viewMode === "week" ? (
            <>
              <div className="grid grid-cols-7 border-b border-outline-variant bg-surface-container">
                {weekDays.map((d) => {
                  const isToday = d.ymd === todayYmd;
                  const isFocus = d.ymd === focusYmd;
                  return (
                    <button
                      key={d.ymd}
                      type="button"
                      onClick={() => onMonthChange(d.date)}
                      className={cn(
                        "px-xs py-sm text-center",
                        isFocus && "bg-amber-50",
                      )}
                    >
                      <div className="text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
                        {WEEKDAYS[d.date.getDay()]}
                      </div>
                      <div
                        className={cn(
                          "mx-auto mt-2xs inline-flex size-7 items-center justify-center text-label-md",
                          isToday && "rounded-full bg-blue-600 font-semibold text-white",
                          !isToday && "text-on-surface",
                        )}
                      >
                        {d.date.getDate()}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="grid min-h-[28rem] grid-cols-7">
                {weekDays.map((d) => {
                  const cellItems = byDate.get(d.ymd) ?? [];
                  const isFocus = d.ymd === focusYmd;
                  return (
                    <div
                      key={d.ymd}
                      className={cn(
                        "flex flex-col gap-xs border-b border-r border-outline-variant p-xs",
                        isFocus && "bg-amber-50/50",
                      )}
                      onClick={() => onMonthChange(d.date)}
                    >
                      {cellItems.length ? (
                        cellItems.map((item) => (
                          <EventBar key={item.id} item={item} onSelect={onSelect} dense={false} />
                        ))
                      ) : (
                        <p className="px-2xs py-sm text-center text-label-sm text-on-surface-variant">
                          —
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {viewMode === "day" ? (
            <div className="flex min-h-[28rem] flex-col gap-sm p-md">
              <div className="flex items-center justify-between gap-sm">
                <p className="text-label-md text-on-surface-variant">
                  {dayItems.length
                    ? `${dayItems.length} OS neste dia`
                    : "Nenhuma OS agendada neste dia"}
                </p>
              </div>
              {dayItems.length ? (
                <div className="flex flex-col gap-sm">
                  {dayItems.map((item) => (
                    <EventBar key={item.id} item={item} onSelect={onSelect} dense={false} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-outline-variant px-md py-xl text-body-md text-on-surface-variant">
                  Sem atividades em {focusDate.toLocaleDateString("pt-BR")}
                </div>
              )}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-md border-t border-outline-variant px-md py-sm">
            <span className="text-label-md font-semibold text-on-surface-variant">
              Situações das atividades:
            </span>
            {legend.map((l) => (
              <span key={l.key} className="inline-flex items-center gap-xs text-label-md text-on-surface">
                <span className={cn("size-2.5 rounded-full", l.dotClass)} />
                {l.label}
              </span>
            ))}
          </div>
        </PageSection>
      </div>
    </div>
  );
}

export function activityInitial(name: string | null | undefined) {
  const s = (name ?? "").trim();
  return s ? s.charAt(0).toUpperCase() : null;
}

export function osActivityStatus(stage: number, hasDate: boolean): {
  key: string;
  label: string;
  barClass: string;
  dotClass: string;
} {
  if (stage >= 6) {
    return {
      key: "concluida",
      label: "Concluída",
      // Finalizadas ficam “apagadas” no calendário
      barClass: "bg-emerald-600/45 opacity-45 hover:opacity-65",
      dotClass: "bg-emerald-300",
    };
  }
  if (stage === 5) {
    return {
      key: "execucao",
      label: "Em execução",
      barClass: "bg-orange-500 hover:bg-orange-600",
      dotClass: "bg-orange-500",
    };
  }
  if (stage === 4 || hasDate) {
    return {
      key: "agendada",
      label: "Agendada",
      barClass: "bg-blue-600 hover:bg-blue-700",
      dotClass: "bg-blue-600",
    };
  }
  return {
    key: "pendente",
    label: "Pendente",
    barClass: "bg-slate-400 hover:bg-slate-500",
    dotClass: "bg-slate-400",
  };
}

export const OS_ACTIVITY_LEGEND: ActivityLegendItem[] = [
  { key: "agendada", label: "Agendada", dotClass: "bg-blue-600" },
  { key: "execucao", label: "Em execução", dotClass: "bg-orange-500" },
  { key: "concluida", label: "Concluída (apagada)", dotClass: "bg-emerald-300" },
];

export function ticketActivityStatus(status: string): {
  key: string;
  label: string;
  barClass: string;
  dotClass: string;
} {
  switch (status) {
    case "andamento":
      return {
        key: "andamento",
        label: "Em atendimento",
        barClass: "bg-orange-500 hover:bg-orange-600",
        dotClass: "bg-orange-500",
      };
    case "encaminhado":
      return {
        key: "encaminhado",
        label: "Encaminhado",
        barClass: "bg-fuchsia-600 hover:bg-fuchsia-700",
        dotClass: "bg-fuchsia-600",
      };
    case "resolvido":
      return {
        key: "resolvido",
        label: "Resolvido",
        barClass: "bg-emerald-600 hover:bg-emerald-700",
        dotClass: "bg-emerald-600",
      };
    case "os":
      return {
        key: "os",
        label: "OS aberta",
        barClass: "bg-blue-600 hover:bg-blue-700",
        dotClass: "bg-blue-600",
      };
    default:
      return {
        key: "aberto",
        label: "Aberto",
        barClass: "bg-slate-400 hover:bg-slate-500",
        dotClass: "bg-slate-400",
      };
  }
}

export const TICKET_ACTIVITY_LEGEND: ActivityLegendItem[] = [
  { key: "aberto", label: "Aberto", dotClass: "bg-slate-400" },
  { key: "andamento", label: "Em atendimento", dotClass: "bg-orange-500" },
  { key: "encaminhado", label: "Encaminhado", dotClass: "bg-fuchsia-600" },
  { key: "resolvido", label: "Resolvido", dotClass: "bg-emerald-600" },
  { key: "os", label: "OS aberta", dotClass: "bg-blue-600" },
];

/** Helpers exported for parents that need YMD math without duplicating. */
export { toYmd, parseYmd, startOfMonth };
