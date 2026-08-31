import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const createHotelSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do hotel"),
  adminName: z.string().trim().min(2, "Informe o nome do administrador"),
  adminUsername: z.string().trim().min(2, "Informe o usuário"),
  adminPassword: z.string().min(4, "A senha deve ter pelo menos 4 caracteres"),
});

export const listHotelsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSuperadminSession } = await import("@/lib/tenant");
  await requireSuperadminSession();
  const { listHotels, hotelStats } = await import("@/db/hotels");
  const hotels = await listHotels();
  return Promise.all(
    hotels.map(async (hotel) => ({
      id: hotel.id,
      name: hotel.name,
      slug: hotel.slug,
      active: hotel.active,
      moduleCameras: Boolean(hotel.module_cameras),
      moduleWaha: Boolean(hotel.module_waha),
      ...(await hotelStats(hotel.id)),
    })),
  );
});

export const createHotelFn = createServerFn({ method: "POST" })
  .validator(createHotelSchema)
  .handler(async ({ data }) => {
    const { requireSuperadminSession } = await import("@/lib/tenant");
    await requireSuperadminSession();
    try {
      const { createHotel } = await import("@/db/hotels");
      const hotel = await createHotel(data);
      return { ok: true as const, hotel };
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (code === "23505") {
        return { ok: false as const, error: "Já existe um hotel ou usuário com esses dados." };
      }
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível criar o hotel",
      };
    }
  });

export const setHotelActiveFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number().int().positive(), active: z.boolean() }))
  .handler(async ({ data }) => {
    const { requireSuperadminSession } = await import("@/lib/tenant");
    await requireSuperadminSession();
    const { setHotelActive } = await import("@/db/hotels");
    await setHotelActive(data.id, data.active);
    return { ok: true as const };
  });

export const renameHotelFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number().int().positive(), name: z.string().trim().min(2) }))
  .handler(async ({ data }) => {
    const { requireSuperadminSession } = await import("@/lib/tenant");
    await requireSuperadminSession();
    try {
      const { renameHotel } = await import("@/db/hotels");
      const hotel = await renameHotel(data.id, data.name);
      if (!hotel) return { ok: false as const, error: "Hotel não encontrado." };
      return { ok: true as const, hotel: { id: hotel.id, name: hotel.name } };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível renomear.",
      };
    }
  });

export const setHotelModulesFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.number().int().positive(),
      cameras: z.boolean().optional(),
      waha: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { requireSuperadminSession } = await import("@/lib/tenant");
    await requireSuperadminSession();
    try {
      const { setHotelModules } = await import("@/db/hotels");
      await setHotelModules(data.id, { cameras: data.cameras, waha: data.waha });
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível salvar os módulos.",
      };
    }
  });

export const deleteHotelFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const { requireSuperadminSession } = await import("@/lib/tenant");
    await requireSuperadminSession();
    try {
      const { deleteHotel } = await import("@/db/hotels");
      await deleteHotel(data.id);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível excluir o hotel.",
      };
    }
  });

export const getHotelBrandingFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionContext } = await import("@/lib/tenant");
  const { getHotelById, getHotelLogo } = await import("@/db/hotels");
  const ctx = await getSessionContext();
  if (!ctx.hotelId) {
    return {
      hotelId: null as number | null,
      name: null as string | null,
      logo: null,
      moduleCameras: false,
      moduleWaha: false,
    };
  }
  const hotel = await getHotelById(ctx.hotelId);
  const logo = await getHotelLogo(ctx.hotelId);
  return {
    hotelId: ctx.hotelId,
    name: hotel?.name ?? ctx.user?.hotelName ?? null,
    logo,
    moduleCameras: Boolean(hotel?.module_cameras),
    moduleWaha: Boolean(hotel?.module_waha),
  };
});

const logoUploadSchema = z.object({
  logoBase64: z.string().min(10, "Envie a imagem da logo"),
  logoMime: z.string().default("image/png"),
});

function decodeLogo(base64: string, mime?: string) {
  const cleaned = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const logo = Buffer.from(cleaned, "base64");
  if (logo.length > 800_000) {
    throw new Error("A logo deve ter menos de 800 KB");
  }
  const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
  const type = (mime || "image/png").toLowerCase();
  if (!allowed.includes(type)) {
    throw new Error("Use PNG, JPG, WEBP ou SVG.");
  }
  return { logo, mime: type };
}

export const uploadHotelLogoFn = createServerFn({ method: "POST" })
  .validator(logoUploadSchema)
  .handler(async ({ data }) => {
    const { requireHotelAdminSession } = await import("@/lib/tenant");
    const { setHotelLogo } = await import("@/db/hotels");
    const { hotelId } = await requireHotelAdminSession();
    try {
      const decoded = decodeLogo(data.logoBase64, data.logoMime);
      await setHotelLogo(hotelId, decoded.logo, decoded.mime);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível salvar a logo.",
      };
    }
  });

export const clearHotelLogoFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireHotelAdminSession } = await import("@/lib/tenant");
  const { clearHotelLogo } = await import("@/db/hotels");
  const { hotelId } = await requireHotelAdminSession();
  await clearHotelLogo(hotelId);
  return { ok: true as const };
});
