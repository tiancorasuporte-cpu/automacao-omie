import { compare, hash } from "bcryptjs";

import {
  modulesForRole,
  serializeModules,
  type AppModuleId,
} from "@/lib/modules";
import { getDb, type AppRole, type AppUser, type AppUserRow } from "./schema";

function toRole(value: string | null | undefined): AppRole {
  if (value === "superadmin") return "superadmin";
  if (value === "admin") return "admin";
  return "operator";
}

function toPublicUser(row: AppUserRow): AppUser {
  const role = toRole(row.role);
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role,
    active: row.active,
    modules: modulesForRole(role, row.modules ?? null),
  };
}

export async function findUserByUsername(username: string) {
  const db = await getDb();
  const rows = (await db`
    select id, username, password_hash, name, role, active, modules
    from users
    where username = ${username}
    limit 1
  `) as AppUserRow[];
  return rows[0];
}

export async function findUserById(id: number, opts?: { includeInactive?: boolean }) {
  const db = await getDb();
  const rows = opts?.includeInactive
    ? ((await db`
        select id, username, password_hash, name, role, active, modules
        from users
        where id = ${id}
        limit 1
      `) as AppUserRow[])
    : ((await db`
        select id, username, password_hash, name, role, active, modules
        from users
        where id = ${id} and active = true
        limit 1
      `) as AppUserRow[]);
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
  const rows = (await db`
    select id, username, password_hash, name, role, active, modules
    from users
    order by name
  `) as AppUserRow[];
  return rows.map(toPublicUser);
}

export async function createUser(input: {
  username: string;
  password: string;
  name: string;
  role: Exclude<AppRole, "superadmin">;
  modules?: AppModuleId[];
}) {
  const db = await getDb();
  const passwordHash = await hash(input.password, 10);
  const modulesJson =
    input.role === "operator" ? serializeModules(input.modules ?? []) : null;
  const rows = (await db`
    insert into users (username, password_hash, name, role, active, modules)
    values (
      ${input.username}, ${passwordHash}, ${input.name}, ${input.role}, true,
      ${modulesJson}
    )
    returning id, username, password_hash, name, role, active, modules
  `) as AppUserRow[];
  const row = rows[0];
  if (!row) throw new Error("Não foi possível criar o usuário");
  return toPublicUser(row);
}

export async function setUserActive(id: number, active: boolean) {
  const db = await getDb();
  await db`update users set active = ${active}, updated_at = now() where id = ${id}`;
}

export async function updateUserModules(id: number, modules: AppModuleId[]) {
  const db = await getDb();
  const target = await findUserById(id, { includeInactive: true });
  if (!target) throw new Error("Usuário não encontrado.");
  if (target.role !== "operator") {
    throw new Error("Somente operadores têm módulos configuráveis.");
  }
  await db`
    update users
    set modules = ${serializeModules(modules)}, updated_at = now()
    where id = ${id}
  `;
  return findUserById(id, { includeInactive: true });
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
