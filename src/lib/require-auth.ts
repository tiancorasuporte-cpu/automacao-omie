import { redirect } from "@tanstack/react-router";

import { getCurrentUser } from "@/lib/auth";
import { getSetupStatusFn } from "@/lib/setup";
import type { AppUser } from "@/db/schema";

export function isSuperadmin(user: Pick<AppUser, "role"> | null | undefined) {
  return user?.role === "superadmin";
}

export function isAdmin(user: Pick<AppUser, "role"> | null | undefined) {
  return user?.role === "admin" || user?.role === "superadmin";
}

export function roleLabel(role: string) {
  if (role === "superadmin") return "Superadmin";
  if (role === "admin") return "Administrador";
  return "Operador";
}

export async function requireAuth() {
  const { configured } = await getSetupStatusFn();
  if (!configured) {
    throw redirect({ to: "/setup" });
  }
  const user = await getCurrentUser();
  if (!user) {
    throw redirect({ to: "/" });
  }
  return { user };
}

export async function requireAdmin() {
  const { user } = await requireAuth();
  if (!isAdmin(user)) {
    throw redirect({ to: "/dashboard" });
  }
  return { user };
}

export async function requireSuperadmin() {
  const { configured } = await getSetupStatusFn();
  if (!configured) {
    throw redirect({ to: "/setup" });
  }
  const user = await getCurrentUser();
  if (!user) {
    throw redirect({ to: "/" });
  }
  if (!isSuperadmin(user)) {
    throw redirect({ to: "/dashboard" });
  }
  return { user };
}

export async function redirectIfAuthenticated() {
  const { configured } = await getSetupStatusFn();
  if (!configured) {
    throw redirect({ to: "/setup" });
  }
  const user = await getCurrentUser();
  if (user) {
    throw redirect({ to: "/dashboard" });
  }
}
