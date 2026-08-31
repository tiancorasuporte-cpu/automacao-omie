import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome"),
  username: z.string().trim().min(2, "Informe o usuário"),
  password: z.string().min(4, "A senha deve ter pelo menos 4 caracteres"),
  role: z.enum(["admin", "operator"]),
});

const idSchema = z.object({
  id: z.number().int().positive(),
});

const profileSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome"),
  password: z.string().optional(),
});

export const listUsersFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/require-auth");
  await requireAdmin();
  const { listUsers } = await import("@/db/users");
  return { ok: true as const, users: await listUsers() };
});

export const createUserFn = createServerFn({ method: "POST" })
  .validator(createSchema)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/require-auth");
    await requireAdmin();
    const { createUser, findUserByUsername } = await import("@/db/users");
    const existing = await findUserByUsername(data.username);
    if (existing) return { ok: false as const, error: "Já existe um usuário com este login." };
    try {
      const user = await createUser(data);
      return { ok: true as const, user };
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (code === "23505") return { ok: false as const, error: "Já existe um usuário com este login." };
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível criar o usuário",
      };
    }
  });

export const setUserActiveFn = createServerFn({ method: "POST" })
  .validator(idSchema.extend({ active: z.boolean() }))
  .handler(async ({ data }) => {
    const { requireAdmin, isSuperadmin } = await import("@/lib/require-auth");
    const { user: admin } = await requireAdmin();
    if (data.id === admin.id && !data.active) {
      return { ok: false as const, error: "Você não pode desativar o próprio usuário." };
    }
    const { findUserById, setUserActive } = await import("@/db/users");
    const target = await findUserById(data.id, { includeInactive: true });
    if (!target) return { ok: false as const, error: "Usuário não encontrado." };
    if (isSuperadmin(target) && !data.active && !isSuperadmin(admin)) {
      return { ok: false as const, error: "Apenas superadmin pode desativar outro superadmin." };
    }
    await setUserActive(data.id, data.active);
    return { ok: true as const };
  });

export const updateProfileFn = createServerFn({ method: "POST" })
  .validator(profileSchema)
  .handler(async ({ data }) => {
    const { getAuthSession } = await import("@/server/session");
    const { findUserById, updateUserProfile } = await import("@/db/users");
    const session = await getAuthSession();
    const userId = session.data.userId;
    if (typeof userId !== "number") return { ok: false as const, error: "Sessão expirada." };
    const user = await findUserById(userId);
    if (!user) return { ok: false as const, error: "Usuário não encontrado." };
    const password = data.password?.trim();
    if (password && password.length < 4) {
      return { ok: false as const, error: "A senha deve ter pelo menos 4 caracteres." };
    }
    await updateUserProfile(userId, data.name, password || undefined);
    return { ok: true as const };
  });
