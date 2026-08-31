import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function normalizeCameraUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da câmera"),
  url: z.string().trim().min(8, "Cole o link da câmera"),
});

const updateSchema = createSchema.extend({
  id: z.number().int().positive(),
});

const idSchema = z.object({
  id: z.number().int().positive(),
});

export const listCamerasFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireHotelSession } = await import("@/lib/tenant");
  const { getHotelById } = await import("@/db/hotels");
  const { listCameras } = await import("@/db/cameras");
  const { hotelId } = await requireHotelSession();
  const hotel = await getHotelById(hotelId);
  if (!hotel?.module_cameras) return [];
  return listCameras(hotelId);
});

export const createCameraFn = createServerFn({ method: "POST" })
  .validator(createSchema)
  .handler(async ({ data }) => {
    const { requireHotelSession } = await import("@/lib/tenant");
    const { getHotelById } = await import("@/db/hotels");
    const { insertCamera } = await import("@/db/cameras");
    const { hotelId } = await requireHotelSession();
    const hotel = await getHotelById(hotelId);
    if (!hotel?.module_cameras) {
      return { ok: false as const, error: "Módulo de câmeras não liberado para este hotel." };
    }
    const url = normalizeCameraUrl(data.url);
    if (!url) return { ok: false as const, error: "Link inválido. Use um endereço http ou https." };
    try {
      const camera = await insertCamera({ hotelId, name: data.name, url });
      return { ok: true as const, camera };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível cadastrar a câmera.",
      };
    }
  });

export const updateCameraFn = createServerFn({ method: "POST" })
  .validator(updateSchema)
  .handler(async ({ data }) => {
    const { requireHotelSession } = await import("@/lib/tenant");
    const { updateCamera } = await import("@/db/cameras");
    const { hotelId } = await requireHotelSession();
    const url = normalizeCameraUrl(data.url);
    if (!url) return { ok: false as const, error: "Link inválido. Use um endereço http ou https." };
    const camera = await updateCamera(data.id, hotelId, { name: data.name, url });
    if (!camera) return { ok: false as const, error: "Câmera não encontrada." };
    return { ok: true as const, camera };
  });

export const deleteCameraFn = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data }) => {
    const { requireHotelSession } = await import("@/lib/tenant");
    const { deleteCamera } = await import("@/db/cameras");
    const { hotelId } = await requireHotelSession();
    const ok = await deleteCamera(data.id, hotelId);
    if (!ok) return { ok: false as const, error: "Câmera não encontrada." };
    return { ok: true as const };
  });
