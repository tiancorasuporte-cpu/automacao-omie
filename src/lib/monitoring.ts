import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function optionalInt(min: number, max: number) {
  return z
    .union([z.number(), z.string(), z.undefined(), z.null()])
    .optional()
    .transform((value) => {
      if (value == null || value === "") return undefined;
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isInteger(n) || n < min || n > max) return undefined;
      return n;
    });
}

const presenceFilterSchema = z.object({
  year: optionalInt(2000, 2100),
  month: optionalInt(1, 12),
  day: optionalInt(1, 31),
  page: optionalInt(1, 100000),
});

export const listPresenceFn = createServerFn({ method: "GET" })
  .validator((input) => presenceFilterSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireHotelSession } = await import("@/lib/tenant");
    const { ensureAccessLogPoller, pullHotelDeviceLogs } = await import("@/server/sync");
    const { listPresence, listRecentAccessEvents, countFilteredAccessEvents, backfillAccessEventGuests } =
      await import("@/db/events");
    const { hotelId } = await requireHotelSession();
    ensureAccessLogPoller();
    // Wait for every hotel device — fire-and-forget polling often only finished the first one.
    await pullHotelDeviceLogs(hotelId).catch(() => 0);
    await backfillAccessEventGuests().catch(() => undefined);
    const pageSize = 10;
    const eventTotal = await countFilteredAccessEvents({
      hotelId,
      year: data.year ?? null,
      month: data.month ?? null,
      day: data.day ?? null,
    });
    const pageCount = Math.max(1, Math.ceil(eventTotal / pageSize));
    const page = Math.min(data.page ?? 1, pageCount);
    return {
      people: await listPresence(hotelId),
      events: await listRecentAccessEvents({
        hotelId,
        limit: pageSize,
        page,
        year: data.year ?? null,
        month: data.month ?? null,
        day: data.day ?? null,
      }),
      eventTotal,
      eventPage: page,
      eventPageCount: pageCount,
      eventPageSize: pageSize,
    };
  });

export const getOverviewFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireHotelSession } = await import("@/lib/tenant");
  const { countDevices } = await import("@/db/devices");
  const { countPeople } = await import("@/db/people");
  const { countAccessEvents, listPresence } = await import("@/db/events");
  const { hotelId } = await requireHotelSession();
  const presence = await listPresence(hotelId);
  return {
    devices: await countDevices(hotelId),
    people: await countPeople(hotelId),
    events: await countAccessEvents(hotelId),
    active: presence.filter((item) => item.status === "Active").length,
  };
});
