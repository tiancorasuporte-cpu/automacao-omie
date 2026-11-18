import { useState } from "react";
import { PAPEIS, TIPOS_VENDA } from "../codigo/config";
import {
  brl,
  comissoesMes,
  fdata,
  hojeISO,
  mesAdd,
  pagamentoVendedor,
  tipoVenda,
} from "../codigo/regras";
import type { LancamentoComissao, Oportunidade, RegrasComissao } from "../codigo/types";
import type { UsuarioCrm } from "./tipos-ui";
import { horaAgora, listaContratos, mesAtual, nomeArquivoSeguro, nomeMes } from "./utils";

interface Props {
  /** já filtradas pelos filtros do topo */
  oportunidades: Oportunidade[];
  vendedores: string[];
  eu: UsuarioCrm;
  regras: RegrasComissao;
  /** abre o modal de Regras de comissão (só aparece com permissão "Comissões") */
  onRegras: () => void;
  onToast: (t: string) => void;
}

type Modo = "resumo" | "pag";

function TabelaLancamentos({
  linhas,
  vazio,
  pag,
}: {
  linhas: LancamentoComissao[];
  vazio: string;
  pag: boolean;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="vt lt">
        <thead>
          <tr>
            <th>Nº</th>
            <th>Cliente</th>
            <th>Tipo</th>
            <th>Fechada em</th>
            <th>Base</th>
            {pag ? null : <th>Pessoa</th>}
            <th>Papel</th>
            <th>Lançamento</th>
            <th>Venda</th>
            <th>Equipe</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {linhas.length ? (
            linhas.map((l, i) => (
              <tr key={`${l.o.id}-${l.p.nome}-${l.mes}-${i}`}>
                <td>{l.o.cod}</td>
                <td>{l.o.cliente}</td>
                <td>{TIPOS_VENDA[tipoVenda(l.o)].curto}</td>
                <td>{fdata(l.o.res?.data)}</td>
                <td>
                  {brl(l.c.base)}
                  {l.c.rec ? "/mês" : ""}
                </td>
                {pag ? null : <td>{l.p.nome}</td>}
                <td>{PAPEIS[l.p.papel]}</td>
                <td>
                  <span className={`tag ${l.tipo === "novo" ? "grn" : "blu"}`}>
                    {l.tipo === "novo" ? "Nova" : "Recorrente"}
                  </span>{" "}
                  {l.desc}
                </td>
                <td>{l.venda ? brl(l.venda) : "—"}</td>
                <td>{l.equipe ? brl(l.equipe) : "—"}</td>
                <td>
                  <b>{brl(l.total)}</b>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={11} className="empty">
                {vazio}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ComissoesView({ oportunidades, vendedores, eu, regras, onRegras, onToast }: Props) {
  const tudo = eu.comissoes;
  const [mes, setMes] = useState(mesAtual());
  const [modo, setModo] = useState<Modo>("resumo");
  const [pessoaSel, setPessoaSel] = useState("");
  const hoje = hojeISO();

  const D = comissoesMes(oportunidades, mes, regras, eu.nome, tudo);
  const contratos = [...D.contratos].sort(
    (a, b) =>
      Number(b.s.cls === "grn") - Number(a.s.cls === "grn") ||
      (a.o.res?.data ?? "").localeCompare(b.o.res?.data ?? ""),
  );
  const previsao = [...D.previsao].sort((a, b) => b[1].exe + b[1].rec - (a[1].exe + a[1].rec));
  const vigentes = D.contratos.filter((x) => x.s.k && !x.c.unica).length;

  const mesesLista = Array.from({ length: 14 }, (_, i) => mesAdd(mesAtual(), -(i - 2)));
  const pessoas = tudo ? [...new Set(D.pessoas.map((p) => p.nome).concat(vendedores))] : [eu.nome];
  const pessoa = tudo ? (pessoas.includes(pessoaSel) ? pessoaSel : (pessoas[0] ?? "")) : eu.nome;

  const E = regras.execucao,
    W = regras.pesos,
    tipos = listaContratos(regras);
  const pag = modo === "pag" ? pagamentoVendedor(oportunidades, mes, regras, pessoa) : null;

  const arq = (ext: string) =>
    (modo === "pag" ? "Comissoes-a-pagar-" + nomeArquivoSeguro(pessoa) + "-" : "Comissoes-") +
    mes +
    "." +
    ext;

  const exportarPDF = () => {
    const t = document.title;
    document.title = arq("pdf").replace(".pdf", "");
    onToast("Na janela de impressão, escolha “Salvar como PDF”.");
    setTimeout(() => {
      window.print();
      document.title = t;
    }, 300);
  };

  const exportarExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const R$ = '"R$" #,##0.00',
        wb = XLSX.utils.book_new();
      const aba = (linhas: unknown[][], larg: number[], cols: number[]) => {
        const ws = XLSX.utils.aoa_to_sheet(linhas);
        ws["!cols"] = larg.map((w) => ({ wch: w }));
        const rg = XLSX.utils.decode_range(ws["!ref"] || "A1");
        for (let r = 1; r <= rg.e.r; r++)
          cols.forEach((c) => {
            const x = ws[XLSX.utils.encode_cell({ r, c })];
            if (x && typeof x.v === "number") x.z = R$;
          });
        return ws;
      };
      const linha = (l: LancamentoComissao): unknown[] => [
        l.o.cod,
        l.o.cliente,
        TIPOS_VENDA[tipoVenda(l.o)].nome,
        fdata(l.o.res?.data),
        l.c.base,
        l.p.nome,
        PAPEIS[l.p.papel],
        l.tipo === "novo" ? "Nova" : "Recorrente",
        l.desc,
        l.venda,
        l.equipe,
        l.total,
      ];
      const cab: unknown[] = [
        "Nº",
        "Cliente",
        "Tipo de venda",
        "Fechada em",
        "Base (R$)",
        "Pessoa",
        "Papel",
        "Comissão",
        "Lançamento",
        "Comissão de venda (R$)",
        "Comissão de equipe (R$)",
        "Total (R$)",
      ];
      const larg = [10, 32, 26, 12, 14, 18, 18, 12, 24, 20, 20, 14],
        moe = [4, 9, 10, 11];

      if (pag) {
        const L = [...pag.novas, ...pag.recorrentes];
        const rod = (txt: string, v: number): unknown[] => [
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          txt,
          "",
          "",
          v,
        ];
        XLSX.utils.book_append_sheet(
          wb,
          aba(
            [
              ["Comissões a pagar — " + pessoa + " — " + nomeMes(mes)],
              [],
              cab,
              ...L.map(linha),
              [],
              rod("Comissão nova", pag.totalNovo),
              rod("Comissão recorrente", pag.totalRec),
              rod("TOTAL A PAGAR", pag.totalAPagar),
            ],
            larg,
            moe,
          ),
          "Pagamento",
        );
      } else {
        XLSX.utils.book_append_sheet(
          wb,
          aba(
            [
              [
                "Pessoa",
                "Papel(is)",
                "Comissão nova (R$)",
                "Comissão recorrente (R$)",
                "Total do mês (R$)",
              ],
              ...D.pessoas.map((c) => [c.nome, c.papeis, c.novo, c.rec, c.total]),
              ["TOTAL", "", D.totalNovo, D.totalRec, D.total],
            ],
            [20, 34, 20, 24, 18],
            [2, 3, 4],
          ),
          "Resumo por pessoa",
        );
        XLSX.utils.book_append_sheet(wb, aba([cab, ...D.lin.map(linha)], larg, moe), "Lançamentos");
        XLSX.utils.book_append_sheet(
          wb,
          aba(
            [
              [
                "Nº",
                "Cliente",
                "Tipo de contrato",
                "Mensalidade (R$)",
                "Fechado em",
                "Comissão",
                "Parcela no mês",
                "Situação",
                "Comissão (R$)",
              ],
              ...contratos.map(({ o, c, s, mensal }) => [
                o.cod,
                o.cliente,
                c.contrato,
                c.base,
                fdata(o.res?.data),
                c.unica ? "Única (1ª parcela)" : c.parcelas || "sem prazo",
                s.k ? s.k + "/" + (c.parcelas || "—") : "",
                s.txt,
                mensal,
              ]),
            ],
            [10, 32, 26, 16, 12, 18, 14, 26, 18],
            [3, 8],
          ),
          "Contratos recorrentes",
        );
      }
      XLSX.writeFile(wb, arq("xlsx"));
      onToast("Excel gerado: " + arq("xlsx"));
    } catch {
      onToast("Não foi possível gerar o Excel.");
    }
  };

  const full = { gridColumn: "1/-1" } as const;
  const titulo = tudo ? "Comissões" : "Minhas comissões";

  return (
    <div className="report on">
      {/* barra */}
      <div className="relbar no-print" style={full}>
        <div className="seg">
          <button className={modo === "resumo" ? "on" : ""} onClick={() => setModo("resumo")}>
            Resumo do mês
          </button>
          <button className={modo === "pag" ? "on" : ""} onClick={() => setModo("pag")}>
            {tudo ? "Pagamento do vendedor" : "Meu extrato"}
          </button>
        </div>
        <b>Mês:</b>
        <select value={mes} onChange={(e) => setMes(e.target.value)}>
          {mesesLista.map((m) => (
            <option key={m} value={m}>
              {nomeMes(m)}
              {m > mesAtual() ? " (previsão)" : ""}
            </option>
          ))}
        </select>
        {modo === "pag" && tudo ? (
          <>
            <b>Pessoa:</b>
            <select value={pessoa} onChange={(e) => setPessoaSel(e.target.value)}>
              {pessoas.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </>
        ) : null}
        {tudo ? null : (
          <span style={{ color: "var(--mut)", fontSize: 12 }}>Você vê só as suas comissões.</span>
        )}
        <div className="sp" />
        {tudo ? (
          <button className="btn" onClick={onRegras}>
            ⚙ Regras de comissão
          </button>
        ) : null}
        <button className="btn" onClick={() => void exportarExcel()}>
          ⬇ Exportar Excel
        </button>
        <button className="btn dark" onClick={exportarPDF}>
          ⬇ Exportar PDF
        </button>
      </div>

      {pag ? (
        <>
          <div className="print-head" style={full}>
            <div>
              <b>ÂNCORA SEGURANÇA PATRIMONIAL</b> · SGO · <b>CONFIDENCIAL</b>
            </div>
            <h2>
              Comissões a pagar — {pessoa} — {nomeMes(mes)}
            </h2>
            <div>
              Emitido em {fdata(hoje)} {horaAgora()} por {eu.nome}
            </div>
          </div>
          <div className="rkpis" style={full}>
            <div className="kpi">
              <span>Pessoa</span>
              <b style={{ fontSize: 17 }}>{pessoa || "—"}</b>
              <span>{nomeMes(mes)}</span>
            </div>
            <div className="kpi" style={{ borderTop: "3px solid var(--grn)" }}>
              <span>Comissão nova no mês</span>
              <b>{brl(pag.totalNovo)}</b>
              <span>{pag.novas.length} lançamento(s)</span>
            </div>
            <div className="kpi" style={{ borderTop: "3px solid var(--blu)" }}>
              <span>Comissão recorrente no mês</span>
              <b>{brl(pag.totalRec)}</b>
              <span>{new Set(pag.recorrentes.map((l) => l.o.id)).size} contrato(s) vigente(s)</span>
            </div>
            <div className="kpi" style={{ borderTop: "3px solid var(--brand)" }}>
              <span>Total a pagar no mês</span>
              <b>{brl(pag.totalAPagar)}</b>
              <span>nova + recorrente</span>
            </div>
            <div className="kpi">
              <span>Regras</span>
              <span style={{ display: "block", marginTop: 4, fontSize: 12, lineHeight: 1.5 }}>
                Valores calculados com as regras gravadas no fechamento de cada oportunidade.
              </span>
            </div>
          </div>
          <div className="panel" style={full}>
            <h3>
              Novas no mês{" "}
              <small style={{ fontWeight: 400, color: "var(--mut)" }}>
                vendas de execução fechadas e 1ª parcela de contratos novos
              </small>
            </h3>
            <TabelaLancamentos linhas={pag.novas} vazio="Nenhuma comissão nova neste mês" pag />
          </div>
          <div className="panel" style={full}>
            <h3>
              Recorrentes{" "}
              <small style={{ fontWeight: 400, color: "var(--mut)" }}>
                parcelas dos contratos vigentes
              </small>
            </h3>
            <TabelaLancamentos
              linhas={pag.recorrentes}
              vazio="Nenhuma parcela recorrente neste mês"
              pag
            />
          </div>
          <div className="panel" style={full}>
            <table className="vt">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>
                    Resumo do pagamento — {pessoa} — {nomeMes(mes)}
                  </th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ textAlign: "left" }}>Comissão nova</td>
                  <td>{brl(pag.totalNovo)}</td>
                </tr>
                <tr>
                  <td style={{ textAlign: "left" }}>Comissão recorrente</td>
                  <td>{brl(pag.totalRec)}</td>
                </tr>
                <tr>
                  <td style={{ textAlign: "left" }}>
                    <b>TOTAL A PAGAR</b>
                  </td>
                  <td>
                    <b>{brl(pag.totalAPagar)}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="print-head" style={full}>
            <div>
              <b>ÂNCORA SEGURANÇA PATRIMONIAL</b> · SGO · <b>CONFIDENCIAL</b>
            </div>
            <h2>
              {titulo} — {nomeMes(mes)}
            </h2>
            <div>
              Emitido em {fdata(hoje)} {horaAgora()} por {eu.nome}
            </div>
          </div>
          <div className="rkpis" style={full}>
            <div className="kpi" style={{ borderTop: "3px solid var(--grn)" }}>
              <span>Comissão nova no mês</span>
              <b>{brl(D.totalNovo)}</b>
              <span>vendas fechadas + 1ª parcela de contratos</span>
            </div>
            <div className="kpi" style={{ borderTop: "3px solid var(--blu)" }}>
              <span>Comissão recorrente no mês</span>
              <b>{brl(D.totalRec)}</b>
              <span>parcelas dos contratos vigentes</span>
            </div>
            <div className="kpi" style={{ borderTop: "3px solid var(--brand)" }}>
              <span>Total do mês</span>
              <b>{brl(D.total)}</b>
              <span>{D.pessoas.length} pessoa(s)</span>
            </div>
            <div className="kpi">
              <span>Contratos com comissão mensal</span>
              <b>{vigentes}</b>
              <span>pagando neste mês</span>
            </div>
            {tudo ? (
              <div className="kpi">
                <span>Regras vigentes</span>
                <span style={{ display: "block", marginTop: 4, fontSize: 12, lineHeight: 1.5 }}>
                  🔧 venda {E.venda}% · equipe {E.equipe}% (uma vez)
                  <br />
                  🔁 {tipos.length} tipos de contrato (
                  {tipos.filter((t) => t.modo === "mensal").length} mensais ·{" "}
                  {tipos.filter((t) => t.modo === "primeira").length} da 1ª parcela)
                  <br />
                  Equipe dividida entre participantes (pesos {W.auxiliar}·{W.apoio})
                </span>
              </div>
            ) : (
              <div className="kpi">
                <span>Cálculo</span>
                <span style={{ display: "block", marginTop: 4, fontSize: 12, lineHeight: 1.5 }}>
                  Automático, conforme o tipo de venda e de contrato de cada oportunidade.
                </span>
              </div>
            )}
          </div>

          <div className="panel" style={full}>
            <h3>{tudo ? "Resumo por pessoa" : "Meu resumo"}</h3>
            <table className="vt">
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th style={{ textAlign: "left" }}>Papel(is)</th>
                  <th>Comissão nova</th>
                  <th>Comissão recorrente</th>
                  <th>Total do mês</th>
                  <th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {D.pessoas.length ? (
                  D.pessoas.map((c) => (
                    <tr key={c.nome}>
                      <td>{c.nome}</td>
                      <td style={{ textAlign: "left" }}>{c.papeis}</td>
                      <td>{brl(c.novo)}</td>
                      <td>
                        {brl(c.rec)}{" "}
                        <small style={{ color: "var(--mut)" }}>
                          ({c.contratos} contrato{c.contratos === 1 ? "" : "s"})
                        </small>
                      </td>
                      <td>
                        <b>{brl(c.total)}</b>
                      </td>
                      <td className="no-print">
                        <button
                          className="btn"
                          onClick={() => {
                            setModo("pag");
                            setPessoaSel(c.nome);
                          }}
                        >
                          {tudo ? "Pagamento ▸" : "Extrato ▸"}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="empty">
                      Nenhuma comissão neste mês
                    </td>
                  </tr>
                )}
                {D.pessoas.length > 1 ? (
                  <tr>
                    <td>
                      <b>Total</b>
                    </td>
                    <td></td>
                    <td>
                      <b>{brl(D.totalNovo)}</b>
                    </td>
                    <td>
                      <b>{brl(D.totalRec)}</b>
                    </td>
                    <td>
                      <b>{brl(D.total)}</b>
                    </td>
                    <td className="no-print"></td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="panel lista" style={full}>
            <h3>Lançamentos do mês</h3>
            <TabelaLancamentos linhas={D.lin} vazio="Sem lançamentos neste mês" pag={false} />
          </div>

          <div className="panel lista" style={full}>
            <h3>
              Contratos recorrentes{" "}
              <small style={{ fontWeight: 400, color: "var(--mut)" }}>
                conforme o tipo de contrato: comissão mensal durante o contrato ou % da 1ª parcela
                (uma vez)
              </small>
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table className="vt lt">
                <thead>
                  <tr>
                    <th>Nº</th>
                    <th>Cliente</th>
                    <th>Tipo de contrato</th>
                    <th>Mensalidade</th>
                    <th>Fechado em</th>
                    <th>Comissão</th>
                    <th>Parcela em {nomeMes(mes)}</th>
                    <th>Situação</th>
                    <th>{tudo ? "Comissão (todos)" : "Minha comissão"}</th>
                  </tr>
                </thead>
                <tbody>
                  {contratos.length ? (
                    contratos.map(({ o, c, s, mensal }) => (
                      <tr key={o.id}>
                        <td>{o.cod}</td>
                        <td>{o.cliente}</td>
                        <td>{c.contrato}</td>
                        <td>{brl(c.base)}</td>
                        <td>{fdata(o.res?.data)}</td>
                        <td>
                          {c.unica
                            ? "Única (1ª parcela)"
                            : c.parcelas
                              ? `${c.parcelas} (${nomeMes(s.ini)} a ${nomeMes(s.fim)})`
                              : `sem prazo (desde ${nomeMes(s.ini)})`}
                        </td>
                        <td>{s.k ? (c.unica ? "1ª" : `${s.k}/${c.parcelas || "—"}`) : "—"}</td>
                        <td>
                          <span className={`tag ${s.cls}`.trim()}>{s.txt}</span>
                        </td>
                        <td>
                          {brl(mensal)}
                          {c.unica ? "" : "/mês"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="empty">
                        Nenhum contrato recorrente fechado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel no-print" style={full}>
            <h3>
              Previsão{" "}
              <small style={{ fontWeight: 400, color: "var(--mut)" }}>
                (se fecharem as oportunidades em negociação e aprovadas hoje)
              </small>
            </h3>
            <table className="vt">
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Uma vez (execução e % da 1ª parcela)</th>
                  <th>🔁 Recorrente mensal (por mês)</th>
                </tr>
              </thead>
              <tbody>
                {previsao.length ? (
                  previsao.map(([n, v]) => (
                    <tr key={n}>
                      <td>{n}</td>
                      <td>{brl(v.exe)}</td>
                      <td>{brl(v.rec)}/mês</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="empty">
                      —
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
