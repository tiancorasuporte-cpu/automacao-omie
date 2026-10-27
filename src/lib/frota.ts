import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { ensureSchema } from "@/db/schema";
import {
  createChecklist,
  createExpense,
  createIncome,
  createReading,
  createRefueling,
  createRoute,
  createService,
  ensureFleetCatalogDefaults,
  ensureFleetDriverForUser,
  getFleetReportTotals,
  getRefuelingAttachments,
  listFleetCatalog,
  listFleetDrivers,
  listFleetVehicles,
  listReminders,
  listVehicleHistory,
  saveFleetDriver,
  saveFleetVehicle,
  saveReminder,
} from "@/db/frota";
import { requireModule } from "@/lib/require-auth";

async function boot() {
  await ensureSchema();
  await ensureFleetCatalogDefaults();
}

async function auth() {
  return requireModule("frota");
}

const photoSchema = z.object({
  foto: z.string().min(32),
  thumb: z.string().min(16),
});

export const getFrotaBootstrapFn = createServerFn({ method: "GET" }).handler(async () => {
  const { user } = await auth();
  await boot();
  const currentDriver = await ensureFleetDriverForUser({ id: user.id, name: user.name });
  const [vehicles, drivers, fuels, expenses, services, payments, reminders] = await Promise.all([
    listFleetVehicles(false),
    listFleetDrivers(false),
    listFleetCatalog("fuel"),
    listFleetCatalog("expense"),
    listFleetCatalog("service"),
    listFleetCatalog("payment"),
    listReminders(null),
  ]);
  return {
    user: { id: user.id, name: user.name },
    currentDriverId: currentDriver.id,
    vehicles,
    drivers,
    catalog: { fuels, expenses, services, payments },
    reminders,
  };
});

export const getFrotaHistoryFn = createServerFn({ method: "GET" })
  .validator((input) => z.object({ vehicleId: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    await auth();
    await boot();
    return listVehicleHistory(data.vehicleId);
  });

export const getFrotaReportFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        vehicleId: z.number().int().positive(),
        from: z.string().min(8),
        to: z.string().min(8),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    await auth();
    await boot();
    return getFleetReportTotals(data.vehicleId, data.from, data.to);
  });

export const saveFleetVehicleFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive().optional().nullable(),
        name: z.string().min(1),
        brand: z.string().optional().nullable(),
        model: z.string().optional().nullable(),
        plate: z.string().optional().nullable(),
        year: z.number().int().optional().nullable(),
        color: z.string().optional().nullable(),
        fuelCapacityLiters: z.number().optional().nullable(),
        currentOdometer: z.number().optional().nullable(),
        notes: z.string().optional().nullable(),
        active: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    await auth();
    await boot();
    const id = await saveFleetVehicle({
      id: data.id ?? null,
      name: data.name,
      brand: data.brand ?? null,
      model: data.model ?? null,
      plate: data.plate ?? null,
      year: data.year ?? null,
      color: data.color ?? null,
      fuelCapacityLiters: data.fuelCapacityLiters ?? null,
      currentOdometer: data.currentOdometer ?? null,
      notes: data.notes ?? null,
      active: data.active ?? true,
    });
    return { ok: true as const, id };
  });

export const saveFleetDriverFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive().optional().nullable(),
        name: z.string().min(1),
        phone: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        cnh: z.string().optional().nullable(),
        active: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    await auth();
    await boot();
    const id = await saveFleetDriver({
      id: data.id ?? null,
      name: data.name,
      phone: data.phone ?? null,
      email: data.email ?? null,
      cnh: data.cnh ?? null,
      active: data.active ?? true,
    });
    return { ok: true as const, id };
  });

export const saveFleetReminderFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive().optional().nullable(),
        vehicleId: z.number().int().positive(),
        title: z.string().min(1),
        triggerKind: z.string().optional(),
        dueDate: z.string().optional().nullable(),
        dueOdometer: z.number().optional().nullable(),
        lastDoneAt: z.string().optional().nullable(),
        lastDoneOdometer: z.number().optional().nullable(),
        intervalDays: z.number().int().optional().nullable(),
        intervalKm: z.number().int().optional().nullable(),
        active: z.boolean().optional(),
        notes: z.string().optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    await auth();
    await boot();
    const id = await saveReminder({
      id: data.id ?? null,
      vehicleId: data.vehicleId,
      title: data.title,
      triggerKind: data.triggerKind ?? "both",
      dueDate: data.dueDate ?? null,
      dueOdometer: data.dueOdometer ?? null,
      lastDoneAt: data.lastDoneAt ?? null,
      lastDoneOdometer: data.lastDoneOdometer ?? null,
      intervalDays: data.intervalDays ?? null,
      intervalKm: data.intervalKm ?? null,
      active: data.active ?? true,
      notes: data.notes ?? null,
    });
    return { ok: true as const, id };
  });

const baseEntry = {
  vehicleId: z.number().int().positive(),
  driverId: z.number().int().positive().optional().nullable(),
  occurredAt: z.string().min(8),
  notes: z.string().optional().nullable(),
};

export const createRefuelingFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        ...baseEntry,
        odometer: z.number(),
        fuelType: z.string().min(1),
        pricePerLiter: z.number(),
        totalAmount: z.number(),
        liters: z.number(),
        fullTank: z.boolean().optional(),
        station: z.string().optional().nullable(),
        reason: z.string().optional().nullable(),
        paymentMethod: z.string().optional().nullable(),
        discount: z.number().optional(),
        previousMissing: z.boolean().optional(),
        photos: z.array(photoSchema).max(6).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const me = await ensureFleetDriverForUser({ id: user.id, name: user.name });
    const id = await createRefueling({
      vehicleId: data.vehicleId,
      driverId: data.driverId ?? me.id,
      occurredAt: data.occurredAt,
      odometer: data.odometer,
      fuelType: data.fuelType,
      pricePerLiter: data.pricePerLiter,
      totalAmount: data.totalAmount,
      liters: data.liters,
      fullTank: data.fullTank ?? false,
      station: data.station ?? null,
      reason: data.reason ?? null,
      paymentMethod: data.paymentMethod ?? null,
      discount: data.discount ?? 0,
      previousMissing: data.previousMissing ?? false,
      notes: data.notes ?? null,
      photos: data.photos ?? [],
      createdBy: user.id,
    });
    return { ok: true as const, id };
  });

export const getRefuelingAttachmentsFn = createServerFn({ method: "GET" })
  .validator((input) => z.object({ id: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    await auth();
    await boot();
    return getRefuelingAttachments(data.id);
  });

export const createExpenseFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        ...baseEntry,
        odometer: z.number().optional().nullable(),
        title: z.string().optional().nullable(),
        expenseType: z.string().min(1),
        amount: z.number(),
        discount: z.number().optional(),
        installments: z.number().int().optional().nullable(),
        location: z.string().optional().nullable(),
        reason: z.string().optional().nullable(),
        paymentMethod: z.string().optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const id = await createExpense({
      vehicleId: data.vehicleId,
      driverId: data.driverId ?? null,
      occurredAt: data.occurredAt,
      odometer: data.odometer ?? null,
      title: data.title ?? null,
      expenseType: data.expenseType,
      amount: data.amount,
      discount: data.discount ?? 0,
      installments: data.installments ?? null,
      location: data.location ?? null,
      reason: data.reason ?? null,
      paymentMethod: data.paymentMethod ?? null,
      notes: data.notes ?? null,
      createdBy: user.id,
    });
    return { ok: true as const, id };
  });

export const createIncomeFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        ...baseEntry,
        odometer: z.number().optional().nullable(),
        title: z.string().optional().nullable(),
        incomeType: z.string().optional(),
        amount: z.number(),
        location: z.string().optional().nullable(),
        paymentMethod: z.string().optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const id = await createIncome({
      vehicleId: data.vehicleId,
      driverId: data.driverId ?? null,
      occurredAt: data.occurredAt,
      odometer: data.odometer ?? null,
      title: data.title ?? null,
      incomeType: data.incomeType ?? "Receita",
      amount: data.amount,
      location: data.location ?? null,
      paymentMethod: data.paymentMethod ?? null,
      notes: data.notes ?? null,
      createdBy: user.id,
    });
    return { ok: true as const, id };
  });

export const createServiceFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        ...baseEntry,
        odometer: z.number().optional().nullable(),
        title: z.string().optional().nullable(),
        serviceType: z.string().min(1),
        amount: z.number(),
        discount: z.number().optional(),
        installments: z.number().int().optional().nullable(),
        location: z.string().optional().nullable(),
        paymentMethod: z.string().optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const id = await createService({
      vehicleId: data.vehicleId,
      driverId: data.driverId ?? null,
      occurredAt: data.occurredAt,
      odometer: data.odometer ?? null,
      title: data.title ?? null,
      serviceType: data.serviceType,
      amount: data.amount,
      discount: data.discount ?? 0,
      installments: data.installments ?? null,
      location: data.location ?? null,
      paymentMethod: data.paymentMethod ?? null,
      notes: data.notes ?? null,
      createdBy: user.id,
    });
    return { ok: true as const, id };
  });

export const createRouteFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        ...baseEntry,
        odometerStart: z.number().optional().nullable(),
        odometerEnd: z.number().optional().nullable(),
        distanceKm: z.number().optional().nullable(),
        origin: z.string().optional().nullable(),
        destination: z.string().optional().nullable(),
        purpose: z.string().optional().nullable(),
        freightAmount: z.number().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const id = await createRoute({
      vehicleId: data.vehicleId,
      driverId: data.driverId ?? null,
      occurredAt: data.occurredAt,
      odometerStart: data.odometerStart ?? null,
      odometerEnd: data.odometerEnd ?? null,
      distanceKm: data.distanceKm ?? null,
      origin: data.origin ?? null,
      destination: data.destination ?? null,
      purpose: data.purpose ?? null,
      freightAmount: data.freightAmount ?? 0,
      notes: data.notes ?? null,
      createdBy: user.id,
    });
    return { ok: true as const, id };
  });

export const createReadingFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        ...baseEntry,
        odometer: z.number(),
        kind: z.string().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const id = await createReading({
      vehicleId: data.vehicleId,
      driverId: data.driverId ?? null,
      occurredAt: data.occurredAt,
      odometer: data.odometer,
      kind: data.kind ?? "odometer",
      notes: data.notes ?? null,
      createdBy: user.id,
    });
    return { ok: true as const, id };
  });

export const createChecklistFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        ...baseEntry,
        odometer: z.number().optional().nullable(),
        title: z.string().optional(),
        items: z.array(
          z.object({
            label: z.string(),
            ok: z.boolean(),
            note: z.string().optional(),
          }),
        ),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const id = await createChecklist({
      vehicleId: data.vehicleId,
      driverId: data.driverId ?? null,
      occurredAt: data.occurredAt,
      odometer: data.odometer ?? null,
      title: data.title ?? "Checklist",
      items: data.items.map((item) => ({
        label: item.label,
        ok: item.ok,
        ...(item.note != null ? { note: item.note } : {}),
      })),
      notes: data.notes ?? null,
      createdBy: user.id,
    });
    return { ok: true as const, id };
  });
