import { redirect } from "@tanstack/react-router";

import { getCurrentUser } from "@/lib/auth";
import {
  APP_MODULES,
  hasPermission,
  pathForModule,
  type AppModuleId,
} from "@/lib/modules";
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

export function canAccessModule(
  user: Pick<AppUser, "role" | "modules"> | null | undefined,
  moduleId: AppModuleId,
) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  const modules = user.modules ?? [];
  if (modules.includes(moduleId)) return true;
  // Operadores com orçamentos também veem a aba Produtos (CMC/markup).
  if (moduleId === "produtos" && modules.includes("orcamentos")) return true;
  return false;
}

export function canDeleteOrcamento(user: Pick<AppUser, "role" | "modules"> | null | undefined) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  return hasPermission(user.modules, "orcamentos_excluir");
}

export function firstAccessiblePath(user: Pick<AppUser, "role" | "modules">) {
  if (isAdmin(user)) return "/dashboard";
  const first = APP_MODULES.find((module) => canAccessModule(user, module.id));
  return first ? pathForModule(first.id) : "/profile";
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

export async function requireModule(moduleId: AppModuleId) {
  const { user } = await requireAuth();
  if (!canAccessModule(user, moduleId)) {
    throw redirect({ to: firstAccessiblePath(user) });
  }
  return { user };
}

export async function requireAdmin() {
  const { user } = await requireAuth();
  if (!isAdmin(user)) {
    throw redirect({ to: firstAccessiblePath(user) });
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
    throw redirect({ to: firstAccessiblePath(user) });
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
    throw redirect({ to: firstAccessiblePath(user) });
  }
}
