import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const idSchema = z.object({ id: z.number().int().positive() });

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const photoSchema = z.object({
  foto: z.string().min(20),
  thumb: z.string().min(20),
});

const collaboratorSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  matricula: optionalText(40),
  departamento: optionalText(120),
  cargo: optionalText(120),
  telefone: optionalText(32),
  tamanhoCamisa: optionalText(12),
  tamanhoCalca: optionalText(12),
  tamanhoCalcado: optionalText(12),
  observacao: optionalText(2000),
});

const itemSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  categoria: optionalText(60),
  tamanho: optionalText(20),
  estoqueMinimo: z.number().int().min(0).max(100000),
  custo: z.number().min(0).max(1_000_000),
  vidaUtilMeses: z.number().int().positive().max(120).nullable().optional(),
});

function fail(error: unknown, fallback: string) {
  return { ok: false as const, error: error instanceof Error ? error.message : fallback };
}

async function auth() {
  const { requireModule } = await import("@/lib/require-auth");
  return requireModule("uniformes");
}

export const getUniformesBootstrapFn = createServerFn({ method: "GET" }).handler(async () => {
  await auth();
  const db = await import("@/db/uniformes");
  const [collaborators, items, movements, holdings, stockMoves] = await Promise.all([
    db.listUniformCollaborators(),
    db.listUniformItems(),
    db.listUniformMovements(),
    db.listUniformHoldings(),
    db.listUniformStockMoves(),
  ]);
  return { collaborators, items, movements, holdings, stockMoves };
});

export const getUniformItemPhotoFn = createServerFn({ method: "GET" })
  .validator((input) => idSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    await auth();
    const { getUniformItemPhoto } = await import("@/db/uniformes");
    return { foto: await getUniformItemPhoto(data.id) };
  });

export const getUniformMovementMediaFn = createServerFn({ method: "GET" })
  .validator((input) => idSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    await auth();
    const { getUniformMovementMedia } = await import("@/db/uniformes");
    return getUniformMovementMedia(data.id);
  });

export const saveUniformCollaboratorFn = createServerFn({ method: "POST" })
  .validator((input) =>
    collaboratorSchema
      .extend({ id: z.number().int().nonnegative(), active: z.boolean() })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    await auth();
    const db = await import("@/db/uniformes");
    try {
      const collaborator =
        data.id > 0
          ? await db.updateUniformCollaborator(data)
          : await db.createUniformCollaborator(data);
      return { ok: true as const, collaborator };
    } catch (error) {
      return fail(error, "Falha ao salvar colaborador.");
    }
  });

export const removeUniformCollaboratorFn = createServerFn({ method: "POST" })
  .validator((input) => idSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    await auth();
    const { removeUniformCollaborator } = await import("@/db/uniformes");
    try {
      return { ok: true as const, ...(await removeUniformCollaborator(data.id)) };
    } catch (error) {
      return fail(error, "Falha ao remover colaborador.");
    }
  });

export const importUniformCollaboratorsFn = createServerFn({ method: "POST" }).handler(
  async () => {
    await auth();
    const { importUniformCollaboratorsFromFacilities } = await import("@/db/uniformes");
    try {
      return { ok: true as const, ...(await importUniformCollaboratorsFromFacilities()) };
    } catch (error) {
      return fail(error, "Falha ao importar colaboradores.");
    }
  },
);

export const saveUniformItemFn = createServerFn({ method: "POST" })
  .validator((input) =>
    itemSchema
      .extend({
        id: z.number().int().nonnegative(),
        active: z.boolean(),
        quantidadeInicial: z.number().int().min(0).max(100000).optional(),
        photo: photoSchema.nullable().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    const db = await import("@/db/uniformes");
    try {
      const base = {
        nome: data.nome,
        categoria: data.categoria ?? null,
        tamanho: data.tamanho ?? null,
        estoqueMinimo: data.estoqueMinimo,
        custo: data.custo,
        vidaUtilMeses: data.vidaUtilMeses ?? null,
      };
      const item =
        data.id > 0
          ? await db.updateUniformItem({
              ...base,
              id: data.id,
              active: data.active,
              ...(data.photo !== undefined ? { photo: data.photo } : {}),
            })
          : await db.createUniformItem({
              ...base,
              quantidadeInicial: data.quantidadeInicial ?? 0,
              photo: data.photo ?? null,
              userId: user.id,
            });
      return { ok: true as const, item };
    } catch (error) {
      return fail(error, "Falha ao salvar peça.");
    }
  });

export const removeUniformItemFn = createServerFn({ method: "POST" })
  .validator((input) => idSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    await auth();
    const { removeUniformItem } = await import("@/db/uniformes");
    try {
      return { ok: true as const, ...(await removeUniformItem(data.id)) };
    } catch (error) {
      return fail(error, "Falha ao remover peça.");
    }
  });

export const restockUniformItemFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        itemId: z.number().int().positive(),
        quantidade: z.number().int().positive().max(100000),
        custoUnitario: z.number().min(0).max(1_000_000),
        fornecedor: optionalText(160),
        documento: optionalText(80),
        motivo: optionalText(2000),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    const { restockUniformItem } = await import("@/db/uniformes");
    try {
      return { ok: true as const, ...(await restockUniformItem({ ...data, userId: user.id })) };
    } catch (error) {
      return fail(error, "Falha ao registrar entrada.");
    }
  });

export const adjustUniformItemFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        itemId: z.number().int().positive(),
        novaQuantidade: z.number().int().min(0).max(100000),
        motivo: z.string().trim().min(1).max(2000),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    const { adjustUniformItem } = await import("@/db/uniformes");
    try {
      return { ok: true as const, ...(await adjustUniformItem({ ...data, userId: user.id })) };
    } catch (error) {
      return fail(error, "Falha ao ajustar estoque.");
    }
  });

export const createUniformMovementFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        collaboratorId: z.number().int().positive(),
        tipo: z.enum(["entrega", "troca", "devolucao"]),
        observacao: optionalText(2000),
        assinatura: z.string().min(50, "Colete a assinatura do colaborador."),
        fotos: z.array(photoSchema).max(6),
        saidas: z
          .array(
            z.object({
              itemId: z.number().int().positive(),
              quantidade: z.number().int().positive().max(1000),
            }),
          )
          .max(50),
        entradas: z
          .array(
            z.object({
              itemId: z.number().int().positive(),
              quantidade: z.number().int().positive().max(1000),
              condicao: z.enum(["reaproveitavel", "descarte"]),
            }),
          )
          .max(50),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    const { createUniformMovement } = await import("@/db/uniformes");
    try {
      const result = await createUniformMovement({
        ...data,
        observacao: data.observacao ?? null,
        userId: user.id,
      });
      return { ok: true as const, ...result };
    } catch (error) {
      return fail(error, "Falha ao registrar movimentação.");
    }
  });

export const reverseUniformMovementFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({ id: z.number().int().positive(), motivo: z.string().trim().min(1).max(2000) })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    const { reverseUniformMovement } = await import("@/db/uniformes");
    try {
      return await reverseUniformMovement({ ...data, userId: user.id });
    } catch (error) {
      return fail(error, "Falha ao estornar movimentação.");
    }
  });
