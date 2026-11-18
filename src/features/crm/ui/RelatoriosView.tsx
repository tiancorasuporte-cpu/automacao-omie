import { useState } from "react";
import { ETAPAS, TIPOS_VENDA } from "../codigo/config";
import {
  brl,
  contratoDe,
  dataCriacao,
  escopo,
  fcurta,
  fdata,
  hojeISO,
  isRecorrente,
  lancamentos,
  mesAdd,
  mesesDoPeriodo,
  MESES,
  periodo,
  porPessoa,
  relatorio,
  situacaoTxt,
  somaExecucao,
  somaRecorrente,
  tipoVenda,
  valorPrincipal,
} from "../codigo/regras";
import type { Oportunidade, RegrasComissao, TipoVenda } from "../codigo/types";
import type { UsuarioCrm } from "./tipos-ui";
import { horaAgora, mesAtual } from "./utils";

interface Props {
  /** já filtradas pelos filtros do topo (vendedor, tipo, serviço, busca) */
  oportunidades: Oportunidade[];
  vendedores: string[];
  eu: UsuarioCrm;
  regras: RegrasComissao;
  /** filtros ativos, só para o texto do cabeçalho */
  filtros: { vendedor: string; tipo: TipoVenda | ""; servico: string };
  onToast: (t: string) => void;
}

type Rel = { mes: string; de: string; ate: string };

export function RelatoriosView({ oportunidades, vendedores, eu, regras, filtros, onToast }: Props) {
  const [rel, setRel] = useState<Rel>({ mes: mesAtual(), de: "", ate: "" });
  const verTudo = eu.comissoes;

  const P = periodo(rel.mes, rel.de, rel.ate);
  const L = escopo(oportunidades, eu.nome, verTudo);
  const D = relatorio(L, P, verTudo ? vendedores : vendedores.filter((v) => v === eu.nome));
  const comissoes = porPessoa(lancamentos(L, mesesDoPeriodo(P), regras, eu.nome, verTudo));
  const hoje = hojeISO();

  const meses = Array.from({ length: 12 }, (_, i) => {
    const k = mesAdd(mesAtual(), -i),
      [y, m] = k.split("-").map(Number);
    return { k, nome: `${MESES[(m ?? 1) - 1]}/${y}` };
  });
  const maxM = Math.max(1, ...D.motivos.map((m) => m[1]));
  const filtrosTxt = [
    filtros.vendedor && "Vendedor: " + filtros.vendedor,
    filtros.tipo && TIPOS_VENDA[filtros.tipo].nome,
    filtros.servico && "Serviço: " + filtros.servico,
  ]
    .filter(Boolean)
    .join(" · ");
  const funil = ETAPAS.filter((e) => e.id !== "final").map(
    (e) => [e.nome, L.filter((o) => o.etapa === e.id).length] as const,
  );
  const maxF = Math.max(1, ...funil.map((f) => f[1]));

  const nomeArq = (ext: string) =>
    `Relatorio-Comercial-${rel.mes === "custom" ? rel.de + "_a_" + rel.ate : rel.mes}.${ext}`;

  const exportarExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const R$ = '"R$" #,##0.00';
      const aba = (linhas: unknown[][], larg: number[], moedaCols: number[] = []) => {
        const ws = XLSX.utils.aoa_to_sheet(linhas);
        ws["!cols"] = larg.map((w) => ({ wch: w }));
        const rg = XLSX.utils.decode_range(ws["!ref"] || "A1");
        for (let r = 1; r <= rg.e.r; r++)
          moedaCols.forEach((c) => {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            if (cell && typeof cell.v === "number") cell.z = R$;
          });
        return ws;
      };
      const wb = XLSX.utils.book_new();
      const resumo = aba(
        [
          ["Relatório Comercial — Âncora Segurança", ""],
          ["Período", P.nome],
          ["Emitido em", fdata(hoje)],
          [],
          ["Indicador", "Valor"],
          ["Oportunidades no período", D.novas.length],
          ["Fechadas", D.fech.length],
          ["Não fechadas", D.perd.length],
          ["Conversão (%)", D.conv],
          ["Em andamento (hoje)", D.andamento.length],
          ["Aprovadas aguardando assinatura", D.aprov.length],
          [],
          ["Execução fechada (R$)", somaExecucao(D.fech)],
          ["Recorrente fechado (R$/mês)", somaRecorrente(D.fech)],
          ["Execução perdida (R$)", somaExecucao(D.perd)],
          ["Recorrente perdido (R$/mês)", somaRecorrente(D.perd)],
        ],
        [38, 22],
      );
      ["B13", "B14", "B15", "B16"].forEach((c) => {
        const cell = resumo[c];
        if (cell) cell.z = R$;
      });
      XLSX.utils.book_append_sheet(wb, resumo, "Resumo");

      XLSX.utils.book_append_sheet(
        wb,
        aba(
          [
            [
              "Nº",
              "Criada em",
              "Cliente",
              "Contato",
              "Cidade",
              "Serviço",
              "Tipo de venda",
              "Tipo de contrato",
              "Responsável",
              "Vendedores auxiliares",
              "Apoio técnico",
              "Situação",
              "Data do resultado",
              "Valor mensal (R$)",
              "Valor total / implantação (R$)",
              "Prazo (meses)",
              "Nº orçamento",
              "Motivo (não fechado)",
              "Observação",
            ],
            ...D.lista.map((o): unknown[] => [
              o.cod,
              fdata(dataCriacao(o)),
              o.cliente,
              o.contato,
              o.cidade,
              o.servico,
              TIPOS_VENDA[tipoVenda(o)].nome,
              isRecorrente(o) ? contratoDe(o, regras).nome : "",
              o.vendedor,
              (o.aux || []).join(", "),
              (o.apoio || []).join(", "),
              situacaoTxt(o),
              o.res ? fdata(o.res.data) : "",
              isRecorrente(o) ? +o.valor || 0 : "",
              +(o.total || 0) || "",
              isRecorrente(o) ? o.prazo : "",
              o.orc || "",
              o.res?.motivo || "",
              o.res?.obs || "",
            ]),
          ],
          [10, 11, 32, 22, 14, 18, 26, 26, 16, 22, 22, 22, 14, 16, 20, 10, 16, 30, 40],
          [13, 14],
        ),
        "Oportunidades",
      );

      XLSX.utils.book_append_sheet(
        wb,
        aba(
          [
            [
              "Tipo de venda",
              "Novas",
              "Fechadas",
              "Não fechadas",
              "Conversão (%)",
              "Valor fechado (R$)",
              "Valor perdido (R$)",
              "Observação",
            ],
            ...D.tipos.map((t): unknown[] => [
              t.nome,
              t.novas,
              t.fech,
              t.perd,
              t.conv,
              t.valor,
              t.perdido,
              t.rec ? "valores mensais" : "valor total",
            ]),
          ],
          [30, 8, 10, 13, 13, 18, 18, 16],
          [5, 6],
        ),
        "Por tipo",
      );

      XLSX.utils.book_append_sheet(
        wb,
        aba(
          [
            [
              "Vendedor",
              "Novas",
              "Em andamento",
              "Fechadas",
              "Não fechadas",
              "Conversão (%)",
              "Execução fechada (R$)",
              "Recorrente fechado (R$/mês)",
            ],
            ...D.vends.map((v): unknown[] => [
              v.nome,
              v.novas,
              v.andamento,
              v.fech,
              v.perd,
              v.conv,
              v.exe,
              v.rec,
            ]),
          ],
          [20, 8, 14, 10, 13, 13, 20, 24],
          [6, 7],
        ),
        "Por vendedor",
      );

      XLSX.utils.book_append_sheet(
        wb,
        aba([["Motivo", "Quantidade"], ...D.motivos.map((m): unknown[] => [m[0], m[1]])], [40, 12]),
        "Motivos de perda",
      );

      XLSX.utils.book_append_sheet(
        wb,
        aba(
          [
            ["Pessoa", "Papel(is)", "Comissão nova (R$)", "Comissão recorrente (R$)", "Total (R$)"],
            ...comissoes.map((c): unknown[] => [c.nome, c.papeis, c.novo, c.rec, c.total]),
          ],
          [20, 34, 20, 24, 16],
          [2, 3, 4],
        ),
        "Comissões",
      );

      XLSX.writeFile(wb, nomeArq("xlsx"));
      onToast("Excel gerado: " + nomeArq("xlsx"));
    } catch {
      onToast("Não foi possível gerar o Excel.");
    }
  };

  const exportarPDF = () => {
    const t = document.title;
    document.title = nomeArq("pdf").replace(".pdf", "");
    onToast("Na janela de impressão, escolha “Salvar como PDF”.");
    setTimeout(() => {
      window.print();
      document.title = t;
    }, 300);
  };

  const full = { gridColumn: "1/-1" } as const;
  const sumNovo = comissoes.reduce((a, c) => a + c.novo, 0),
    sumRec = comissoes.reduce((a, c) => a + c.rec, 0),
    sumTot = comissoes.reduce((a, c) => a + c.total, 0);

  return (
    <div className="report on">
      <div className="relbar no-print" style={full}>
        <b>Período:</b>
        <select
          value={rel.mes}
          onChange={(e) => {
            const mes = e.target.value;
            setRel((r) =>
              mes === "custom" && !r.de
                ? { mes, de: mesAtual() + "-01", ate: hoje }
                : { ...r, mes },
            );
          }}
        >
          {meses.map((m) => (
            <option key={m.k} value={m.k}>
              {m.nome}
            </option>
          ))}
          <option value="custom">Personalizado…</option>
        </select>
        {rel.mes === "custom" ? (
          <>
            <input
              type="date"
              value={rel.de}
              onChange={(e) => setRel((r) => ({ ...r, de: e.target.value }))}
            />{" "}
            até{" "}
            <input
              type="date"
              value={rel.ate}
              onChange={(e) => setRel((r) => ({ ...r, ate: e.target.value }))}
            />
          </>
        ) : null}
        <span style={{ color: "var(--mut)", fontSize: 12 }}>
          {verTudo ? "" : "Mostrando só as oportunidades em que você participa · "}
          {filtrosTxt
            ? "Filtros: " + filtrosTxt
            : "Os filtros de vendedor, tipo e serviço acima também valem aqui."}
        </span>
        <div className="sp" />
        <button className="btn" onClick={() => void exportarExcel()}>
          ⬇ Exportar Excel
        </button>
        <button className="btn dark" onClick={exportarPDF}>
          ⬇ Exportar PDF
        </button>
      </div>

      <div className="print-head" style={full}>
        <div>
          <b>ÂNCORA SEGURANÇA PATRIMONIAL</b> · SGO
        </div>
        <h2>Relatório Comercial — {P.nome}</h2>
        <div>
          {filtrosTxt ? filtrosTxt + " · " : ""}Emitido em {fdata(hoje)} {horaAgora()}
        </div>
      </div>

      <div className="rkpis" style={full}>
        <div className="kpi">
          <span>Oportunidades no período</span>
          <b>{D.novas.length}</b>
          <span>novas (vindas de OS ou cadastradas)</span>
        </div>
        <div className="kpi" style={{ borderTop: "3px solid var(--grn)" }}>
          <span>Fechadas</span>
          <b>{D.fech.length}</b>
          <span>
            🔧 {brl(somaExecucao(D.fech))} · 🔁 {brl(somaRecorrente(D.fech))}/mês
          </span>
        </div>
        <div className="kpi" style={{ borderTop: "3px solid var(--red)" }}>
          <span>Não fechadas</span>
          <b>{D.perd.length}</b>
          <span>
            🔧 {brl(somaExecucao(D.perd))} · 🔁 {brl(somaRecorrente(D.perd))}/mês
          </span>
        </div>
        <div className="kpi">
          <span>Conversão</span>
          <b>{D.conv}%</b>
          <span>fechadas ÷ finalizadas no período</span>
        </div>
        <div className="kpi">
          <span>Em andamento (hoje)</span>
          <b>{D.andamento.length}</b>
          <span>{D.aprov.length} aprovada(s) aguardando assinatura</span>
        </div>
      </div>

      <div className="panel" style={full}>
        <h3>Por tipo de venda</h3>
        <table className="vt">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Novas</th>
              <th>Fechadas</th>
              <th>Não fechadas</th>
              <th>Conversão</th>
              <th>Valor fechado</th>
              <th>Valor perdido</th>
            </tr>
          </thead>
          <tbody>
            {D.tipos.map((t) => (
              <tr key={t.id}>
                <td>
                  {TIPOS_VENDA[t.id].ic} {t.nome}
                </td>
                <td>{t.novas}</td>
                <td>{t.fech}</td>
                <td>{t.perd}</td>
                <td>
                  <b>{t.conv}%</b>
                </td>
                <td>
                  {brl(t.valor)}
                  {t.rec ? "/mês" : ""}
                </td>
                <td>
                  {brl(t.perdido)}
                  {t.rec ? "/mês" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel" style={full}>
        <h3>Por vendedor responsável</h3>
        <table className="vt">
          <thead>
            <tr>
              <th>Vendedor</th>
              <th>Novas</th>
              <th>Em andamento</th>
              <th>Fechadas</th>
              <th>Não fechadas</th>
              <th>Conversão</th>
              <th>🔧 Execução fechada</th>
              <th>🔁 Recorrente fechado</th>
            </tr>
          </thead>
          <tbody>
            {D.vends.map((v) => (
              <tr key={v.nome}>
                <td>{v.nome}</td>
                <td>{v.novas}</td>
                <td>{v.andamento}</td>
                <td>{v.fech}</td>
                <td>{v.perd}</td>
                <td>
                  <b>{v.conv}%</b>
                </td>
                <td>{brl(v.exe)}</td>
                <td>{brl(v.rec)}/mês</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel" style={full}>
        <h3>
          {verTudo ? "Comissões do período" : "Minhas comissões no período"}{" "}
          <small style={{ fontWeight: 400, color: "var(--mut)" }}>
            nova = vendas fechadas e 1ª parcela de contratos novos · recorrente = parcelas dos
            contratos vigentes
          </small>
        </h3>
        <table className="vt">
          <thead>
            <tr>
              <th>Pessoa</th>
              <th style={{ textAlign: "left" }}>Papel(is)</th>
              <th>Comissão nova</th>
              <th>Comissão recorrente</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {comissoes.length ? (
              comissoes.map((c) => (
                <tr key={c.nome}>
                  <td>{c.nome}</td>
                  <td style={{ textAlign: "left" }}>{c.papeis}</td>
                  <td>{brl(c.novo)}</td>
                  <td>{brl(c.rec)}</td>
                  <td>
                    <b>{brl(c.total)}</b>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="empty">
                  Nenhuma comissão no período
                </td>
              </tr>
            )}
            {comissoes.length > 1 ? (
              <tr>
                <td>
                  <b>Total</b>
                </td>
                <td></td>
                <td>
                  <b>{brl(sumNovo)}</b>
                </td>
                <td>
                  <b>{brl(sumRec)}</b>
                </td>
                <td>
                  <b>{brl(sumTot)}</b>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="panel lista" style={full}>
        <h3>
          Oportunidades do período ({D.lista.length}){" "}
          <small style={{ fontWeight: 400, color: "var(--mut)" }}>
            criadas, fechadas ou não fechadas no período
          </small>
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table className="vt lt">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Criada</th>
                <th>Cliente</th>
                <th>Cidade</th>
                <th>Tipo</th>
                <th>Responsável</th>
                <th>Situação</th>
                <th>Valor</th>
                <th>Motivo / obs.</th>
              </tr>
            </thead>
            <tbody>
              {D.lista.length ? (
                D.lista.map((o) => (
                  <tr key={o.id}>
                    <td>{o.cod}</td>
                    <td>{fcurta(dataCriacao(o))}</td>
                    <td>{o.cliente}</td>
                    <td>{o.cidade}</td>
                    <td>{TIPOS_VENDA[tipoVenda(o)].curto}</td>
                    <td>{o.vendedor}</td>
                    <td>
                      <span
                        className={`tag ${o.res ? (o.res.st === "ganho" ? "grn" : "red") : ""}`.trim()}
                      >
                        {situacaoTxt(o)}
                      </span>
                      {o.res ? " " + fcurta(o.res.data) : ""}
                    </td>
                    <td>
                      {valorPrincipal(o)
                        ? brl(valorPrincipal(o)) + (isRecorrente(o) ? "/mês" : "")
                        : "—"}
                    </td>
                    <td style={{ textAlign: "left", fontSize: 12 }}>{o.res?.motivo || ""}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="empty">
                    Nenhuma oportunidade no período
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h3>Motivos de não fechamento</h3>
        {D.motivos.length ? (
          D.motivos.map(([n, q]) => (
            <div className="bar" key={n}>
              <span>{n}</span>
              <div className="tr">
                <div className="fi r" style={{ width: `${(q / maxM) * 100}%` }} />
              </div>
              <span className="n">{q}</span>
            </div>
          ))
        ) : (
          <div className="empty">Nenhuma oportunidade perdida no período</div>
        )}
      </div>

      <div className="panel no-print">
        <h3>Funil hoje — oportunidades em aberto por etapa</h3>
        {funil.map(([n, q]) => (
          <div className="bar" key={n}>
            <span>{n}</span>
            <div className="tr">
              <div className="fi" style={{ width: `${(q / maxF) * 100}%` }} />
            </div>
            <span className="n">{q}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
