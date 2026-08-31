import { redirect } from "@tanstack/react-router";

import type { AppUser } from "@/db/schema";

export function isSuperadmin(user: Pick<AppUser, "role"> | null | undefined) {
  return user?.role === "superadmin";
}

export function isHotelAdmin(user: Pick<AppUser, "role"> | null | undefined) {
  return user?.role === "admin" || user?.role === "superadmin";
}

export async function getSessionContext() {
  const { getAuthSession } = await import("@/server/session");
  const { findUserById } = await import("@/db/users");
  const { getHotelById } = await import("@/db/hotels");
  const session = await getAuthSession();
  const userId = session.data.userId;
  if (typeof userId !== "number") return { user: null as AppUser | null, hotelId: null as number | null };
  const user = await findUserById(userId);
  if (!user) return { user: null, hotelId: null };
  const hotelId = typeof session.data.hotelId === "number" ? session.data.hotelId : user.hotelId;
  if (hotelId) {
    const hotel = await getHotelById(hotelId);
    return {
      user: { ...user, hotelId, hotelName: hotel?.name ?? user.hotelName },
      hotelId,
    };
  }
  return { user: { ...user, hotelId: null, hotelName: null }, hotelId: null };
}

export async function requireHotelSession() {
  const ctx = await getSessionContext();
  if (!ctx.user) throw redirect({ to: "/" });
  if (!ctx.hotelId) throw redirect({ to: "/hotels" });
  return { user: ctx.user, hotelId: ctx.hotelId };
}

export async function requireHotelAdminSession() {
  const ctx = await requireHotelSession();
  if (!isHotelAdmin(ctx.user)) throw redirect({ to: "/monitoring" });
  return ctx;
}

export async function requireSuperadminSession() {
  const ctx = await getSessionContext();
  if (!ctx.user) throw redirect({ to: "/" });
  if (!isSuperadmin(ctx.user)) throw redirect({ to: "/monitoring" });
  return ctx;
}
