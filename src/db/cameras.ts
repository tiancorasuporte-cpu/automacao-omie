import { getDb } from "./schema";

export type CameraRow = {
  id: number;
  hotel_id: number;
  name: string;
  url: string;
  created_at: Date;
  updated_at: Date;
};

export type CameraPublic = {
  id: number;
  name: string;
  url: string;
};

function toPublic(row: CameraRow): CameraPublic {
  return { id: row.id, name: row.name, url: row.url };
}

export async function listCameras(hotelId: number): Promise<CameraPublic[]> {
  const db = await getDb();
  const rows = await db<CameraRow[]>`
    select * from cameras where hotel_id = ${hotelId} order by id
  `;
  return rows.map(toPublic);
}

export async function getCameraById(id: number, hotelId: number) {
  const db = await getDb();
  const rows = await db<CameraRow[]>`
    select * from cameras where id = ${id} and hotel_id = ${hotelId} limit 1
  `;
  const row = rows[0];
  return row ? toPublic(row) : undefined;
}

export async function insertCamera(input: { hotelId: number; name: string; url: string }) {
  const db = await getDb();
  const rows = await db<CameraRow[]>`
    insert into cameras (hotel_id, name, url)
    values (${input.hotelId}, ${input.name}, ${input.url})
    returning *
  `;
  const row = rows[0];
  if (!row) throw new Error("Não foi possível cadastrar a câmera");
  return toPublic(row);
}

export async function updateCamera(
  id: number,
  hotelId: number,
  input: { name: string; url: string },
) {
  const db = await getDb();
  const rows = await db<CameraRow[]>`
    update cameras
    set name = ${input.name}, url = ${input.url}, updated_at = now()
    where id = ${id} and hotel_id = ${hotelId}
    returning *
  `;
  const row = rows[0];
  return row ? toPublic(row) : undefined;
}

export async function deleteCamera(id: number, hotelId: number) {
  const db = await getDb();
  const rows = await db<{ id: number }[]>`
    delete from cameras where id = ${id} and hotel_id = ${hotelId} returning id
  `;
  return Boolean(rows[0]);
}

export async function countCameras(hotelId: number) {
  const db = await getDb();
  const rows = await db<{ count: number }[]>`
    select count(*)::int as count from cameras where hotel_id = ${hotelId}
  `;
  return rows[0]?.count ?? 0;
}
