import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { parseDateTimeInput, toWhatsAppChatId } from "@/lib/stay";

const createPersonSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome"),
  documentType: z.enum(["cpf", "rg", "passport"]).default("cpf"),
  cpf: z.string().trim().min(5, "Informe o documento"),
  room: z.string().trim().max(32).optional(),
  roomType: z.string().trim().max(32).optional(),
  phone: z.string().trim().max(20).optional(),
  kind: z.enum(["guest", "staff"]),
  department: z.string().trim().max(80).optional(),
  checkIn: z.string().trim().min(16, "Informe data e hora do check-in"),
  checkOut: z.string().trim().min(16, "Informe data e hora do check-out"),
  targetAll: z.boolean().default(true),
  deviceIds: z.array(z.number().int().positive()).default([]),
  photoBase64: z.string().optional(),
  photoMime: z.string().optional(),
});

const photoSchema = z.object({
  id: z.number().int().positive(),
  photoBase64: z.string().min(10),
  photoMime: z.string().default("image/jpeg"),
});

const idSchema = z.object({
  id: z.number().int().positive(),
});

const roomSchema = z.object({
  room: z.string().trim().min(1),
});

function digits(value: string) {
  const only = value.replace(/\D/g, "");
  return only || value.trim();
}

async function personInHotel(id: number) {
  const { requireHotelSession } = await import("@/lib/tenant");
  const { getPersonById } = await import("@/db/people");
  const { hotelId } = await requireHotelSession();
  const person = await getPersonById(id, hotelId);
  return { person, hotelId };
}

function decodePhoto(base64?: string, mime?: string) {
  if (!base64) return { photo: null as Buffer | null, mime: null as string | null };
  const cleaned = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const photo = Buffer.from(cleaned, "base64");
  if (photo.length > 1_800_000) {
    throw new Error("A foto deve ter menos de 1.8 MB");
  }
  return { photo, mime: mime || "image/jpeg" };
}

export const listPeopleFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireHotelSession } = await import("@/lib/tenant");
  const { processStayWindows } = await import("@/server/sync");
  const { listPeople } = await import("@/db/people");
  const { hotelId } = await requireHotelSession();
  await processStayWindows().catch(() => undefined);
  return listPeople(hotelId);
});

export const lookupRoomFn = createServerFn({ method: "GET" })
  .validator(roomSchema)
  .handler(async ({ data }) => {
    const { requireHotelSession } = await import("@/lib/tenant");
    const { findPersonByRoom } = await import("@/db/people");
    const { hotelId } = await requireHotelSession();
    const person = await findPersonByRoom(data.room, hotelId);
    if (!person) return { ok: false as const, error: "Nenhum hóspede encontrado neste quarto." };
    return {
      ok: true as const,
      person: {
        name: person.name,
        cpf: person.cpf,
        kind: person.kind,
        roomType: person.room_type,
      },
    };
  });

export const listDeviceOptionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireHotelSession } = await import("@/lib/tenant");
  const { listDevices } = await import("@/db/devices");
  const { hotelId } = await requireHotelSession();
  const rows = await listDevices(hotelId);
  return rows.map((device) => ({
    id: device.id,
    name: device.name,
    location: device.location,
  }));
});

export const createPersonFn = createServerFn({ method: "POST" })
  .validator(createPersonSchema)
  .handler(async ({ data }) => {
    const { requireHotelSession } = await import("@/lib/tenant");
    const { findPersonByCpf, insertPerson, setGuestDevices } = await import("@/db/people");
    const { processStayWindows } = await import("@/server/sync");
    const { hotelId } = await requireHotelSession();

    const document = data.documentType === "cpf" ? digits(data.cpf) : data.cpf.trim();
    const existing = await findPersonByCpf(document, hotelId);
    if (existing) {
      return { ok: false as const, error: "Já existe uma pessoa com este documento." };
    }

    const phone = data.phone?.trim() || null;
    if (data.kind === "guest" && !toWhatsAppChatId(phone)) {
      return { ok: false as const, error: "Informe o WhatsApp do hóspede com DDD." };
    }

    const checkIn = parseDateTimeInput(data.checkIn);
    const checkOut = parseDateTimeInput(data.checkOut);
    if (!checkIn || !checkOut) {
      return { ok: false as const, error: "Informe data e hora de check-in e check-out." };
    }
    if (checkOut <= checkIn) {
      return { ok: false as const, error: "O check-out deve ser depois do check-in." };
    }

    try {
      const decoded = decodePhoto(data.photoBase64, data.photoMime);
      if (!decoded.photo) {
        return { ok: false as const, error: "Capture ou carregue uma foto para o Face Max." };
      }

      const person = await insertPerson({
        name: data.name,
        cpf: document,
        room: data.kind === "guest" ? data.room || null : null,
        phone: data.kind === "guest" ? phone : null,
        kind: data.kind,
        department: data.kind === "staff" ? data.department || null : null,
        photo: decoded.photo,
        photoMime: decoded.mime,
        documentType: data.documentType,
        roomType: data.roomType || null,
        checkIn,
        checkOut,
        targetAll: data.targetAll,
        hotelId,
      });

      if (!data.targetAll) {
        await setGuestDevices(person.id, data.deviceIds);
      }

      const stay = await processStayWindows();
      return { ok: true as const, person, stay };
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (code === "23505") {
        return { ok: false as const, error: "Já existe uma pessoa com este documento neste hotel." };
      }
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível cadastrar",
      };
    }
  });

export const updatePersonPhotoFn = createServerFn({ method: "POST" })
  .validator(photoSchema)
  .handler(async ({ data }) => {
    const { updatePersonPhoto, getPersonById } = await import("@/db/people");
    const { processStayWindows } = await import("@/server/sync");

    const { person } = await personInHotel(data.id);
    if (!person) return { ok: false as const, error: "Pessoa não encontrada" };

    try {
      const decoded = decodePhoto(data.photoBase64, data.photoMime);
      if (!decoded.photo) return { ok: false as const, error: "Foto inválida" };
      await updatePersonPhoto(data.id, decoded.photo, decoded.mime ?? "image/jpeg");
      await processStayWindows().catch(() => undefined);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Falha ao enviar foto" };
    }
  });

export const getPersonPhotoFn = createServerFn({ method: "GET" })
  .validator(idSchema)
  .handler(async ({ data }) => {
    const { getPersonById } = await import("@/db/people");
    const { person } = await personInHotel(data.id);
    if (!person?.photo) return null;
    const buffer = Buffer.isBuffer(person.photo) ? person.photo : Buffer.from(person.photo);
    return {
      mime: person.photo_mime || "image/jpeg",
      base64: buffer.toString("base64"),
    };
  });

export const deletePersonFn = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data }) => {
    const { getPersonById, deletePerson } = await import("@/db/people");
    const { removePersonEverywhere } = await import("@/server/sync");
    const { person } = await personInHotel(data.id);
    if (!person) return { ok: false as const, error: "Pessoa não encontrada" };
    try {
      await removePersonEverywhere(person);
      await deletePerson(data.id);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível excluir",
      };
    }
  });

export const syncAllPeopleFn = createServerFn({ method: "POST" }).handler(async () => {
  const { processStayWindows } = await import("@/server/sync");
  const stay = await processStayWindows();
  return stay;
});

export const getPersonFn = createServerFn({ method: "GET" })
  .validator(idSchema)
  .handler(async ({ data }) => {
    const { getPersonById, listGuestDeviceIds, listPersonDeviceStatus } = await import("@/db/people");
    const { person } = await personInHotel(data.id);
    if (!person) return { ok: false as const, error: "Pessoa não encontrada" };
    const photo = person.photo
      ? {
          mime: person.photo_mime || "image/jpeg",
          base64: (Buffer.isBuffer(person.photo) ? person.photo : Buffer.from(person.photo)).toString(
            "base64",
          ),
        }
      : null;
    return {
      ok: true as const,
      person: {
        id: person.id,
        name: person.name,
        cpf: person.cpf,
        room: person.room,
        phone: person.phone,
        kind: person.kind === "staff" ? ("staff" as const) : ("guest" as const),
        department: person.department,
        documentType: (person.document_type || "cpf") as "cpf" | "rg" | "passport",
        roomType: person.room_type,
        checkIn: person.check_in?.toISOString() ?? null,
        checkOut: person.check_out?.toISOString() ?? null,
        targetAll: person.target_all !== false,
        deviceIds: await listGuestDeviceIds(person.id),
        devices: await listPersonDeviceStatus(person.id),
        photo,
      },
    };
  });

const updatePersonSchema = createPersonSchema.extend({
  id: z.number().int().positive(),
  photoBase64: z.string().optional(),
});

export const updatePersonFn = createServerFn({ method: "POST" })
  .validator(updatePersonSchema)
  .handler(async ({ data }) => {
    const { findPersonByCpf, getPersonById, setGuestDevices, updatePerson } = await import("@/db/people");
    const { processStayWindows, revokePersonFromUntargeted } = await import("@/server/sync");

    const { person: current, hotelId } = await personInHotel(data.id);
    if (!current) return { ok: false as const, error: "Pessoa não encontrada" };

    const document = data.documentType === "cpf" ? digits(data.cpf) : data.cpf.trim();
    const existing = await findPersonByCpf(document, hotelId, data.id);
    if (existing) {
      return { ok: false as const, error: "Já existe uma pessoa com este documento." };
    }

    const phone = data.phone?.trim() || null;
    if (data.kind === "guest" && !toWhatsAppChatId(phone)) {
      return { ok: false as const, error: "Informe o WhatsApp do hóspede com DDD." };
    }

    const checkIn = parseDateTimeInput(data.checkIn);
    const checkOut = parseDateTimeInput(data.checkOut);
    if (!checkIn || !checkOut) {
      return { ok: false as const, error: "Informe data e hora de check-in e check-out." };
    }
    if (checkOut <= checkIn) {
      return { ok: false as const, error: "O check-out deve ser depois do check-in." };
    }
    if (!data.targetAll && data.deviceIds.length === 0) {
      return { ok: false as const, error: "Selecione pelo menos um equipamento." };
    }

    try {
      const decoded = decodePhoto(data.photoBase64, data.photoMime);
      await updatePerson(data.id, {
        name: data.name,
        cpf: document,
        room: data.kind === "guest" ? data.room || null : null,
        phone: data.kind === "guest" ? phone : null,
        kind: data.kind,
        department: data.kind === "staff" ? data.department || null : null,
        photo: decoded.photo,
        photoMime: decoded.mime,
        documentType: data.documentType,
        roomType: data.roomType || null,
        checkIn,
        checkOut,
        targetAll: data.targetAll,
      });
      await setGuestDevices(data.id, data.targetAll ? [] : data.deviceIds);
      if ((current.phone ?? "") !== (phone ?? "")) {
        const { clearWhatsappNotified } = await import("@/db/people");
        await clearWhatsappNotified(data.id);
      }
      const { person } = await personInHotel(data.id);
      if (person) await revokePersonFromUntargeted(person);
      const stay = await processStayWindows();
      return { ok: true as const, stay };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível salvar",
      };
    }
  });

const personDeviceSchema = z.object({
  personId: z.number().int().positive(),
  deviceId: z.number().int().positive(),
});

export const syncPersonDeviceFn = createServerFn({ method: "POST" })
  .validator(personDeviceSchema)
  .handler(async ({ data }) => {
    const { getPersonById } = await import("@/db/people");
    const { syncPersonToDevice } = await import("@/server/sync");
    const { person } = await personInHotel(data.personId);
    if (!person) return { ok: false as const, error: "Pessoa não encontrada" };
    try {
      const result = await syncPersonToDevice(person, data.deviceId);
      return { ok: true as const, faceSynced: result.faceSynced };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao sincronizar",
      };
    }
  });

export const removePersonDeviceFn = createServerFn({ method: "POST" })
  .validator(personDeviceSchema)
  .handler(async ({ data }) => {
    const { getPersonById } = await import("@/db/people");
    const { removePersonFromDevice } = await import("@/server/sync");
    const { person } = await personInHotel(data.personId);
    if (!person) return { ok: false as const, error: "Pessoa não encontrada" };
    try {
      await removePersonFromDevice(person, data.deviceId);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao remover do equipamento",
      };
    }
  });
