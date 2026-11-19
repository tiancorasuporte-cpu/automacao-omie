import { getDb } from "@/db/schema";
import { COMISSAO_PADRAO } from "@/features/crm/codigo/config";
import {
  aplicarVolta,
  calcComissao,
  documentoFechamento,
  hojeISO,
  proximoCodigo,
  validarAgendamento,
  validarAprovado,
  validarEnvio,
  validarFinal,
  validarMontado,
  validarResultado,
} from "@/features/crm/codigo/regras";
import type {
  Acao,
  Aprovacao,
  Documento,
  EtapaId,
  EventoHistorico,
  ItemLevantamento,
  Oportunidade,
  RegrasComissao,
  Resultado,
  TipoAcaoId,
  TipoVenda,
} from "@/features/crm/codigo/types";

function str(v: unknown) {
  return v == null ? "" : String(v);
}
function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function json<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "object") return v as T;
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return fallback;
  }
}

type OpRow = Record<string, unknown>;

function mapOp(
  row: OpRow,
  itens: ItemLevantamento[],
  aux: string[],
  apoio: string[],
  docs: Documento[],
  hist: EventoHistorico[],
): Oportunidade {
  const acao = json<Acao | null>(row["acao_json"], null);
  const aprov = json<Aprovacao | null>(row["aprov_json"], null);
  const res = json<Resultado | null>(row["res_json"], null);
  const contrato = json<{ fim: string; motivo: string } | null>(row["contrato_json"], null);
  const comRegras = json<RegrasComissao | null>(row["com_regras_json"], null);
  const tvRaw = str(row["tipo_venda"]);
  const orcRaw = str(row["num_orcamento"] ?? "");
  const modalidadeRaw = str(row["modalidade"] ?? "");
  const op: Oportunidade = {
    id: num(row["id"]),
    cod: str(row["cod"]),
    cliente: str(row["cliente"]),
    contato: str(row["contato"]),
    tel: str(row["tel"]),
    cidade: str(row["cidade"]),
    servico: str(row["servico"]),
    os: str(row["os_origem"] ?? ""),
    tecnico: str(row["tecnico"] ?? ""),
    visita: str(row["data_visita"] ?? ""),
    vendedor: str(row["responsavel"]),
    aux,
    apoio,
    etapa: str(row["etapa"]) as EtapaId,
    desde: str(row["etapa_desde"]).slice(0, 10),
    criado: str(row["criado_em"]).slice(0, 10),
    valor: num(row["valor_mensal"]),
    prazo: num(row["prazo_meses"]),
    validade: str(row["validade"] ?? ""),
    itens,
    docs,
    hist,
  };
  if (tvRaw === "execucao" || tvRaw === "recorrente") op.tv = tvRaw;
  if (row["valor_total"] != null) op.total = num(row["valor_total"]);
  if (orcRaw) op.orc = orcRaw;
  if (acao) op.acao = acao;
  if (aprov) op.aprov = aprov;
  if (res) op.res = res;
  if (modalidadeRaw) op.modalidade = modalidadeRaw;
  if (comRegras) op.comRegras = comRegras;
  if (contrato) op.contrato = contrato;
  const omieAppId = str(row["omie_app_id"] ?? "");
  const codigoOmie = num(row["codigo_cliente_omie"]);
  if (omieAppId) op.omieAppId = omieAppId;
  if (codigoOmie > 0) op.codigoClienteOmie = codigoOmie;
  return op;
}

async function loadRelated(ids: number[]) {
  const db = await getDb();
  const itens = new Map<number, ItemLevantamento[]>();
  const aux = new Map<number, string[]>();
  const apoio = new Map<number, string[]>();
  const docs = new Map<number, Documento[]>();
  const hist = new Map<number, EventoHistorico[]>();
  if (!ids.length) return { itens, aux, apoio, docs, hist };

  const itemRows = (await db`
    select oportunidade_id, qtd, descricao
    from crm_item
    where oportunidade_id = any(${ids})
    order by id
  `) as Array<{ oportunidade_id: number; qtd: number; descricao: string }>;
  for (const r of itemRows) {
    const list = itens.get(r.oportunidade_id) ?? [];
    list.push({ q: Number(r.qtd), d: r.descricao });
    itens.set(r.oportunidade_id, list);
  }

  const eqRows = (await db`
    select oportunidade_id, nome, papel
    from crm_equipe
    where oportunidade_id = any(${ids})
  `) as Array<{ oportunidade_id: number; nome: string; papel: string }>;
  for (const r of eqRows) {
    if (r.papel === "auxiliar") {
      const list = aux.get(r.oportunidade_id) ?? [];
      list.push(r.nome);
      aux.set(r.oportunidade_id, list);
    } else if (r.papel === "apoio") {
      const list = apoio.get(r.oportunidade_id) ?? [];
      list.push(r.nome);
      apoio.set(r.oportunidade_id, list);
    }
  }

  const docRows = (await db`
    select id, oportunidade_id, nome, tamanho, etiqueta, lido_auto, autor, criado_em
    from crm_documento
    where oportunidade_id = any(${ids})
    order by id
  `) as Array<Record<string, unknown>>;
  for (const r of docRows) {
    const oid = num(r["oportunidade_id"]);
    const list = docs.get(oid) ?? [];
    list.push({
      id: str(r["id"]),
      nome: str(r["nome"]),
      tam: num(r["tamanho"]),
      data: str(r["criado_em"]).slice(0, 10),
      autor: str(r["autor"]),
      etiqueta: str(r["etiqueta"]),
      lido: Boolean(r["lido_auto"]),
    });
    docs.set(oid, list);
  }

  const evRows = (await db`
    select oportunidade_id, data, tipo, texto, autor
    from crm_evento
    where oportunidade_id = any(${ids})
    order by id desc
  `) as Array<Record<string, unknown>>;
  for (const r of evRows) {
    const oid = num(r["oportunidade_id"]);
    const list = hist.get(oid) ?? [];
    list.push({
      data: str(r["data"]).slice(0, 10),
      tipo: str(r["tipo"]) as EventoHistorico["tipo"],
      texto: str(r["texto"]),
      autor: str(r["autor"]),
    });
    hist.set(oid, list);
  }

  return { itens, aux, apoio, docs, hist };
}

async function addEvent(
  oportunidadeId: number,
  autor: string,
  tipo: EventoHistorico["tipo"],
  texto: string,
  data = hojeISO(),
) {
  const db = await getDb();
  await db`
    insert into crm_evento (oportunidade_id, data, tipo, texto, autor)
    values (${oportunidadeId}, ${data}, ${tipo}, ${texto}, ${autor})
  `;
}

export async function listOportunidades(): Promise<Oportunidade[]> {
  const db = await getDb();
  const rows = (await db`
    select * from crm_oportunidade order by id desc
  `) as OpRow[];
  const ids = rows.map((r) => num(r["id"]));
  const rel = await loadRelated(ids);
  return rows.map((r) => {
    const id = num(r["id"]);
    return mapOp(
      r,
      rel.itens.get(id) ?? [],
      rel.aux.get(id) ?? [],
      rel.apoio.get(id) ?? [],
      rel.docs.get(id) ?? [],
      rel.hist.get(id) ?? [],
    );
  });
}

export async function getOportunidade(id: number): Promise<Oportunidade | null> {
  const db = await getDb();
  const rows = (await db`
    select * from crm_oportunidade where id = ${id} limit 1
  `) as OpRow[];
  const row = rows[0];
  if (!row) return null;
  const rel = await loadRelated([id]);
  return mapOp(
    row,
    rel.itens.get(id) ?? [],
    rel.aux.get(id) ?? [],
    rel.apoio.get(id) ?? [],
    rel.docs.get(id) ?? [],
    rel.hist.get(id) ?? [],
  );
}

async function nextCod(): Promise<string> {
  const db = await getDb();
  const rows = (await db`select cod from crm_oportunidade`) as Array<{ cod: string }>;
  return proximoCodigo(rows.map((r) => ({ cod: r.cod }) as Oportunidade));
}

export async function createOportunidadeManual(input: {
  cliente: string;
  contato: string;
  tel: string;
  cidade: string;
  servico: string;
  tv: TipoVenda;
  vendedor: string;
  autor: string;
  omieAppId?: string | null;
  codigoClienteOmie?: number | null;
}) {
  const db = await getDb();
  const cod = await nextCod();
  const hoje = hojeISO();
  const omieAppId = input.omieAppId?.trim() || null;
  const codigoOmie =
    input.codigoClienteOmie != null && Number(input.codigoClienteOmie) > 0
      ? Number(input.codigoClienteOmie)
      : null;
  const [row] = (await db`
    insert into crm_oportunidade (
      cod, cliente, contato, tel, cidade, servico, tipo_venda, responsavel,
      etapa, etapa_desde, criado_em, valor_mensal, prazo_meses,
      omie_app_id, codigo_cliente_omie
    ) values (
      ${cod}, ${input.cliente.trim()}, ${input.contato.trim()}, ${input.tel.trim()},
      ${input.cidade.trim()}, ${input.servico}, ${input.tv}, ${input.vendedor},
      'montar', ${hoje}, ${hoje}, 0, 0,
      ${omieAppId}, ${codigoOmie}
    )
    returning id
  `) as Array<{ id: number }>;
  if (!row) throw new Error("Falha ao criar oportunidade.");
  const evtTxt = codigoOmie
    ? `Criada manualmente (indicação / cliente que ligou). Cliente Omie #${codigoOmie}.`
    : "Criada manualmente (indicação / cliente que ligou).";
  await addEvent(row.id, input.autor, "sis", evtTxt);
  return getOportunidade(row.id);
}

/** Cria OP a partir de OS de visita (orçamento) finalizada. Idempotente por os_origem. */
export async function createOportunidadeFromOs(input: {
  osNum: string;
  osId: number;
  cliente: string;
  cidade?: string | null;
  servico?: string | null;
  tecnico?: string | null;
  dataVisita?: string | null;
  vendedor: string;
  autor: string;
  itens: Array<{ qtd: number; nome: string }>;
}) {
  const db = await getDb();
  const existing = (await db`
    select id from crm_oportunidade where os_origem = ${input.osNum} limit 1
  `) as Array<{ id: number }>;
  if (existing[0]) return getOportunidade(existing[0].id);

  const cod = await nextCod();
  const hoje = hojeISO();
  const [row] = (await db`
    insert into crm_oportunidade (
      cod, cliente, contato, tel, cidade, servico, tipo_venda, os_origem, os_origem_id,
      tecnico, data_visita, responsavel, etapa, etapa_desde, criado_em, valor_mensal, prazo_meses
    ) values (
      ${cod}, ${input.cliente.trim()}, '', '', ${input.cidade?.trim() || ""},
      ${input.servico?.trim() || "CFTV"}, null, ${input.osNum}, ${input.osId},
      ${input.tecnico?.trim() || ""}, ${input.dataVisita?.slice(0, 10) || hoje},
      ${input.vendedor}, 'montar', ${hoje}, ${hoje}, 0, 0
    )
    returning id
  `) as Array<{ id: number }>;
  if (!row) throw new Error("Falha ao criar oportunidade da OS.");

  for (const it of input.itens) {
    await db`
      insert into crm_item (oportunidade_id, qtd, descricao)
      values (${row.id}, ${it.qtd}, ${it.nome.trim()})
    `;
  }
  if (input.tecnico?.trim()) {
    // técnico da visita fica disponível como apoio (só entra se marcado depois)
  }
  await addEvent(
    row.id,
    input.autor,
    "sis",
    `Criada automaticamente ao finalizar a ${input.osNum} (visita de orçamento).`,
  );
  return getOportunidade(row.id);
}

export async function patchOportunidade(
  id: number,
  campos: Partial<{
    contato: string;
    tel: string;
    cidade: string;
    servico: string;
    tv: TipoVenda;
    modalidade: string;
    valor: number;
    prazo: number;
    total: number;
    validade: string;
    orc: string;
  }>,
  autor: string,
) {
  const o = await getOportunidade(id);
  if (!o) throw new Error("Oportunidade não encontrada.");
  const db = await getDb();
  const tv = campos.tv ?? o.tv ?? null;
  await db`
    update crm_oportunidade set
      contato = ${campos.contato ?? o.contato},
      tel = ${campos.tel ?? o.tel},
      cidade = ${campos.cidade ?? o.cidade},
      servico = ${campos.servico ?? o.servico},
      tipo_venda = ${tv},
      modalidade = ${campos.modalidade ?? o.modalidade ?? null},
      valor_mensal = ${campos.valor ?? o.valor},
      prazo_meses = ${campos.prazo ?? o.prazo},
      valor_total = ${campos.total ?? o.total ?? null},
      validade = ${campos.validade ?? o.validade ?? null},
      num_orcamento = ${campos.orc ?? o.orc ?? null},
      updated_at = now()
    where id = ${id}
  `;
  if (campos.tv && campos.tv !== o.tv) {
    await addEvent(id, autor, "nota", `Tipo de venda alterado para ${campos.tv}.`);
  }
  return getOportunidade(id);
}

export type CrmFile = { name: string; mime?: string | undefined; data: string; size?: number | undefined };

async function fileToDoc(
  oportunidadeId: number,
  file: CrmFile,
  etiqueta: string,
  autor: string,
  lido = false,
) {
  const db = await getDb();
  const tam = file.size ?? Math.round((file.data.length * 3) / 4);
  const [row] = (await db`
    insert into crm_documento (
      oportunidade_id, nome, tamanho, mime, data_base64, etiqueta, lido_auto, autor
    ) values (
      ${oportunidadeId}, ${file.name}, ${tam}, ${file.mime || "application/octet-stream"},
      ${file.data}, ${etiqueta}, ${lido}, ${autor}
    )
    returning id
  `) as Array<{ id: number }>;
  await addEvent(oportunidadeId, autor, "nota", `Anexo: ${etiqueta} · ${file.name}`);
  return String(row!.id);
}

export async function acaoMontado(
  id: number,
  d: {
    tv: TipoVenda;
    orc: string;
    modalidade?: string;
    valor: number;
    total: number;
    prazo: number;
    validade: string;
    obs: string;
    arquivo: CrmFile | null;
    lido?: boolean;
  },
  autor: string,
) {
  const o = await getOportunidade(id);
  if (!o) throw new Error("Oportunidade não encontrada.");
  const err = validarMontado({ orc: d.orc, temArquivo: Boolean(d.arquivo) });
  if (err) throw new Error(err);
  if (d.arquivo) {
    await fileToDoc(id, d.arquivo, "Orçamento padrão", autor, Boolean(d.lido));
  }
  const db = await getDb();
  const hoje = hojeISO();
  await db`
    update crm_oportunidade set
      tipo_venda = ${d.tv},
      modalidade = ${d.modalidade || null},
      valor_mensal = ${d.valor},
      valor_total = ${d.total || null},
      prazo_meses = ${d.prazo},
      validade = ${d.validade},
      num_orcamento = ${d.orc || null},
      etapa = 'montado',
      etapa_desde = ${hoje},
      updated_at = now()
    where id = ${id}
  `;
  await addEvent(
    id,
    autor,
    "etapa",
    `Orçamento montado${d.orc ? ` · ${d.orc}` : ""}${d.obs ? ` · ${d.obs}` : ""}.`,
  );
  return getOportunidade(id);
}

export async function acaoEnvio(
  id: number,
  d: {
    canal: string;
    data: string;
    tv: TipoVenda;
    orc: string;
    modalidade?: string;
    valor: number;
    total: number;
    prazo: number;
    validade: string;
    obs: string;
    arquivo: CrmFile | null;
    lido?: boolean;
  },
  autor: string,
) {
  const o = await getOportunidade(id);
  if (!o) throw new Error("Oportunidade não encontrada.");
  const err = validarEnvio(o, {
    temArquivoNovo: Boolean(d.arquivo),
    tv: d.tv,
    mensal: d.valor,
    total: d.total,
    obs: d.obs,
  });
  if (err) throw new Error(err);
  if (d.arquivo) {
    await fileToDoc(id, d.arquivo, "Proposta enviada", autor, Boolean(d.lido));
  }
  const db = await getDb();
  const hoje = hojeISO();
  await db`
    update crm_oportunidade set
      tipo_venda = ${d.tv},
      modalidade = ${d.modalidade || null},
      valor_mensal = ${d.valor},
      valor_total = ${d.total || null},
      prazo_meses = ${d.prazo},
      validade = ${d.validade},
      num_orcamento = ${d.orc || o.orc || null},
      etapa = 'enviado',
      etapa_desde = ${hoje},
      updated_at = now()
    where id = ${id}
  `;
  await addEvent(
    id,
    autor,
    "contato",
    `1ª ação: proposta enviada por ${d.canal} em ${d.data}.${d.obs ? ` ${d.obs}` : ""}`,
  );
  return getOportunidade(id);
}

export async function acaoAgendar(
  id: number,
  d: {
    n: 2 | 3;
    modo: "mover" | "reagendar";
    tipo: TipoAcaoId;
    data: string;
    hora: string;
    obj: string;
    resultadoAnterior: string;
    motivoReagendar: string;
  },
  autor: string,
) {
  const o = await getOportunidade(id);
  if (!o) throw new Error("Oportunidade não encontrada.");
  const err = validarAgendamento(o, d.modo, {
    resultadoAnterior: d.resultadoAnterior,
    tipo: d.tipo,
    data: d.data,
    motivoReagendar: d.motivoReagendar,
  });
  if (err) throw new Error(err);
  const db = await getDb();
  if (d.resultadoAnterior && o.acao && !o.acao.feita) {
    const prev = { ...o.acao, feita: true, resultado: d.resultadoAnterior };
    await db`
      update crm_oportunidade set acao_json = ${JSON.stringify(prev)}, updated_at = now()
      where id = ${id}
    `;
    await addEvent(id, autor, "feito", `Resultado da ${o.acao.n}ª ação: ${d.resultadoAnterior}`);
  }
  const acao: Acao = {
    n: d.n,
    tipo: d.tipo,
    data: d.data,
    feita: false,
  };
  if (d.hora) acao.hora = d.hora;
  if (d.obj) acao.obj = d.obj;
  const etapa: EtapaId = d.n === 2 ? "acao2" : "acao3";
  const hoje = hojeISO();
  await db`
    update crm_oportunidade set
      acao_json = ${JSON.stringify(acao)},
      etapa = ${etapa},
      etapa_desde = ${d.modo === "mover" ? hoje : o.desde},
      updated_at = now()
    where id = ${id}
  `;
  await addEvent(
    id,
    autor,
    "acao",
    d.modo === "reagendar"
      ? `${d.n}ª ação reagendada (${d.motivoReagendar}): ${d.tipo} em ${d.data}${d.hora ? " " + d.hora : ""}.`
      : `${d.n}ª ação agendada: ${d.tipo} em ${d.data}${d.hora ? " " + d.hora : ""}${d.obj ? ` · ${d.obj}` : ""}.`,
  );
  return getOportunidade(id);
}

export async function acaoResultado(
  id: number,
  d: { resultado: string; proximo: "acao3" | "final" | "aguardar" },
  autor: string,
) {
  const o = await getOportunidade(id);
  if (!o) throw new Error("Oportunidade não encontrada.");
  const err = validarResultado(d);
  if (err) throw new Error(err);
  if (!o.acao) throw new Error("Não há ação agendada.");
  const db = await getDb();
  const acao = { ...o.acao, feita: true, resultado: d.resultado };
  await db`
    update crm_oportunidade set acao_json = ${JSON.stringify(acao)}, updated_at = now()
    where id = ${id}
  `;
  await addEvent(id, autor, "feito", `Resultado da ${o.acao.n}ª ação: ${d.resultado}`);
  return getOportunidade(id);
}

export async function acaoAprovar(
  id: number,
  d: { aguardando: string; data: string; prev: string; obs: string },
  autor: string,
  soPrevisao = false,
) {
  const o = await getOportunidade(id);
  if (!o) throw new Error("Oportunidade não encontrada.");
  const err = validarAprovado({ prev: d.prev, obs: d.obs, soPrevisao });
  if (err) throw new Error(err);
  const db = await getDb();
  const aprov: Aprovacao = {
    data: d.data || hojeISO(),
    aguardando: d.aguardando,
    prev: d.prev,
  };
  if (d.obs) aprov.obs = d.obs;
  if (soPrevisao) {
    await db`
      update crm_oportunidade set
        aprov_json = ${JSON.stringify({ ...o.aprov, ...aprov })},
        updated_at = now()
      where id = ${id}
    `;
    await addEvent(id, autor, "nota", `Previsão alterada para ${d.prev}.${d.obs ? ` Motivo: ${d.obs}` : ""}`);
  } else {
    let acaoJson = o.acao ? JSON.stringify({ ...o.acao, feita: true, resultado: "Cliente aprovou a proposta." }) : null;
    const hoje = hojeISO();
    await db`
      update crm_oportunidade set
        aprov_json = ${JSON.stringify(aprov)},
        acao_json = ${acaoJson},
        etapa = 'aprovado',
        etapa_desde = ${hoje},
        updated_at = now()
      where id = ${id}
    `;
    await addEvent(
      id,
      autor,
      "etapa",
      `Cliente aprovou. Aguardando: ${d.aguardando}. Previsão ${d.prev}.`,
    );
  }
  return getOportunidade(id);
}

export async function acaoFinalizar(
  id: number,
  d: {
    st: "ganho" | "perdido";
    motivo: string;
    obs: string;
    concorrente: string;
    retomar: string;
    arquivo: CrmFile | null;
  },
  autor: string,
  opts?: { createOsPedido?: (o: Oportunidade, docEtiqueta: string) => Promise<string | null> },
) {
  const o = await getOportunidade(id);
  if (!o) throw new Error("Oportunidade não encontrada.");
  const err = validarFinal(o, {
    st: d.st,
    temArquivoNovo: Boolean(d.arquivo),
    motivo: d.motivo,
    obs: d.obs,
  });
  if (err) throw new Error(err);

  const docReq = documentoFechamento(o);
  if (d.st === "ganho" && d.arquivo) {
    await fileToDoc(id, d.arquivo, docReq.etiqueta, autor);
  }

  const hoje = hojeISO();
  const res: Resultado = {
    st: d.st,
    data: hoje,
    motivo: d.st === "perdido" ? d.motivo : "",
    obs: d.obs,
  };
  if (d.concorrente) res.concorrente = d.concorrente;
  if (d.retomar) res.retomar = d.retomar;

  const regras = await getRegrasComissao();
  const comRegras = d.st === "ganho" ? regras : null;
  let osInstalacao: string | null = null;

  if (d.st === "ganho" && opts?.createOsPedido) {
    osInstalacao = await opts.createOsPedido(o, docReq.etiqueta);
  }

  const db = await getDb();
  await db`
    update crm_oportunidade set
      res_json = ${JSON.stringify(res)},
      com_regras_json = ${comRegras ? JSON.stringify(comRegras) : null},
      os_instalacao = ${osInstalacao},
      etapa = 'final',
      etapa_desde = ${hoje},
      updated_at = now()
    where id = ${id}
  `;

  if (d.st === "ganho" && comRegras) {
    const calc = calcComissao({ ...o, res, comRegras }, comRegras);
    for (const p of calc.pessoas) {
      await db`
        insert into crm_comissao (
          oportunidade_id, nome, papel, base, venda, equipe, total,
          parcelas, inicio, impl_venda, impl_equipe, regras_json, fechado_em
        ) values (
          ${id}, ${p.nome}, ${p.papel}, ${calc.base}, ${p.venda}, ${p.equipe}, ${p.total},
          ${calc.parcelas}, ${calc.inicio}, ${p.implVenda}, ${p.implEquipe},
          ${JSON.stringify(comRegras)}, ${hoje}
        )
      `;
    }
  }

  await addEvent(
    id,
    autor,
    "final",
    d.st === "ganho"
      ? `Fechado.${osInstalacao ? ` OS ${osInstalacao} criada.` : ""}`
      : `Não fechado · ${d.motivo}${d.obs ? ` · ${d.obs}` : ""}`,
  );
  return getOportunidade(id);
}

export async function acaoVoltar(id: number, destino: EtapaId, motivo: string, autor: string) {
  const o = await getOportunidade(id);
  if (!o) throw new Error("Oportunidade não encontrada.");
  if (!motivo.trim()) throw new Error("Informe a justificativa.");
  aplicarVolta(o, destino);
  const db = await getDb();
  const hoje = hojeISO();
  await db`
    update crm_oportunidade set
      etapa = ${destino},
      etapa_desde = ${hoje},
      acao_json = ${o.acao ? JSON.stringify(o.acao) : null},
      aprov_json = ${o.aprov ? JSON.stringify(o.aprov) : null},
      res_json = null,
      updated_at = now()
    where id = ${id}
  `;
  await addEvent(id, autor, "etapa", `Voltou para ${destino}. Motivo: ${motivo}`);
  return getOportunidade(id);
}

export async function acaoReabrir(id: number, motivo: string, autor: string) {
  const o = await getOportunidade(id);
  if (!o) throw new Error("Oportunidade não encontrada.");
  if (o.etapa !== "final") throw new Error("Só finalizadas podem ser reabertas.");
  if (!motivo.trim()) throw new Error("Informe o motivo.");
  const db = await getDb();
  const hoje = hojeISO();
  await db`
    update crm_oportunidade set
      etapa = 'acao2',
      etapa_desde = ${hoje},
      res_json = null,
      aprov_json = null,
      acao_json = null,
      updated_at = now()
    where id = ${id}
  `;
  await addEvent(id, autor, "etapa", `Reaberta. Motivo: ${motivo}`);
  return getOportunidade(id);
}

export async function acaoNota(id: number, texto: string, autor: string) {
  if (!texto.trim()) throw new Error("Escreva a anotação.");
  await addEvent(id, autor, "nota", texto.trim());
  return getOportunidade(id);
}

export async function setEquipe(
  id: number,
  d: { vendedor?: string; motivo?: string; aux?: string[]; apoio?: string[] },
  autor: string,
) {
  const o = await getOportunidade(id);
  if (!o) throw new Error("Oportunidade não encontrada.");
  const db = await getDb();
  if (d.vendedor && d.vendedor !== o.vendedor) {
    if (!d.motivo?.trim()) throw new Error("Informe o motivo da troca do responsável.");
    await db`
      update crm_oportunidade set responsavel = ${d.vendedor}, updated_at = now() where id = ${id}
    `;
    await addEvent(
      id,
      autor,
      "nota",
      `Responsável alterado de ${o.vendedor} para ${d.vendedor}. Motivo: ${d.motivo}`,
    );
  }
  if (d.aux) {
    await db`delete from crm_equipe where oportunidade_id = ${id} and papel = 'auxiliar'`;
    for (const nome of d.aux) {
      await db`
        insert into crm_equipe (oportunidade_id, nome, papel) values (${id}, ${nome}, 'auxiliar')
      `;
    }
  }
  if (d.apoio) {
    await db`delete from crm_equipe where oportunidade_id = ${id} and papel = 'apoio'`;
    for (const nome of d.apoio) {
      await db`
        insert into crm_equipe (oportunidade_id, nome, papel) values (${id}, ${nome}, 'apoio')
      `;
    }
  }
  return getOportunidade(id);
}

export async function uploadDocumento(
  id: number,
  d: {
    etiqueta: string;
    arquivo: CrmFile;
    lido?: boolean;
    tv?: TipoVenda;
    orc?: string;
    modalidade?: string;
    valor?: number;
    total?: number;
    prazo?: number;
    validade?: string;
  },
  autor: string,
) {
  if (!d.arquivo) throw new Error("Selecione um arquivo.");
  await fileToDoc(id, d.arquivo, d.etiqueta, autor, Boolean(d.lido));
  if (d.tv || d.orc || d.valor != null || d.total != null) {
    const campos: Parameters<typeof patchOportunidade>[1] = {};
    if (d.tv) campos.tv = d.tv;
    if (d.orc != null) campos.orc = d.orc;
    if (d.modalidade != null) campos.modalidade = d.modalidade;
    if (d.valor != null) campos.valor = d.valor;
    if (d.total != null) campos.total = d.total;
    if (d.prazo != null) campos.prazo = d.prazo;
    if (d.validade != null) campos.validade = d.validade;
    await patchOportunidade(id, campos, autor);
  }
  return getOportunidade(id);
}

export async function deleteDocumento(id: number, docId: string, autor: string) {
  const db = await getDb();
  const rows = (await db`
    select id, nome, etiqueta from crm_documento
    where id = ${Number(docId)} and oportunidade_id = ${id}
    limit 1
  `) as Array<{ id: number; nome: string; etiqueta: string }>;
  const doc = rows[0];
  if (!doc) throw new Error("Documento não encontrado.");
  await db`delete from crm_documento where id = ${doc.id}`;
  await addEvent(id, autor, "nota", `Anexo removido: ${doc.etiqueta} · ${doc.nome}`);
  return getOportunidade(id);
}

export async function vincularClienteOmieOportunidade(
  id: number,
  input: {
    omieAppId: string;
    codigoClienteOmie: number;
    cliente?: string | null;
    contato?: string | null;
    tel?: string | null;
    cidade?: string | null;
  },
  autor: string,
) {
  const o = await getOportunidade(id);
  if (!o) throw new Error("Oportunidade não encontrada.");
  const codigo = Number(input.codigoClienteOmie);
  if (!Number.isFinite(codigo) || codigo <= 0) {
    throw new Error("Código do cliente Omie inválido.");
  }
  const appId = input.omieAppId.trim();
  if (!appId) throw new Error("App Omie não informado.");
  const db = await getDb();
  await db`
    update crm_oportunidade set
      omie_app_id = ${appId},
      codigo_cliente_omie = ${codigo},
      cliente = ${input.cliente?.trim() || o.cliente},
      contato = ${input.contato?.trim() || o.contato},
      tel = ${input.tel?.trim() || o.tel},
      cidade = ${input.cidade?.trim() || o.cidade},
      updated_at = now()
    where id = ${id}
  `;
  await addEvent(id, autor, "sis", `Cliente vinculado à Omie (#${codigo}).`);
  return getOportunidade(id);
}

export async function deleteOportunidade(id: number) {
  const o = await getOportunidade(id);
  if (!o) throw new Error("Oportunidade não encontrada.");
  const db = await getDb();
  await db`delete from crm_oportunidade where id = ${id}`;
  return { ok: true as const, id, cod: o.cod };
}

export async function getDocumentoData(docId: string) {
  const db = await getDb();
  const rows = (await db`
    select id, nome, mime, data_base64, tamanho
    from crm_documento where id = ${Number(docId)} limit 1
  `) as Array<{ id: number; nome: string; mime: string; data_base64: string; tamanho: number }>;
  return rows[0] ?? null;
}

export async function getRegrasComissao(): Promise<RegrasComissao> {
  const db = await getDb();
  const rows = (await db`
    select json_regras from crm_regras_comissao order by id desc limit 1
  `) as Array<{ json_regras: unknown }>;
  if (!rows[0]) return structuredClone(COMISSAO_PADRAO);
  return json(rows[0].json_regras, COMISSAO_PADRAO);
}

export async function saveRegrasComissao(r: RegrasComissao, autor: string, autorId: number | null) {
  const db = await getDb();
  await db`
    insert into crm_regras_comissao (vigente_desde, json_regras, autor_id, autor)
    values (${hojeISO()}, ${JSON.stringify(r)}, ${autorId}, ${autor})
  `;
}

export async function encerrarContrato(
  id: number,
  d: { fim: string; motivo: string } | null,
  autor: string,
) {
  const o = await getOportunidade(id);
  if (!o) throw new Error("Oportunidade não encontrada.");
  const db = await getDb();
  if (!d) {
    await db`
      update crm_oportunidade set contrato_json = null, updated_at = now() where id = ${id}
    `;
    await db`
      update crm_comissao set contrato_fim = null where oportunidade_id = ${id}
    `;
    await addEvent(id, autor, "nota", "Encerramento do contrato desfeito.");
  } else {
    if (!d.fim || !d.motivo.trim()) throw new Error("Informe data e motivo do encerramento.");
    await db`
      update crm_oportunidade set
        contrato_json = ${JSON.stringify(d)},
        updated_at = now()
      where id = ${id}
    `;
    await db`
      update crm_comissao set contrato_fim = ${d.fim} where oportunidade_id = ${id}
    `;
    await addEvent(id, autor, "nota", `Contrato encerrado em ${d.fim}. Motivo: ${d.motivo}`);
  }
  return getOportunidade(id);
}
