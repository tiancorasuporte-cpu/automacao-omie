import type { AppUser } from "@/db/schema";
import { findUserByMobileToken } from "@/db/mobile";
import { canOsWorkflow, isAdmin } from "@/lib/require-auth";
import type { OsWorkflowRole } from "@/lib/require-auth";

export function jsonOk(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

export function jsonError(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

export function readBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function requireMobileTecnico(request: Request): Promise<
  | { ok: true; user: AppUser; token: string }
  | { ok: false; response: Response }
> {
  const token = readBearerToken(request);
  if (!token) {
    return { ok: false, response: jsonError("Não autenticado.", 401) };
  }
  const user = await findUserByMobileToken(token);
  if (!user) {
    return { ok: false, response: jsonError("Sessão inválida ou expirada.", 401) };
  }
  if (!user.isTecnico) {
    return {
      ok: false,
      response: jsonError("Acesso restrito a técnicos.", 403),
    };
  }
  return { ok: true, user, token };
}

/** Permissões de campo: técnico autenticado age como assistencia na O.S. */
export function mobileOsRoles(user: AppUser) {
  return {
    isAdmin: isAdmin(user),
    canRole: (role: OsWorkflowRole) =>
      isAdmin(user) ||
      canOsWorkflow(user, role) ||
      (user.isTecnico && role === "assistencia"),
  };
}

export async function readJsonBody<T = unknown>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
