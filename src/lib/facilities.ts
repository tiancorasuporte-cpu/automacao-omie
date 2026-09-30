import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  FACILITIES_EMPRESAS,
  FACILITIES_ESCALAS,
  FACILITIES_FUNCOES,
  FACILITIES_MOTIVOS,
  currentMonthKey,
  isFacilitiesEmpresaId,
  isFacilitiesEscalaId,
  isFacilitiesFuncaoId,
  isFacilitiesMotivoId,
} from "@/lib/facilities-domain";

const empresaSchema = z
  .string()
  .refine(isFacilitiesEmpresaId, "Empresa inválida.")
  .transform((v) => v as (typeof FACILITIES_EMPRESAS)[number]["id"]);

const funcaoSchema = z
  .string()
  .refine(isFacilitiesFuncaoId, "Função inválida.")
  .transform((v) => v as (typeof FACILITIES_FUNCOES)[number]["id"]);

const escalaSchema = z
  .string()
  .refine(isFacilitiesEscalaId, "Escala inválida.")
  .transform((v) => v as (typeof FACILITIES_ESCALAS)[number]["id"]);

const motivoSchema = z
  .string()
  .refine(isFacilitiesMotivoId, "Motivo inválido.")
  .transform((v) => v as (typeof FACILITIES_MOTIVOS)[number]["id"]);

const monthKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .optional()
  .transform((v) => v ?? currentMonthKey());

export const getFacilitiesBootstrapFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        monthKey: monthKeySchema,
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("facilities");
    const {
      listFacilitiesPosts,
      listFacilitiesCollaborators,
      listFacilitiesSubstitutions,
      getFacilitiesMonthSummary,
    } = await import("@/db/facilities");
    const [posts, collaborators, substitutions, summary] = await Promise.all([
      listFacilitiesPosts(false),
      listFacilitiesCollaborators(false),
      listFacilitiesSubstitutions({
        monthKey: data.monthKey,
      }),
      getFacilitiesMonthSummary(data.monthKey),
    ]);
    return {
      monthKey: data.monthKey,
      posts,
      collaborators,
      substitutions,
      summary,
      catalogs: {
        empresas: [...FACILITIES_EMPRESAS],
        funcoes: [...FACILITIES_FUNCOES],
        escalas: [...FACILITIES_ESCALAS],
        motivos: [...FACILITIES_MOTIVOS],
      },
    };
  });

export const createFacilitiesPostFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        nome: z.string().trim().min(1).max(200),
        endereco: z.string().trim().max(255).nullable().optional(),
        cidade: z.string().trim().max(120).nullable().optional(),
        observacao: z.string().trim().nullable().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("facilities");
    const { createFacilitiesPost } = await import("@/db/facilities");
    try {
      const post = await createFacilitiesPost({
        nome: data.nome,
        endereco: data.endereco ?? null,
        cidade: data.cidade ?? null,
        observacao: data.observacao ?? null,
      });
      return { ok: true as const, post };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao cadastrar posto.",
      };
    }
  });

export const updateFacilitiesPostFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        nome: z.string().trim().min(1).max(200),
        endereco: z.string().trim().max(255).nullable().optional(),
        cidade: z.string().trim().max(120).nullable().optional(),
        observacao: z.string().trim().nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("facilities");
    const { updateFacilitiesPost } = await import("@/db/facilities");
    try {
      const post = await updateFacilitiesPost({
        id: data.id,
        nome: data.nome,
        endereco: data.endereco ?? null,
        cidade: data.cidade ?? null,
        observacao: data.observacao ?? null,
        active: data.active ?? true,
      });
      return { ok: true as const, post };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao atualizar posto.",
      };
    }
  });

export const deactivateFacilitiesPostFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ id: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("facilities");
    const { deactivateFacilitiesPost } = await import("@/db/facilities");
    try {
      await deactivateFacilitiesPost(data.id);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao desativar posto.",
      };
    }
  });

export const createFacilitiesCollaboratorFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        nome: z.string().trim().min(1).max(200),
        empresa: empresaSchema,
        funcao: funcaoSchema,
        escala: escalaSchema,
        postoBaseId: z.number().int().positive().nullable().optional(),
        telefone: z.string().trim().max(32).nullable().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("facilities");
    const { createFacilitiesCollaborator } = await import("@/db/facilities");
    try {
      const collaborator = await createFacilitiesCollaborator({
        nome: data.nome,
        empresa: data.empresa,
        funcao: data.funcao,
        escala: data.escala,
        postoBaseId: data.postoBaseId ?? null,
        telefone: data.telefone ?? null,
      });
      return { ok: true as const, collaborator };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao cadastrar colaborador.",
      };
    }
  });

export const updateFacilitiesCollaboratorFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        nome: z.string().trim().min(1).max(200),
        empresa: empresaSchema,
        funcao: funcaoSchema,
        escala: escalaSchema,
        postoBaseId: z.number().int().positive().nullable().optional(),
        telefone: z.string().trim().max(32).nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("facilities");
    const { updateFacilitiesCollaborator } = await import("@/db/facilities");
    try {
      const collaborator = await updateFacilitiesCollaborator({
        id: data.id,
        nome: data.nome,
        empresa: data.empresa,
        funcao: data.funcao,
        escala: data.escala,
        postoBaseId: data.postoBaseId ?? null,
        telefone: data.telefone ?? null,
        active: data.active ?? true,
      });
      return { ok: true as const, collaborator };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao atualizar colaborador.",
      };
    }
  });

export const deactivateFacilitiesCollaboratorFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ id: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("facilities");
    const { deactivateFacilitiesCollaborator } = await import("@/db/facilities");
    try {
      await deactivateFacilitiesCollaborator(data.id);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao desativar colaborador.",
      };
    }
  });

export const createFacilitiesSubstitutionFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        motivo: motivoSchema,
        postoId: z.number().int().positive(),
        ausenteId: z.number().int().positive(),
        substitutoId: z.number().int().positive(),
        horas: z.number().positive().max(24),
        observacao: z.string().trim().nullable().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    const { user } = await requireModule("facilities");
    const { createFacilitiesSubstitution } = await import("@/db/facilities");
    try {
      const substitution = await createFacilitiesSubstitution({
        data: data.data,
        motivo: data.motivo,
        postoId: data.postoId,
        ausenteId: data.ausenteId,
        substitutoId: data.substitutoId,
        horas: data.horas,
        observacao: data.observacao ?? null,
        createdBy: user.id,
      });
      return { ok: true as const, substitution };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao lançar substituição.",
      };
    }
  });

export const deleteFacilitiesSubstitutionFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ id: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("facilities");
    const { deleteFacilitiesSubstitution } = await import("@/db/facilities");
    try {
      await deleteFacilitiesSubstitution(data.id);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao excluir lançamento.",
      };
    }
  });

function normalizeImportName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export const importFacilitiesPostsFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        rows: z
          .array(
            z.object({
              nome: z.string().trim().min(1).max(200),
              endereco: z.string().trim().max(255).nullable().optional(),
              cidade: z.string().trim().max(120).nullable().optional(),
              observacao: z.string().trim().nullable().optional(),
            }),
          )
          .max(500),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("facilities");
    const { createFacilitiesPost, listFacilitiesPosts } = await import("@/db/facilities");
    const existing = await listFacilitiesPosts(false);
    const known = new Set(existing.map((p) => normalizeImportName(p.nome)));
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of data.rows) {
      const key = normalizeImportName(row.nome);
      if (known.has(key)) {
        skipped += 1;
        continue;
      }
      try {
        await createFacilitiesPost({
          nome: row.nome,
          endereco: row.endereco ?? null,
          cidade: row.cidade ?? null,
          observacao: row.observacao ?? null,
        });
        known.add(key);
        created += 1;
      } catch (error) {
        errors.push(
          `${row.nome}: ${error instanceof Error ? error.message : "Falha ao cadastrar."}`,
        );
      }
    }

    return { ok: true as const, created, skipped, errors };
  });

export const importFacilitiesCollaboratorsFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        rows: z
          .array(
            z.object({
              nome: z.string().trim().min(1).max(200),
              empresa: empresaSchema,
              funcao: funcaoSchema,
              escala: escalaSchema,
              postoBaseNome: z.string().trim().max(200).nullable().optional(),
              telefone: z.string().trim().max(32).nullable().optional(),
            }),
          )
          .max(500),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireModule } = await import("@/lib/require-auth");
    await requireModule("facilities");
    const {
      createFacilitiesCollaborator,
      listFacilitiesCollaborators,
      listFacilitiesPosts,
    } = await import("@/db/facilities");

    const [existing, posts] = await Promise.all([
      listFacilitiesCollaborators(false),
      listFacilitiesPosts(false),
    ]);
    const known = new Set(existing.map((c) => normalizeImportName(c.nome)));
    const postsByName = new Map(
      posts.map((p) => [normalizeImportName(p.nome), p.id] as const),
    );

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of data.rows) {
      const key = normalizeImportName(row.nome);
      if (known.has(key)) {
        skipped += 1;
        continue;
      }
      let postoBaseId: number | null = null;
      if (row.postoBaseNome) {
        const postId = postsByName.get(normalizeImportName(row.postoBaseNome));
        if (!postId) {
          errors.push(`${row.nome}: posto base "${row.postoBaseNome}" não encontrado.`);
          continue;
        }
        postoBaseId = postId;
      }
      try {
        await createFacilitiesCollaborator({
          nome: row.nome,
          empresa: row.empresa,
          funcao: row.funcao,
          escala: row.escala,
          postoBaseId,
          telefone: row.telefone ?? null,
        });
        known.add(key);
        created += 1;
      } catch (error) {
        errors.push(
          `${row.nome}: ${error instanceof Error ? error.message : "Falha ao cadastrar."}`,
        );
      }
    }

    return { ok: true as const, created, skipped, errors };
  });
