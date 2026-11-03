import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";

export type TerceiroActor = {
  id: number;
  name: string;
};

export type Terceiro = {
  id: number;
  nome: string;
  documento: string | null;
  contato: string | null;
  observacao: string;
  /** Código do cliente na Omie, se vinculado. */
  omieClientCode: number | null;
  omieAppId: string | null;
  /** Alteração de cobrança aguardando checagem do faturamento. */
  pendingReview: boolean;
  lastChangeAt: string | null;
  lastChangeBy: number | null;
  lastChangeByName: string | null;
  lastChangeSummary: string | null;
  reviewedAt: string | null;
  reviewedBy: number | null;
  reviewedByName: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TerceiroMonitoramento = {
  terceiroId: number;
  qtdContas: number;
  precoUnitario: number;
  observacao: string;
  subtotal: number;
};

export type TerceiroContaExcecao = {
  id: number;
  terceiroId: number;
  identificador: string;
  valor: number;
  observacao: string;
  active: boolean;
};

export type TerceiroServico = {
  id: number;
  terceiroId: number;
  /** Referência opcional ao item da Tabela de preços. */
  monthlyServiceId: number | null;
  nome: string;
  quantidade: number;
  valor: number;
  observacao: string;
  active: boolean;
  subtotal: number;
  pendingReview: boolean;
  lastChangeAt: string | null;
  lastChangeBy: number | null;
  lastChangeByName: string | null;
  lastChangeSummary: string | null;
  reviewedAt: string | null;
  reviewedBy: number | null;
  reviewedByName: string | null;
};

export type TerceiroContaProporcional = {
  id: number;
  terceiroId: number;
  identificador: string;
  /** Cobrança futura: preço comum ou particularidade. */
  valorBaseTipo: "padrao" | "particularidade";
  /** Valor mensal cheio usado na base do cálculo. */
  valorMensal: number;
  dataInicio: string;
  dataFim: string;
  dias: number;
  valorProporcional: number;
  observacao: string;
  status: "aberta" | "lancada";
  lancadaAt: string | null;
};

export type TerceiroTotais = {
  monitoramentoPadrao: number;
  contasExcecao: number;
  outrosServicos: number;
  contasProporcionais: number;
  totalMensal: number;
  qtdContasPadrao: number;
  qtdContasExcecao: number;
  qtdContasProporcionais: number;
  qtdContasTotal: number;
};

export type TerceiroListItem = Terceiro & {
  totais: TerceiroTotais;
};

export type TerceiroDetail = Terceiro & {
  monitoramento: TerceiroMonitoramento;
  contasExcecao: TerceiroContaExcecao[];
  contasProporcionais: TerceiroContaProporcional[];
  servicos: TerceiroServico[];
  totais: TerceiroTotais;
};

type TerceiroRow = {
  id: number;
  nome: string;
  documento: string | null;
  contato: string | null;
  observacao: string | null;
  omie_client_code?: number | string | null;
  omie_app_id?: string | null;
  pending_review?: boolean | null;
  last_change_at?: string | Date | null;
  last_change_by?: number | null;
  last_change_by_name?: string | null;
  last_change_summary?: string | null;
  reviewed_at?: string | Date | null;
  reviewed_by?: number | null;
  reviewed_by_name?: string | null;
  active: boolean;
  created_at: string | Date;
  updated_at: string | Date;
};

type MonitoramentoRow = {
  terceiro_id: number;
  qtd_contas: number | string;
  preco_unitario: number | string;
  observacao: string | null;
};

type ContaExcecaoRow = {
  id: number;
  terceiro_id: number;
  identificador: string;
  valor: number | string;
  observacao: string | null;
  active: boolean;
};

type ServicoRow = {
  id: number;
  terceiro_id: number;
  monthly_service_id?: number | null;
  nome: string;
  quantidade: number | string;
  valor: number | string;
  observacao: string | null;
  active: boolean;
  pending_review?: boolean | null;
  last_change_at?: string | Date | null;
  last_change_by?: number | null;
  last_change_by_name?: string | null;
  last_change_summary?: string | null;
  reviewed_at?: string | Date | null;
  reviewed_by?: number | null;
  reviewed_by_name?: string | null;
};

type ContaProporcionalRow = {
  id: number;
  terceiro_id: number;
  identificador: string;
  valor_base_tipo: string;
  valor_mensal: number | string;
  data_inicio: string | Date;
  data_fim: string | Date;
  dias: number | string;
  valor_proporcional: number | string;
  observacao: string | null;
  status: string;
  lancada_at: string | Date | null;
};

function toNumber(value: string | number | null | undefined) {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toIso(value: string | Date) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toIsoOrNull(value: string | Date | null | undefined) {
  if (value == null) return null;
  return toIso(value);
}

function toTerceiro(row: TerceiroRow): Terceiro {
  const codeRaw = row.omie_client_code;
  const codeNum = codeRaw == null || codeRaw === "" ? null : Number(codeRaw);
  return {
    id: row.id,
    nome: row.nome,
    documento: row.documento?.trim() ? row.documento.trim() : null,
    contato: row.contato?.trim() ? row.contato.trim() : null,
    observacao: row.observacao?.trim() ? String(row.observacao) : "",
    omieClientCode:
      codeNum != null && Number.isFinite(codeNum) && codeNum > 0 ? Math.floor(codeNum) : null,
    omieAppId: row.omie_app_id?.trim() ? row.omie_app_id.trim() : null,
    pendingReview: Boolean(row.pending_review),
    lastChangeAt: toIsoOrNull(row.last_change_at),
    lastChangeBy: row.last_change_by ?? null,
    lastChangeByName: row.last_change_by_name?.trim() ? row.last_change_by_name.trim() : null,
    lastChangeSummary: row.last_change_summary?.trim()
      ? row.last_change_summary.trim()
      : null,
    reviewedAt: toIsoOrNull(row.reviewed_at),
    reviewedBy: row.reviewed_by ?? null,
    reviewedByName: row.reviewed_by_name?.trim() ? row.reviewed_by_name.trim() : null,
    active: Boolean(row.active),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/** Sincroniza o alerta da empresa com serviços pendentes + alterações gerais. */
async function syncTerceiroPendingFromChildren(terceiroId: number) {
  const db = await getDb();
  const pendingSvcs = (await db`
    select nome, last_change_at, last_change_by, last_change_by_name, last_change_summary
    from terceiro_servicos
    where terceiro_id = ${terceiroId} and pending_review = true
    order by last_change_at desc nulls last, id desc
    limit 1
  `) as Array<{
    nome: string;
    last_change_at: string | Date | null;
    last_change_by: number | null;
    last_change_by_name: string | null;
    last_change_summary: string | null;
  }>;
  const company = (await db`
    select pending_review, last_change_summary
    from terceiros where id = ${terceiroId} limit 1
  `) as Array<{ pending_review: boolean; last_change_summary: string | null }>;
  const companyPending = Boolean(company[0]?.pending_review);
  const companySummary = company[0]?.last_change_summary?.trim() ?? "";
  const companyIsServicoAlert = companySummary.startsWith("Serviço:");

  const latestSvc = pendingSvcs[0];
  if (latestSvc) {
    const summary =
      `Serviço: ${latestSvc.nome}${
        latestSvc.last_change_summary ? ` — ${latestSvc.last_change_summary}` : ""
      }`.slice(0, 200);
    await db`
      update terceiros
      set
        pending_review = true,
        last_change_at = ${latestSvc.last_change_at ?? new Date()},
        last_change_by = ${latestSvc.last_change_by},
        last_change_by_name = ${latestSvc.last_change_by_name},
        last_change_summary = ${summary},
        updated_at = now()
      where id = ${terceiroId}
    `;
    return;
  }

  // Sem serviços pendentes: limpa só se o alerta atual era de serviço.
  if (companyPending && companyIsServicoAlert) {
    await db`
      update terceiros
      set pending_review = false, updated_at = now()
      where id = ${terceiroId}
    `;
  }
}

export async function markTerceiroChanged(
  terceiroId: number,
  actor: TerceiroActor,
  summary: string,
): Promise<TerceiroDetail> {
  const db = await getDb();
  const name = actor.name.trim().slice(0, 120) || `Usuário #${actor.id}`;
  const text = summary.trim().slice(0, 200) || "Alteração na cobrança";
  await db`
    update terceiros
    set
      pending_review = true,
      last_change_at = now(),
      last_change_by = ${actor.id},
      last_change_by_name = ${name},
      last_change_summary = ${text},
      updated_at = now()
    where id = ${terceiroId}
  `;
  const detail = await getTerceiroDetail(terceiroId);
  if (!detail) throw new Error("Terceiro não encontrado.");
  return detail;
}

export async function markTerceiroReviewed(
  terceiroId: number,
  actor: TerceiroActor,
): Promise<TerceiroDetail> {
  const db = await getDb();
  const name = actor.name.trim().slice(0, 120) || `Usuário #${actor.id}`;
  // Marca todos os serviços pendentes também (checagem geral).
  await db`
    update terceiro_servicos
    set
      pending_review = false,
      reviewed_at = now(),
      reviewed_by = ${actor.id},
      reviewed_by_name = ${name},
      updated_at = now()
    where terceiro_id = ${terceiroId} and pending_review = true
  `;
  const rows = (await db`
    update terceiros
    set
      pending_review = false,
      reviewed_at = now(),
      reviewed_by = ${actor.id},
      reviewed_by_name = ${name},
      updated_at = now()
    where id = ${terceiroId}
    returning id
  `) as Array<{ id: number }>;
  if (!rows[0]) throw new Error("Terceiro não encontrado.");
  const detail = await getTerceiroDetail(terceiroId);
  if (!detail) throw new Error("Terceiro não encontrado.");
  return detail;
}

export async function markServicoChanged(
  servicoId: number,
  actor: TerceiroActor,
  summary: string,
): Promise<TerceiroDetail> {
  const db = await getDb();
  const name = actor.name.trim().slice(0, 120) || `Usuário #${actor.id}`;
  const text = summary.trim().slice(0, 200) || "Alterado";
  const rows = (await db`
    update terceiro_servicos
    set
      pending_review = true,
      last_change_at = now(),
      last_change_by = ${actor.id},
      last_change_by_name = ${name},
      last_change_summary = ${text},
      updated_at = now()
    where id = ${servicoId}
    returning terceiro_id
  `) as Array<{ terceiro_id: number }>;
  const terceiroId = rows[0]?.terceiro_id;
  if (terceiroId == null) throw new Error("Serviço não encontrado.");
  await syncTerceiroPendingFromChildren(terceiroId);
  const detail = await getTerceiroDetail(terceiroId);
  if (!detail) throw new Error("Terceiro não encontrado.");
  return detail;
}

export async function markServicoReviewed(
  servicoId: number,
  actor: TerceiroActor,
): Promise<TerceiroDetail> {
  const db = await getDb();
  const name = actor.name.trim().slice(0, 120) || `Usuário #${actor.id}`;
  const rows = (await db`
    update terceiro_servicos
    set
      pending_review = false,
      reviewed_at = now(),
      reviewed_by = ${actor.id},
      reviewed_by_name = ${name},
      updated_at = now()
    where id = ${servicoId}
    returning terceiro_id
  `) as Array<{ terceiro_id: number }>;
  const terceiroId = rows[0]?.terceiro_id;
  if (terceiroId == null) throw new Error("Serviço não encontrado.");
  await syncTerceiroPendingFromChildren(terceiroId);
  const detail = await getTerceiroDetail(terceiroId);
  if (!detail) throw new Error("Terceiro não encontrado.");
  return detail;
}

function emptyMonitoramento(terceiroId: number): TerceiroMonitoramento {
  return {
    terceiroId,
    qtdContas: 0,
    precoUnitario: 0,
    observacao: "",
    subtotal: 0,
  };
}

function toMonitoramento(row: MonitoramentoRow | null | undefined, terceiroId: number): TerceiroMonitoramento {
  if (!row) return emptyMonitoramento(terceiroId);
  const qtdContas = Math.max(0, Math.floor(toNumber(row.qtd_contas)));
  const precoUnitario = Math.max(0, toNumber(row.preco_unitario));
  return {
    terceiroId: row.terceiro_id,
    /** Contas cobradas no preço comum (não inclui particularidades). */
    qtdContas,
    precoUnitario,
    observacao: row.observacao?.trim() ? String(row.observacao) : "",
    /** Subtotal só do bloco padrão; particularidades entram à parte em calcTotais. */
    subtotal: qtdContas * precoUnitario,
  };
}

function toContaExcecao(row: ContaExcecaoRow): TerceiroContaExcecao {
  return {
    id: row.id,
    terceiroId: row.terceiro_id,
    identificador: row.identificador,
    valor: Math.max(0, toNumber(row.valor)),
    observacao: row.observacao?.trim() ? String(row.observacao) : "",
    active: Boolean(row.active),
  };
}

function toServico(row: ServicoRow): TerceiroServico {
  const quantidade = Math.max(0, toNumber(row.quantidade));
  const valor = Math.max(0, toNumber(row.valor));
  const catalogId =
    row.monthly_service_id != null && Number(row.monthly_service_id) > 0
      ? Math.floor(Number(row.monthly_service_id))
      : null;
  return {
    id: row.id,
    terceiroId: row.terceiro_id,
    monthlyServiceId: catalogId,
    nome: row.nome,
    quantidade,
    valor,
    observacao: row.observacao?.trim() ? String(row.observacao) : "",
    active: Boolean(row.active),
    subtotal: quantidade * valor,
    pendingReview: Boolean(row.pending_review),
    lastChangeAt: toIsoOrNull(row.last_change_at),
    lastChangeBy: row.last_change_by ?? null,
    lastChangeByName: row.last_change_by_name?.trim()
      ? row.last_change_by_name.trim()
      : null,
    lastChangeSummary: row.last_change_summary?.trim()
      ? row.last_change_summary.trim()
      : null,
    reviewedAt: toIsoOrNull(row.reviewed_at),
    reviewedBy: row.reviewed_by ?? null,
    reviewedByName: row.reviewed_by_name?.trim() ? row.reviewed_by_name.trim() : null,
  };
}

function toDateIso(value: string | Date) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : String(value);
}

export function daysInclusive(dataInicio: string, dataFim: string) {
  const a = new Date(`${dataInicio}T12:00:00`);
  const b = new Date(`${dataFim}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    throw new Error("Informe o período (de / até) com datas válidas.");
  }
  if (b < a) throw new Error("A data final deve ser igual ou posterior à inicial.");
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

export function daysInMonthOf(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00`);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function calcValorProporcional(valorMensal: number, dataInicio: string, dataFim: string) {
  const dias = daysInclusive(dataInicio, dataFim);
  const diasMes = daysInMonthOf(dataInicio);
  const valor = Math.max(0, valorMensal);
  const proporcional = diasMes > 0 ? (valor / diasMes) * dias : 0;
  return {
    dias,
    diasMes,
    valorProporcional: Math.round(proporcional * 100) / 100,
  };
}

function toContaProporcional(row: ContaProporcionalRow): TerceiroContaProporcional {
  const tipo = row.valor_base_tipo === "particularidade" ? "particularidade" : "padrao";
  return {
    id: row.id,
    terceiroId: row.terceiro_id,
    identificador: row.identificador,
    valorBaseTipo: tipo,
    valorMensal: Math.max(0, toNumber(row.valor_mensal)),
    dataInicio: toDateIso(row.data_inicio),
    dataFim: toDateIso(row.data_fim),
    dias: Math.max(0, Math.floor(toNumber(row.dias))),
    valorProporcional: Math.max(0, toNumber(row.valor_proporcional)),
    observacao: row.observacao?.trim() ? String(row.observacao) : "",
    status: row.status === "lancada" ? "lancada" : "aberta",
    lancadaAt:
      row.lancada_at == null
        ? null
        : row.lancada_at instanceof Date
          ? row.lancada_at.toISOString()
          : String(row.lancada_at),
  };
}

export function calcTotais(
  monitoramento: TerceiroMonitoramento,
  contasExcecao: TerceiroContaExcecao[],
  servicos: TerceiroServico[],
  contasProporcionais: TerceiroContaProporcional[] = [],
): TerceiroTotais {
  const contasAtivas = contasExcecao.filter((c) => c.active);
  const servicosAtivos = servicos.filter((s) => s.active);
  const proporcAbertas = contasProporcionais.filter((c) => c.status === "aberta");
  // Particularidades NÃO entram no preço comum — só no total de contas e na própria cobrança.
  const qtdContasPadrao = Math.max(0, monitoramento.qtdContas);
  const qtdContasExcecao = contasAtivas.length;
  const qtdContasProporcionais = proporcAbertas.length;
  const monitoramentoPadrao = qtdContasPadrao * Math.max(0, monitoramento.precoUnitario);
  const contasExcecaoTotal = contasAtivas.reduce((sum, c) => sum + c.valor, 0);
  const outrosServicos = servicosAtivos.reduce((sum, s) => sum + s.subtotal, 0);
  const contasProporcionaisTotal = proporcAbertas.reduce((sum, c) => sum + c.valorProporcional, 0);
  return {
    monitoramentoPadrao,
    contasExcecao: contasExcecaoTotal,
    outrosServicos,
    contasProporcionais: contasProporcionaisTotal,
    totalMensal:
      monitoramentoPadrao + contasExcecaoTotal + outrosServicos + contasProporcionaisTotal,
    qtdContasPadrao,
    qtdContasExcecao,
    qtdContasProporcionais,
    qtdContasTotal: qtdContasPadrao + qtdContasExcecao + qtdContasProporcionais,
  };
}

async function ensureMonitoramento(terceiroId: number) {
  const db = await getDb();
  await db`
    insert into terceiro_monitoramento (terceiro_id, qtd_contas, preco_unitario, observacao, updated_at)
    values (${terceiroId}, 0, 0, '', now())
    on conflict (terceiro_id) do nothing
  `;
}

export async function listTerceiros(activeOnly = true): Promise<TerceiroListItem[]> {
  const db = await getDb();
  const rows = activeOnly
    ? ((await db`
        select * from terceiros where active = true order by nome asc
      `) as TerceiroRow[])
    : ((await db`
        select * from terceiros order by active desc, nome asc
      `) as TerceiroRow[]);

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [monRows, exRows, svcRows, propRows] = await Promise.all([
    db`
      select * from terceiro_monitoramento where terceiro_id in ${db(ids)}
    ` as Promise<MonitoramentoRow[]>,
    db`
      select * from terceiro_contas_excecao
      where terceiro_id in ${db(ids)} and active = true
      order by identificador asc
    ` as Promise<ContaExcecaoRow[]>,
    db`
      select * from terceiro_servicos
      where terceiro_id in ${db(ids)} and active = true
      order by nome asc
    ` as Promise<ServicoRow[]>,
    db`
      select * from terceiro_contas_proporcionais
      where terceiro_id in ${db(ids)} and status = 'aberta'
      order by data_inicio asc
    ` as Promise<ContaProporcionalRow[]>,
  ]);

  const monById = new Map(monRows.map((r) => [r.terceiro_id, r]));
  const exById = new Map<number, ContaExcecaoRow[]>();
  for (const row of exRows) {
    const list = exById.get(row.terceiro_id) ?? [];
    list.push(row);
    exById.set(row.terceiro_id, list);
  }
  const svcById = new Map<number, ServicoRow[]>();
  for (const row of svcRows) {
    const list = svcById.get(row.terceiro_id) ?? [];
    list.push(row);
    svcById.set(row.terceiro_id, list);
  }
  const propById = new Map<number, ContaProporcionalRow[]>();
  for (const row of propRows) {
    const list = propById.get(row.terceiro_id) ?? [];
    list.push(row);
    propById.set(row.terceiro_id, list);
  }

  return rows.map((row) => {
    const terceiro = toTerceiro(row);
    const monitoramento = toMonitoramento(monById.get(row.id), row.id);
    const contas = (exById.get(row.id) ?? []).map(toContaExcecao);
    const servicos = (svcById.get(row.id) ?? []).map(toServico);
    const proporc = (propById.get(row.id) ?? []).map(toContaProporcional);
    return {
      ...terceiro,
      totais: calcTotais(monitoramento, contas, servicos, proporc),
    };
  });
}

export async function getTerceiroDetail(id: number): Promise<TerceiroDetail | null> {
  const db = await getDb();
  const rows = (await db`
    select * from terceiros where id = ${id} limit 1
  `) as TerceiroRow[];
  const row = rows[0];
  if (!row) return null;

  await ensureMonitoramento(id);

  const [monRows, exRows, svcRows, propRows] = await Promise.all([
    db`
      select * from terceiro_monitoramento where terceiro_id = ${id} limit 1
    ` as Promise<MonitoramentoRow[]>,
    db`
      select * from terceiro_contas_excecao
      where terceiro_id = ${id}
      order by active desc, identificador asc
    ` as Promise<ContaExcecaoRow[]>,
    db`
      select * from terceiro_servicos
      where terceiro_id = ${id}
      order by active desc, nome asc
    ` as Promise<ServicoRow[]>,
    db`
      select * from terceiro_contas_proporcionais
      where terceiro_id = ${id}
      order by
        case when status = 'aberta' then 0 else 1 end,
        data_inicio desc
    ` as Promise<ContaProporcionalRow[]>,
  ]);

  const monitoramento = toMonitoramento(monRows[0], id);
  const contasExcecao = exRows.map(toContaExcecao);
  const servicos = svcRows.map(toServico);
  const contasProporcionais = propRows.map(toContaProporcional);
  const terceiro = toTerceiro(row);

  return {
    ...terceiro,
    monitoramento,
    contasExcecao,
    contasProporcionais,
    servicos,
    totais: calcTotais(monitoramento, contasExcecao, servicos, contasProporcionais),
  };
}

export async function createTerceiro(input: {
  nome: string;
  documento?: string | null;
  contato?: string | null;
  observacao?: string;
  omieClientCode?: number | null;
  omieAppId?: string | null;
  qtdContas?: number;
  precoUnitario?: number;
  monitoramentoObs?: string;
}) {
  const db = await getDb();
  const nome = input.nome.trim();
  if (!nome) throw new Error("Informe o nome da empresa terceira.");
  const omieCode =
    input.omieClientCode != null &&
    Number.isFinite(input.omieClientCode) &&
    input.omieClientCode > 0
      ? Math.floor(input.omieClientCode)
      : null;
  const omieAppId = omieCode != null && input.omieAppId?.trim() ? input.omieAppId.trim() : null;

  const rows = (await db`
    insert into terceiros (
      nome, documento, contato, observacao, omie_client_code, omie_app_id,
      active, created_at, updated_at
    )
    values (
      ${nome.slice(0, 200)},
      ${input.documento?.trim() ? input.documento.trim().slice(0, 32) : null},
      ${input.contato?.trim() ? input.contato.trim().slice(0, 200) : null},
      ${(input.observacao ?? "").trim().slice(0, 4000)},
      ${omieCode}, ${omieAppId},
      true, now(), now()
    )
    returning *
  `) as TerceiroRow[];
  const row = rows[0];
  if (!row) throw new Error("Não foi possível cadastrar o terceiro.");

  const qtd = Math.max(0, Math.floor(input.qtdContas ?? 0));
  const preco = Math.max(0, input.precoUnitario ?? 0);
  await db`
    insert into terceiro_monitoramento (terceiro_id, qtd_contas, preco_unitario, observacao, updated_at)
    values (
      ${row.id}, ${qtd}, ${preco},
      ${(input.monitoramentoObs ?? "").trim().slice(0, 2000)}, now()
    )
  `;

  const detail = await getTerceiroDetail(row.id);
  if (!detail) throw new Error("Terceiro criado, mas falha ao carregar.");
  return detail;
}

export async function updateTerceiro(input: {
  id: number;
  nome: string;
  documento?: string | null;
  contato?: string | null;
  observacao?: string;
  omieClientCode?: number | null;
  omieAppId?: string | null;
  active?: boolean;
}) {
  const db = await getDb();
  const nome = input.nome.trim();
  if (!nome) throw new Error("Informe o nome da empresa terceira.");
  const omieCode =
    input.omieClientCode != null &&
    Number.isFinite(input.omieClientCode) &&
    input.omieClientCode > 0
      ? Math.floor(input.omieClientCode)
      : null;
  const omieAppId = omieCode != null && input.omieAppId?.trim() ? input.omieAppId.trim() : null;

  const rows = (await db`
    update terceiros
    set
      nome = ${nome.slice(0, 200)},
      documento = ${input.documento?.trim() ? input.documento.trim().slice(0, 32) : null},
      contato = ${input.contato?.trim() ? input.contato.trim().slice(0, 200) : null},
      observacao = ${(input.observacao ?? "").trim().slice(0, 4000)},
      omie_client_code = ${omieCode},
      omie_app_id = ${omieAppId},
      active = ${input.active !== false},
      updated_at = now()
    where id = ${input.id}
    returning *
  `) as TerceiroRow[];
  if (!rows[0]) throw new Error("Terceiro não encontrado.");
  const detail = await getTerceiroDetail(input.id);
  if (!detail) throw new Error("Terceiro não encontrado.");
  return detail;
}

export async function updateMonitoramento(input: {
  terceiroId: number;
  qtdContas: number;
  precoUnitario: number;
  observacao?: string;
}) {
  const db = await getDb();
  await ensureMonitoramento(input.terceiroId);
  const qtd = Math.max(0, Math.floor(input.qtdContas));
  const preco = Math.max(0, input.precoUnitario);
  await db`
    update terceiro_monitoramento
    set
      qtd_contas = ${qtd},
      preco_unitario = ${preco},
      observacao = ${(input.observacao ?? "").trim().slice(0, 2000)},
      updated_at = now()
    where terceiro_id = ${input.terceiroId}
  `;
  const detail = await getTerceiroDetail(input.terceiroId);
  if (!detail) throw new Error("Terceiro não encontrado.");
  return detail;
}

export async function createContaExcecao(input: {
  terceiroId: number;
  identificador: string;
  valor: number;
  observacao?: string;
}) {
  const db = await getDb();
  const identificador = input.identificador.trim();
  if (!identificador) throw new Error("Informe o identificador da conta.");
  const valor = Math.max(0, input.valor);
  const rows = (await db`
    insert into terceiro_contas_excecao (
      terceiro_id, identificador, valor, observacao, active, created_at, updated_at
    ) values (
      ${input.terceiroId}, ${identificador.slice(0, 200)}, ${valor},
      ${(input.observacao ?? "").trim().slice(0, 2000)}, true, now(), now()
    )
    returning *
  `) as ContaExcecaoRow[];
  if (!rows[0]) throw new Error("Não foi possível cadastrar a conta.");
  const detail = await getTerceiroDetail(input.terceiroId);
  if (!detail) throw new Error("Terceiro não encontrado.");
  return { conta: toContaExcecao(rows[0]), detail };
}

export async function updateContaExcecao(input: {
  id: number;
  identificador: string;
  valor: number;
  observacao?: string;
  active?: boolean;
}) {
  const db = await getDb();
  const identificador = input.identificador.trim();
  if (!identificador) throw new Error("Informe o identificador da conta.");
  const rows = (await db`
    update terceiro_contas_excecao
    set
      identificador = ${identificador.slice(0, 200)},
      valor = ${Math.max(0, input.valor)},
      observacao = ${(input.observacao ?? "").trim().slice(0, 2000)},
      active = ${input.active !== false},
      updated_at = now()
    where id = ${input.id}
    returning *
  `) as ContaExcecaoRow[];
  const row = rows[0];
  if (!row) throw new Error("Conta não encontrada.");
  const detail = await getTerceiroDetail(row.terceiro_id);
  if (!detail) throw new Error("Terceiro não encontrado.");
  return { conta: toContaExcecao(row), detail };
}

export async function deleteContaExcecao(id: number) {
  const db = await getDb();
  const rows = (await db`
    delete from terceiro_contas_excecao where id = ${id} returning terceiro_id
  `) as Array<{ terceiro_id: number }>;
  const terceiroId = rows[0]?.terceiro_id;
  if (terceiroId == null) throw new Error("Conta não encontrada.");
  const detail = await getTerceiroDetail(terceiroId);
  if (!detail) throw new Error("Terceiro não encontrado.");
  return detail;
}

export async function createServico(input: {
  terceiroId: number;
  nome: string;
  quantidade?: number;
  valor: number;
  observacao?: string;
  monthlyServiceId?: number | null;
}) {
  const db = await getDb();
  const nome = input.nome.trim();
  if (!nome) throw new Error("Informe o nome do serviço.");
  const quantidade =
    input.quantidade != null && Number.isFinite(input.quantidade) && input.quantidade > 0
      ? input.quantidade
      : 1;
  const valor = Math.max(0, input.valor);
  const monthlyServiceId =
    input.monthlyServiceId != null &&
    Number.isFinite(input.monthlyServiceId) &&
    input.monthlyServiceId > 0
      ? Math.floor(input.monthlyServiceId)
      : null;
  const rows = (await db`
    insert into terceiro_servicos (
      terceiro_id, monthly_service_id, nome, quantidade, valor, observacao,
      active, created_at, updated_at
    ) values (
      ${input.terceiroId}, ${monthlyServiceId}, ${nome.slice(0, 200)}, ${quantidade}, ${valor},
      ${(input.observacao ?? "").trim().slice(0, 2000)}, true, now(), now()
    )
    returning *
  `) as ServicoRow[];
  if (!rows[0]) throw new Error("Não foi possível cadastrar o serviço.");
  const detail = await getTerceiroDetail(input.terceiroId);
  if (!detail) throw new Error("Terceiro não encontrado.");
  return { servico: toServico(rows[0]), detail };
}

export async function updateServico(input: {
  id: number;
  nome: string;
  quantidade?: number;
  valor: number;
  observacao?: string;
  active?: boolean;
}) {
  const db = await getDb();
  const nome = input.nome.trim();
  if (!nome) throw new Error("Informe o nome do serviço.");
  const quantidade =
    input.quantidade != null && Number.isFinite(input.quantidade) && input.quantidade > 0
      ? input.quantidade
      : 1;
  const rows = (await db`
    update terceiro_servicos
    set
      nome = ${nome.slice(0, 200)},
      quantidade = ${quantidade},
      valor = ${Math.max(0, input.valor)},
      observacao = ${(input.observacao ?? "").trim().slice(0, 2000)},
      active = ${input.active !== false},
      updated_at = now()
    where id = ${input.id}
    returning *
  `) as ServicoRow[];
  const row = rows[0];
  if (!row) throw new Error("Serviço não encontrado.");
  const detail = await getTerceiroDetail(row.terceiro_id);
  if (!detail) throw new Error("Terceiro não encontrado.");
  return { servico: toServico(row), detail };
}

export async function deleteServico(id: number) {
  const db = await getDb();
  const rows = (await db`
    delete from terceiro_servicos where id = ${id} returning terceiro_id, nome
  `) as Array<{ terceiro_id: number; nome: string }>;
  const row = rows[0];
  if (!row) throw new Error("Serviço não encontrado.");
  const detail = await getTerceiroDetail(row.terceiro_id);
  if (!detail) throw new Error("Terceiro não encontrado.");
  return { detail, nome: row.nome, terceiroId: row.terceiro_id };
}

export async function deleteTerceiro(id: number) {
  const db = await getDb();
  const rows = (await db`
    delete from terceiros where id = ${id} returning id
  `) as Array<{ id: number }>;
  if (!rows[0]) throw new Error("Terceiro não encontrado.");
}

export async function createContaProporcional(input: {
  terceiroId: number;
  identificador: string;
  valorBaseTipo: "padrao" | "particularidade";
  valorMensal?: number;
  dataInicio: string;
  dataFim: string;
  observacao?: string;
}) {
  const db = await getDb();
  const identificador = input.identificador.trim();
  if (!identificador) throw new Error("Informe o identificador da conta.");
  const dataInicio = input.dataInicio.slice(0, 10);
  const dataFim = input.dataFim.slice(0, 10);

  let valorMensal = Math.max(0, input.valorMensal ?? 0);
  if (input.valorBaseTipo === "padrao") {
    await ensureMonitoramento(input.terceiroId);
    const monRows = (await db`
      select preco_unitario from terceiro_monitoramento where terceiro_id = ${input.terceiroId} limit 1
    `) as Array<{ preco_unitario: number | string }>;
    valorMensal = Math.max(0, toNumber(monRows[0]?.preco_unitario));
    if (!(valorMensal > 0)) {
      throw new Error("Defina o preço unitário padrão do monitoramento antes de lançar proporcional.");
    }
  } else if (!(valorMensal > 0)) {
    throw new Error("Informe o valor mensal da particularidade.");
  }

  const { dias, valorProporcional } = calcValorProporcional(valorMensal, dataInicio, dataFim);
  const rows = (await db`
    insert into terceiro_contas_proporcionais (
      terceiro_id, identificador, valor_base_tipo, valor_mensal,
      data_inicio, data_fim, dias, valor_proporcional, observacao, status,
      created_at, updated_at
    ) values (
      ${input.terceiroId}, ${identificador.slice(0, 200)}, ${input.valorBaseTipo}, ${valorMensal},
      ${dataInicio}, ${dataFim}, ${dias}, ${valorProporcional},
      ${(input.observacao ?? "").trim().slice(0, 2000)}, 'aberta', now(), now()
    )
    returning *
  `) as ContaProporcionalRow[];
  if (!rows[0]) throw new Error("Não foi possível cadastrar a conta proporcional.");
  const detail = await getTerceiroDetail(input.terceiroId);
  if (!detail) throw new Error("Terceiro não encontrado.");
  return { conta: toContaProporcional(rows[0]), detail };
}

export async function updateContaProporcional(input: {
  id: number;
  identificador: string;
  valorBaseTipo: "padrao" | "particularidade";
  valorMensal?: number;
  dataInicio: string;
  dataFim: string;
  observacao?: string;
}) {
  const db = await getDb();
  const existingRows = (await db`
    select * from terceiro_contas_proporcionais where id = ${input.id} limit 1
  `) as ContaProporcionalRow[];
  const existing = existingRows[0];
  if (!existing) throw new Error("Conta proporcional não encontrada.");
  if (existing.status === "lancada") {
    throw new Error("Conta já lançada — não pode editar. Apague e recadastre se necessário.");
  }

  const identificador = input.identificador.trim();
  if (!identificador) throw new Error("Informe o identificador da conta.");
  const dataInicio = input.dataInicio.slice(0, 10);
  const dataFim = input.dataFim.slice(0, 10);

  let valorMensal = Math.max(0, input.valorMensal ?? 0);
  if (input.valorBaseTipo === "padrao") {
    const monRows = (await db`
      select preco_unitario from terceiro_monitoramento
      where terceiro_id = ${existing.terceiro_id} limit 1
    `) as Array<{ preco_unitario: number | string }>;
    valorMensal = Math.max(0, toNumber(monRows[0]?.preco_unitario));
  } else if (!(valorMensal > 0)) {
    throw new Error("Informe o valor mensal da particularidade.");
  }

  const { dias, valorProporcional } = calcValorProporcional(valorMensal, dataInicio, dataFim);
  const rows = (await db`
    update terceiro_contas_proporcionais
    set
      identificador = ${identificador.slice(0, 200)},
      valor_base_tipo = ${input.valorBaseTipo},
      valor_mensal = ${valorMensal},
      data_inicio = ${dataInicio},
      data_fim = ${dataFim},
      dias = ${dias},
      valor_proporcional = ${valorProporcional},
      observacao = ${(input.observacao ?? "").trim().slice(0, 2000)},
      updated_at = now()
    where id = ${input.id}
    returning *
  `) as ContaProporcionalRow[];
  const row = rows[0];
  if (!row) throw new Error("Conta proporcional não encontrada.");
  const detail = await getTerceiroDetail(row.terceiro_id);
  if (!detail) throw new Error("Terceiro não encontrado.");
  return { conta: toContaProporcional(row), detail };
}

export async function deleteContaProporcional(id: number) {
  const db = await getDb();
  const rows = (await db`
    delete from terceiro_contas_proporcionais where id = ${id} returning terceiro_id
  `) as Array<{ terceiro_id: number }>;
  const terceiroId = rows[0]?.terceiro_id;
  if (terceiroId == null) throw new Error("Conta proporcional não encontrada.");
  const detail = await getTerceiroDetail(terceiroId);
  if (!detail) throw new Error("Terceiro não encontrado.");
  return detail;
}

/**
 * Lança a proporcional na cobrança definitiva da próxima competência:
 * - base padrão → +1 conta no preço comum
 * - particularidade → cria conta com valor mensal cheio
 */
export async function lancarContaProporcional(id: number) {
  const db = await getDb();
  const existingRows = (await db`
    select * from terceiro_contas_proporcionais where id = ${id} limit 1
  `) as ContaProporcionalRow[];
  const existing = existingRows[0];
  if (!existing) throw new Error("Conta proporcional não encontrada.");
  if (existing.status === "lancada") {
    throw new Error("Esta conta proporcional já foi lançada.");
  }

  const conta = toContaProporcional(existing);
  await ensureMonitoramento(conta.terceiroId);

  if (conta.valorBaseTipo === "padrao") {
    await db`
      update terceiro_monitoramento
      set qtd_contas = qtd_contas + 1, updated_at = now()
      where terceiro_id = ${conta.terceiroId}
    `;
  } else {
    await db`
      insert into terceiro_contas_excecao (
        terceiro_id, identificador, valor, observacao, active, created_at, updated_at
      ) values (
        ${conta.terceiroId},
        ${conta.identificador.slice(0, 200)},
        ${conta.valorMensal},
        ${`Origem proporcional ${conta.dataInicio} a ${conta.dataFim}${conta.observacao ? ` — ${conta.observacao}` : ""}`.slice(0, 2000)},
        true, now(), now()
      )
    `;
  }

  await db`
    update terceiro_contas_proporcionais
    set status = 'lancada', lancada_at = now(), updated_at = now()
    where id = ${id}
  `;

  const detail = await getTerceiroDetail(conta.terceiroId);
  if (!detail) throw new Error("Terceiro não encontrado.");
  return detail;
}
