import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";
import {
  DEFAULT_EXPENSE_TYPES,
  DEFAULT_FUEL_TYPES,
  DEFAULT_PAYMENT_METHODS,
  DEFAULT_SERVICE_TYPES,
} from "@/lib/frota-domain";

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown) {
  return v == null ? "" : String(v);
}

function nullableStr(v: unknown) {
  const s = str(v).trim();
  return s || null;
}

export type FleetVehicle = {
  id: number;
  name: string;
  brand: string | null;
  model: string | null;
  plate: string | null;
  year: number | null;
  color: string | null;
  fuelCapacityLiters: number | null;
  currentOdometer: number;
  notes: string | null;
  active: boolean;
};

export type FleetDriver = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  cnh: string | null;
  userId: number | null;
  active: boolean;
};

export type FleetRefuelingPhoto = { foto: string; thumb: string };

export type FleetHistoryItem = {
  id: number;
  kind: "refueling" | "expense" | "income" | "service" | "route" | "reading" | "checklist";
  vehicleId: number;
  occurredAt: string;
  title: string;
  subtitle: string | null;
  amount: number;
  odometer: number | null;
  hasAttachment: boolean;
};

function mapVehicle(row: Record<string, unknown>): FleetVehicle {
  return {
    id: num(row["id"]),
    name: str(row["name"]),
    brand: row["brand"] == null ? null : str(row["brand"]),
    model: row["model"] == null ? null : str(row["model"]),
    plate: row["plate"] == null ? null : str(row["plate"]),
    year: row["year"] == null ? null : num(row["year"]),
    color: row["color"] == null ? null : str(row["color"]),
    fuelCapacityLiters: row["fuel_capacity_liters"] == null ? null : num(row["fuel_capacity_liters"]),
    currentOdometer: num(row["current_odometer"]),
    notes: row["notes"] == null ? null : str(row["notes"]),
    active: Boolean(row["active"]),
  };
}

function mapDriver(row: Record<string, unknown>): FleetDriver {
  return {
    id: num(row["id"]),
    name: str(row["name"]),
    phone: row["phone"] == null ? null : str(row["phone"]),
    email: row["email"] == null ? null : str(row["email"]),
    cnh: row["cnh"] == null ? null : str(row["cnh"]),
    userId: row["user_id"] == null ? null : num(row["user_id"]),
    active: Boolean(row["active"]),
  };
}

const MAX_PHOTO_CHARS = 1_600_000;
const MAX_THUMB_CHARS = 120_000;
const PHOTO_MIME = /^data:image\/(jpeg|png|webp);base64,/;

function assertFleetPhoto(value: string, max: number, label: string) {
  if (!PHOTO_MIME.test(value)) throw new Error(`${label} em formato inválido.`);
  if (value.length > max) throw new Error(`${label} muito grande. Tire a foto novamente.`);
}

function normalizeRefuelingPhotos(photos: FleetRefuelingPhoto[] | undefined | null) {
  const list = (photos ?? []).slice(0, 6);
  for (const photo of list) {
    assertFleetPhoto(photo.foto, MAX_PHOTO_CHARS, "Foto da nota");
    assertFleetPhoto(photo.thumb, MAX_THUMB_CHARS, "Miniatura da nota");
  }
  return list;
}

function encodeAttachmentPayload(photos: FleetRefuelingPhoto[]) {
  if (!photos.length) return { name: null as string | null, data: null as string | null };
  return {
    name: photos.length === 1 ? "nota.jpg" : `${photos.length} fotos`,
    data: JSON.stringify(photos),
  };
}

function decodeAttachmentPhotos(raw: string | null | undefined): FleetRefuelingPhoto[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (p): p is FleetRefuelingPhoto =>
          Boolean(p) &&
          typeof p === "object" &&
          typeof (p as FleetRefuelingPhoto).foto === "string" &&
          typeof (p as FleetRefuelingPhoto).thumb === "string",
      )
      .slice(0, 6);
  } catch {
    // legado: data URL única
    if (PHOTO_MIME.test(raw)) return [{ foto: raw, thumb: raw }];
    return [];
  }
}

/** Garante motorista vinculado ao usuário com acesso à Frota. */
export async function ensureFleetDriverForUser(user: {
  id: number;
  name: string;
}) {
  const db = await getDb();
  const name = user.name.trim() || `Usuário #${user.id}`;
  const [linked] = (await db`
    select * from fleet_drivers where user_id = ${user.id} limit 1
  `) as Array<Record<string, unknown>>;
  if (linked) {
    await db`
      update fleet_drivers
      set name = ${name}, active = true
      where id = ${num(linked["id"])}
    `;
    return mapDriver({ ...linked, name, active: true, user_id: user.id });
  }
  const [orphan] = (await db`
    select * from fleet_drivers
    where user_id is null and lower(trim(name)) = lower(${name})
    order by id asc
    limit 1
  `) as Array<Record<string, unknown>>;
  if (orphan) {
    await db`
      update fleet_drivers
      set user_id = ${user.id}, active = true, name = ${name}
      where id = ${num(orphan["id"])}
    `;
    return mapDriver({ ...orphan, user_id: user.id, name, active: true });
  }
  const [row] = (await db`
    insert into fleet_drivers (name, user_id, active)
    values (${name}, ${user.id}, true)
    returning *
  `) as Array<Record<string, unknown>>;
  return mapDriver(row!);
}

export async function deactivateFleetDriverForUser(userId: number) {
  const db = await getDb();
  await db`update fleet_drivers set active = false where user_id = ${userId}`;
}

export async function ensureFleetCatalogDefaults() {
  const db = await getDb();
  const seeds: Array<{ kind: string; names: readonly string[] }> = [
    { kind: "fuel", names: DEFAULT_FUEL_TYPES },
    { kind: "expense", names: DEFAULT_EXPENSE_TYPES },
    { kind: "service", names: DEFAULT_SERVICE_TYPES },
    { kind: "payment", names: DEFAULT_PAYMENT_METHODS },
  ];
  for (const group of seeds) {
    for (const name of group.names) {
      await db`
        insert into fleet_catalog (kind, name)
        values (${group.kind}, ${name})
        on conflict (kind, name) do nothing
      `;
    }
  }
}

export async function listFleetVehicles(activeOnly = true) {
  const db = await getDb();
  const rows = (await db`
    select * from fleet_vehicles
    where (${activeOnly} = false or active = true)
    order by name asc
  `) as Array<Record<string, unknown>>;
  return rows.map(mapVehicle);
}

export async function listFleetDrivers(activeOnly = true) {
  const db = await getDb();
  const rows = (await db`
    select * from fleet_drivers
    where (${activeOnly} = false or active = true)
    order by name asc
  `) as Array<Record<string, unknown>>;
  return rows.map(mapDriver);
}

export async function listFleetCatalog(kind: string) {
  const db = await getDb();
  const rows = (await db`
    select id, kind, name from fleet_catalog
    where kind = ${kind} and active = true
    order by name asc
  `) as Array<Record<string, unknown>>;
  return rows.map((r) => ({ id: num(r["id"]), kind: str(r["kind"]), name: str(r["name"]) }));
}

export async function saveFleetVehicle(input: {
  id?: number | null;
  name: string;
  brand?: string | null;
  model?: string | null;
  plate?: string | null;
  year?: number | null;
  color?: string | null;
  fuelCapacityLiters?: number | null;
  currentOdometer?: number | null;
  notes?: string | null;
  active?: boolean;
}) {
  const db = await getDb();
  const name = input.name.trim();
  if (!name) throw new Error("Informe o nome/código do veículo.");
  if (input.id) {
    await db`
      update fleet_vehicles set
        name = ${name},
        brand = ${nullableStr(input.brand)},
        model = ${nullableStr(input.model)},
        plate = ${nullableStr(input.plate)},
        year = ${input.year ?? null},
        color = ${nullableStr(input.color)},
        fuel_capacity_liters = ${input.fuelCapacityLiters ?? null},
        current_odometer = ${input.currentOdometer ?? 0},
        notes = ${nullableStr(input.notes)},
        active = ${input.active ?? true},
        updated_at = now()
      where id = ${input.id}
    `;
    return input.id;
  }
  const [row] = (await db`
    insert into fleet_vehicles (
      name, brand, model, plate, year, color, fuel_capacity_liters, current_odometer, notes, active
    ) values (
      ${name},
      ${nullableStr(input.brand)},
      ${nullableStr(input.model)},
      ${nullableStr(input.plate)},
      ${input.year ?? null},
      ${nullableStr(input.color)},
      ${input.fuelCapacityLiters ?? null},
      ${input.currentOdometer ?? 0},
      ${nullableStr(input.notes)},
      ${input.active ?? true}
    )
    returning id
  `) as Array<{ id: number }>;
  return row!.id;
}

export async function saveFleetDriver(input: {
  id?: number | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  cnh?: string | null;
  userId?: number | null;
  active?: boolean;
}) {
  const db = await getDb();
  const name = input.name.trim();
  if (!name) throw new Error("Informe o nome do motorista.");
  if (input.id) {
    await db`
      update fleet_drivers set
        name = ${name},
        phone = ${nullableStr(input.phone)},
        email = ${nullableStr(input.email)},
        cnh = ${nullableStr(input.cnh)},
        active = ${input.active ?? true}
      where id = ${input.id}
    `;
    return input.id;
  }
  const [row] = (await db`
    insert into fleet_drivers (name, phone, email, cnh, user_id, active)
    values (
      ${name},
      ${nullableStr(input.phone)},
      ${nullableStr(input.email)},
      ${nullableStr(input.cnh)},
      ${input.userId ?? null},
      ${input.active ?? true}
    )
    returning id
  `) as Array<{ id: number }>;
  return row!.id;
}

async function bumpVehicleOdometer(vehicleId: number, odometer: number | null | undefined) {
  if (odometer == null || !Number.isFinite(odometer)) return;
  const db = await getDb();
  await db`
    update fleet_vehicles
    set current_odometer = greatest(current_odometer, ${odometer}),
        updated_at = now()
    where id = ${vehicleId}
  `;
}

export async function createRefueling(input: {
  vehicleId: number;
  driverId?: number | null;
  occurredAt: string;
  odometer: number;
  fuelType: string;
  pricePerLiter: number;
  totalAmount: number;
  liters: number;
  fullTank?: boolean;
  station?: string | null;
  reason?: string | null;
  paymentMethod?: string | null;
  discount?: number;
  previousMissing?: boolean;
  notes?: string | null;
  photos?: FleetRefuelingPhoto[];
  createdBy?: number | null;
}) {
  const photos = normalizeRefuelingPhotos(input.photos);
  const attachment = encodeAttachmentPayload(photos);
  const db = await getDb();
  const [row] = (await db`
    insert into fleet_refuelings (
      vehicle_id, driver_id, occurred_at, odometer, fuel_type, price_per_liter,
      total_amount, liters, full_tank, station, reason, payment_method, discount,
      previous_missing, attachment_name, attachment_data, notes, created_by
    ) values (
      ${input.vehicleId}, ${input.driverId ?? null}, ${input.occurredAt}, ${input.odometer},
      ${input.fuelType}, ${input.pricePerLiter}, ${input.totalAmount}, ${input.liters},
      ${input.fullTank ?? false}, ${nullableStr(input.station)}, ${nullableStr(input.reason)},
      ${nullableStr(input.paymentMethod)}, ${input.discount ?? 0}, ${input.previousMissing ?? false},
      ${attachment.name}, ${attachment.data},
      ${nullableStr(input.notes)}, ${input.createdBy ?? null}
    )
    returning id
  `) as Array<{ id: number }>;
  await bumpVehicleOdometer(input.vehicleId, input.odometer);
  return row!.id;
}

export async function getRefuelingAttachments(refuelingId: number) {
  const db = await getDb();
  const [row] = (await db`
    select attachment_name, attachment_data
    from fleet_refuelings
    where id = ${refuelingId}
    limit 1
  `) as Array<{ attachment_name: string | null; attachment_data: string | null }>;
  if (!row) return null;
  return {
    name: row.attachment_name,
    photos: decodeAttachmentPhotos(row.attachment_data),
  };
}

export async function createExpense(input: {
  vehicleId: number;
  driverId?: number | null;
  occurredAt: string;
  odometer?: number | null;
  title?: string | null;
  expenseType: string;
  amount: number;
  discount?: number;
  installments?: number | null;
  location?: string | null;
  reason?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  createdBy?: number | null;
}) {
  const db = await getDb();
  const [row] = (await db`
    insert into fleet_expenses (
      vehicle_id, driver_id, occurred_at, odometer, title, expense_type, amount,
      discount, installments, location, reason, payment_method, notes, created_by
    ) values (
      ${input.vehicleId}, ${input.driverId ?? null}, ${input.occurredAt}, ${input.odometer ?? null},
      ${nullableStr(input.title)}, ${input.expenseType}, ${input.amount}, ${input.discount ?? 0},
      ${input.installments ?? null}, ${nullableStr(input.location)}, ${nullableStr(input.reason)},
      ${nullableStr(input.paymentMethod)}, ${nullableStr(input.notes)}, ${input.createdBy ?? null}
    )
    returning id
  `) as Array<{ id: number }>;
  await bumpVehicleOdometer(input.vehicleId, input.odometer);
  return row!.id;
}

export async function createIncome(input: {
  vehicleId: number;
  driverId?: number | null;
  occurredAt: string;
  odometer?: number | null;
  title?: string | null;
  incomeType?: string;
  amount: number;
  location?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  createdBy?: number | null;
}) {
  const db = await getDb();
  const [row] = (await db`
    insert into fleet_incomes (
      vehicle_id, driver_id, occurred_at, odometer, title, income_type, amount,
      location, payment_method, notes, created_by
    ) values (
      ${input.vehicleId}, ${input.driverId ?? null}, ${input.occurredAt}, ${input.odometer ?? null},
      ${nullableStr(input.title)}, ${input.incomeType ?? "Receita"}, ${input.amount},
      ${nullableStr(input.location)}, ${nullableStr(input.paymentMethod)},
      ${nullableStr(input.notes)}, ${input.createdBy ?? null}
    )
    returning id
  `) as Array<{ id: number }>;
  await bumpVehicleOdometer(input.vehicleId, input.odometer);
  return row!.id;
}

export async function createService(input: {
  vehicleId: number;
  driverId?: number | null;
  occurredAt: string;
  odometer?: number | null;
  title?: string | null;
  serviceType: string;
  amount: number;
  discount?: number;
  installments?: number | null;
  location?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  createdBy?: number | null;
}) {
  const db = await getDb();
  const [row] = (await db`
    insert into fleet_services (
      vehicle_id, driver_id, occurred_at, odometer, title, service_type, amount,
      discount, installments, location, payment_method, notes, created_by
    ) values (
      ${input.vehicleId}, ${input.driverId ?? null}, ${input.occurredAt}, ${input.odometer ?? null},
      ${nullableStr(input.title)}, ${input.serviceType}, ${input.amount}, ${input.discount ?? 0},
      ${input.installments ?? null}, ${nullableStr(input.location)},
      ${nullableStr(input.paymentMethod)}, ${nullableStr(input.notes)}, ${input.createdBy ?? null}
    )
    returning id
  `) as Array<{ id: number }>;
  await bumpVehicleOdometer(input.vehicleId, input.odometer);
  return row!.id;
}

export async function createRoute(input: {
  vehicleId: number;
  driverId?: number | null;
  occurredAt: string;
  odometerStart?: number | null;
  odometerEnd?: number | null;
  distanceKm?: number | null;
  origin?: string | null;
  destination?: string | null;
  purpose?: string | null;
  freightAmount?: number;
  notes?: string | null;
  createdBy?: number | null;
}) {
  const db = await getDb();
  const [row] = (await db`
    insert into fleet_routes (
      vehicle_id, driver_id, occurred_at, odometer_start, odometer_end, distance_km,
      origin, destination, purpose, freight_amount, notes, created_by
    ) values (
      ${input.vehicleId}, ${input.driverId ?? null}, ${input.occurredAt},
      ${input.odometerStart ?? null}, ${input.odometerEnd ?? null}, ${input.distanceKm ?? null},
      ${nullableStr(input.origin)}, ${nullableStr(input.destination)}, ${nullableStr(input.purpose)},
      ${input.freightAmount ?? 0}, ${nullableStr(input.notes)}, ${input.createdBy ?? null}
    )
    returning id
  `) as Array<{ id: number }>;
  await bumpVehicleOdometer(input.vehicleId, input.odometerEnd ?? input.odometerStart);
  return row!.id;
}

export async function createReading(input: {
  vehicleId: number;
  driverId?: number | null;
  occurredAt: string;
  odometer: number;
  kind?: string;
  notes?: string | null;
  createdBy?: number | null;
}) {
  const db = await getDb();
  const [row] = (await db`
    insert into fleet_readings (
      vehicle_id, driver_id, occurred_at, odometer, kind, notes, created_by
    ) values (
      ${input.vehicleId}, ${input.driverId ?? null}, ${input.occurredAt}, ${input.odometer},
      ${input.kind ?? "odometer"}, ${nullableStr(input.notes)}, ${input.createdBy ?? null}
    )
    returning id
  `) as Array<{ id: number }>;
  await bumpVehicleOdometer(input.vehicleId, input.odometer);
  return row!.id;
}

export async function createChecklist(input: {
  vehicleId: number;
  driverId?: number | null;
  occurredAt: string;
  odometer?: number | null;
  title?: string;
  items: Array<{ label: string; ok: boolean; note?: string }>;
  notes?: string | null;
  createdBy?: number | null;
}) {
  const db = await getDb();
  const [row] = (await db`
    insert into fleet_checklists (
      vehicle_id, driver_id, occurred_at, odometer, title, items_json, notes, created_by
    ) values (
      ${input.vehicleId}, ${input.driverId ?? null}, ${input.occurredAt}, ${input.odometer ?? null},
      ${input.title ?? "Checklist"}, ${JSON.stringify(input.items)}, ${nullableStr(input.notes)},
      ${input.createdBy ?? null}
    )
    returning id
  `) as Array<{ id: number }>;
  await bumpVehicleOdometer(input.vehicleId, input.odometer);
  return row!.id;
}

export async function saveReminder(input: {
  id?: number | null;
  vehicleId: number;
  title: string;
  triggerKind?: string;
  dueDate?: string | null;
  dueOdometer?: number | null;
  lastDoneAt?: string | null;
  lastDoneOdometer?: number | null;
  intervalDays?: number | null;
  intervalKm?: number | null;
  active?: boolean;
  notes?: string | null;
}) {
  const db = await getDb();
  const title = input.title.trim();
  if (!title) throw new Error("Informe o título do lembrete.");
  if (input.id) {
    await db`
      update fleet_reminders set
        title = ${title},
        trigger_kind = ${input.triggerKind ?? "both"},
        due_date = ${input.dueDate ?? null},
        due_odometer = ${input.dueOdometer ?? null},
        last_done_at = ${input.lastDoneAt ?? null},
        last_done_odometer = ${input.lastDoneOdometer ?? null},
        interval_days = ${input.intervalDays ?? null},
        interval_km = ${input.intervalKm ?? null},
        active = ${input.active ?? true},
        notes = ${nullableStr(input.notes)}
      where id = ${input.id}
    `;
    return input.id;
  }
  const [row] = (await db`
    insert into fleet_reminders (
      vehicle_id, title, trigger_kind, due_date, due_odometer, last_done_at,
      last_done_odometer, interval_days, interval_km, active, notes
    ) values (
      ${input.vehicleId}, ${title}, ${input.triggerKind ?? "both"}, ${input.dueDate ?? null},
      ${input.dueOdometer ?? null}, ${input.lastDoneAt ?? null}, ${input.lastDoneOdometer ?? null},
      ${input.intervalDays ?? null}, ${input.intervalKm ?? null}, ${input.active ?? true},
      ${nullableStr(input.notes)}
    )
    returning id
  `) as Array<{ id: number }>;
  return row!.id;
}

export async function listReminders(vehicleId?: number | null) {
  const db = await getDb();
  const rows = (await db`
    select * from fleet_reminders
    where active = true
      and (${vehicleId ?? null}::int is null or vehicle_id = ${vehicleId ?? null})
    order by due_date nulls last, due_odometer nulls last, id desc
  `) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: num(r["id"]),
    vehicleId: num(r["vehicle_id"]),
    title: str(r["title"]),
    triggerKind: str(r["trigger_kind"]),
    dueDate: r["due_date"] == null ? null : str(r["due_date"]).slice(0, 10),
    dueOdometer: r["due_odometer"] == null ? null : num(r["due_odometer"]),
    lastDoneAt: r["last_done_at"] == null ? null : str(r["last_done_at"]).slice(0, 10),
    lastDoneOdometer: r["last_done_odometer"] == null ? null : num(r["last_done_odometer"]),
    intervalDays: r["interval_days"] == null ? null : num(r["interval_days"]),
    intervalKm: r["interval_km"] == null ? null : num(r["interval_km"]),
    notes: r["notes"] == null ? null : str(r["notes"]),
  }));
}

export async function listVehicleHistory(vehicleId: number, limit = 200): Promise<FleetHistoryItem[]> {
  const db = await getDb();
  const rows = (await db`
    (
      select id, 'refueling'::text as kind, vehicle_id, occurred_at::text as occurred_at,
             fuel_type as title, station as subtitle, total_amount as amount, odometer,
             (attachment_data is not null and length(attachment_data) > 0) as has_attachment
      from fleet_refuelings where vehicle_id = ${vehicleId}
    )
    union all
    (
      select id, 'expense', vehicle_id, occurred_at::text, coalesce(nullif(title,''), expense_type),
             location, amount, odometer,
             (attachment_data is not null and length(attachment_data) > 0) as has_attachment
      from fleet_expenses where vehicle_id = ${vehicleId}
    )
    union all
    (
      select id, 'income', vehicle_id, occurred_at::text, coalesce(nullif(title,''), income_type),
             location, amount, odometer, false as has_attachment
      from fleet_incomes where vehicle_id = ${vehicleId}
    )
    union all
    (
      select id, 'service', vehicle_id, occurred_at::text, coalesce(nullif(title,''), service_type),
             location, amount, odometer,
             (attachment_data is not null and length(attachment_data) > 0) as has_attachment
      from fleet_services where vehicle_id = ${vehicleId}
    )
    union all
    (
      select id, 'route', vehicle_id, occurred_at::text,
             coalesce(origin,'') || ' → ' || coalesce(destination,''),
             purpose, freight_amount, odometer_end, false as has_attachment
      from fleet_routes where vehicle_id = ${vehicleId}
    )
    union all
    (
      select id, 'reading', vehicle_id, occurred_at::text, 'Leitura de odômetro', kind, 0, odometer,
             false as has_attachment
      from fleet_readings where vehicle_id = ${vehicleId}
    )
    union all
    (
      select id, 'checklist', vehicle_id, occurred_at::text, title, null, 0, odometer,
             false as has_attachment
      from fleet_checklists where vehicle_id = ${vehicleId}
    )
    order by occurred_at desc
    limit ${limit}
  `) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: num(r["id"]),
    kind: str(r["kind"]) as FleetHistoryItem["kind"],
    vehicleId: num(r["vehicle_id"]),
    occurredAt: str(r["occurred_at"]),
    title: str(r["title"]),
    subtitle: r["subtitle"] == null ? null : str(r["subtitle"]),
    amount: num(r["amount"]),
    odometer: r["odometer"] == null ? null : num(r["odometer"]),
    hasAttachment: Boolean(r["has_attachment"]),
  }));
}

export async function getFleetReportTotals(vehicleId: number, fromIso: string, toIso: string) {
  const db = await getDb();
  const [refuel] = (await db`
    select coalesce(sum(total_amount),0)::float as total, count(*)::int as qty,
           coalesce(sum(liters),0)::float as liters,
           coalesce(avg(nullif(price_per_liter,0)),0)::float as avg_price,
           coalesce(min(nullif(price_per_liter,0)),0)::float as min_price,
           coalesce(max(price_per_liter),0)::float as max_price,
           coalesce(sum(case when full_tank then 1 else 0 end),0)::int as full_tank_qty
    from fleet_refuelings
    where vehicle_id = ${vehicleId} and occurred_at >= ${fromIso} and occurred_at <= ${toIso}
  `) as Array<{
    total: number;
    qty: number;
    liters: number;
    avg_price: number;
    min_price: number;
    max_price: number;
    full_tank_qty: number;
  }>;
  const [expense] = (await db`
    select coalesce(sum(amount),0)::float as total, count(*)::int as qty
    from fleet_expenses
    where vehicle_id = ${vehicleId} and occurred_at >= ${fromIso} and occurred_at <= ${toIso}
  `) as Array<{ total: number; qty: number }>;
  const [service] = (await db`
    select coalesce(sum(amount),0)::float as total, count(*)::int as qty
    from fleet_services
    where vehicle_id = ${vehicleId} and occurred_at >= ${fromIso} and occurred_at <= ${toIso}
  `) as Array<{ total: number; qty: number }>;
  const [income] = (await db`
    select coalesce(sum(amount),0)::float as total, count(*)::int as qty
    from fleet_incomes
    where vehicle_id = ${vehicleId} and occurred_at >= ${fromIso} and occurred_at <= ${toIso}
  `) as Array<{ total: number; qty: number }>;
  const [route] = (await db`
    select coalesce(sum(distance_km),0)::float as km, coalesce(sum(freight_amount),0)::float as freight,
           count(*)::int as qty
    from fleet_routes
    where vehicle_id = ${vehicleId} and occurred_at >= ${fromIso} and occurred_at <= ${toIso}
  `) as Array<{ km: number; freight: number; qty: number }>;
  const [reading] = (await db`
    select count(*)::int as qty from fleet_readings
    where vehicle_id = ${vehicleId} and occurred_at >= ${fromIso} and occurred_at <= ${toIso}
  `) as Array<{ qty: number }>;
  const [checklist] = (await db`
    select count(*)::int as qty from fleet_checklists
    where vehicle_id = ${vehicleId} and occurred_at >= ${fromIso} and occurred_at <= ${toIso}
  `) as Array<{ qty: number }>;
  const [reminder] = (await db`
    select count(*)::int as qty from fleet_reminders
    where vehicle_id = ${vehicleId} and active = true
  `) as Array<{ qty: number }>;

  const refuelRows = (await db`
    select occurred_at::text as occurred_at, odometer::float as odometer,
           liters::float as liters, total_amount::float as total_amount,
           price_per_liter::float as price_per_liter, full_tank
    from fleet_refuelings
    where vehicle_id = ${vehicleId} and occurred_at >= ${fromIso} and occurred_at <= ${toIso}
    order by occurred_at asc, odometer asc, id asc
  `) as Array<{
    occurred_at: string;
    odometer: number;
    liters: number;
    total_amount: number;
    price_per_liter: number;
    full_tank: boolean;
  }>;

  const efficiencies: number[] = [];
  const gapsKm: number[] = [];
  const gapsDays: number[] = [];
  for (let i = 1; i < refuelRows.length; i++) {
    const prev = refuelRows[i - 1]!;
    const cur = refuelRows[i]!;
    const km = num(cur.odometer) - num(prev.odometer);
    if (km > 0) gapsKm.push(km);
    const dayMs = new Date(cur.occurred_at).getTime() - new Date(prev.occurred_at).getTime();
    if (dayMs > 0) gapsDays.push(dayMs / 86_400_000);
    // eficiência típica: km desde o abastecimento anterior / litros do atual (tanque cheio)
    if (cur.full_tank && km > 0 && num(cur.liters) > 0) {
      efficiencies.push(km / num(cur.liters));
    }
  }

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  const periodDays = Math.max(1, Math.round((toMs - fromMs) / 86_400_000) || 1);

  const monthlyRaw = (await db`
    select to_char(occurred_at, 'YYYY-MM') as month, coalesce(sum(total_amount),0)::float as total
    from fleet_refuelings
    where vehicle_id = ${vehicleId} and occurred_at >= ${fromIso} and occurred_at <= ${toIso}
    group by 1 order by 1
  `) as Array<{ month: string; total: number }>;
  const monthlyExpense = (await db`
    select to_char(occurred_at, 'YYYY-MM') as month, coalesce(sum(amount),0)::float as total
    from fleet_expenses
    where vehicle_id = ${vehicleId} and occurred_at >= ${fromIso} and occurred_at <= ${toIso}
    group by 1 order by 1
  `) as Array<{ month: string; total: number }>;
  const monthlyIncome = (await db`
    select to_char(occurred_at, 'YYYY-MM') as month, coalesce(sum(amount),0)::float as total
    from fleet_incomes
    where vehicle_id = ${vehicleId} and occurred_at >= ${fromIso} and occurred_at <= ${toIso}
    group by 1 order by 1
  `) as Array<{ month: string; total: number }>;
  const monthlyService = (await db`
    select to_char(occurred_at, 'YYYY-MM') as month, coalesce(sum(amount),0)::float as total
    from fleet_services
    where vehicle_id = ${vehicleId} and occurred_at >= ${fromIso} and occurred_at <= ${toIso}
    group by 1 order by 1
  `) as Array<{ month: string; total: number }>;

  const cost = num(refuel?.total) + num(expense?.total) + num(service?.total);
  const revenue = num(income?.total) + num(route?.freight);
  const refuelQty = num(refuel?.qty);
  const refuelLiters = num(refuel?.liters);
  const refuelTotal = num(refuel?.total);
  const avgEfficiency = avg(efficiencies);

  return {
    from: fromIso,
    to: toIso,
    periodDays,
    cost,
    revenue,
    balance: revenue - cost,
    refuelTotal,
    refuelLiters,
    expenseTotal: num(expense?.total),
    serviceTotal: num(service?.total),
    incomeTotal: num(income?.total),
    distanceKm: num(route?.km),
    counts: {
      refuel: refuelQty,
      expense: num(expense?.qty),
      service: num(service?.qty),
      income: num(income?.qty),
      route: num(route?.qty),
      reading: num(reading?.qty),
      checklist: num(checklist?.qty),
      reminder: num(reminder?.qty),
    },
    refueling: {
      cost: refuelTotal,
      costPerDay: refuelTotal / periodDays,
      costPerKm: gapsKm.length ? refuelTotal / gapsKm.reduce((a, b) => a + b, 0) : 0,
      liters: refuelLiters,
      litersPerRefuel: refuelQty ? refuelLiters / refuelQty : 0,
      litersPerDay: refuelLiters / periodDays,
      avgPrice: num(refuel?.avg_price),
      minPrice: num(refuel?.min_price),
      maxPrice: num(refuel?.max_price),
      avgEfficiency,
      minEfficiency: efficiencies.length ? Math.min(...efficiencies) : 0,
      maxEfficiency: efficiencies.length ? Math.max(...efficiencies) : 0,
      kmBetween: avg(gapsKm),
      frequencyDays: avg(gapsDays),
      monthlyProjection: (refuelTotal / periodDays) * 30,
      fullTankQty: num(refuel?.full_tank_qty),
      fullTankPct: refuelQty ? (num(refuel?.full_tank_qty) / refuelQty) * 100 : 0,
    },
    monthly: {
      refuel: monthlyRaw.map((r) => ({ month: str(r.month), total: num(r.total) })),
      expense: monthlyExpense.map((r) => ({ month: str(r.month), total: num(r.total) })),
      income: monthlyIncome.map((r) => ({ month: str(r.month), total: num(r.total) })),
      service: monthlyService.map((r) => ({ month: str(r.month), total: num(r.total) })),
    },
  };
}
