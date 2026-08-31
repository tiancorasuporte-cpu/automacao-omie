import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { DeviceModel } from "@/db/devices";

export type DeviceView = {
  id: number;
  name: string;
  model: string;
  location: string | null;
  ip: string;
  port: number;
  serial: string | null;
  firmware: string | null;
  lastSeenAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  online: boolean;
};

const registerSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do equipamento"),
  model: z.enum(["idface_max", "idface", "idbio", "other"]),
  location: z.string().trim().max(120).optional(),
  ip: z
    .string()
    .trim()
    .regex(/^(?:\d{1,3}\.){3}\d{1,3}$|^[a-zA-Z0-9.-]+$/, "IP ou host inválido"),
  port: z.coerce.number().int().min(1).max(65535),
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const idSchema = z.object({
  id: z.number().int().positive(),
});

async function hotelDevice(id: number) {
  const { requireHotelAdminSession } = await import("@/lib/tenant");
  const { getDeviceById } = await import("@/db/devices");
  const { hotelId } = await requireHotelAdminSession();
  const device = await getDeviceById(id);
  if (!device || device.hotel_id !== hotelId) return { device: undefined, hotelId };
  return { device, hotelId };
}

async function hotelDeviceForStaff(id: number) {
  const { requireHotelSession } = await import("@/lib/tenant");
  const { getDeviceById } = await import("@/db/devices");
  const { hotelId } = await requireHotelSession();
  const device = await getDeviceById(id);
  if (!device || device.hotel_id !== hotelId) return { device: undefined, hotelId };
  return { device, hotelId };
}

function asEndpoint(device: {
  ip: string;
  port: number;
  use_https: boolean;
  username: string;
  password: string;
}) {
  return {
    ip: device.ip,
    port: device.port,
    useHttps: device.use_https,
    username: device.username,
    password: device.password,
  };
}

function toView(
  device: {
    id: number;
    name: string;
    model: string;
    location: string | null;
    ip: string;
    port: number;
    serial: string | null;
    firmware: string | null;
    last_seen_at: Date | null;
    last_sync_at: Date | null;
    last_error: string | null;
  },
  online: boolean,
): DeviceView {
  return {
    id: device.id,
    name: device.name,
    model: device.model,
    location: device.location,
    ip: device.ip,
    port: device.port,
    serial: device.serial,
    firmware: device.firmware,
    lastSeenAt: device.last_seen_at?.toISOString() ?? null,
    lastSyncAt: device.last_sync_at?.toISOString() ?? null,
    lastError: device.last_error,
    online,
  };
}

export const listDevicesFn = createServerFn({ method: "GET" }).handler(async (): Promise<DeviceView[]> => {
  const { requireHotelAdminSession } = await import("@/lib/tenant");
  const { listDevices, updateDeviceProbe } = await import("@/db/devices");
  const { systemInformation } = await import("@/server/control-id");
  const { hotelId } = await requireHotelAdminSession();
  const rows = await listDevices(hotelId);

  return Promise.all(
    rows.map(async (device) => {
      try {
        const info = await systemInformation(asEndpoint(device));
        await updateDeviceProbe(device.id, {
          serial: info.serial ?? null,
          firmware: info.version ?? null,
          hardwareId: info.device_id ?? null,
          lastError: null,
          seen: true,
        });
        return toView(
          {
            ...device,
            serial: info.serial ?? device.serial,
            firmware: info.version ?? device.firmware,
            last_seen_at: new Date(),
            last_error: null,
          },
          true,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Offline";
        await updateDeviceProbe(device.id, { lastError: message, seen: false });
        return toView({ ...device, last_error: message }, false);
      }
    }),
  );
});

export const registerDeviceFn = createServerFn({ method: "POST" })
  .validator(registerSchema)
  .handler(async ({ data }) => {
    const { requireHotelAdminSession } = await import("@/lib/tenant");
    const { insertDevice, updateDeviceProbe, markDeviceSynced } = await import("@/db/devices");
    const { systemInformation, ensureAccessPolicy, ControlIdError } = await import("@/server/control-id");
    const { saveSyncCursor } = await import("@/db/events");
    const { syncDevice } = await import("@/server/sync");
    const { hotelId } = await requireHotelAdminSession();

    const endpoint = {
      ip: data.ip,
      port: data.port,
      username: data.username,
      password: data.password,
    };

    try {
      const info = await systemInformation(endpoint);
      const device = await insertDevice({
        name: data.name,
        model: data.model as DeviceModel,
        location: data.location || null,
        ip: data.ip,
        port: data.port,
        username: data.username,
        password: data.password,
        hotelId,
      });
      await updateDeviceProbe(device.id, {
        serial: info.serial ?? null,
        firmware: info.version ?? null,
        hardwareId: info.device_id ?? null,
        lastError: null,
        seen: true,
      });
      const policy = await ensureAccessPolicy(endpoint);
      await saveSyncCursor(device.id, { groupId: policy.groupId, ruleId: policy.ruleId });
      const sync = await syncDevice(device.id);
      await markDeviceSynced(device.id);
      return { ok: true as const, id: device.id, sync };
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (code === "23505") {
        return { ok: false as const, error: "Já existe um equipamento com este IP e porta." };
      }
      const message =
        error instanceof ControlIdError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Não foi possível cadastrar o equipamento";
      return { ok: false as const, error: message };
    }
  });

export const restartDeviceFn = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data }) => {
    const { rebootDevice } = await import("@/server/control-id");
    const { device } = await hotelDevice(data.id);
    if (!device) return { ok: false as const, error: "Equipamento não encontrado" };
    try {
      await rebootDevice(asEndpoint(device));
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Falha ao reiniciar" };
    }
  });

export const openDeviceDoorFn = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data }) => {
    const { openDoor } = await import("@/server/control-id");
    const { device } = await hotelDeviceForStaff(data.id);
    if (!device) return { ok: false as const, error: "Equipamento não encontrado" };
    try {
      await openDoor(asEndpoint(device));
      await new Promise((resolve) => setTimeout(resolve, 700));
      const { pullAccessLogs } = await import("@/server/sync");
      await pullAccessLogs(device.id).catch(() => 0);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Falha ao abrir a porta" };
    }
  });

export const syncDeviceFn = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data }) => {
    const { markDeviceSynced, updateDeviceProbe } = await import("@/db/devices");
    const { syncDevice } = await import("@/server/sync");
    const { device } = await hotelDevice(data.id);
    if (!device) return { ok: false as const, error: "Equipamento não encontrado" };
    try {
      const result = await syncDevice(device.id);
      await markDeviceSynced(data.id);
      return { ok: true as const, ...result };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha na sincronização";
      await updateDeviceProbe(data.id, { lastError: message, seen: false });
      return { ok: false as const, error: message };
    }
  });

export const clearDeviceFacesFn = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data }) => {
    const { updateDeviceProbe } = await import("@/db/devices");
    const { clearAllFacesOnDevice } = await import("@/server/sync");
    const { device } = await hotelDevice(data.id);
    if (!device) return { ok: false as const, error: "Equipamento não encontrado" };
    try {
      const result = await clearAllFacesOnDevice(device.id);
      await updateDeviceProbe(data.id, { lastError: null, seen: true });
      return {
        ok: true as const,
        removed: result.removed,
        remaining: result.remaining,
        errors: result.errors,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao limpar faces";
      await updateDeviceProbe(data.id, { lastError: message, seen: false });
      return { ok: false as const, error: message };
    }
  });

export const getDeviceFn = createServerFn({ method: "GET" })
  .validator(idSchema)
  .handler(async ({ data }) => {
    const { device } = await hotelDevice(data.id);
    if (!device) return { ok: false as const, error: "Equipamento não encontrado" };
    return {
      ok: true as const,
      device: {
        id: device.id,
        name: device.name,
        model: device.model,
        location: device.location,
        ip: device.ip,
        port: device.port,
        username: device.username,
      },
    };
  });

const updateSchema = registerSchema.omit({ password: true }).extend({
  id: z.number().int().positive(),
  password: z.string().optional(),
});

export const updateDeviceFn = createServerFn({ method: "POST" })
  .validator(updateSchema)
  .handler(async ({ data }) => {
    const { updateDevice, updateDeviceProbe, markDeviceSynced } = await import("@/db/devices");
    const { systemInformation, ensureAccessPolicy, ControlIdError } = await import("@/server/control-id");
    const { saveSyncCursor } = await import("@/db/events");

    const { device: current } = await hotelDevice(data.id);
    if (!current) return { ok: false as const, error: "Equipamento não encontrado" };

    const username = data.username || current.username;
    const password = data.password || current.password;
    const endpoint = { ip: data.ip, port: data.port, username, password };

    try {
      const info = await systemInformation(endpoint);
      const device = await updateDevice(data.id, {
        name: data.name,
        model: data.model as DeviceModel,
        location: data.location || null,
        ip: data.ip,
        port: data.port,
        username,
        password: data.password || null,
      });
      await updateDeviceProbe(device.id, {
        serial: info.serial ?? null,
        firmware: info.version ?? null,
        hardwareId: info.device_id ?? null,
        lastError: null,
        seen: true,
      });
      const policy = await ensureAccessPolicy(endpoint);
      await saveSyncCursor(device.id, { groupId: policy.groupId, ruleId: policy.ruleId });
      await markDeviceSynced(device.id);
      return { ok: true as const, id: device.id };
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (code === "23505") {
        return { ok: false as const, error: "Já existe um equipamento com este IP e porta." };
      }
      const message =
        error instanceof ControlIdError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Não foi possível salvar o equipamento";
      return { ok: false as const, error: message };
    }
  });

export const deleteDeviceFn = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data }) => {
    const { deleteDevice } = await import("@/db/devices");
    const { device } = await hotelDevice(data.id);
    if (!device) return { ok: false as const, error: "Equipamento não encontrado" };
    try {
      await deleteDevice(data.id);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível excluir",
      };
    }
  });
