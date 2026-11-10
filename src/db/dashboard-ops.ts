import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";
import { OS_STAGES } from "@/lib/assistencia-domain";
import { currentMonthKey, monthRange } from "@/lib/facilities-domain";
import { TICKET_ATIVOS, TICKET_SETORES } from "@/lib/tickets-domain";

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown) {
  return v == null ? "" : String(v);
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type OpsAttentionItem = {
  id: string;
  kind: "ticket" | "os" | "compra" | "estoque";
  title: string;
  detail: string;
  href: string;
  severity: "alta" | "media";
};

export type OpsTeamToday = {
  id: number;
  name: string;
  status: "em_campo" | "a_caminho" | "livre";
  statusLabel: string;
  osNum: string | null;
  clientName: string | null;
  detail: string | null;
};

export async function getOpsDashboardData() {
  const db = await getDb();
  const today = todayIso();
  const monthKey = currentMonthKey();
  const { start, end } = monthRange(monthKey);
  const ativos = [...TICKET_ATIVOS];

  const [
    ticketRows,
    osStageRows,
    osFieldRows,
    comprasAtrasoRows,
    quoteMonthRows,
    quoteStatusRows,
    pedidosAprovRows,
    contasRows,
    stockDivRows,
    osSepRows,
    avgOsRows,
    avgManutRows,
    ticketsSetorRows,
    attentionTickets,
    attentionPaused,
    attentionCompras,
    teamsRows,
    teamsOsRows,
    osFinalizadasRows,
  ] = await Promise.all([
    db`
      select count(*)::int as total
      from tickets
      where status = any(${ativos})
    ` as Promise<Array<{ total: number }>>,
    db`
      select stage, count(*)::int as total
      from assist_os
      where stage between 0 and 6
      group by stage
      order by stage asc
    ` as Promise<Array<{ stage: number; total: number }>>,
    db`
      select count(distinct team_id)::int as total
      from assist_os
      where stage = 5
        and team_id is not null
        and ci_at is not null
        and co_at is null
    ` as Promise<Array<{ total: number }>>,
    db`
      select
        (
          select count(*)::int
          from compras_solicitacoes
          where status in ('aberta', 'em_cotacao')
            and previsao is not null
            and previsao < ${today}::date
        )
        +
        (
          select count(*)::int
          from assist_os_items i
          join assist_os o on o.id = i.os_id
          where i.status = 'comprar'
            and o.stage in (1, 2)
            and i.previsao is not null
            and i.previsao < ${today}::date
        ) as total
    ` as Promise<Array<{ total: number }>>,
    db`
      select count(*)::int as total
      from quotes
      where created_at::date >= ${start}::date
        and created_at::date <= ${end}::date
    ` as Promise<Array<{ total: number }>>,
    db`
      select status, count(*)::int as total
      from quotes
      where created_at::date >= ${start}::date
        and created_at::date <= ${end}::date
      group by status
    ` as Promise<Array<{ status: string; total: number }>>,
    db`
      select count(*)::int as total
      from assist_os
      where tipo = 'pedido'
        and aprovado_em is not null
        and aprovado_em::date >= ${start}::date
        and aprovado_em::date <= ${end}::date
    ` as Promise<Array<{ total: number }>>,
    db`
      select
        coalesce((
          select sum(m.qtd_contas)::int
          from terceiro_monitoramento m
          join terceiros t on t.id = m.terceiro_id
          where t.active = true
        ), 0)
        + coalesce((
          select count(*)::int
          from terceiro_contas_excecao c
          join terceiros t on t.id = c.terceiro_id
          where t.active = true and c.active = true
        ), 0)
        + coalesce((
          select count(*)::int
          from terceiro_contas_proporcionais p
          join terceiros t on t.id = p.terceiro_id
          where t.active = true and p.status = 'aberta'
        ), 0) as total
    ` as Promise<Array<{ total: number }>>,
    db`
      select count(*)::int as total
      from omie_products p
      left join product_stock s on s.product_id = p.id
      where p.inactive = false
        and coalesce(s.quantidade_fisica, 0) <> coalesce(p.estoque_fiscal, 0)
        and (
          coalesce(p.estoque_fiscal, 0) > 0
          or coalesce(s.quantidade_fisica, 0) > 0
        )
    ` as Promise<Array<{ total: number }>>,
    db`
      select count(*)::int as total
      from assist_os
      where stage = 1
    ` as Promise<Array<{ total: number }>>,
    db`
      select coalesce(avg(extract(epoch from (fin_date::timestamp - created_at)) / 86400.0), 0)::float as dias
      from assist_os
      where fin_date is not null
        and fin_date::date >= ${start}::date
        and fin_date::date <= ${end}::date
        and stage >= 6
    ` as Promise<Array<{ dias: number }>>,
    db`
      select coalesce(avg(extract(epoch from (fin_date::timestamp - created_at)) / 86400.0), 0)::float as dias
      from assist_os
      where tipo = 'manut'
        and fin_date is not null
        and fin_date::date >= ${start}::date
        and fin_date::date <= ${end}::date
        and stage >= 6
    ` as Promise<Array<{ dias: number }>>,
    db`
      select ts.setor, count(distinct t.id)::int as total
      from tickets t
      join ticket_sectors ts on ts.ticket_id = t.id
      where t.status = any(${ativos})
      group by ts.setor
      order by total desc
    ` as Promise<Array<{ setor: string; total: number }>>,
    db`
      select id, num, client_name, descricao, prioridade, status
      from tickets
      where status = any(${ativos})
        and prioridade in ('Urgente', 'Alta')
      order by
        case prioridade when 'Urgente' then 0 else 1 end,
        updated_at desc
      limit 6
    ` as Promise<
      Array<{
        id: number;
        num: string;
        client_name: string;
        descricao: string;
        prioridade: string;
        status: string;
      }>
    >,
    db`
      select id, num, client_name, pause_motivo
      from assist_os
      where paused_at is not null
        and stage between 0 and 6
      order by paused_at desc
      limit 4
    ` as Promise<Array<{ id: number; num: string; client_name: string; pause_motivo: string | null }>>,
    db`
      select id, descricao, previsao::text as previsao, origem
      from compras_solicitacoes
      where status in ('aberta', 'em_cotacao')
        and previsao is not null
        and previsao < ${today}::date
      order by previsao asc
      limit 4
    ` as Promise<
      Array<{ id: number; descricao: string; previsao: string; origem: string }>
    >,
    db`
      select id, name
      from assist_teams
      where active = true
      order by name asc
    ` as Promise<Array<{ id: number; name: string }>>,
    db`
      select
        o.team_id,
        o.num,
        o.client_name,
        o.stage,
        o.ci_at,
        o.co_at,
        o.ag_date::text as ag_date,
        o.paused_at
      from assist_os o
      where o.team_id is not null
        and o.stage between 4 and 5
        and (
          (o.stage = 5 and o.co_at is null)
          or (o.ag_date = ${today}::date)
        )
      order by
        case when o.stage = 5 and o.ci_at is not null and o.co_at is null then 0 else 1 end,
        o.updated_at desc
    ` as Promise<
      Array<{
        team_id: number;
        num: string;
        client_name: string;
        stage: number;
        ci_at: Date | string | null;
        co_at: Date | string | null;
        ag_date: string | null;
        paused_at: Date | string | null;
      }>
    >,
    db`
      select count(*)::int as total
      from assist_os
      where stage >= 6
        and coalesce(fin_date, updated_at)::date >= ${start}::date
        and coalesce(fin_date, updated_at)::date <= ${end}::date
    ` as Promise<Array<{ total: number }>>,
  ]);

  const osByStage = OS_STAGES.filter((s) => s.idx <= 6).map((s) => ({
    stage: s.idx,
    name: s.name,
    shortName:
      s.idx === 0
        ? "Aberta"
        : s.idx === 1
          ? "Separação"
          : s.idx === 2
            ? "Compras"
            : s.idx === 3
              ? "Aguardo"
              : s.idx === 4
                ? "Agenda"
                : s.idx === 5
                  ? "Campo"
                  : "Feita",
    total: num(osStageRows.find((r) => Number(r.stage) === s.idx)?.total),
  }));

  const osEmAndamento = osByStage.reduce((sum, row) => sum + row.total, 0);

  const quoteMap = Object.fromEntries(quoteStatusRows.map((r) => [str(r.status), num(r.total)]));

  const attention: OpsAttentionItem[] = [];
  for (const row of attentionTickets) {
    const desc = str(row.descricao).trim().slice(0, 80);
    attention.push({
      id: `ticket-${row.id}`,
      kind: "ticket",
      title: `${row.num} · ${row.client_name}`,
      detail: `${row.prioridade}${desc ? ` · ${desc}` : ""}`,
      href: "/tickets",
      severity: row.prioridade === "Urgente" ? "alta" : "media",
    });
  }
  for (const row of attentionPaused) {
    attention.push({
      id: `os-pause-${row.id}`,
      kind: "os",
      title: `OS ${row.num} pausada`,
      detail: `${row.client_name}${row.pause_motivo ? ` · ${row.pause_motivo}` : ""}`,
      href: "/assistencia",
      severity: "media",
    });
  }
  for (const row of attentionCompras) {
    attention.push({
      id: `compra-${row.id}`,
      kind: "compra",
      title: `Compra atrasada · ${row.descricao}`,
      detail: `Previsão ${String(row.previsao).slice(0, 10)} · ${row.origem}`,
      href: "/compras",
      severity: "alta",
    });
  }
  if (num(stockDivRows[0]?.total) > 0) {
    attention.push({
      id: "estoque-div",
      kind: "estoque",
      title: `${num(stockDivRows[0]?.total)} produto(s) com estoque divergente`,
      detail: "Físico diferente do fiscal",
      href: "/estoque",
      severity: "media",
    });
  }

  const osByTeam = new Map<number, (typeof teamsOsRows)[number]>();
  for (const row of teamsOsRows) {
    const teamId = num(row.team_id);
    if (!osByTeam.has(teamId)) osByTeam.set(teamId, row);
  }

  const equipesHoje: OpsTeamToday[] = teamsRows.map((team) => {
    const os = osByTeam.get(num(team.id));
    if (os && Number(os.stage) === 5 && os.ci_at && !os.co_at) {
      return {
        id: num(team.id),
        name: str(team.name),
        status: "em_campo" as const,
        statusLabel: os.paused_at ? "Pausada" : "No local",
        osNum: str(os.num),
        clientName: str(os.client_name),
        detail: os.paused_at ? "OS pausada em campo" : "Check-in ativo",
      };
    }
    if (os && (Number(os.stage) === 4 || Number(os.stage) === 5)) {
      return {
        id: num(team.id),
        name: str(team.name),
        status: "a_caminho" as const,
        statusLabel: "Agendada",
        osNum: str(os.num),
        clientName: str(os.client_name),
        detail: os.ag_date ? `Agenda ${String(os.ag_date).slice(0, 10)}` : "Em agenda",
      };
    }
    return {
      id: num(team.id),
      name: str(team.name),
      status: "livre" as const,
      statusLabel: "Livre",
      osNum: null,
      clientName: null,
      detail: "Sem OS em execução agora",
    };
  });

  const ticketsPorSetor = TICKET_SETORES.map((setor) => ({
    id: setor.id,
    nome: setor.nome,
    total: num(ticketsSetorRows.find((r) => str(r.setor) === setor.id)?.total),
  })).filter((row) => row.total > 0);

  const maxSetor = Math.max(1, ...ticketsPorSetor.map((r) => r.total));

  return {
    monthKey,
    kpis: {
      ticketsAbertos: num(ticketRows[0]?.total),
      osEmAndamento,
      equipesEmCampo: num(osFieldRows[0]?.total),
      comprasAtrasadas: num(comprasAtrasoRows[0]?.total),
      orcamentosMes: num(quoteMonthRows[0]?.total),
      contasMonitoradas: num(contasRows[0]?.total),
    },
    fluxoOs: osByStage,
    osFinalizadasMes: num(osFinalizadasRows[0]?.total),
    tempoMedio: {
      geralDias: Math.round(num(avgOsRows[0]?.dias) * 10) / 10,
      manutDias: Math.round(num(avgManutRows[0]?.dias) * 10) / 10,
    },
    attention: attention.slice(0, 10),
    equipesHoje,
    ticketsPorSetor: ticketsPorSetor.map((row) => ({
      ...row,
      pct: Math.round((row.total / maxSetor) * 100),
    })),
    comercial: {
      salvos: num(quoteMap["draft"]),
      enviados: num(quoteMap["sent"]),
      erros: num(quoteMap["error"]),
      aprovados: num(pedidosAprovRows[0]?.total),
    },
    estoque: {
      divergentes: num(stockDivRows[0]?.total),
      osSeparacao: num(osSepRows[0]?.total),
    },
  };
}
