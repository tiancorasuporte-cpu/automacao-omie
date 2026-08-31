import { getDb } from "./schema";

export type PersonKind = "guest" | "staff";

export type PersonRow = {
  id: number;
  name: string;
  cpf: string;
  room: string | null;
  check_in: Date | null;
  check_out: Date | null;
  control_id_user_id: number | null;
  hotel_id: number;
  kind: string;
  phone: string | null;
  whatsapp_notified_at: Date | null;
  department: string | null;
  document_type: string | null;
  room_type: string | null;
  target_all: boolean;
  photo: Uint8Array | Buffer | null;
  photo_mime: string | null;
  active: boolean;
  updated_at: Date | null;
};

export type PersonPublic = {
  id: number;
  name: string;
  cpf: string;
  room: string | null;
  phone: string | null;
  checkIn: string | null;
  checkOut: string | null;
  kind: PersonKind;
  department: string | null;
  documentType: string;
  roomType: string | null;
  targetAll: boolean;
  hasPhoto: boolean;
  active: boolean;
  controlIdUserId: number | null;
  syncedDevices: number;
  faceSyncedDevices: number;
};

export type NewPerson = {
  name: string;
  cpf: string;
  room?: string | null;
  kind: PersonKind;
  hotelId: number;
  phone?: string | null;
  department?: string | null;
  documentType?: string;
  roomType?: string | null;
  checkIn?: Date | null;
  checkOut?: Date | null;
  targetAll?: boolean;
  photo?: Buffer | null;
  photoMime?: string | null;
};

function toKind(value: string | null | undefined): PersonKind {
  return value === "staff" ? "staff" : "guest";
}

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export async function listPeople(hotelId: number): Promise<PersonPublic[]> {
  const db = await getDb();
  const rows = await db<
    (Omit<PersonRow, "photo"> & {
      has_photo: boolean;
      synced_devices: number;
      face_synced_devices: number;
    })[]
  >`
    select
      g.id,
      g.name,
      g.cpf,
      g.room,
      g.phone,
      g.check_in,
      g.check_out,
      g.control_id_user_id,
      g.kind,
      g.department,
      g.document_type,
      g.room_type,
      g.target_all,
      g.photo_mime,
      g.active,
      g.updated_at,
      (g.photo is not null) as has_photo,
      coalesce(s.synced_devices, 0)::int as synced_devices,
      coalesce(s.face_synced_devices, 0)::int as face_synced_devices
    from guests g
    left join (
      select
        guest_id,
        count(*)::int as synced_devices,
        count(*) filter (where face_synced)::int as face_synced_devices
      from device_people
      group by guest_id
    ) s on s.guest_id = g.id
    where g.active = true and g.hotel_id = ${hotelId}
    order by g.name
  `;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    cpf: row.cpf,
    room: row.room,
    phone: row.phone,
    checkIn: toIso(row.check_in),
    checkOut: toIso(row.check_out),
    kind: toKind(row.kind),
    department: row.department,
    documentType: row.document_type || "cpf",
    roomType: row.room_type,
    targetAll: row.target_all !== false,
    hasPhoto: row.has_photo,
    active: row.active,
    controlIdUserId: row.control_id_user_id,
    syncedDevices: row.synced_devices,
    faceSyncedDevices: row.face_synced_devices,
  }));
}

export async function getPersonById(id: number, hotelId?: number): Promise<PersonRow | undefined> {
  const db = await getDb();
  const rows = hotelId
    ? await db<PersonRow[]>`select * from guests where id = ${id} and hotel_id = ${hotelId} limit 1`
    : await db<PersonRow[]>`select * from guests where id = ${id} limit 1`;
  return rows[0];
}

export async function findPersonByCpf(
  cpf: string,
  hotelId: number,
  exceptId?: number,
): Promise<PersonRow | undefined> {
  const db = await getDb();
  const digitsOnly = cpf.replace(/\D/g, "");
  const rows = exceptId
    ? await db<PersonRow[]>`
        select * from guests
        where hotel_id = ${hotelId}
          and id <> ${exceptId}
          and (
            cpf = ${cpf}
            or regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g') = ${digitsOnly}
          )
        limit 1
      `
    : await db<PersonRow[]>`
        select * from guests
        where hotel_id = ${hotelId}
          and (
            cpf = ${cpf}
            or regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g') = ${digitsOnly}
          )
        limit 1
      `;
  return rows[0];
}

export async function insertPerson(input: NewPerson): Promise<PersonPublic> {
  const db = await getDb();
  const rows = await db<{ id: number }[]>`
    insert into guests (
      name, cpf, room, phone, kind, department, photo, photo_mime,
      check_in, check_out, document_type, room_type, target_all, hotel_id
    )
    values (
      ${input.name},
      ${input.cpf},
      ${input.room ?? null},
      ${input.phone ?? null},
      ${input.kind},
      ${input.department ?? null},
      ${input.photo ?? null},
      ${input.photoMime ?? null},
      ${input.checkIn ?? null},
      ${input.checkOut ?? null},
      ${input.documentType ?? "cpf"},
      ${input.roomType ?? null},
      ${input.targetAll ?? true},
      ${input.hotelId}
    )
    returning id
  `;
  const id = rows[0]?.id;
  if (!id) throw new Error("Failed to insert person");
  const people = await listPeople(input.hotelId);
  const person = people.find((item) => item.id === id);
  if (!person) throw new Error("Failed to load person");
  return person;
}

export async function updatePersonPhoto(id: number, photo: Buffer, mime: string) {
  const db = await getDb();
  await db`
    update guests
    set photo = ${photo}, photo_mime = ${mime}, whatsapp_notified_at = null, updated_at = now()
    where id = ${id}
  `;
  await db`
    update device_people
    set face_synced = false, last_error = null
    where guest_id = ${id}
  `;
}

export async function listPeopleForSync(hotelId?: number) {
  const db = await getDb();
  if (hotelId) {
    return db<PersonRow[]>`
      select * from guests where active = true and hotel_id = ${hotelId} order by id
    `;
  }
  return db<PersonRow[]>`
    select * from guests where active = true order by id
  `;
}

export async function upsertDevicePerson(input: {
  deviceId: number;
  guestId: number;
  controlIdUserId: number;
  faceSynced: boolean;
  lastError?: string | null;
}) {
  const db = await getDb();
  await db`
    insert into device_people (device_id, guest_id, control_id_user_id, face_synced, last_sync_at, last_error)
    values (
      ${input.deviceId},
      ${input.guestId},
      ${input.controlIdUserId},
      ${input.faceSynced},
      now(),
      ${input.lastError ?? null}
    )
    on conflict (device_id, guest_id) do update set
      control_id_user_id = excluded.control_id_user_id,
      face_synced = excluded.face_synced,
      last_sync_at = now(),
      last_error = excluded.last_error
  `;

  await db`
    update guests
    set control_id_user_id = coalesce(control_id_user_id, ${input.controlIdUserId}), updated_at = now()
    where id = ${input.guestId}
  `;
}

export async function listDevicePeople(deviceId: number) {
  const db = await getDb();
  return db<{ guest_id: number; control_id_user_id: number }[]>`
    select guest_id, control_id_user_id
    from device_people
    where device_id = ${deviceId}
  `;
}

export async function findPersonIdByDeviceUser(deviceId: number, controlIdUserId: number) {
  const db = await getDb();
  const mapped = await db<{ guest_id: number }[]>`
    select guest_id
    from device_people
    where device_id = ${deviceId} and control_id_user_id = ${controlIdUserId}
    limit 1
  `;
  if (mapped[0]) return mapped[0].guest_id;
  const guest = await db<{ id: number }[]>`
    select g.id from guests g
    join devices d on d.hotel_id = g.hotel_id
    where g.active = true
      and g.control_id_user_id = ${controlIdUserId}
      and d.id = ${deviceId}
    limit 1
  `;
  return guest[0]?.id ?? null;
}

export async function findPersonIdByRegistration(registration: string, hotelId: number) {
  const digits = registration.replace(/\D/g, "");
  if (digits.length < 5) return null;
  const db = await getDb();
  const rows = await db<{ id: number }[]>`
    select id
    from guests
    where active = true
      and hotel_id = ${hotelId}
      and regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g') = ${digits}
    limit 1
  `;
  return rows[0]?.id ?? null;
}

export async function findPersonByRoom(room: string, hotelId: number): Promise<PersonRow | undefined> {
  const db = await getDb();
  const rows = await db<PersonRow[]>`
    select * from guests
    where room = ${room} and active = true and hotel_id = ${hotelId}
    order by check_in desc nulls last
    limit 1
  `;
  return rows[0];
}

export async function setGuestDevices(guestId: number, deviceIds: number[]) {
  const db = await getDb();
  await db`delete from guest_devices where guest_id = ${guestId}`;
  for (const deviceId of deviceIds) {
    await db`
      insert into guest_devices (guest_id, device_id)
      values (${guestId}, ${deviceId})
      on conflict do nothing
    `;
  }
}

export async function listGuestDeviceIds(guestId: number) {
  const db = await getDb();
  const rows = await db<{ device_id: number }[]>`
    select device_id from guest_devices where guest_id = ${guestId}
  `;
  return rows.map((row) => row.device_id);
}

export async function listDevicePeopleByGuest(guestId: number) {
  const db = await getDb();
  return db<{ device_id: number; control_id_user_id: number; face_synced: boolean }[]>`
    select device_id, control_id_user_id, face_synced
    from device_people
    where guest_id = ${guestId}
  `;
}

export async function markFaceRevoked(deviceId: number, guestId: number) {
  const db = await getDb();
  await db`
    update device_people
    set face_synced = false, last_error = 'checked_out', last_sync_at = now()
    where device_id = ${deviceId} and guest_id = ${guestId}
  `;
}

export async function deleteDevicePersonMapping(deviceId: number, guestId: number) {
  const db = await getDb();
  await db`delete from device_people where device_id = ${deviceId} and guest_id = ${guestId}`;
}

export async function clearDevicePeople(deviceId: number) {
  const db = await getDb();
  await db`delete from device_people where device_id = ${deviceId}`;
}

export async function setPersonTargetAll(id: number, targetAll: boolean) {
  const db = await getDb();
  await db`
    update guests set target_all = ${targetAll}, updated_at = now() where id = ${id}
  `;
}

export type PersonDeviceStatus = {
  id: number;
  name: string;
  location: string | null;
  faceSynced: boolean;
  lastError: string | null;
  lastSyncAt: string | null;
  mapped: boolean;
};

export async function listPersonDeviceStatus(guestId: number): Promise<PersonDeviceStatus[]> {
  const db = await getDb();
  const rows = await db<
    {
      id: number;
      name: string;
      location: string | null;
      face_synced: boolean | null;
      last_error: string | null;
      last_sync_at: Date | null;
      mapped: boolean;
    }[]
  >`
    select
      d.id,
      d.name,
      d.location,
      dp.face_synced,
      dp.last_error,
      dp.last_sync_at,
      (dp.guest_id is not null) as mapped
    from devices d
    left join device_people dp on dp.device_id = d.id and dp.guest_id = ${guestId}
    where d.hotel_id = (select hotel_id from guests where id = ${guestId})
    order by d.name
  `;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    location: row.location,
    faceSynced: Boolean(row.face_synced),
    lastError: row.last_error,
    lastSyncAt: row.last_sync_at?.toISOString() ?? null,
    mapped: Boolean(row.mapped),
  }));
}

export async function updatePerson(
  id: number,
  input: {
    name: string;
    cpf: string;
    room?: string | null;
    phone?: string | null;
    kind: PersonKind;
    department?: string | null;
    documentType?: string;
    roomType?: string | null;
    checkIn?: Date | null;
    checkOut?: Date | null;
    targetAll?: boolean;
    photo?: Buffer | null;
    photoMime?: string | null;
  },
) {
  const db = await getDb();
  if (input.photo) {
    await db`
      update guests
      set
        name = ${input.name},
        cpf = ${input.cpf},
        room = ${input.room ?? null},
        phone = ${input.phone ?? null},
        kind = ${input.kind},
        department = ${input.department ?? null},
        document_type = ${input.documentType ?? "cpf"},
        room_type = ${input.roomType ?? null},
        check_in = ${input.checkIn ?? null},
        check_out = ${input.checkOut ?? null},
        target_all = ${input.targetAll ?? true},
        photo = ${input.photo},
        photo_mime = ${input.photoMime ?? "image/jpeg"},
        whatsapp_notified_at = null,
        updated_at = now()
      where id = ${id}
    `;
    await db`
      update device_people
      set face_synced = false, last_error = null
      where guest_id = ${id}
    `;
  } else {
    await db`
      update guests
      set
        name = ${input.name},
        cpf = ${input.cpf},
        room = ${input.room ?? null},
        phone = ${input.phone ?? null},
        kind = ${input.kind},
        department = ${input.department ?? null},
        document_type = ${input.documentType ?? "cpf"},
        room_type = ${input.roomType ?? null},
        check_in = ${input.checkIn ?? null},
        check_out = ${input.checkOut ?? null},
        target_all = ${input.targetAll ?? true},
        updated_at = now()
      where id = ${id}
    `;
  }
}

export async function claimWhatsappNotify(id: number) {
  const db = await getDb();
  const rows = await db<{ id: number }[]>`
    update guests
    set whatsapp_notified_at = now(), updated_at = now()
    where id = ${id} and whatsapp_notified_at is null
    returning id
  `;
  return Boolean(rows[0]);
}

export async function clearWhatsappNotified(id: number) {
  const db = await getDb();
  await db`update guests set whatsapp_notified_at = null, updated_at = now() where id = ${id}`;
}

export async function deletePerson(id: number) {
  const db = await getDb();
  await db`delete from guests where id = ${id}`;
}

export async function countPeople(hotelId: number) {
  const db = await getDb();
  const rows = await db<{ count: number }[]>`
    select count(*)::int as count from guests where active = true and hotel_id = ${hotelId}
  `;
  return rows[0]?.count ?? 0;
}
