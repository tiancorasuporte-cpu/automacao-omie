import { compare, hash } from "bcryptjs";

import { getDb, type AppRole, type AppUser, type AppUserRow } from "./schema";

function toRole(value: string | null | undefined): AppRole {
  if (value === "superadmin") return "superadmin";
  if (value === "admin") return "admin";
  return "operator";
}

function toPublicUser(row: AppUserRow): AppUser {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: toRole(row.role),
    active: row.active,
  };
}

export async function findUserByUsername(username: string) {
  const db = await getDb();
  const rows = await db<AppUserRow[]>`
    select id, username, password_hash, name, role, active
    from users
    where username = ${username}
    limit 1
  `;
  return rows[0];
}

export async function findUserById(id: number, opts?: { includeInactive?: boolean }) {
  const db = await getDb();
  const rows = opts?.includeInactive
    ? await db<AppUserRow[]>`
        select id, username, password_hash, name, role, active
        from users
        where id = ${id}
        limit 1
      `
    : await db<AppUserRow[]>`
        select id, username, password_hash, name, role, active
        from users
        where id = ${id} and active = true
        limit 1
      `;
  const row = rows[0];
  return row ? toPublicUser(row) : undefined;
}

export async function authenticateUser(username: string, password: string) {
  const user = await findUserByUsername(username);
  if (!user || !user.active) return undefined;
  const matches = await compare(password, user.password_hash);
  if (!matches) return undefined;
  return findUserById(user.id);
}

export async function listUsers() {
  const db = await getDb();
  const rows = await db<AppUserRow[]>`
    select id, username, password_hash, name, role, active
    from users
    order by name
  `;
  return rows.map(toPublicUser);
}

export async function createUser(input: {
  username: string;
  password: string;
  name: string;
  role: Exclude<AppRole, "superadmin">;
}) {
  const db = await getDb();
  const passwordHash = await hash(input.password, 10);
  const rows = await db<AppUserRow[]>`
    insert into users (username, password_hash, name, role, active)
    values (${input.username}, ${passwordHash}, ${input.name}, ${input.role}, true)
    returning id, username, password_hash, name, role, active
  `;
  const row = rows[0];
  if (!row) throw new Error("Não foi possível criar o usuário");
  return toPublicUser(row);
}

export async function setUserActive(id: number, active: boolean) {
  const db = await getDb();
  await db`update users set active = ${active}, updated_at = now() where id = ${id}`;
}

export async function updateUserProfile(id: number, name: string, password?: string) {
  const db = await getDb();
  if (password) {
    const passwordHash = await hash(password, 10);
    await db`
      update users
      set name = ${name}, password_hash = ${passwordHash}, updated_at = now()
      where id = ${id}
    `;
    return;
  }
  await db`update users set name = ${name}, updated_at = now() where id = ${id}`;
}
