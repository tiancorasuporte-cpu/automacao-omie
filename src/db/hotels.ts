import { hash } from "bcryptjs";

import { getDb } from "./schema";

export type HotelRow = {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  logo: Uint8Array | Buffer | null;
  logo_mime: string | null;
  module_cameras: boolean;
  module_waha: boolean;
  created_at: Date;
  updated_at: Date;
};

function slugify(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slug || `hotel-${Date.now()}`;
}

type HotelMeta = Omit<HotelRow, "logo"> & { has_logo?: boolean };

export async function listHotels() {
  const db = await getDb();
  return db<HotelMeta[]>`
    select
      id, name, slug, active, logo_mime, created_at, updated_at,
      coalesce(module_cameras, false) as module_cameras,
      coalesce(module_waha, false) as module_waha,
      (logo is not null) as has_logo
    from hotels
    order by name
  `;
}

export async function listActiveHotels() {
  const db = await getDb();
  return db<HotelMeta[]>`
    select
      id, name, slug, active, logo_mime, created_at, updated_at,
      coalesce(module_cameras, false) as module_cameras,
      coalesce(module_waha, false) as module_waha,
      (logo is not null) as has_logo
    from hotels
    where active = true
    order by name
  `;
}

export async function getHotelById(id: number) {
  const db = await getDb();
  const rows = await db<HotelMeta[]>`
    select
      id, name, slug, active, logo_mime, created_at, updated_at,
      coalesce(module_cameras, false) as module_cameras,
      coalesce(module_waha, false) as module_waha,
      (logo is not null) as has_logo
    from hotels
    where id = ${id}
    limit 1
  `;
  return rows[0];
}

export async function getHotelLogo(id: number) {
  const db = await getDb();
  const rows = await db<{ logo: Uint8Array | Buffer | null; logo_mime: string | null }[]>`
    select logo, logo_mime from hotels where id = ${id} limit 1
  `;
  const row = rows[0];
  if (!row?.logo) return null;
  const buffer = Buffer.isBuffer(row.logo) ? row.logo : Buffer.from(row.logo);
  return {
    mime: row.logo_mime || "image/png",
    base64: buffer.toString("base64"),
  };
}

export async function setHotelLogo(id: number, logo: Buffer, mime: string) {
  const db = await getDb();
  await db`
    update hotels
    set logo = ${logo}, logo_mime = ${mime}, updated_at = now()
    where id = ${id}
  `;
}

export async function clearHotelLogo(id: number) {
  const db = await getDb();
  await db`
    update hotels
    set logo = null, logo_mime = null, updated_at = now()
    where id = ${id}
  `;
}

export async function getHotelBySlug(slug: string) {
  const db = await getDb();
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return undefined;
  const rows = await db<HotelMeta[]>`
    select
      id, name, slug, active, logo_mime, created_at, updated_at,
      coalesce(module_cameras, false) as module_cameras,
      coalesce(module_waha, false) as module_waha,
      (logo is not null) as has_logo
    from hotels
    where slug = ${normalized}
    limit 1
  `;
  return rows[0];
}

export async function createHotel(input: {
  name: string;
  adminName: string;
  adminUsername: string;
  adminPassword: string;
}) {
  const db = await getDb();
  const base = slugify(input.name);
  let slug = base;
  for (let index = 2; index < 50; index += 1) {
    const taken = await db<{ id: number }[]>`select id from hotels where slug = ${slug} limit 1`;
    if (!taken[0]) break;
    slug = `${base}-${index}`;
  }

  const rows = await db<HotelRow[]>`
    insert into hotels (name, slug, active, module_cameras, module_waha)
    values (${input.name.trim()}, ${slug}, true, false, false)
    returning *
  `;
  const hotel = rows[0];
  if (!hotel) throw new Error("Não foi possível criar o hotel");

  const passwordHash = await hash(input.adminPassword, 10);
  await db`
    insert into users (username, password_hash, name, role, hotel_id, active)
    values (${input.adminUsername.trim()}, ${passwordHash}, ${input.adminName.trim()}, 'admin', ${hotel.id}, true)
  `;
  return hotel;
}

export async function renameHotel(id: number, name: string) {
  const db = await getDb();
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new Error("Informe o nome do hotel");
  const rows = await db<HotelMeta[]>`
    update hotels
    set name = ${trimmed}, updated_at = now()
    where id = ${id}
    returning
      id, name, slug, active, logo_mime, created_at, updated_at,
      coalesce(module_cameras, false) as module_cameras,
      coalesce(module_waha, false) as module_waha,
      (logo is not null) as has_logo
  `;
  return rows[0];
}

export async function setHotelModules(
  id: number,
  modules: { cameras?: boolean; waha?: boolean },
) {
  const db = await getDb();
  const current = await getHotelById(id);
  if (!current) throw new Error("Hotel não encontrado");
  const cameras = modules.cameras ?? Boolean(current.module_cameras);
  const waha = modules.waha ?? Boolean(current.module_waha);
  await db`
    update hotels
    set
      module_cameras = ${cameras},
      module_waha = ${waha},
      updated_at = now()
    where id = ${id}
  `;
}

export async function setHotelActive(id: number, active: boolean) {
  const db = await getDb();
  await db`update hotels set active = ${active}, updated_at = now() where id = ${id}`;
}

export async function deleteHotel(id: number) {
  const db = await getDb();
  const count = await db<{ count: number }[]>`select count(*)::int as count from hotels`;
  if ((count[0]?.count ?? 0) <= 1) {
    throw new Error("Não é possível excluir o único hotel da suíte.");
  }

  await db`delete from cameras where hotel_id = ${id}`;
  await db`
    delete from device_people
    where device_id in (select id from devices where hotel_id = ${id})
       or guest_id in (select id from guests where hotel_id = ${id})
  `;
  await db`
    delete from access_events
    where device_id in (select id from devices where hotel_id = ${id})
  `;
  await db`
    delete from device_sync_state
    where device_id in (select id from devices where hotel_id = ${id})
  `;
  await db`delete from guest_devices where guest_id in (select id from guests where hotel_id = ${id})`;
  await db`delete from devices where hotel_id = ${id}`;
  await db`delete from guests where hotel_id = ${id}`;
  await db`delete from users where hotel_id = ${id}`;
  const rows = await db<{ id: number }[]>`delete from hotels where id = ${id} returning id`;
  if (!rows[0]) throw new Error("Hotel não encontrado");
}

export async function hotelStats(hotelId: number) {
  const db = await getDb();
  const users = await db<{ count: number }[]>`
    select count(*)::int as count from users where hotel_id = ${hotelId} and active = true
  `;
  const devices = await db<{ count: number }[]>`
    select count(*)::int as count from devices where hotel_id = ${hotelId}
  `;
  const people = await db<{ count: number }[]>`
    select count(*)::int as count from guests where hotel_id = ${hotelId} and active = true
  `;
  return {
    users: users[0]?.count ?? 0,
    devices: devices[0]?.count ?? 0,
    people: people[0]?.count ?? 0,
  };
}
