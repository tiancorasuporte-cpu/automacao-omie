import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { z } from "zod";

import { AppShell } from "@/components/AppShell";
import { PageTitle } from "@/components/PageChrome";
import { FleetBrandMark } from "@/components/FleetBrandMark";
import { Icon } from "@/components/Icon";
import { PhotoCapture, type CapturedPhoto } from "@/components/PhotoCapture";
import { SuggestInput } from "@/components/SuggestInput";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { APP_NAME } from "@/lib/brand";
import { FLEET_BRAND_LABELS, FLEET_BRAND_OPTIONS } from "@/lib/fleet-brands";
import {
  createChecklistFn,
  createExpenseFn,
  createIncomeFn,
  createReadingFn,
  createRefuelingFn,
  createRouteFn,
  createServiceFn,
  deleteFleetVehicleFn,
  deleteReadingFn,
  getFrotaBootstrapFn,
  getFrotaDailyKmFn,
  getFrotaHistoryFn,
  getFrotaReportFn,
  getRefuelingAttachmentsFn,
  saveFleetDriverFn,
  saveFleetReminderFn,
  saveFleetVehicleFn,
  updateReadingFn,
} from "@/lib/frota";
import {
  FLEET_ENTRY_LABELS,
  formatBRL,
  formatKm,
  formatKmPerLiter,
  monthKey,
  monthLabelPt,
  parseMoney,
  type FleetEntryType,
} from "@/lib/frota-domain";
import { downloadFrotaKmExcel } from "@/lib/frota-km-excel";
import { downloadFrotaKmPdf } from "@/lib/frota-km-pdf";
import { requireModule } from "@/lib/require-auth";
import { cn } from "@/lib/utils";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

const TAB_IDS = ["historico", "km", "relatorios", "lembretes", "veiculos", "motoristas"] as const;
const searchSchema = z.object({ tab: z.enum(TAB_IDS).catch("historico") });

export const Route = createFileRoute("/frota")({
  validateSearch: searchSchema,
  beforeLoad: () => requireModule("frota"),
  loader: () => getFrotaBootstrapFn(),
  head: () => ({ meta: [{ title: `Frota — ${APP_NAME}` }] }),
  component: FrotaPage,
});

type TabId = (typeof TAB_IDS)[number];
type Boot = Awaited<ReturnType<typeof getFrotaBootstrapFn>>;
type Vehicle = Boot["vehicles"][number];
type Driver = Boot["drivers"][number];
type HistoryItem = Awaited<ReturnType<typeof getFrotaHistoryFn>>[number];
type DailyKmItem = Awaited<ReturnType<typeof getFrotaDailyKmFn>>[number];
type Report = Awaited<ReturnType<typeof getFrotaReportFn>>;

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "historico", label: "Histórico", icon: "history" },
  { id: "km", label: "KM do dia", icon: "speed" },
  { id: "relatorios", label: "Relatórios", icon: "monitoring" },
  { id: "lembretes", label: "Lembretes", icon: "alarm" },
  { id: "veiculos", label: "Veículos", icon: "directions_car" },
  { id: "motoristas", label: "Motoristas", icon: "person" },
];

const ADD_TYPES: Array<{
  type: FleetEntryType;
  icon: string;
  hint: string;
  accent: string;
}> = [
  { type: "refueling", icon: "local_gas_station", hint: "Combustível e posto", accent: "bg-amber-500/15 text-amber-700" },
  { type: "expense", icon: "payments", hint: "Seguro, imposto, pedágio…", accent: "bg-orange-500/15 text-orange-700" },
  { type: "income", icon: "trending_up", hint: "Frete, corrida, receita", accent: "bg-emerald-500/15 text-emerald-700" },
  { type: "service", icon: "build", hint: "Óleo, pneu, revisão", accent: "bg-stone-500/15 text-stone-700" },
  { type: "route", icon: "route", hint: "Origem, destino e km", accent: "bg-sky-500/15 text-sky-700" },
  { type: "reading", icon: "speed", hint: "Odômetro e km do dia", accent: "bg-rose-500/15 text-rose-700" },
  { type: "checklist", icon: "checklist", hint: "Inspeção do veículo", accent: "bg-blue-500/15 text-blue-700" },
  { type: "reminder", icon: "alarm", hint: "Por data ou quilometragem", accent: "bg-violet-500/15 text-violet-700" },
];

function nowLocalInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function vehicleLabel(v: Vehicle) {
  const bits = [v.name, v.brand, v.model].filter(Boolean);
  return bits.join(" · ");
}

function FrotaPage() {
  const boot = Route.useLoaderData();
  const { tab } = Route.useSearch();
  const router = useRouter();
  const navigate = Route.useNavigate();

  const [vehicles, setVehicles] = useState(boot.vehicles);
  const [drivers, setDrivers] = useState(boot.drivers);
  const [reminders, setReminders] = useState(boot.reminders);
  const [currentDriverId, setCurrentDriverId] = useState(boot.currentDriverId);
  const [vehicleId, setVehicleId] = useState<number | null>(() => {
    if (boot.defaultVehicleId) return boot.defaultVehicleId;
    return boot.vehicles.find((v) => v.active)?.id ?? boot.vehicles[0]?.id ?? null;
  });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [dailyKm, setDailyKm] = useState<DailyKmItem[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [formType, setFormType] = useState<FleetEntryType | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null | "new">(null);
  const [editingReading, setEditingReading] = useState<DailyKmItem | null>(null);
  const [driverFormOpen, setDriverFormOpen] = useState(false);
  const [kmFilterVehicleId, setKmFilterVehicleId] = useState<number | "">("");
  const [kmFilterDriverId, setKmFilterDriverId] = useState<number | "">("");
  const [kmFilterFrom, setKmFilterFrom] = useState("");
  const [kmFilterTo, setKmFilterTo] = useState("");

  const selected = useMemo(
    () => vehicles.find((v) => v.id === vehicleId) ?? null,
    [vehicles, vehicleId],
  );

  const historyByMonth = useMemo(() => {
    const map = new Map<string, HistoryItem[]>();
    for (const item of history) {
      const key = monthKey(item.occurredAt);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [history]);

  async function reloadBoot() {
    const next = await getFrotaBootstrapFn();
    setVehicles(next.vehicles);
    setDrivers(next.drivers);
    setReminders(next.reminders);
    setCurrentDriverId(next.currentDriverId);
    if (vehicleId == null) {
      setVehicleId(
        next.defaultVehicleId ??
          next.vehicles.find((v) => v.active)?.id ??
          next.vehicles[0]?.id ??
          null,
      );
    }
  }

  async function reloadHistory() {
    if (!vehicleId) {
      setHistory([]);
      return;
    }
    setLoading(true);
    try {
      setHistory(await getFrotaHistoryFn({ data: { vehicleId } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar histórico.");
    } finally {
      setLoading(false);
    }
  }

  async function reloadReport() {
    if (!vehicleId) {
      setReport(null);
      return;
    }
    const to = new Date();
    const from = new Date();
    from.setFullYear(from.getFullYear() - 2);
    setLoading(true);
    try {
      setReport(
        await getFrotaReportFn({
          data: {
            vehicleId,
            from: from.toISOString(),
            to: to.toISOString(),
          },
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar relatório.");
    } finally {
      setLoading(false);
    }
  }

  async function reloadDailyKm() {
    setLoading(true);
    setError(null);
    try {
      const fromIso = kmFilterFrom
        ? new Date(`${kmFilterFrom}T00:00:00`).toISOString()
        : null;
      const toIso = kmFilterTo ? new Date(`${kmFilterTo}T23:59:59`).toISOString() : null;
      setDailyKm(
        await getFrotaDailyKmFn({
          data: {
            vehicleId: kmFilterVehicleId === "" ? null : Number(kmFilterVehicleId),
            driverId: kmFilterDriverId === "" ? null : Number(kmFilterDriverId),
            from: fromIso,
            to: toIso,
          },
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar KM do dia.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "historico") void reloadHistory();
    if (tab === "relatorios") void reloadReport();
    if (tab === "km") void reloadDailyKm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, vehicleId, kmFilterVehicleId, kmFilterDriverId, kmFilterFrom, kmFilterTo]);

  function setTab(next: TabId) {
    void navigate({ search: { tab: next } });
  }

  return (
    <AppShell mobileTitle="Frota">
      <div className="mx-auto w-full max-w-6xl space-y-lg p-margin-mobile md:p-margin-desktop">
        <PageTitle
          title="Frota"
          subtitle="Controle de veículos, custos e manutenção."
        />
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md sm:p-lg">
          <div className="flex flex-col gap-md sm:flex-row sm:items-end sm:justify-between">
            <div className="grid flex-1 gap-xs sm:max-w-lg">
              <label className="text-label-sm font-medium text-on-surface-variant">Veículo</label>
              <SuggestInput
                value={vehicleId != null ? String(vehicleId) : ""}
                onChange={(v) => setVehicleId(v ? Number(v) : null)}
                freeText={false}
                placeholder={vehicles.length ? "Digite nome, marca ou placa…" : "Cadastre um veículo"}
                emptyLabel="Nenhum veículo encontrado"
                leading={
                  selected?.brand ? <FleetBrandMark brand={selected.brand} size="sm" /> : (
                    <Icon name="directions_car" className="text-xl text-on-surface-variant" />
                  )
                }
                options={vehicles.map((v) => ({
                  value: String(v.id),
                  label: vehicleLabel(v),
                  hint: [v.plate, formatKm(v.currentOdometer)].filter(Boolean).join(" · "),
                }))}
              />
              {selected ? (
                <div className="flex flex-wrap items-center gap-sm pt-2xs">
                  {selected.brand ? <FleetBrandMark brand={selected.brand} size="sm" showLabel /> : null}
                  <p className="text-body-sm text-on-surface-variant">
                    Odômetro atual:{" "}
                    <span className="font-semibold text-on-surface">
                      {formatKm(selected.currentOdometer)}
                    </span>
                  </p>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-sm">
              <button
                type="button"
                className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary hover:bg-surface-container-high disabled:opacity-50"
                onClick={() => setFormType("reading")}
                disabled={!vehicleId}
              >
                <Icon name="speed" className="text-xl" />
                Lançar KM
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-xs rounded-lg bg-secondary-container px-sm py-xs text-label-md font-semibold text-on-secondary-container disabled:opacity-50"
                onClick={() => setAddOpen(true)}
              >
                <Icon name="add" className="text-xl" />
                Novo registro
              </button>
            </div>
          </div>

          <nav className="mt-lg flex gap-xs overflow-x-auto border-t border-outline-variant pt-md">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-sm rounded-xl px-md py-sm text-label-md transition",
                  tab === t.id
                    ? "bg-primary/10 font-bold text-primary"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
                )}
              >
                <Icon name={t.icon} filled={tab === t.id} className="text-xl" />
                {t.label}
              </button>
            ))}
          </nav>
        </section>

        {error ? (
          <div className="rounded-xl border border-error/30 bg-error-container/20 px-md py-sm text-body-sm text-error">
            {error}
          </div>
        ) : null}

        <section className="min-h-[20rem] rounded-xl border border-outline-variant bg-surface-container-lowest p-md sm:p-lg">
          {tab === "historico" ? (
            <HistoryPanel
              loading={loading}
              groups={historyByMonth}
              empty={!vehicleId ? "Cadastre um veículo para começar." : "Sem registros ainda."}
              onAdd={() => setAddOpen(true)}
            />
          ) : null}

          {tab === "km" ? (
            <DailyKmPanel
              loading={loading}
              rows={dailyKm}
              vehicles={vehicles}
              drivers={drivers}
              filterVehicleId={kmFilterVehicleId}
              filterDriverId={kmFilterDriverId}
              filterFrom={kmFilterFrom}
              filterTo={kmFilterTo}
              onFilterVehicleId={setKmFilterVehicleId}
              onFilterDriverId={setKmFilterDriverId}
              onFilterFrom={setKmFilterFrom}
              onFilterTo={setKmFilterTo}
              onAdd={() => setFormType("reading")}
              onEdit={(row) => setEditingReading(row)}
              onDelete={async (row) => {
                if (
                  !window.confirm(
                    `Excluir lançamento de KM do veículo ${row.vehicleName} (${formatKm(row.odometer)})?`,
                  )
                ) {
                  return;
                }
                try {
                  await deleteReadingFn({ data: { id: row.id } });
                  await reloadBoot();
                  await reloadDailyKm();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Falha ao excluir KM.");
                }
              }}
              onExportExcel={() => {
                downloadFrotaKmExcel({
                  title: "Frota — KM do dia",
                  generatedAt: new Date().toLocaleString("pt-BR"),
                  rows: dailyKm,
                });
              }}
              onExportPdf={async () => {
                await downloadFrotaKmPdf({
                  title: "Frota — KM do dia",
                  generatedAt: new Date().toLocaleString("pt-BR"),
                  rows: dailyKm,
                });
              }}
            />
          ) : null}

          {tab === "relatorios" ? <ReportPanel report={report} loading={loading} /> : null}

          {tab === "lembretes" ? (
            <RemindersPanel
              reminders={reminders.filter((r) => !vehicleId || r.vehicleId === vehicleId)}
              vehicles={vehicles}
              onRefresh={async () => {
                await reloadBoot();
              }}
              onAdd={() => {
                setFormType("reminder");
              }}
            />
          ) : null}

          {tab === "veiculos" ? (
            <VehiclesPanel
              vehicles={vehicles}
              onNew={() => setEditingVehicle("new")}
              onEdit={(v) => setEditingVehicle(v)}
              onDelete={async (v) => {
                if (
                  !window.confirm(
                    `Excluir o veículo "${v.name}"? Todos os lançamentos vinculados serão removidos.`,
                  )
                ) {
                  return;
                }
                try {
                  await deleteFleetVehicleFn({ data: { id: v.id } });
                  if (vehicleId === v.id) setVehicleId(null);
                  await reloadBoot();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Falha ao excluir veículo.");
                }
              }}
              onRefresh={reloadBoot}
            />
          ) : null}

          {tab === "motoristas" ? (
            <DriversPanel
              drivers={drivers}
              onNew={() => setDriverFormOpen(true)}
              onRefresh={reloadBoot}
            />
          ) : null}
        </section>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="p-lg" style={{ width: "min(36rem, 100%)" }}>
          <DialogHeader>
            <DialogTitle>Novo registro</DialogTitle>
            <p className="text-body-sm text-on-surface-variant">
              Escolha o tipo de lançamento para o veículo selecionado.
            </p>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
            {ADD_TYPES.map((item) => (
              <button
                key={item.type}
                type="button"
                className="flex w-full min-w-0 items-start gap-md rounded-xl border border-outline-variant bg-surface px-md py-md text-left text-on-surface transition hover:border-primary/40 hover:bg-surface-container-low"
                onClick={() => {
                  setAddOpen(false);
                  setFormType(item.type);
                }}
              >
                <span
                  className={cn(
                    "inline-flex size-10 shrink-0 items-center justify-center rounded-xl",
                    item.accent,
                  )}
                >
                  <Icon name={item.icon} className="text-xl" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-label-md font-semibold text-on-surface">
                    {FLEET_ENTRY_LABELS[item.type]}
                  </span>
                  <span className="mt-2xs block text-body-sm text-on-surface-variant">{item.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {formType ? (
        <EntryFormDialog
          type={formType}
          vehicles={vehicles}
          drivers={drivers}
          catalog={boot.catalog}
          defaultVehicleId={vehicleId}
          defaultDriverId={currentDriverId}
          onClose={() => setFormType(null)}
          onSaved={async () => {
            setFormType(null);
            await reloadBoot();
            await router.invalidate();
            if (tab === "historico") await reloadHistory();
            if (tab === "km") await reloadDailyKm();
            if (tab === "relatorios") await reloadReport();
          }}
        />
      ) : null}

      {editingVehicle ? (
        <VehicleFormDialog
          vehicle={editingVehicle === "new" ? null : editingVehicle}
          onClose={() => setEditingVehicle(null)}
          onSaved={async () => {
            setEditingVehicle(null);
            await reloadBoot();
          }}
        />
      ) : null}

      {editingReading ? (
        <EditReadingDialog
          reading={editingReading}
          onClose={() => setEditingReading(null)}
          onSaved={async () => {
            setEditingReading(null);
            await reloadBoot();
            await reloadDailyKm();
          }}
        />
      ) : null}

      {driverFormOpen ? (
        <DriverFormDialog
          onClose={() => setDriverFormOpen(false)}
          onSaved={async () => {
            setDriverFormOpen(false);
            await reloadBoot();
          }}
        />
      ) : null}
    </AppShell>
  );
}

function DailyKmPanel({
  loading,
  rows,
  vehicles,
  drivers,
  filterVehicleId,
  filterDriverId,
  filterFrom,
  filterTo,
  onFilterVehicleId,
  onFilterDriverId,
  onFilterFrom,
  onFilterTo,
  onAdd,
  onEdit,
  onDelete,
  onExportExcel,
  onExportPdf,
}: {
  loading: boolean;
  rows: DailyKmItem[];
  vehicles: Vehicle[];
  drivers: Driver[];
  filterVehicleId: number | "";
  filterDriverId: number | "";
  filterFrom: string;
  filterTo: string;
  onFilterVehicleId: (v: number | "") => void;
  onFilterDriverId: (v: number | "") => void;
  onFilterFrom: (v: string) => void;
  onFilterTo: (v: string) => void;
  onAdd: () => void;
  onEdit: (row: DailyKmItem) => void;
  onDelete: (row: DailyKmItem) => void | Promise<void>;
  onExportExcel: () => void;
  onExportPdf: () => Promise<void>;
}) {
  const [exporting, setExporting] = useState(false);
  const totalKm = rows.reduce((acc, row) => acc + (row.kmDay ?? 0), 0);

  return (
    <div className="space-y-md">
      <div className="flex flex-col gap-md lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-title-md text-primary">KM do dia</h3>
          <p className="text-body-sm text-on-surface-variant">
            Controle diário com odômetro anterior/atual, motivo e quem lançou.
          </p>
        </div>
        <div className="flex flex-wrap gap-sm">
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-xs rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container"
          >
            <Icon name="speed" className="text-[18px]" />
            Lançar KM
          </button>
          <button
            type="button"
            onClick={onExportExcel}
            disabled={!rows.length}
            className="inline-flex items-center gap-xs rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-primary disabled:opacity-50"
          >
            <Icon name="download" className="text-[18px]" />
            Excel
          </button>
          <button
            type="button"
            disabled={!rows.length || exporting}
            onClick={() => {
              void (async () => {
                setExporting(true);
                try {
                  await onExportPdf();
                } finally {
                  setExporting(false);
                }
              })();
            }}
            className="inline-flex items-center gap-xs rounded-lg border border-outline-variant bg-surface px-md py-sm text-label-md font-semibold text-primary disabled:opacity-50"
          >
            <Icon name="picture_as_pdf" className="text-[18px]" />
            {exporting ? "Gerando…" : "PDF"}
          </button>
        </div>
      </div>

      <div className="grid gap-sm rounded-xl border border-outline-variant bg-surface p-md sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-xs text-label-sm">
          <span className="text-on-surface-variant">Veículo</span>
          <select
            className={inputClass}
            value={filterVehicleId === "" ? "" : String(filterVehicleId)}
            onChange={(e) => onFilterVehicleId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Todos</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {vehicleLabel(v)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-xs text-label-sm">
          <span className="text-on-surface-variant">Motorista</span>
          <select
            className={inputClass}
            value={filterDriverId === "" ? "" : String(filterDriverId)}
            onChange={(e) => onFilterDriverId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Todos</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-xs text-label-sm">
          <span className="text-on-surface-variant">De</span>
          <input
            type="date"
            className={inputClass}
            value={filterFrom}
            onChange={(e) => onFilterFrom(e.target.value)}
          />
        </label>
        <label className="grid gap-xs text-label-sm">
          <span className="text-on-surface-variant">Até</span>
          <input
            type="date"
            className={inputClass}
            value={filterTo}
            onChange={(e) => onFilterTo(e.target.value)}
          />
        </label>
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface-container-low px-md py-sm text-body-sm text-on-surface-variant">
        {rows.length} lançamento(s) · Total rodado{" "}
        <span className="font-semibold text-primary">{formatKm(totalKm)}</span>
      </div>

      {loading ? (
        <p className="py-xl text-center text-body-sm text-on-surface-variant">Carregando KM…</p>
      ) : !rows.length ? (
        <div className="flex min-h-[12rem] flex-col items-center justify-center gap-sm text-center">
          <p className="text-title-md font-semibold text-on-surface">Nenhum lançamento neste filtro.</p>
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-xs rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container"
          >
            <Icon name="speed" className="text-[18px]" />
            Lançar KM
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-sm md:hidden">
            {rows.map((row) => (
              <article
                key={row.id}
                className="rounded-xl border border-outline-variant bg-surface p-md"
              >
                <div className="flex items-start justify-between gap-sm">
                  <div>
                    <p className="text-label-md text-on-surface-variant">
                      {new Date(row.occurredAt).toLocaleString("pt-BR")}
                    </p>
                    <p className="mt-xs text-title-md text-primary">
                      {row.vehicleName}
                      {row.vehiclePlate ? ` · ${row.vehiclePlate}` : ""}
                    </p>
                  </div>
                  <p className="text-title-md font-semibold text-primary">
                    {row.kmDay != null ? `+${formatKm(row.kmDay)}` : "—"}
                  </p>
                </div>
                <div className="mt-sm grid gap-xs text-body-md">
                  <p>
                    <span className="text-on-surface-variant">Anterior: </span>
                    {row.previousOdometer != null ? formatKm(row.previousOdometer) : "—"}
                    <span className="text-on-surface-variant"> → Atual: </span>
                    {formatKm(row.odometer)}
                  </p>
                  <p>
                    <span className="text-on-surface-variant">Motivo: </span>
                    {row.reason || "—"}
                  </p>
                  <p className="text-label-md text-on-surface-variant">
                    {[
                      row.driverName ? `Motorista: ${row.driverName}` : null,
                      row.createdByName ? `Lançado por: ${row.createdByName}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="mt-sm flex gap-xs">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2xs rounded-lg border border-outline-variant px-sm py-2xs text-label-sm font-semibold text-primary"
                      onClick={() => onEdit(row)}
                    >
                      <Icon name="edit" className="text-[16px]" />
                      Editar
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2xs rounded-lg border border-error/30 px-sm py-2xs text-label-sm font-semibold text-error"
                      onClick={() => void onDelete(row)}
                    >
                      <Icon name="delete" className="text-[16px]" />
                      Excluir
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-left text-body-md">
              <thead className="bg-primary text-label-md font-semibold uppercase tracking-wide text-on-primary">
                <tr>
                  <th className="px-md py-sm">Data/hora</th>
                  <th className="px-md py-sm">Veículo</th>
                  <th className="px-md py-sm">KM anterior</th>
                  <th className="px-md py-sm">KM atual</th>
                  <th className="px-md py-sm">KM do dia</th>
                  <th className="px-md py-sm">Motivo</th>
                  <th className="px-md py-sm">Motorista</th>
                  <th className="px-md py-sm">Lançado por</th>
                  <th className="px-md py-sm">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-outline-variant/60">
                    <td className="px-md py-sm whitespace-nowrap">
                      {new Date(row.occurredAt).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-md py-sm text-primary">
                      <div>{row.vehicleName}</div>
                      {row.vehiclePlate ? (
                        <div className="text-label-md text-on-surface-variant">{row.vehiclePlate}</div>
                      ) : null}
                    </td>
                    <td className="px-md py-sm">
                      {row.previousOdometer != null ? formatKm(row.previousOdometer) : "—"}
                    </td>
                    <td className="px-md py-sm font-semibold">{formatKm(row.odometer)}</td>
                    <td className="px-md py-sm font-semibold text-primary">
                      {row.kmDay != null ? `+${formatKm(row.kmDay)}` : "—"}
                    </td>
                    <td className="px-md py-sm max-w-[14rem]">
                      <span className="line-clamp-2">{row.reason || "—"}</span>
                    </td>
                    <td className="px-md py-sm text-on-surface-variant">{row.driverName || "—"}</td>
                    <td className="px-md py-sm text-on-surface-variant">
                      {row.createdByName || "—"}
                    </td>
                    <td className="px-md py-sm">
                      <div className="flex flex-wrap gap-xs">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2xs rounded-lg border border-outline-variant px-sm py-2xs text-label-sm font-semibold text-primary"
                          onClick={() => onEdit(row)}
                          title="Editar KM"
                        >
                          <Icon name="edit" className="text-[16px]" />
                          Editar
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2xs rounded-lg border border-error/30 px-sm py-2xs text-label-sm font-semibold text-error"
                          onClick={() => void onDelete(row)}
                          title="Excluir KM"
                        >
                          <Icon name="delete" className="text-[16px]" />
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function HistoryPanel({
  groups,
  loading,
  empty,
  onAdd,
}: {
  groups: Array<[string, HistoryItem[]]>;
  loading: boolean;
  empty: string;
  onAdd: () => void;
}) {
  const [attachItem, setAttachItem] = useState<HistoryItem | null>(null);
  const [attachPhotos, setAttachPhotos] = useState<CapturedPhoto[]>([]);
  const [attachLoading, setAttachLoading] = useState(false);

  async function openAttachments(item: HistoryItem) {
    if (item.kind !== "refueling" || !item.hasAttachment) return;
    setAttachItem(item);
    setAttachPhotos([]);
    setAttachLoading(true);
    try {
      const res = await getRefuelingAttachmentsFn({ data: { id: item.id } });
      setAttachPhotos(res?.photos ?? []);
    } catch {
      setAttachPhotos([]);
    } finally {
      setAttachLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center text-body-sm text-on-surface-variant">
        Carregando histórico…
      </div>
    );
  }
  if (!groups.length) {
    return (
      <div className="flex min-h-[14rem] flex-col items-center justify-center gap-md text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-xl bg-surface-container-low text-primary">
          <Icon name="history" className="text-3xl" />
        </span>
        <div>
          <p className="text-title-md font-semibold text-on-surface">{empty}</p>
          <p className="mt-xs text-body-sm text-on-surface-variant">
            Lance abastecimentos, despesas e serviços para montar a linha do tempo.
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-sm rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container"
        >
          <Icon name="add" className="text-lg" />
          Novo registro
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-lg">
      {groups.map(([ym, items]) => {
        const total = items.reduce((acc, i) => acc + (i.amount || 0), 0);
        return (
          <section key={ym} className="space-y-sm">
            <div className="flex flex-wrap items-end justify-between gap-sm rounded-xl bg-surface-container-low px-md py-sm">
              <div className="text-label-md font-bold capitalize text-on-surface">{monthLabelPt(ym)}</div>
              <div className="text-body-sm font-semibold text-on-surface-variant">{formatBRL(total)}</div>
            </div>
            <ul className="space-y-sm border-l-2 border-dashed border-outline-variant pl-md">
              {items.map((item) => (
                <li key={`${item.kind}-${item.id}`} className="relative">
                  <span className="absolute -left-[1.4rem] top-3 size-2.5 rounded-full bg-primary" />
                  <div className="flex items-start justify-between gap-md rounded-xl border border-outline-variant bg-surface px-md py-md">
                    <div className="min-w-0">
                      <div className="truncate text-label-md font-semibold text-on-surface">{item.title}</div>
                      <div className="mt-2xs text-body-sm text-on-surface-variant">
                        {FLEET_ENTRY_LABELS[item.kind as FleetEntryType] ?? item.kind}
                        {item.subtitle ? ` · ${item.subtitle}` : ""}
                        {item.odometer != null ? ` · odômetro ${formatKm(item.odometer)}` : ""}
                      </div>
                      <div className="mt-2xs flex flex-wrap items-center gap-sm text-body-sm text-on-surface-variant">
                        <span>{new Date(item.occurredAt).toLocaleString("pt-BR")}</span>
                        {item.driverName ? <span>· Motorista: {item.driverName}</span> : null}
                        {item.createdByName ? <span>· Lançado por: {item.createdByName}</span> : null}
                        {item.hasAttachment && item.kind === "refueling" ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-2xs rounded-lg bg-amber-500/15 px-sm py-2xs text-label-sm font-medium text-amber-800"
                            onClick={() => void openAttachments(item)}
                          >
                            <Icon name="photo_camera" className="text-base" />
                            Ver nota
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {item.kind === "reading" && item.kmDay != null ? (
                      <div className="shrink-0 text-right">
                        <div className="text-label-md font-bold text-primary">+{formatKm(item.kmDay)}</div>
                        <div className="text-label-sm text-on-surface-variant">no dia</div>
                      </div>
                    ) : item.amount ? (
                      <div className="shrink-0 text-label-md font-bold text-primary">{formatBRL(item.amount)}</div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <Dialog
        open={Boolean(attachItem)}
        onOpenChange={(open) => {
          if (!open) {
            setAttachItem(null);
            setAttachPhotos([]);
          }
        }}
      >
        <DialogContent className="p-lg" style={{ width: "min(36rem, 100%)" }}>
          <DialogHeader>
            <DialogTitle>Fotos da nota</DialogTitle>
          </DialogHeader>
          {attachLoading ? (
            <p className="text-body-sm text-on-surface-variant">Carregando anexos…</p>
          ) : !attachPhotos.length ? (
            <p className="text-body-sm text-on-surface-variant">Nenhuma foto encontrada.</p>
          ) : (
            <div className="grid grid-cols-2 gap-sm sm:grid-cols-3">
              {attachPhotos.map((photo, idx) => (
                <a
                  key={idx}
                  href={photo.foto}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-xl border border-outline-variant bg-surface"
                >
                  <img src={photo.thumb || photo.foto} alt={`Nota ${idx + 1}`} className="aspect-square w-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type ReportSection =
  | "geral"
  | "refueling"
  | "expense"
  | "income"
  | "service"
  | "route"
  | "reading"
  | "checklist"
  | "reminder";

const REPORT_SECTIONS: Array<{ id: ReportSection; label: string; icon: string }> = [
  { id: "geral", label: "Geral", icon: "dashboard" },
  { id: "refueling", label: "Abastecimento", icon: "local_gas_station" },
  { id: "expense", label: "Despesa", icon: "payments" },
  { id: "income", label: "Receita", icon: "trending_up" },
  { id: "service", label: "Serviço", icon: "build" },
  { id: "route", label: "Percurso", icon: "route" },
  { id: "reading", label: "KM do dia", icon: "speed" },
  { id: "checklist", label: "Checklist", icon: "checklist" },
  { id: "reminder", label: "Lembrete", icon: "alarm" },
];

const monthChartConfig = {
  total: { label: "Total", color: "var(--secondary-container)" },
} satisfies ChartConfig;

function ReportKpi({
  label,
  value,
  hints,
  accent = false,
}: {
  label: string;
  value: string;
  hints?: string[];
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-md">
      <div className="text-label-sm text-on-surface-variant">{label}</div>
      <div
        className={cn(
          "mt-xs text-headline-sm font-bold",
          accent ? "text-amber-700" : "text-on-surface",
        )}
      >
        {value}
      </div>
      {hints?.length ? (
        <div className="mt-sm space-y-2xs text-body-sm text-on-surface-variant">
          {hints.map((h) => (
            <div key={h}>{h}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MonthlyBars({
  title,
  data,
}: {
  title: string;
  data: Array<{ month: string; total: number }>;
}) {
  const chartData = data.map((d) => ({
    month: d.month.slice(5) + "/" + d.month.slice(0, 4),
    total: d.total,
  }));
  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-md">
      <div className="mb-md text-title-md font-semibold text-on-surface">{title}</div>
      {!chartData.length ? (
        <div className="flex h-48 items-center justify-center text-body-sm text-on-surface-variant">
          Sem lançamentos no período.
        </div>
      ) : (
        <ChartContainer config={monthChartConfig} className="aspect-[2/1] w-full">
          <BarChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} width={48} fontSize={11} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(v) => formatBRL(Number(v))}
                  labelFormatter={(l) => String(l)}
                />
              }
            />
            <Bar dataKey="total" fill="var(--color-total)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartContainer>
      )}
    </div>
  );
}

function ReportPanel({ report, loading }: { report: Report | null; loading: boolean }) {
  const [section, setSection] = useState<ReportSection>("refueling");

  if (loading) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center text-body-sm text-on-surface-variant">
        Calculando relatório…
      </div>
    );
  }
  if (!report) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center text-body-sm text-on-surface-variant">
        Selecione um veículo para ver o resumo.
      </div>
    );
  }

  const r = report.refueling;

  return (
    <div className="space-y-md">
      <nav className="flex gap-xs overflow-x-auto pb-2xs">
        {REPORT_SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-xs rounded-xl px-md py-sm text-label-md transition",
              section === s.id
                ? "bg-primary text-on-primary"
                : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high",
            )}
          >
            <Icon name={s.icon} className="text-lg" />
            {s.label}
          </button>
        ))}
      </nav>

      {section === "geral" ? (
        <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
          <ReportKpi label="Saldo" value={formatBRL(report.balance)} accent />
          <ReportKpi label="Custo" value={formatBRL(report.cost)} />
          <ReportKpi label="Receita" value={formatBRL(report.revenue)} />
          <ReportKpi
            label="Abastecimento"
            value={formatBRL(report.refuelTotal)}
            hints={[`${report.counts.refuel} lançamentos`]}
          />
          <ReportKpi
            label="Despesas"
            value={formatBRL(report.expenseTotal)}
            hints={[`${report.counts.expense} lançamentos`]}
          />
          <ReportKpi
            label="Serviços"
            value={formatBRL(report.serviceTotal)}
            hints={[`${report.counts.service} lançamentos`]}
          />
          <ReportKpi label="Distância (percursos)" value={formatKm(report.distanceKm)} />
          <ReportKpi
            label="Litros"
            value={`${report.refuelLiters.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`}
            hints={[`Média ${formatKmPerLiter(r.avgEfficiency || null)}`]}
          />
        </div>
      ) : null}

      {section === "refueling" ? (
        <div className="space-y-md">
          <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-4">
            <ReportKpi
              label="Custo"
              value={formatBRL(r.cost)}
              accent
              hints={[
                `${formatBRL(r.costPerDay)}/dia`,
                r.costPerKm > 0 ? `${formatBRL(r.costPerKm)}/km` : "—/km",
              ]}
            />
            <ReportKpi
              label="Volume"
              value={`${r.liters.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L`}
              accent
              hints={[
                `${r.litersPerRefuel.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L por abastecimento`,
                `${r.litersPerDay.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L/dia`,
              ]}
            />
            <ReportKpi
              label="Preço médio"
              value={`${formatBRL(r.avgPrice)}/L`}
              accent
              hints={[
                `Menor ${formatBRL(r.minPrice)}`,
                `Maior ${formatBRL(r.maxPrice)}`,
              ]}
            />
            <ReportKpi
              label="Média"
              value={formatKmPerLiter(r.avgEfficiency || null)}
              accent
              hints={[
                `Menor ${formatKmPerLiter(r.minEfficiency || null)}`,
                `Maior ${formatKmPerLiter(r.maxEfficiency || null)}`,
              ]}
            />
          </div>

          <div className="rounded-xl border border-outline-variant bg-surface p-md">
            <div className="mb-md text-title-md font-semibold text-on-surface">
              Rotina de abastecimento
            </div>
            <div className="grid gap-md sm:grid-cols-3">
              <div>
                <div className="text-label-sm text-on-surface-variant">Entre abastecimentos</div>
                <div className="mt-2xs text-title-lg font-bold text-amber-700">
                  {r.kmBetween > 0 ? formatKm(Math.round(r.kmBetween)) : "—"}
                </div>
              </div>
              <div>
                <div className="text-label-sm text-on-surface-variant">Frequência</div>
                <div className="mt-2xs text-title-lg font-bold text-amber-700">
                  {r.frequencyDays > 0
                    ? `${r.frequencyDays.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} dias`
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-label-sm text-on-surface-variant">Projeção mensal</div>
                <div className="mt-2xs text-title-lg font-bold text-amber-700">
                  {formatBRL(r.monthlyProjection)}
                </div>
              </div>
            </div>
            <div className="mt-md">
              <div className="mb-xs flex items-center justify-between text-body-sm text-on-surface-variant">
                <span>
                  {r.fullTankQty} de {report.counts.refuel} abastecimentos com tanque cheio (
                  {r.fullTankPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
                <div
                  className="h-full rounded-full bg-amber-500"
                  style={{ width: `${Math.min(100, r.fullTankPct)}%` }}
                />
              </div>
            </div>
          </div>

          <MonthlyBars title="Gráfico gastos mensais" data={report.monthly.refuel} />
        </div>
      ) : null}

      {section === "expense" ? (
        <div className="space-y-md">
          <div className="grid gap-md sm:grid-cols-2">
            <ReportKpi
              label="Total despesas"
              value={formatBRL(report.expenseTotal)}
              accent
              hints={[`${report.counts.expense} lançamentos`]}
            />
            <ReportKpi
              label="Média / dia"
              value={formatBRL(report.expenseTotal / report.periodDays)}
            />
          </div>
          <MonthlyBars title="Despesas mensais" data={report.monthly.expense} />
        </div>
      ) : null}

      {section === "income" ? (
        <div className="space-y-md">
          <div className="grid gap-md sm:grid-cols-2">
            <ReportKpi
              label="Total receitas"
              value={formatBRL(report.incomeTotal)}
              accent
              hints={[`${report.counts.income} lançamentos`]}
            />
            <ReportKpi label="Receita + frete" value={formatBRL(report.revenue)} />
          </div>
          <MonthlyBars title="Receitas mensais" data={report.monthly.income} />
        </div>
      ) : null}

      {section === "service" ? (
        <div className="space-y-md">
          <div className="grid gap-md sm:grid-cols-2">
            <ReportKpi
              label="Total serviços"
              value={formatBRL(report.serviceTotal)}
              accent
              hints={[`${report.counts.service} lançamentos`]}
            />
          </div>
          <MonthlyBars title="Serviços mensais" data={report.monthly.service} />
        </div>
      ) : null}

      {section === "route" ? (
        <div className="grid gap-md sm:grid-cols-2">
          <ReportKpi
            label="Distância"
            value={formatKm(report.distanceKm)}
            accent
            hints={[`${report.counts.route} percursos`]}
          />
          <ReportKpi label="Frete registrado" value={formatBRL(report.revenue - report.incomeTotal)} />
        </div>
      ) : null}

        {section === "reading" ? (
        <ReportKpi label="Lançamentos de KM no período" value={String(report.counts.reading)} accent />
      ) : null}
      {section === "checklist" ? (
        <ReportKpi label="Checklists no período" value={String(report.counts.checklist)} accent />
      ) : null}
      {section === "reminder" ? (
        <ReportKpi label="Lembretes ativos" value={String(report.counts.reminder)} accent />
      ) : null}
    </div>
  );
}

function RemindersPanel({
  reminders,
  vehicles,
  onRefresh,
  onAdd,
}: {
  reminders: Boot["reminders"];
  vehicles: Vehicle[];
  onRefresh: () => Promise<void>;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-md">
      <div className="flex justify-end gap-sm">
        <button
          type="button"
          className="rounded-xl border border-outline-variant px-md py-sm text-label-md"
          onClick={() => void onRefresh()}
        >
          Atualizar
        </button>
        <button
          type="button"
          className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container"
          onClick={onAdd}
        >
          Novo lembrete
        </button>
      </div>
      {!reminders.length ? (
        <div className="flex min-h-[10rem] items-center justify-center text-body-sm text-on-surface-variant">
          Nenhum lembrete ativo.
        </div>
      ) : (
        <div className="grid gap-sm sm:grid-cols-2">
          {reminders.map((r) => {
            const v = vehicles.find((x) => x.id === r.vehicleId);
            return (
              <div
                key={r.id}
                className="rounded-xl border border-outline-variant bg-surface px-md py-md"
              >
                <div className="flex items-start gap-md">
                  <span className="inline-flex size-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-700">
                    <Icon name="alarm" className="text-xl" />
                  </span>
                  <div>
                    <div className="font-semibold text-on-surface">{r.title}</div>
                    <div className="mt-2xs text-body-sm text-on-surface-variant">
                      {v ? vehicleLabel(v) : `Veículo #${r.vehicleId}`}
                      {r.dueDate ? ` · ${r.dueDate}` : ""}
                      {r.dueOdometer != null ? ` · ${formatKm(r.dueOdometer)}` : ""}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VehiclesPanel({
  vehicles,
  onNew,
  onEdit,
  onDelete,
  onRefresh,
}: {
  vehicles: Vehicle[];
  onNew: () => void;
  onEdit: (v: Vehicle) => void;
  onDelete: (v: Vehicle) => void | Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  return (
    <div className="space-y-md">
      <div className="flex justify-end gap-sm">
        <button
          type="button"
          className="rounded-xl border border-outline-variant px-md py-sm text-label-md"
          onClick={() => void onRefresh()}
        >
          Atualizar
        </button>
        <button
          type="button"
          className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container"
          onClick={onNew}
        >
          Novo veículo
        </button>
      </div>
      {!vehicles.length ? (
        <div className="flex min-h-[10rem] items-center justify-center text-body-sm text-on-surface-variant">
          Nenhum veículo cadastrado.
        </div>
      ) : (
        <div className="grid gap-sm sm:grid-cols-2">
          {vehicles.map((v) => (
            <div
              key={v.id}
              className="rounded-xl border border-outline-variant bg-surface px-md py-md"
            >
              <div className="flex items-start gap-md">
                <FleetBrandMark brand={v.brand} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-on-surface">{v.name}</div>
                  <div className="mt-2xs text-body-sm text-on-surface-variant">
                    {[v.brand, v.model].filter(Boolean).join(" · ") || "Sem marca/modelo"}
                  </div>
                  <div className="mt-2xs text-body-sm text-on-surface-variant">
                    {v.plate ? `${v.plate} · ` : ""}
                    {formatKm(v.currentOdometer)}
                    {!v.active ? " · inativo" : ""}
                  </div>
                  <div className="mt-sm flex flex-wrap gap-xs">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2xs rounded-lg border border-outline-variant px-sm py-2xs text-label-sm font-semibold text-primary"
                      onClick={() => onEdit(v)}
                    >
                      <Icon name="edit" className="text-[16px]" />
                      Editar / KM
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2xs rounded-lg border border-error/30 px-sm py-2xs text-label-sm font-semibold text-error"
                      onClick={() => void onDelete(v)}
                    >
                      <Icon name="delete" className="text-[16px]" />
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DriversPanel({
  drivers,
  onNew,
  onRefresh,
}: {
  drivers: Driver[];
  onNew: () => void;
  onRefresh: () => Promise<void>;
}) {
  return (
    <div className="space-y-md">
      <div className="flex justify-end gap-sm">
        <button
          type="button"
          className="rounded-xl border border-outline-variant px-md py-sm text-label-md"
          onClick={() => void onRefresh()}
        >
          Atualizar
        </button>
        <button
          type="button"
          className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container"
          onClick={onNew}
        >
          Novo motorista
        </button>
      </div>
      {!drivers.length ? (
        <div className="flex min-h-[10rem] items-center justify-center text-body-sm text-on-surface-variant">
          Nenhum motorista cadastrado.
        </div>
      ) : (
        <div className="grid gap-sm sm:grid-cols-2">
          {drivers.map((d) => (
            <div
              key={d.id}
              className="rounded-xl border border-outline-variant bg-surface px-md py-md"
            >
              <div className="flex items-start gap-md">
                <span className="inline-flex size-10 items-center justify-center rounded-xl bg-surface-container-low text-on-surface">
                  <Icon name="person" className="text-xl" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-xs font-semibold text-on-surface">
                    <span>{d.name}</span>
                    {d.userId ? (
                      <span className="rounded-md bg-primary/10 px-xs py-2xs text-label-sm font-medium text-primary">
                        Usuário do sistema
                      </span>
                    ) : null}
                    {!d.active ? (
                      <span className="text-label-sm font-medium text-on-surface-variant">inativo</span>
                    ) : null}
                  </div>
                  <div className="mt-2xs text-body-sm text-on-surface-variant">
                    {[d.phone, d.email, d.cnh].filter(Boolean).join(" · ") || "Sem contatos"}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-xs text-label-sm">
      <span className="text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-outline-variant bg-surface px-md py-sm text-body-md";

function EntryFormDialog({
  type,
  vehicles,
  drivers,
  catalog,
  defaultVehicleId,
  defaultDriverId,
  onClose,
  onSaved,
}: {
  type: FleetEntryType;
  vehicles: Vehicle[];
  drivers: Driver[];
  catalog: Boot["catalog"];
  defaultVehicleId: number | null;
  defaultDriverId: number | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState(defaultVehicleId ?? vehicles[0]?.id ?? 0);
  const [driverId, setDriverId] = useState<number | "">(
    defaultDriverId ?? drivers.find((d) => d.active)?.id ?? drivers[0]?.id ?? "",
  );
  const [occurredAt, setOccurredAt] = useState(nowLocalInput());
  const [odometer, setOdometer] = useState(() => {
    const v = vehicles.find((x) => x.id === (defaultVehicleId ?? vehicles[0]?.id ?? 0));
    return type === "reading" && v ? String(v.currentOdometer || "") : "";
  });
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [fuelType, setFuelType] = useState(catalog.fuels[0]?.name ?? "Gas. Comum");
  const [pricePerLiter, setPricePerLiter] = useState("");
  const [liters, setLiters] = useState("");
  const [fullTank, setFullTank] = useState(true);
  const [station, setStation] = useState("");
  const [expenseType, setExpenseType] = useState(catalog.expenses[0]?.name ?? "Outros");
  const [serviceType, setServiceType] = useState(catalog.services[0]?.name ?? "Outros");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [location, setLocation] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueOdometer, setDueOdometer] = useState("");
  const [intervalKm, setIntervalKm] = useState("5000");
  const [intervalDays, setIntervalDays] = useState("180");
  const [checklistText, setChecklistText] = useState("Pneus\nFaróis\nÓleo\nDocumentos");
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const readingKmDay = useMemo(() => {
    if (type !== "reading") return null;
    const next = Number(odometer);
    const prev = selectedVehicle?.currentOdometer ?? 0;
    if (!Number.isFinite(next)) return null;
    return Math.max(0, Math.round((next - prev) * 10) / 10);
  }, [type, odometer, selectedVehicle?.currentOdometer]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!vehicleId) {
      setErr("Selecione um veículo.");
      return;
    }
    setBusy(true);
    setErr(null);
    const iso = new Date(occurredAt).toISOString();
    const driver = driverId === "" ? null : Number(driverId);
    try {
      if (type === "refueling") {
        const total = parseMoney(amount);
        const ppl = parseMoney(pricePerLiter);
        let L = parseMoney(liters);
        if (!L && ppl > 0 && total > 0) L = total / ppl;
        await createRefuelingFn({
          data: {
            vehicleId,
            driverId: driver,
            occurredAt: iso,
            odometer: Number(odometer),
            fuelType,
            pricePerLiter: ppl,
            totalAmount: total,
            liters: L,
            fullTank,
            station: station || null,
            paymentMethod: paymentMethod || null,
            notes: notes || null,
            photos,
          },
        });
      } else if (type === "expense") {
        await createExpenseFn({
          data: {
            vehicleId,
            driverId: driver,
            occurredAt: iso,
            odometer: odometer ? Number(odometer) : null,
            title: title || null,
            expenseType,
            amount: parseMoney(amount),
            location: location || null,
            paymentMethod: paymentMethod || null,
            notes: notes || null,
          },
        });
      } else if (type === "income") {
        await createIncomeFn({
          data: {
            vehicleId,
            driverId: driver,
            occurredAt: iso,
            odometer: odometer ? Number(odometer) : null,
            title: title || null,
            amount: parseMoney(amount),
            location: location || null,
            paymentMethod: paymentMethod || null,
            notes: notes || null,
          },
        });
      } else if (type === "service") {
        await createServiceFn({
          data: {
            vehicleId,
            driverId: driver,
            occurredAt: iso,
            odometer: odometer ? Number(odometer) : null,
            title: title || null,
            serviceType,
            amount: parseMoney(amount),
            location: location || null,
            paymentMethod: paymentMethod || null,
            notes: notes || null,
          },
        });
      } else if (type === "route") {
        await createRouteFn({
          data: {
            vehicleId,
            driverId: driver,
            occurredAt: iso,
            origin: origin || null,
            destination: destination || null,
            distanceKm: distanceKm ? Number(distanceKm) : null,
            odometerEnd: odometer ? Number(odometer) : null,
            freightAmount: parseMoney(amount),
            notes: notes || null,
          },
        });
      } else if (type === "reading") {
        if (!reason.trim()) {
          setErr("Informe o motivo da atualização do KM.");
          setBusy(false);
          return;
        }
        await createReadingFn({
          data: {
            vehicleId,
            driverId: driver,
            occurredAt: iso,
            odometer: Number(odometer),
            reason: reason.trim(),
            notes: notes || null,
          },
        });
      } else if (type === "checklist") {
        const items = checklistText
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((label) => ({ label, ok: true }));
        await createChecklistFn({
          data: {
            vehicleId,
            driverId: driver,
            occurredAt: iso,
            odometer: odometer ? Number(odometer) : null,
            title: title || "Checklist",
            items,
            notes: notes || null,
          },
        });
      } else if (type === "reminder") {
        await saveFleetReminderFn({
          data: {
            vehicleId,
            title: title || "Lembrete",
            dueDate: dueDate || null,
            dueOdometer: dueOdometer ? Number(dueOdometer) : null,
            intervalDays: intervalDays ? Number(intervalDays) : null,
            intervalKm: intervalKm ? Number(intervalKm) : null,
            notes: notes || null,
          },
        });
      }
      await onSaved();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-lg">
        <DialogHeader>
          <DialogTitle>{FLEET_ENTRY_LABELS[type]}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-md" onSubmit={onSubmit}>
          <Field label="Veículo">
            <SuggestInput
              value={vehicleId ? String(vehicleId) : ""}
              onChange={(v) => {
                const id = Number(v) || 0;
                setVehicleId(id);
                if (type === "reading") {
                  const next = vehicles.find((x) => x.id === id);
                  if (next) setOdometer(String(next.currentOdometer || ""));
                }
              }}
              freeText={false}
              required
              placeholder="Digite nome, marca ou placa…"
              leading={
                (() => {
                  const v = vehicles.find((x) => x.id === vehicleId);
                  return v?.brand ? (
                    <FleetBrandMark brand={v.brand} size="sm" />
                  ) : (
                    <Icon name="directions_car" className="text-xl text-on-surface-variant" />
                  );
                })()
              }
              options={vehicles.map((v) => ({
                value: String(v.id),
                label: vehicleLabel(v),
                hint: v.plate,
              }))}
            />
          </Field>
          <Field label="Data / hora">
            <input
              type="datetime-local"
              className={inputClass}
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              required
            />
          </Field>
          {type !== "reminder" ? (
            <Field label="Motorista">
              <SuggestInput
                value={driverId === "" ? "" : String(driverId)}
                onChange={(v) => setDriverId(v ? Number(v) : "")}
                freeText={false}
                placeholder="Digite o nome do motorista…"
                emptyLabel="Nenhum motorista encontrado"
                options={[
                  { value: "", label: "— sem motorista —" },
                  ...drivers.map((d) => ({
                    value: String(d.id),
                    label: d.name,
                    hint: d.userId ? "Usuário do sistema" : d.phone,
                  })),
                ]}
              />
            </Field>
          ) : null}

          {["refueling", "expense", "income", "service", "reading", "checklist", "route"].includes(
            type,
          ) ? (
            <div className="space-y-xs">
              <Field label={type === "reading" ? "Odômetro atual (km)" : "Odômetro (km)"}>
                <input
                  className={inputClass}
                  value={odometer}
                  onChange={(e) => setOdometer(e.target.value)}
                  required={type === "refueling" || type === "reading"}
                  inputMode="decimal"
                  placeholder={
                    type === "reading" && selectedVehicle
                      ? `Atual no sistema: ${selectedVehicle.currentOdometer}`
                      : undefined
                  }
                />
              </Field>
              {type === "reading" ? (
                <p className="text-body-sm text-on-surface-variant">
                  Odômetro no sistema:{" "}
                  <span className="font-semibold text-on-surface">
                    {formatKm(selectedVehicle?.currentOdometer ?? 0)}
                  </span>
                  {readingKmDay != null ? (
                    <>
                      {" "}
                      · KM do dia:{" "}
                      <span className="font-semibold text-primary">+{formatKm(readingKmDay)}</span>
                    </>
                  ) : null}
                </p>
              ) : null}
            </div>
          ) : null}

          {type === "reading" ? (
            <Field label="Motivo da atualização">
              <input
                className={inputClass}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                placeholder="Ex.: Fim do expediente, troca de motorista, correção…"
              />
            </Field>
          ) : null}

          {type === "refueling" ? (
            <>
              <Field label="Combustível">
                <SuggestInput
                  value={fuelType}
                  onChange={setFuelType}
                  freeText
                  placeholder="Ex.: Gas. Comum, Diesel…"
                  options={catalog.fuels.map((f) => ({ value: f.name, label: f.name }))}
                />
              </Field>
              <div className="grid grid-cols-3 gap-sm">
                <Field label="Preço / L">
                  <input
                    className={inputClass}
                    value={pricePerLiter}
                    onChange={(e) => setPricePerLiter(e.target.value)}
                  />
                </Field>
                <Field label="Valor total">
                  <input
                    className={inputClass}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Litros">
                  <input
                    className={inputClass}
                    value={liters}
                    onChange={(e) => setLiters(e.target.value)}
                  />
                </Field>
              </div>
              <label className="flex items-center gap-sm text-body-sm">
                <input
                  type="checkbox"
                  checked={fullTank}
                  onChange={(e) => setFullTank(e.target.checked)}
                />
                Completando o tanque?
              </label>
              <Field label="Posto">
                <input className={inputClass} value={station} onChange={(e) => setStation(e.target.value)} />
              </Field>
              <PhotoCapture
                photos={photos}
                onChange={setPhotos}
                max={6}
                label="Fotos da nota / comprovante"
                disabled={busy}
              />
            </>
          ) : null}

          {type === "expense" ? (
            <>
              <Field label="Título (opcional)">
                <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label="Tipo de despesa">
                <SuggestInput
                  value={expenseType}
                  onChange={setExpenseType}
                  freeText
                  placeholder="Ex.: Pedágio, Seguro…"
                  options={catalog.expenses.map((f) => ({ value: f.name, label: f.name }))}
                />
              </Field>
              <Field label="Valor">
                <input
                  className={inputClass}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </Field>
              <Field label="Local">
                <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
              </Field>
            </>
          ) : null}

          {type === "income" ? (
            <>
              <Field label="Título">
                <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label="Valor">
                <input
                  className={inputClass}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </Field>
            </>
          ) : null}

          {type === "service" ? (
            <>
              <Field label="Título (opcional)">
                <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label="Tipo de serviço">
                <SuggestInput
                  value={serviceType}
                  onChange={setServiceType}
                  freeText
                  placeholder="Ex.: Troca de óleo, Revisão…"
                  options={catalog.services.map((f) => ({ value: f.name, label: f.name }))}
                />
              </Field>
              <Field label="Valor">
                <input className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="Local">
                <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
              </Field>
            </>
          ) : null}

          {type === "route" ? (
            <>
              <Field label="Origem">
                <input className={inputClass} value={origin} onChange={(e) => setOrigin(e.target.value)} />
              </Field>
              <Field label="Destino">
                <input
                  className={inputClass}
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                />
              </Field>
              <Field label="Distância (km)">
                <input
                  className={inputClass}
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(e.target.value)}
                />
              </Field>
              <Field label="Frete / valor (opcional)">
                <input className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
            </>
          ) : null}

          {type === "checklist" ? (
            <>
              <Field label="Título">
                <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label="Itens (um por linha)">
                <textarea
                  className={inputClass}
                  rows={5}
                  value={checklistText}
                  onChange={(e) => setChecklistText(e.target.value)}
                />
              </Field>
            </>
          ) : null}

          {type === "reminder" ? (
            <>
              <Field label="Título">
                <input
                  className={inputClass}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </Field>
              <Field label="Data prevista">
                <input
                  type="date"
                  className={inputClass}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </Field>
              <Field label="Odômetro previsto">
                <input
                  className={inputClass}
                  value={dueOdometer}
                  onChange={(e) => setDueOdometer(e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-sm">
                <Field label="Intervalo (dias)">
                  <input
                    className={inputClass}
                    value={intervalDays}
                    onChange={(e) => setIntervalDays(e.target.value)}
                  />
                </Field>
                <Field label="Intervalo (km)">
                  <input
                    className={inputClass}
                    value={intervalKm}
                    onChange={(e) => setIntervalKm(e.target.value)}
                  />
                </Field>
              </div>
            </>
          ) : null}

          {["refueling", "expense", "income", "service"].includes(type) ? (
            <Field label="Forma de pagamento">
              <SuggestInput
                value={paymentMethod}
                onChange={setPaymentMethod}
                freeText
                placeholder="Ex.: PIX, Cartão, Dinheiro…"
                options={catalog.payments.map((p) => ({ value: p.name, label: p.name }))}
              />
            </Field>
          ) : null}

          <Field label="Observação">
            <textarea
              className={inputClass}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          {err ? <p className="text-body-sm text-error">{err}</p> : null}

          <DialogFooter>
            <button type="button" className="rounded-lg px-md py-sm text-label-md" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container disabled:opacity-60"
            >
              {busy ? "Salvando…" : "Cadastrar"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VehicleFormDialog({
  vehicle,
  onClose,
  onSaved,
}: {
  vehicle: Vehicle | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const editing = Boolean(vehicle);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(vehicle?.name ?? "");
  const [brand, setBrand] = useState(vehicle?.brand ?? "");
  const [model, setModel] = useState(vehicle?.model ?? "");
  const [plate, setPlate] = useState(vehicle?.plate ?? "");
  const [odometer, setOdometer] = useState(String(vehicle?.currentOdometer ?? 0));
  const [active, setActive] = useState(vehicle?.active ?? true);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await saveFleetVehicleFn({
        data: {
          id: vehicle?.id ?? null,
          name,
          brand: brand || null,
          model: model || null,
          plate: plate || null,
          currentOdometer: Number(odometer) || 0,
          active,
        },
      });
      await onSaved();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-lg" style={{ width: "min(28rem, 100%)" }}>
        <DialogHeader>
          <DialogTitle>{editing ? "Editar veículo" : "Novo veículo"}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-md" onSubmit={onSubmit}>
          <Field label="Nome / código">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <div className="grid grid-cols-2 gap-sm">
            <Field label="Marca">
              <SuggestInput
                value={brand}
                onChange={setBrand}
                freeText
                placeholder="Digite a marca…"
                leading={<FleetBrandMark brand={brand || null} size="sm" />}
                options={FLEET_BRAND_OPTIONS.map((id) => ({
                  value: FLEET_BRAND_LABELS[id],
                  label: FLEET_BRAND_LABELS[id],
                }))}
              />
            </Field>
            <Field label="Modelo">
              <input className={inputClass} value={model} onChange={(e) => setModel(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-sm">
            <Field label="Placa">
              <input className={inputClass} value={plate} onChange={(e) => setPlate(e.target.value)} />
            </Field>
            <Field label={editing ? "Odômetro atual (km)" : "Odômetro inicial"}>
              <input
                className={inputClass}
                type="number"
                min={0}
                step="0.1"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
              />
            </Field>
          </div>
          {editing ? (
            <label className="inline-flex items-center gap-sm text-body-md text-on-surface">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Veículo ativo
            </label>
          ) : null}
          {err ? <p className="text-body-sm text-error">{err}</p> : null}
          <DialogFooter>
            <button type="button" onClick={onClose} className="rounded-lg px-md py-sm">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-secondary-container px-md py-sm font-semibold text-on-secondary-container"
            >
              {busy ? "Salvando…" : "Salvar"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditReadingDialog({
  reading,
  onClose,
  onSaved,
}: {
  reading: DailyKmItem;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const occurredLocal = useMemo(() => {
    const d = new Date(reading.occurredAt);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, [reading.occurredAt]);
  const [occurredAt, setOccurredAt] = useState(occurredLocal);
  const [odometer, setOdometer] = useState(String(reading.odometer));
  const [reason, setReason] = useState(reading.reason ?? "");
  const [notes, setNotes] = useState(reading.notes ?? "");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const km = Number(odometer);
      if (!Number.isFinite(km) || km < 0) {
        throw new Error("Informe um odômetro válido.");
      }
      await updateReadingFn({
        data: {
          id: reading.id,
          odometer: km,
          occurredAt: occurredAt ? new Date(occurredAt).toISOString() : null,
          reason: reason.trim(),
          notes: notes.trim() || null,
        },
      });
      await onSaved();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Falha ao salvar KM.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-lg" style={{ width: "min(28rem, 100%)" }}>
        <DialogHeader>
          <DialogTitle>Editar lançamento de KM</DialogTitle>
          <p className="text-body-sm text-on-surface-variant">
            {reading.vehicleName}
            {reading.vehiclePlate ? ` · ${reading.vehiclePlate}` : ""}
          </p>
        </DialogHeader>
        <form className="grid gap-md" onSubmit={onSubmit}>
          <Field label="Data/hora">
            <input
              className={inputClass}
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </Field>
          <Field label="Odômetro (km)">
            <input
              className={inputClass}
              type="number"
              min={0}
              step="0.1"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
              required
            />
          </Field>
          <Field label="Motivo">
            <input
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </Field>
          <Field label="Observação">
            <textarea
              className={inputClass}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          {err ? <p className="text-body-sm text-error">{err}</p> : null}
          <DialogFooter>
            <button type="button" onClick={onClose} className="rounded-lg px-md py-sm">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-secondary-container px-md py-sm font-semibold text-on-secondary-container"
            >
              {busy ? "Salvando…" : "Salvar KM"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DriverFormDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cnh, setCnh] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await saveFleetDriverFn({
        data: { name, phone: phone || null, email: email || null, cnh: cnh || null },
      });
      await onSaved();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-lg" style={{ width: "min(28rem, 100%)" }}>
        <DialogHeader>
          <DialogTitle>Novo motorista</DialogTitle>
        </DialogHeader>
        <form className="grid gap-md" onSubmit={onSubmit}>
          <Field label="Nome">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Telefone">
            <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="E-mail">
            <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="CNH">
            <input className={inputClass} value={cnh} onChange={(e) => setCnh(e.target.value)} />
          </Field>
          {err ? <p className="text-body-sm text-error">{err}</p> : null}
          <DialogFooter>
            <button type="button" onClick={onClose} className="rounded-lg px-md py-sm">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-secondary-container px-md py-sm font-semibold text-on-secondary-container"
            >
              Salvar
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
