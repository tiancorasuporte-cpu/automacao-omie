import { getDb } from "./schema";

export type DeviceModel = "idface_max" | "idface" | "idbio" | "other";

export type DeviceRow = {
  id: number;
  name: string;
  model: string;
  location: string | null;
  ip: string;
  port: number;
  use_https: boolean;
  username: string;
  password: string;
  serial: string | null;
  firmware: string | null;
  hardware_id: string | null;
  last_seen_at: Date | null;
  last_sync_at: Date | null;
  last_error: string | null;
  hotel_id: number;
  created_at: Date;
  updated_at: Date;
};

export type NewDevice = {
  name: string;
  model: DeviceModel;
  location?: string | null;
  ip: string;
  port: number;
  useHttps?: boolean;
  username: string;
  password: string;
  hotelId: number;
};

export async function listDevices(hotelId: number): Promise<DeviceRow[]> {
  const db = await getDb();
  return db<DeviceRow[]>`
    select *
    from devices
    where hotel_id = ${hotelId}
    order by name
  `;
}

export async function listAllDevices(): Promise<DeviceRow[]> {
  const db = await getDb();
  return db<DeviceRow[]>`
    select *
    from devices
    order by name
  `;
}

export async function getDeviceById(id: number): Promise<DeviceRow | undefined> {
  const db = await getDb();
  const rows = await db<DeviceRow[]>`
    select * from devices where id = ${id} limit 1
  `;
  return rows[0];
}

export async function insertDevice(input: NewDevice): Promise<DeviceRow> {
  const db = await getDb();
  const rows = await db<DeviceRow[]>`
    insert into devices (name, model, location, ip, port, use_https, username, password, hotel_id)
    values (
      ${input.name},
      ${input.model},
      ${input.location ?? null},
      ${input.ip},
      ${input.port},
      ${input.useHttps ?? false},
      ${input.username},
      ${input.password},
      ${input.hotelId}
    )
    returning *
  `;
  const row = rows[0];
  if (!row) throw new Error("Failed to insert device");
  return row;
}

export async function updateDeviceProbe(
  id: number,
  patch: {
    serial?: string | null;
    firmware?: string | null;
    hardwareId?: string | null;
    lastError?: string | null;
    seen?: boolean;
  },
) {
  const db = await getDb();
  await db`
    update devices
    set
      serial = coalesce(${patch.serial ?? null}, serial),
      firmware = coalesce(${patch.firmware ?? null}, firmware),
      hardware_id = coalesce(${patch.hardwareId ?? null}, hardware_id),
      last_error = ${patch.lastError ?? null},
      last_seen_at = case when ${patch.seen ?? false} then now() else last_seen_at end,
      updated_at = now()
    where id = ${id}
  `;
}

export async function markDeviceSynced(id: number) {
  const db = await getDb();
  await db`
    update devices
    set last_sync_at = now(), last_error = null, updated_at = now()
    where id = ${id}
  `;
}

export async function countDevices(hotelId: number) {
  const db = await getDb();
  const rows = await db<{ count: number }[]>`
    select count(*)::int as count from devices where hotel_id = ${hotelId}
  `;
  return rows[0]?.count ?? 0;
}

export async function updateDevice(
  id: number,
  input: {
    name: string;
    model: DeviceModel;
    location?: string | null;
    ip: string;
    port: number;
    username: string;
    password?: string | null;
  },
): Promise<DeviceRow> {
  const db = await getDb();
  const rows = input.password
    ? await db<DeviceRow[]>`
        update devices
        set
          name = ${input.name},
          model = ${input.model},
          location = ${input.location ?? null},
          ip = ${input.ip},
          port = ${input.port},
          username = ${input.username},
          password = ${input.password},
          updated_at = now()
        where id = ${id}
        returning *
      `
    : await db<DeviceRow[]>`
        update devices
        set
          name = ${input.name},
          model = ${input.model},
          location = ${input.location ?? null},
          ip = ${input.ip},
          port = ${input.port},
          username = ${input.username},
          updated_at = now()
        where id = ${id}
        returning *
      `;
  const row = rows[0];
  if (!row) throw new Error("Equipamento não encontrado");
  return row;
}

export async function deleteDevice(id: number) {
  const db = await getDb();
  await db`delete from devices where id = ${id}`;
}
