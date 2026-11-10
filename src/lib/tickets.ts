import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  assumeTicket,
  commentTicket,
  createTicket,
  forwardTicket,
  getTicketById,
  linkTicketToOs,
  listTickets,
  reopenTicket,
  resolveTicket,
  scheduleTicket,
} from "@/db/tickets";
import { createOs, getOsById } from "@/db/assistencia";
import { ensureSchema } from "@/db/schema";
import { osTipoLabel, type OsTipo } from "@/lib/assistencia-domain";
import {
  canActOnTicketSectors,
  canOsWorkflow,
  isAdmin,
  requireModule,
  userTicketSectors,
} from "@/lib/require-auth";
import {
  defaultSetoresForCat,
  TICKET_ATIVOS,
  TICKET_CATS,
  TICKET_PRIOS,
  TICKET_SETORES,
  ticketCatLabel,
} from "@/lib/tickets-domain";

async function auth() {
  return requireModule("tickets");
}

async function boot() {
  await ensureSchema();
}

export const getTicketsBootstrapFn = createServerFn({ method: "GET" }).handler(async () => {
  const { user } = await auth();
  await boot();
  const sectors = userTicketSectors(user);
  const tickets = await listTickets({
    queue: isAdmin(user) ? "todos" : sectors.length ? "meu" : "meus",
    filter: "ativos",
    userId: user.id,
    userSectors: sectors,
  });
  const { listOmieApps, requireOrcamentosOmieApp } = await import("@/server/omie/client");
  const apps = listOmieApps().map((a) => ({ id: a.id, name: a.name }));
  let omieAppId = apps[0]?.id ?? "";
  try {
    omieAppId = requireOrcamentosOmieApp().id;
  } catch {
    // usa o primeiro app se não houver app de orçamentos
  }
  return {
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      sectors,
      canOpenOs: isAdmin(user) || canOsWorkflow(user, "assistencia"),
      isAdmin: isAdmin(user),
    },
    omieAppId,
    apps,
    catalogs: {
      setores: TICKET_SETORES.map((s) => ({ id: s.id, nome: s.nome })),
      cats: TICKET_CATS.map((c) => ({
        id: c.id,
        label: c.label,
        setores: [...c.setores],
      })),
      prios: [...TICKET_PRIOS],
    },
    tickets,
  };
});

export const searchTicketClientsFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        omieAppId: z.string().trim().optional(),
        query: z.string().trim().min(2),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    await auth();
    await boot();
    const { listOmieApps, requireOrcamentosOmieApp } = await import("@/server/omie/client");
    const { searchOmieClients } = await import("@/server/omie/quotes");
    let app;
    try {
      app = data.omieAppId
        ? listOmieApps().find((a) => a.id === data.omieAppId) ?? requireOrcamentosOmieApp()
        : requireOrcamentosOmieApp();
    } catch {
      app = listOmieApps()[0];
    }
    if (!app) return [];
    try {
      return await searchOmieClients(app, data.query);
    } catch {
      return [];
    }
  });

export const listTicketsFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        queue: z.enum(["meu", "meus", "todos"]),
        filter: z.enum(["ativos", "fechados", "todos"]),
        query: z.string().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const sectors = userTicketSectors(user);
    return listTickets({
      queue: data.queue,
      filter: data.filter,
      userId: user.id,
      userSectors: sectors.length ? sectors : ["__none__"],
      query: data.query,
    });
  });

export const getTicketFn = createServerFn({ method: "GET" })
  .validator((input) => z.object({ id: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    await auth();
    await boot();
    return getTicketById(data.id);
  });

export const createTicketFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        cat: z.string().min(1),
        codigoRef: z.string().optional().nullable(),
        clientName: z.string().min(1),
        omieAppId: z.string().optional().nullable(),
        clientCode: z.number().optional().nullable(),
        contato: z.string().optional().nullable(),
        descricao: z.string().min(1),
        prioridade: z.enum(["Baixa", "Normal", "Alta", "Urgente"]).optional(),
        setores: z.array(z.string()).min(1),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const setores =
      data.setores.length > 0 ? data.setores : defaultSetoresForCat(data.cat);
    return createTicket({
      cat: data.cat,
      codigoRef: data.codigoRef,
      clientName: data.clientName,
      omieAppId: data.omieAppId,
      clientCode: data.clientCode,
      contato: data.contato,
      descricao: data.descricao,
      prioridade: data.prioridade,
      setores,
      openedBy: user.id,
      openedByName: user.name,
    });
  });

export const assumeTicketFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ id: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const ticket = await getTicketById(data.id);
    if (!ticket) throw new Error("Ticket não encontrado.");
    if (!canActOnTicketSectors(user, ticket.setores)) {
      throw new Error("Sem permissão para este setor.");
    }
    if (!TICKET_ATIVOS.includes(ticket.status) || ticket.status === "andamento") {
      if (ticket.status !== "aberto" && ticket.status !== "encaminhado") {
        throw new Error("Ticket não pode ser assumido neste status.");
      }
    }
    return assumeTicket({ id: data.id, userId: user.id, userName: user.name });
  });

const ticketAnexoSchema = z.object({
  name: z.string().min(1),
  mime: z.string().min(1),
  data: z.string().min(1),
});

export const commentTicketFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        texto: z.string().optional().default(""),
        anexos: z.array(ticketAnexoSchema).max(10).optional(),
      })
      .refine((v) => Boolean(v.texto?.trim()) || Boolean(v.anexos?.length), {
        message: "Informe um comentário ou anexo.",
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    return commentTicket({
      id: data.id,
      userId: user.id,
      userName: user.name,
      texto: data.texto ?? "",
      anexos: data.anexos,
    });
  });

export const forwardTicketFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        addSetores: z.array(z.string()).min(1),
        removeMine: z.boolean().optional(),
        texto: z.string().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const ticket = await getTicketById(data.id);
    if (!ticket) throw new Error("Ticket não encontrado.");
    if (!canActOnTicketSectors(user, ticket.setores)) {
      throw new Error("Sem permissão para este setor.");
    }
    return forwardTicket({
      id: data.id,
      userId: user.id,
      userName: user.name,
      addSetores: data.addSetores,
      removeMine: Boolean(data.removeMine),
      mySectors: userTicketSectors(user),
      texto: data.texto,
    });
  });

export const resolveTicketFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        texto: z.string().optional().default(""),
        anexos: z.array(ticketAnexoSchema).max(10).optional(),
      })
      .refine((v) => Boolean(v.texto?.trim()) || Boolean(v.anexos?.length), {
        message: "Informe o texto da solução ou um anexo.",
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const ticket = await getTicketById(data.id);
    if (!ticket) throw new Error("Ticket não encontrado.");
    if (!canActOnTicketSectors(user, ticket.setores)) {
      throw new Error("Sem permissão para este setor.");
    }
    return resolveTicket({
      id: data.id,
      userId: user.id,
      userName: user.name,
      texto: data.texto ?? "",
      anexos: data.anexos,
    });
  });

export const reopenTicketFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        texto: z.string().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const ticket = await getTicketById(data.id);
    if (!ticket) throw new Error("Ticket não encontrado.");
    if (!canActOnTicketSectors(user, ticket.setores)) {
      throw new Error("Sem permissão para este setor.");
    }
    return reopenTicket({
      id: data.id,
      userId: user.id,
      userName: user.name,
      texto: data.texto,
    });
  });

export const scheduleTicketFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        agDate: z.string().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    const ticket = await getTicketById(data.id);
    if (!ticket) throw new Error("Ticket não encontrado.");
    if (!canActOnTicketSectors(user, ticket.setores)) {
      throw new Error("Sem permissão para este setor.");
    }
    const agDate =
      data.agDate == null || !String(data.agDate).trim()
        ? null
        : String(data.agDate).trim().slice(0, 10);
    if (agDate && !/^\d{4}-\d{2}-\d{2}$/.test(agDate)) {
      throw new Error("Data inválida.");
    }
    return scheduleTicket({
      id: data.id,
      agDate,
      userId: user.id,
      userName: user.name,
    });
  });

export const openOsFromTicketFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        ticketId: z.number().int().positive(),
        tipo: z.enum(["pedido", "manut", "monit", "visita"]),
        subtipo: z.string().optional().nullable(),
        quoteId: z.number().int().positive().optional().nullable(),
        quoteNumero: z.string().optional().nullable(),
        servico: z.string().optional(),
        items: z
          .array(z.object({ qtd: z.number().positive(), nome: z.string().min(1) }))
          .optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await auth();
    await boot();
    if (!isAdmin(user) && !canOsWorkflow(user, "assistencia")) {
      throw new Error("Sem permissão para abrir OS (OS · Assistência).");
    }

    const ticket = await getTicketById(data.ticketId);
    if (!ticket) throw new Error("Ticket não encontrado.");
    if (ticket.status === "os" && ticket.osId) {
      const existing = await getOsById(ticket.osId);
      return { ticket, os: existing };
    }

    const os = await createOs({
      tipo: data.tipo as OsTipo,
      subtipo: data.subtipo,
      clientName: ticket.clientName,
      omieAppId: ticket.omieAppId,
      clientCode: ticket.clientCode,
      servico: data.servico || ticket.descricao,
      quoteId: data.quoteId ?? null,
      quoteNumero: data.quoteNumero ?? null,
      ticketId: ticket.id,
      items: data.items,
      createdBy: user.id,
      createdByName: user.name,
    });
    if (!os) throw new Error("Falha ao criar OS.");

    const updated = await linkTicketToOs({
      ticketId: ticket.id,
      osId: os.id,
      osTipoLabel: osTipoLabel(data.tipo) + (data.subtipo ? ` · ${data.subtipo}` : ""),
      userId: user.id,
      userName: user.name,
    });

    return { ticket: updated, os };
  });

export const ticketCatDefaultsFn = createServerFn({ method: "GET" })
  .validator((input) => z.object({ cat: z.string() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    await auth();
    return {
      label: ticketCatLabel(data.cat),
      setores: defaultSetoresForCat(data.cat),
    };
  });
