import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { hasPermission } from "@/lib/modules";
import { isAdmin } from "@/lib/require-auth";

const fileSchema = z
  .object({
    name: z.string().min(1),
    mime: z.string().optional(),
    data: z.string().min(1),
    size: z.number().optional(),
  })
  .nullable();

const propostaSchema = z.object({
  tv: z.enum(["execucao", "recorrente"]),
  orc: z.string(),
  modalidade: z.string().optional(),
  valor: z.number(),
  total: z.number(),
  prazo: z.number(),
  validade: z.string(),
  arquivo: fileSchema,
  lido: z.boolean().optional(),
});

async function authCrm() {
  const { requireModule } = await import("@/lib/require-auth");
  // Schema sobe via getDb() nas queries — não chamar ensureSchema() aqui
  // (reexecutar o DDL inteiro a cada request trava a UI).
  return requireModule("crm");
}

function canComissoes(user: { role: string; modules?: string[] | null }) {
  if (isAdmin({ role: user.role as "admin" | "superadmin" | "operator" })) return true;
  return hasPermission(user.modules as never, "crm_comissoes");
}

export const getCrmBootstrapFn = createServerFn({ method: "GET" }).handler(async () => {
  const { user } = await authCrm();
  // Garante schema uma vez via getDb (cache em ready), sem re-DDL.
  const { getDb } = await import("@/db/schema");
  await getDb();
  const crm = await import("@/db/crm");
  const { listUsers, listTecnicos, listVendedores } = await import("@/db/users");
  const [oportunidades, regras, users, tecnicosRows, vendedoresRows] = await Promise.all([
    crm.listOportunidades(),
    crm.getRegrasComissao(),
    listUsers(),
    listTecnicos(true),
    listVendedores(true),
  ]);

  const vendedores = (vendedoresRows.length ? vendedoresRows : [])
    .map((u) => u.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  const tecnicos = (tecnicosRows.length ? tecnicosRows : users)
    .map((u) => u.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  return {
    user: {
      id: user.id,
      name: user.name,
      comissoes: canComissoes(user),
      isVendedor: Boolean(user.isVendedor),
    },
    oportunidades,
    regras,
    vendedores,
    tecnicos,
  };
});

export const listCrmOportunidadesFn = createServerFn({ method: "GET" }).handler(async () => {
  await authCrm();
  const { listOportunidades } = await import("@/db/crm");
  return listOportunidades();
});

export const createCrmOportunidadeFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        cliente: z.string().min(1),
        contato: z.string(),
        tel: z.string(),
        cidade: z.string(),
        servico: z.string().min(1),
        tv: z.enum(["execucao", "recorrente"]),
        vendedor: z.string().min(1),
        omieAppId: z.string().trim().optional().nullable(),
        codigoClienteOmie: z.number().int().positive().optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await authCrm();
    const { createOportunidadeManual } = await import("@/db/crm");
    return createOportunidadeManual({
      ...data,
      omieAppId: data.omieAppId ?? null,
      codigoClienteOmie: data.codigoClienteOmie ?? null,
      autor: user.name,
    });
  });

export const vincularCrmOmieClienteFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        omieAppId: z.string().trim().min(1),
        codigoClienteOmie: z.number().int().positive(),
        cliente: z.string().trim().optional().nullable(),
        contato: z.string().trim().optional().nullable(),
        tel: z.string().trim().optional().nullable(),
        cidade: z.string().trim().optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await authCrm();
    const { vincularClienteOmieOportunidade } = await import("@/db/crm");
    return vincularClienteOmieOportunidade(
      data.id,
      {
        omieAppId: data.omieAppId,
        codigoClienteOmie: data.codigoClienteOmie,
        cliente: data.cliente,
        contato: data.contato,
        tel: data.tel,
        cidade: data.cidade,
      },
      user.name,
    );
  });

export const deleteCrmOportunidadeFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ id: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    await authCrm();
    const { deleteOportunidade } = await import("@/db/crm");
    return deleteOportunidade(data.id);
  });

/** Busca clientes Omie (Belfer) para vincular na oportunidade. */
export const searchCrmOmieClientesFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z.object({ query: z.string().trim().min(2) }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    await authCrm();
    const { requireOrcamentosOmieApp } = await import("@/server/omie/client");
    const { searchOmieClients } = await import("@/server/omie/quotes");
    const app = requireOrcamentosOmieApp();
    try {
      const rows = await searchOmieClients(app, data.query);
      return { omieAppId: app.id, items: rows };
    } catch {
      return { omieAppId: app.id, items: [] as Awaited<ReturnType<typeof searchOmieClients>> };
    }
  });

/** Detalhes do cliente Omie (telefone/cidade) ao selecionar na busca. */
export const getCrmOmieClienteDetalhesFn = createServerFn({ method: "GET" })
  .validator((input) =>
    z.object({ clientCode: z.coerce.number().int().positive() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    await authCrm();
    const { requireOrcamentosOmieApp } = await import("@/server/omie/client");
    const { clientDisplayName, clientPhone, getCliente } = await import("@/server/omie/clients");
    const app = requireOrcamentosOmieApp();
    const client = await getCliente(app, data.clientCode).catch(() => undefined);
    if (!client) return null;
    return {
      omieAppId: app.id,
      codigoClienteOmie: client.codigo_cliente_omie,
      nome: clientDisplayName(client) || client.razao_social,
      contato: client.contato,
      telefone: clientPhone(client),
      cidade: client.cidade,
    };
  });

/** Cadastra cliente novo na Omie (Belfer/orçamentos) a partir do CRM. */
export const createCrmOmieClienteFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        razaoSocial: z.string().min(1),
        nomeFantasia: z.string().optional().nullable(),
        cnpjCpf: z.string().min(11),
        email: z.string().optional().nullable(),
        telefone: z.string().min(10),
        contato: z.string().optional().nullable(),
        endereco: z.string().min(1),
        enderecoNumero: z.string().min(1),
        complemento: z.string().optional().nullable(),
        bairro: z.string().min(1),
        cidade: z.string().min(1),
        estado: z.string().min(2).max(2),
        cep: z.string().min(8),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    await authCrm();
    const { requireOrcamentosOmieApp } = await import("@/server/omie/client");
    const { incluirClienteOmie } = await import("@/server/omie/clients");
    const app = requireOrcamentosOmieApp();
    return incluirClienteOmie(app, {
      razaoSocial: data.razaoSocial,
      nomeFantasia: data.nomeFantasia,
      cnpjCpf: data.cnpjCpf,
      email: data.email,
      telefone: data.telefone,
      contato: data.contato,
      endereco: data.endereco,
      enderecoNumero: data.enderecoNumero,
      complemento: data.complemento,
      bairro: data.bairro,
      cidade: data.cidade,
      estado: data.estado,
      cep: data.cep,
    });
  });

export const patchCrmOportunidadeFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        campos: z
          .object({
            contato: z.string().optional(),
            tel: z.string().optional(),
            cidade: z.string().optional(),
            servico: z.string().optional(),
            tv: z.enum(["execucao", "recorrente"]).optional(),
            modalidade: z.string().optional(),
            valor: z.number().optional(),
            prazo: z.number().optional(),
            total: z.number().optional(),
            validade: z.string().optional(),
            orc: z.string().optional(),
          })
          .passthrough(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await authCrm();
    const { patchOportunidade } = await import("@/db/crm");
    return patchOportunidade(data.id, data.campos as never, user.name);
  });

export const crmMontadoFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        ...propostaSchema.shape,
        obs: z.string(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await authCrm();
    const { acaoMontado } = await import("@/db/crm");
    const { id, ...rest } = data;
    return acaoMontado(id, rest as never, user.name);
  });

export const crmEnvioFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        canal: z.string().min(1),
        data: z.string().min(1),
        obs: z.string(),
        ...propostaSchema.shape,
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await authCrm();
    const { acaoEnvio } = await import("@/db/crm");
    const { id, ...rest } = data;
    return acaoEnvio(id, rest as never, user.name);
  });

export const crmAgendarFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        n: z.union([z.literal(2), z.literal(3)]),
        modo: z.enum(["mover", "reagendar"]),
        tipo: z.string().min(1),
        data: z.string().min(1),
        hora: z.string(),
        obj: z.string(),
        resultadoAnterior: z.string(),
        motivoReagendar: z.string(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await authCrm();
    const { acaoAgendar } = await import("@/db/crm");
    return acaoAgendar(
      data.id,
      {
        ...data,
        tipo: data.tipo as import("@/features/crm/codigo/types").TipoAcaoId,
      },
      user.name,
    );
  });

export const crmResultadoFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        resultado: z.string().min(1),
        proximo: z.enum(["acao3", "final", "aguardar"]),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await authCrm();
    const { acaoResultado } = await import("@/db/crm");
    return acaoResultado(data.id, data, user.name);
  });

export const crmAprovarFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        aguardando: z.string().min(1),
        data: z.string(),
        prev: z.string().min(1),
        obs: z.string(),
        soPrevisao: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await authCrm();
    const { acaoAprovar } = await import("@/db/crm");
    return acaoAprovar(
      data.id,
      {
        aguardando: data.aguardando,
        data: data.data,
        prev: data.prev,
        obs: data.obs,
      },
      user.name,
      Boolean(data.soPrevisao),
    );
  });

export const crmFinalizarFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        st: z.enum(["ganho", "perdido"]),
        motivo: z.string(),
        obs: z.string(),
        concorrente: z.string(),
        retomar: z.string(),
        arquivo: fileSchema,
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await authCrm();
    const { acaoFinalizar } = await import("@/db/crm");
    const { createOs } = await import("@/db/assistencia");

    return acaoFinalizar(
      data.id,
      {
        st: data.st,
        motivo: data.motivo,
        obs: data.obs,
        concorrente: data.concorrente,
        retomar: data.retomar,
        arquivo: data.arquivo as never,
      },
      user.name,
      {
        createOsPedido: async (o, etiqueta) => {
          if (data.st !== "ganho") return null;
          const os = await createOs({
            tipo: "pedido",
            clientName: o.cliente,
            clientCity: o.cidade || null,
            servico: o.servico || "",
            quoteNumero: o.orc || o.cod,
            aprovadoPor: user.name,
            aprovacaoAnexo: data.arquivo
              ? {
                  name: data.arquivo.name,
                  mime: data.arquivo.mime ?? "application/octet-stream",
                  data: data.arquivo.data,
                }
              : null,
            items: o.itens
              .filter((it) => it.d?.trim() && Number(it.q) > 0)
              .map((it) => ({ qtd: Number(it.q), nome: it.d.trim() })),
            createdBy: user.id,
            createdByName: user.name,
          });
          void etiqueta;
          return os?.num ?? null;
        },
      },
    );
  });

/** Cria orçamento local a partir do L.T. (não envia à Omie). Idempotente por os_origem_id. */
export const gerarOrcamentoFromOportunidadeFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ id: z.number().int().positive() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { user } = await authCrm();
    const { getOportunidade } = await import("@/db/crm");
    const { getDb } = await import("@/db/schema");
    const { createQuoteRecord } = await import("@/db/quotes");
    const { getOmieProductsByCodes } = await import("@/db/products");
    const { requireOrcamentosOmieApp, listOrcamentosOmieApps } = await import(
      "@/server/omie/client"
    );

    const o = await getOportunidade(data.id);
    if (!o) throw new Error("Oportunidade não encontrada.");
    if (!o.itens.length) throw new Error("Sem itens do levantamento para montar o orçamento.");

    const db = await getDb();
    if (o.osOrigemId) {
      const [existing] = (await db`
        select id, numero_interno
        from quotes
        where os_origem_id = ${o.osOrigemId} and lt_numero is not null
        order by id asc
        limit 1
      `) as Array<{ id: number; numero_interno: string }>;
      if (existing) {
        return {
          quoteId: existing.id,
          numeroInterno: existing.numero_interno,
          already: true as const,
        };
      }
    }

    let appId = o.omieAppId?.trim() || "";
    let appName = appId;
    if (!appId) {
      const app = requireOrcamentosOmieApp();
      appId = app.id;
      appName = app.name;
    } else {
      const apps = listOrcamentosOmieApps();
      appName = apps.find((a) => a.id === appId)?.name ?? appId;
    }
    const clientCode = o.codigoClienteOmie;
    if (!clientCode || clientCode <= 0) {
      throw new Error("Vincule o cliente Omie na oportunidade antes de gerar o orçamento.");
    }

    const codes = o.itens
      .map((it) => Number(it.codigoProduto))
      .filter((c) => Number.isFinite(c) && c > 0);
    const products = await getOmieProductsByCodes(appId, codes);
    const byCode = new Map(products.map((p) => [p.codigoProduto, p]));

    const items = o.itens.map((it) => {
      const codigo = Number(it.codigoProduto);
      if (!Number.isFinite(codigo) || codigo <= 0) {
        throw new Error(
          `Item "${it.d}" sem código Omie. Refaça o levantamento com produtos do catálogo.`,
        );
      }
      const prod = byCode.get(codigo);
      return {
        codigoProduto: codigo,
        descricao: it.d,
        quantidade: Number(it.q) || 1,
        valorUnitario: Number(prod?.precoSugerido ?? prod?.valorUnitario ?? 0) || 0,
        unidade: prod?.unidade ?? null,
        ncm: prod?.ncm ?? null,
      };
    });

    const total = items.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
    const obsParts = [
      o.ltNumero ? `Origem ${o.ltNumero}` : null,
      o.os ? `OS ${o.os}` : null,
      `OP ${o.cod}`,
    ].filter(Boolean);

    const created = await createQuoteRecord({
      omieAppId: appId,
      omieAppName: appName,
      clientCode,
      clientName: o.cliente,
      observacao: obsParts.join(" · "),
      total,
      createdBy: user.id,
      items,
    });

    await db`
      update quotes
      set lt_numero = ${o.ltNumero ?? null},
          oportunidade_id = ${o.id},
          os_origem_id = ${o.osOrigemId ?? null},
          updated_at = now()
      where id = ${created.quoteId}
    `;
    await db`
      update crm_oportunidade
      set num_orcamento = ${created.numeroInterno}, updated_at = now()
      where id = ${o.id}
    `;
    await db`
      insert into crm_evento (oportunidade_id, data, tipo, texto, autor)
      values (
        ${o.id},
        ${new Date().toISOString().slice(0, 10)},
        'sis',
        ${`Orçamento ${created.numeroInterno} gerado a partir do levantamento técnico.`},
        ${user.name}
      )
    `;

    return {
      quoteId: created.quoteId,
      numeroInterno: created.numeroInterno,
      already: false as const,
    };
  });

export const crmVoltarFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        destino: z.string().min(1),
        motivo: z.string().min(1),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await authCrm();
    const { acaoVoltar } = await import("@/db/crm");
    return acaoVoltar(
      data.id,
      data.destino as import("@/features/crm/codigo/types").EtapaId,
      data.motivo,
      user.name,
    );
  });

export const crmReabrirFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({ id: z.number().int().positive(), motivo: z.string().min(1) })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await authCrm();
    const { acaoReabrir } = await import("@/db/crm");
    return acaoReabrir(data.id, data.motivo, user.name);
  });

export const crmNotaFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({ id: z.number().int().positive(), texto: z.string().min(1) })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await authCrm();
    const { acaoNota } = await import("@/db/crm");
    return acaoNota(data.id, data.texto, user.name);
  });

export const crmEquipeFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        vendedor: z.string().optional(),
        motivo: z.string().optional(),
        aux: z.array(z.string()).optional(),
        apoio: z.array(z.string()).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await authCrm();
    const { setEquipe } = await import("@/db/crm");
    const { id, ...rest } = data;
    return setEquipe(id, rest as never, user.name);
  });

export const crmUploadDocFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        etiqueta: z.string().min(1),
        arquivo: z.object({
          name: z.string().min(1),
          mime: z.string().optional(),
          data: z.string().min(1),
          size: z.number().optional(),
        }),
        lido: z.boolean().optional(),
        tv: z.enum(["execucao", "recorrente"]).optional(),
        orc: z.string().optional(),
        modalidade: z.string().optional(),
        valor: z.number().optional(),
        total: z.number().optional(),
        prazo: z.number().optional(),
        validade: z.string().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await authCrm();
    const { uploadDocumento } = await import("@/db/crm");
    const { id, ...rest } = data;
    return uploadDocumento(id, rest as never, user.name);
  });

export const crmDeleteDocFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({ id: z.number().int().positive(), docId: z.string().min(1) })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await authCrm();
    const { deleteDocumento } = await import("@/db/crm");
    return deleteDocumento(data.id, data.docId, user.name);
  });

export const crmGetDocFn = createServerFn({ method: "GET" })
  .validator((input) => z.object({ docId: z.string().min(1) }).parse(input ?? {}))
  .handler(async ({ data }) => {
    await authCrm();
    const { getDocumentoData } = await import("@/db/crm");
    const doc = await getDocumentoData(data.docId);
    if (!doc) throw new Error("Documento não encontrado.");
    return doc;
  });

export const crmSaveRegrasFn = createServerFn({ method: "POST" })
  .validator((input) => z.object({ regras: z.any() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { user } = await authCrm();
    if (!canComissoes(user)) throw new Error("Sem permissão para editar regras de comissão.");
    const { saveRegrasComissao } = await import("@/db/crm");
    await saveRegrasComissao(data.regras, user.name, user.id);
    return { ok: true };
  });

export const crmEncerrarContratoFn = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        id: z.number().int().positive(),
        contrato: z
          .object({ fim: z.string(), motivo: z.string() })
          .nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { user } = await authCrm();
    if (!canComissoes(user)) throw new Error("Sem permissão para encerrar contrato.");
    const { encerrarContrato } = await import("@/db/crm");
    return encerrarContrato(data.id, data.contrato, user.name);
  });

