import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  CORES_HISTORICO,
  ETAPAS,
  NEGOCIACAO,
  SEGUIMENTO,
  SERVICOS,
  TIPOS_VENDA,
} from "../codigo/config";
import {
  alerta,
  calcComissao,
  contratoDe,
  diasAte,
  etapaInfo,
  fdata,
  isRecorrente,
  situacaoContrato,
  tipoVenda,
} from "../codigo/regras";
import type { Documento, EtapaId, Oportunidade, RegrasComissao, TipoVenda } from "../codigo/types";
import type { CamposPatch, EquipeDados, UsuarioCrm } from "./tipos-ui";
import { ftam, icDoc, listaContratos, mesAtual, nomeMes, tipoAcao } from "./utils";

export type AbaGaveta = "resumo" | "docs" | "hist";
/** Botões da gaveta (data-act do protótipo) */
export type AcaoGaveta =
  | "montado"
  | "enviado"
  | "acao2"
  | "acao3"
  | "aprovado"
  | "final"
  | "nota"
  | "anexo"
  | "recebido"
  | "reprev"
  | "feita"
  | "reagendar"
  | "reabrir"
  | "encerrar"
  | "reativar"
  | "gerar_orcamento";

interface Props {
  o: Oportunidade;
  vendedores: string[];
  tecnicos: string[];
  regras: RegrasComissao;
  eu: UsuarioCrm;
  aba: AbaGaveta;
  onAba: (a: AbaGaveta) => void;
  onFechar: () => void;
  /** "Mover para" do rodapé (passa por movimento() em quem chama) */
  onMover: (id: number, etapa: EtapaId) => void;
  onAcao: (a: AcaoGaveta) => void;
  onPatch: (campos: CamposPatch) => void;
  onEquipe: (d: EquipeDados) => void;
  /** troca de responsável: quem chama abre o modal de motivo */
  onTrocarResponsavel: (novo: string) => void;
  onAbrirDoc: (d: Documento) => void;
  onRemoverDoc: (d: Documento) => void;
  onExcluir?: (() => void) | undefined;
}

/** Campo editável: grava quando o usuário sai do campo (ou escolhe, nos selects) */
function Campo({
  label,
  valor,
  tipo = "text",
  ro,
  placeholder,
  step,
  min,
  onCommit,
  children,
}: {
  label: string;
  valor: string | number | undefined;
  tipo?: "text" | "number" | "date" | "select";
  ro: boolean;
  placeholder?: string;
  step?: string;
  min?: string;
  onCommit: (v: string) => void;
  children?: ReactNode;
}) {
  const atual = valor === undefined || valor === 0 ? "" : String(valor);
  return (
    <div className="f">
      <label>{label}</label>
      {tipo === "select" ? (
        <select
          key={atual}
          defaultValue={atual}
          disabled={ro}
          onChange={(e) => onCommit(e.target.value)}
        >
          {children}
        </select>
      ) : (
        <input
          key={atual}
          type={tipo}
          defaultValue={atual}
          disabled={ro}
          {...(placeholder ? { placeholder } : {})}
          {...(step ? { step } : {})}
          {...(min ? { min } : {})}
          onBlur={(e) => {
            if (e.target.value !== atual) onCommit(e.target.value);
          }}
        />
      )}
    </div>
  );
}

export function OpportunityDrawer({
  o,
  vendedores,
  tecnicos,
  regras,
  eu,
  aba,
  onAba,
  onFechar,
  onMover,
  onAcao,
  onPatch,
  onEquipe,
  onTrocarResponsavel,
  onAbrirDoc,
  onRemoverDoc,
  onExcluir,
}: Props) {
  const [on, setOn] = useState(false);
  const corpo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const r = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(r);
  }, []);
  useEffect(() => {
    if (corpo.current) corpo.current.scrollTop = 0;
  }, [aba, o.id]);

  const idx = ETAPAS.findIndex((e) => e.id === o.etapa);
  const a = alerta(o);
  const ro = o.etapa === "final";
  const rec = isRecorrente(o);
  const tv = TIPOS_VENDA[tipoVenda(o)];
  const stepCls = (i: number) =>
    i < idx
      ? "on"
      : i === idx
        ? o.etapa === "final"
          ? o.res?.st === "ganho"
            ? "win"
            : "lost"
          : "on"
        : "";

  const patchNum = (campo: "valor" | "prazo" | "total") => (v: string) =>
    onPatch({ [campo]: +v } as CamposPatch);
  const patchTxt =
    (campo: "contato" | "tel" | "cidade" | "servico" | "validade" | "orc" | "modalidade") =>
    (v: string) =>
      onPatch({ [campo]: v } as CamposPatch);

  const btn = (act: AcaoGaveta, cls: string, txt: string) => (
    <button className={`btn ${cls}`.trim()} onClick={() => onAcao(act)}>
      {txt}
    </button>
  );

  const acaoPrincipal: Partial<Record<EtapaId, ReactNode>> = {
    montar: btn("montado", "pri", "Marcar orçamento como montado"),
    montado: btn("enviado", "pri", "Registrar envio ao cliente (1ª ação)"),
    enviado: btn("acao2", "pri", "Agendar 2ª ação"),
    acao2: btn("acao3", "pri", "Agendar 3ª ação"),
  };

  /* ---------- caixas de situação (.dst) ---------- */
  const ap = o.aprov;
  const boxAprov =
    o.etapa === "aprovado" && ap ? (
      <div className={`acao-box ${a.cls === "red" ? "late" : "ok"}`}>
        <div className="t">Cliente aprovou em {fdata(ap.data)}</div>
        <div className="n">✍️ Aguardando: {ap.aguardando}</div>
        <div>
          Previsão: {ap.prev ? fdata(ap.prev) : "—"}
          {a.txt ? (
            <>
              {" "}
              · <b>{a.txt}</b>
            </>
          ) : null}
        </div>
        {ap.obs ? <div style={{ marginTop: 4, fontSize: 13 }}>{ap.obs}</div> : null}
        <div className="bt">
          <button className="btn sm grn" onClick={() => onAcao("recebido")}>
            ✔ Recebido — finalizar como fechado
          </button>
          <button className="btn sm" onClick={() => onAcao("reprev")}>
            Alterar previsão
          </button>
        </div>
      </div>
    ) : null;

  const ac = o.acao;
  const tAc = ac ? tipoAcao(ac.tipo) : null;
  const boxAcao =
    o.etapa === "acao2" || o.etapa === "acao3" ? (
      ac && tAc ? (
        <div className={`acao-box ${ac.feita ? "ok" : a.cls === "red" ? "late" : ""}`.trim()}>
          <div className="t">
            {ac.n}ª ação {ac.feita ? "· realizada" : "· agendada"}
          </div>
          <div className="n">
            {tAc.ic} {tAc.nome}
          </div>
          <div>
            {fdata(ac.data)}
            {ac.hora ? " às " + ac.hora : ""} · {o.vendedor}
            {!ac.feita && a.txt ? (
              <>
                {" "}
                · <b>{a.txt}</b>
              </>
            ) : null}
          </div>
          {ac.obj ? (
            <div style={{ marginTop: 4, fontSize: 13 }}>
              <b>Objetivo:</b> {ac.obj}
            </div>
          ) : null}
          {ac.feita ? (
            <div style={{ marginTop: 4, fontSize: 13 }}>
              <b>Resultado:</b> {ac.resultado}
            </div>
          ) : null}
          <div className="bt">
            {!ac.feita ? (
              <>
                <button className="btn sm grn" onClick={() => onAcao("feita")}>
                  ✔ Registrar resultado
                </button>
                <button className="btn sm" onClick={() => onAcao("reagendar")}>
                  Reagendar / trocar ação
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="acao-box late">
          <div className="n">Nenhuma ação agendada</div>
          <div className="bt">
            <button className="btn sm pri" onClick={() => onAcao("reagendar")}>
              Agendar ação
            </button>
          </div>
        </div>
      )
    ) : null;

  let blocoResultado: ReactNode = null;
  if (o.res) {
    const ganho = o.res.st === "ganho";
    const docFech = (o.docs || []).find(
      (d) => d.etiqueta === "Contrato assinado" || d.etiqueta === "Aceite do cliente",
    );
    let contrato: ReactNode = null;
    if (ganho && rec) {
      const c = calcComissao(o, regras),
        s = situacaoContrato(o, c, mesAtual());
      contrato = (
        <div
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: "1px dashed rgba(0,0,0,.15)",
            fontSize: 12,
          }}
        >
          🔁 <b>{c.contrato}:</b>{" "}
          {c.unica
            ? `comissão única sobre a 1ª parcela, paga em ${nomeMes(s.ini)}`
            : `comissão paga todo mês, ${c.parcelas ? `${c.parcelas} parcelas (${nomeMes(s.ini)} a ${nomeMes(s.fim)})` : `enquanto o contrato estiver vigente (desde ${nomeMes(s.ini)})`} · ${s.k ? `este mês: parcela ${s.k}${c.parcelas ? "/" + c.parcelas : ""}` : s.txt}`}
          {o.contrato?.fim ? (
            <div>
              <b>Contrato encerrado em {fdata(o.contrato.fim)}</b>
              {o.contrato.motivo ? " — " + o.contrato.motivo : ""}
            </div>
          ) : null}
          {eu.comissoes && !c.unica ? (
            <div style={{ marginTop: 4 }}>
              {o.contrato?.fim ? (
                <button className="btn" onClick={() => onAcao("reativar")}>
                  Desfazer encerramento
                </button>
              ) : (
                <button className="btn" onClick={() => onAcao("encerrar")}>
                  Registrar encerramento do contrato
                </button>
              )}
            </div>
          ) : null}
        </div>
      );
    }
    blocoResultado = (
      <div className={`result ${ganho ? "win" : "lost"}`}>
        <b>{ganho ? "✔ FECHADO" : "✖ NÃO FECHADO"}</b> em {fdata(o.res.data)}
        {o.res.motivo ? (
          <div>
            <b>Motivo:</b> {o.res.motivo}
          </div>
        ) : null}
        {o.res.concorrente ? (
          <div>
            <b>Concorrente:</b> {o.res.concorrente}
          </div>
        ) : null}
        {o.res.obs ? <div>{o.res.obs}</div> : null}
        {ganho ? (
          <div style={{ marginTop: 4, fontSize: 12 }}>
            {docFech ? (
              <>
                📎 {docFech.etiqueta}: {docFech.nome}
                <br />
              </>
            ) : null}
            → OS “Pedido aprovado (instalação)” criada no Quadro de OS.
          </div>
        ) : null}
        {contrato}
      </div>
    );
  }

  /* ---------- aba Resumo: equipe ---------- */
  const alternar = (campo: "aux" | "apoio", nome: string) => {
    const lista = [...(o[campo] || [])],
      i = lista.indexOf(nome);
    if (i >= 0) lista.splice(i, 1);
    else lista.push(nome);
    onEquipe({ [campo]: lista });
  };
  const chip = (campo: "aux" | "apoio", nome: string, extra?: ReactNode) => {
    const sel = (o[campo] || []).includes(nome);
    return (
      <button
        key={campo + nome}
        className={`chip ${sel ? "on" : ""}`.trim()}
        disabled={ro}
        onClick={() => alternar(campo, nome)}
      >
        {sel ? "✔ " : ""}
        {nome}
        {extra}
      </button>
    );
  };

  const modalidadeId = contratoDe(o, regras).id;
  const docs = o.docs || [];

  const painel = (
    <div className="crm-root crm-portal" aria-modal="true" role="dialog">
      <div className={`shade ${on ? "on" : ""}`.trim()} onClick={onFechar} />
      <aside className={`drawer ${on ? "on" : ""}`.trim()}>
        {/* 1) cabeçalho */}
        <div className="dh">
          <div className="r">
            <div>
              <div className="meta">
                {o.cod} ·{" "}
                {o.ltNumero
                  ? `${o.ltNumero}${o.os ? ` · OS ${o.os}` : ""}`
                  : o.os
                    ? `Origem: OS ${o.os} (levantamento técnico)`
                    : "Origem: cadastro manual"}
                {o.codigoClienteOmie ? ` · Omie #${o.codigoClienteOmie}` : ""}
              </div>
              <h2>{o.cliente}</h2>
              {o.ltNumero ? (
                <div className="meta" style={{ marginTop: 4 }}>
                  <span
                    style={{
                      display: "inline-block",
                      background: "#FEF3C7",
                      border: "1px solid #F59E0B",
                      borderRadius: 6,
                      padding: "2px 8px",
                      fontWeight: 600,
                      fontSize: 12,
                    }}
                  >
                    {o.ltNumero}
                  </span>
                </div>
              ) : null}
              <div className="meta">
                {tv.ic} {tv.nome} · {etapaInfo(o.etapa).nome}
                {a.txt ? " · " + a.txt : ""}
              </div>
            </div>
            <button className="x" onClick={onFechar}>
              ×
            </button>
          </div>
          <div className="steps">
            {ETAPAS.map((e, i) => (
              <div key={e.id} className={stepCls(i)} title={e.nome} />
            ))}
          </div>
          <div className="dtabs">
            <button className={aba === "resumo" ? "on" : ""} onClick={() => onAba("resumo")}>
              Resumo
            </button>
            <button className={aba === "docs" ? "on" : ""} onClick={() => onAba("docs")}>
              Documentos e itens <em>{docs.length + o.itens.length}</em>
            </button>
            <button className={aba === "hist" ? "on" : ""} onClick={() => onAba("hist")}>
              Histórico <em>{o.hist.length}</em>
            </button>
          </div>
        </div>

        {/* 2) situação */}
        {o.res || boxAcao || boxAprov ? (
          <div className="dst">
            {blocoResultado}
            {boxAcao}
            {boxAprov}
          </div>
        ) : null}

        {/* 3) conteúdo */}
        <div className="db" ref={corpo}>
          {aba === "resumo" ? (
            <>
              <div className="sec">
                <h3>Cliente</h3>
                <div className="grid">
                  <Campo label="Contato" valor={o.contato} ro={ro} onCommit={patchTxt("contato")} />
                  <Campo
                    label="Telefone / WhatsApp"
                    valor={o.tel}
                    ro={ro}
                    onCommit={patchTxt("tel")}
                  />
                  <Campo label="Cidade" valor={o.cidade} ro={ro} onCommit={patchTxt("cidade")} />
                  <Campo
                    label="Serviço"
                    tipo="select"
                    valor={o.servico}
                    ro={ro}
                    onCommit={patchTxt("servico")}
                  >
                    {SERVICOS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Campo>
                  <div className="f">
                    <label>Visita técnica</label>
                    <div className="ro">
                      {o.tecnico ? `${o.tecnico} · ${fdata(o.visita)}` : "—"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="sec">
                <h3>Proposta</h3>
                <div className="tvsel">
                  {(Object.keys(TIPOS_VENDA) as TipoVenda[]).map((id) => {
                    const t = TIPOS_VENDA[id];
                    return (
                      <button
                        key={id}
                        className={`${t.cls} ${tipoVenda(o) === id ? "on" : ""}`.trim()}
                        disabled={ro}
                        onClick={() => {
                          if (o.tv !== id) onPatch({ tv: id });
                        }}
                      >
                        {t.ic} {t.nome}
                      </button>
                    );
                  })}
                </div>
                <div className="grid">
                  {rec ? (
                    <>
                      <Campo
                        label="Tipo de contrato"
                        tipo="select"
                        valor={modalidadeId}
                        ro={ro}
                        onCommit={patchTxt("modalidade")}
                      >
                        {listaContratos(regras).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nome}
                          </option>
                        ))}
                      </Campo>
                      <Campo
                        label="Valor mensal (R$)"
                        tipo="number"
                        step="0.01"
                        min="0"
                        placeholder="0,00"
                        valor={o.valor}
                        ro={ro}
                        onCommit={patchNum("valor")}
                      />
                      <Campo
                        label="Prazo contratual (meses)"
                        tipo="number"
                        min="1"
                        valor={o.prazo}
                        ro={ro}
                        onCommit={patchNum("prazo")}
                      />
                      <Campo
                        label="Taxa de implantação (R$)"
                        tipo="number"
                        step="0.01"
                        min="0"
                        placeholder="0,00"
                        valor={o.total}
                        ro={ro}
                        onCommit={patchNum("total")}
                      />
                    </>
                  ) : (
                    <Campo
                      label="Valor total da venda (R$)"
                      tipo="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      valor={o.total}
                      ro={ro}
                      onCommit={patchNum("total")}
                    />
                  )}
                  <Campo
                    label="Validade da proposta"
                    tipo="date"
                    valor={o.validade}
                    ro={ro}
                    onCommit={patchTxt("validade")}
                  />
                  <Campo
                    label="Nº do orçamento"
                    placeholder="ORC-2026-00131"
                    valor={o.orc || ""}
                    ro={ro}
                    onCommit={patchTxt("orc")}
                  />
                </div>
                {o.validade && diasAte(o.validade) < 0 && !ro ? (
                  <div className="note">
                    A validade da proposta venceu em {fdata(o.validade)}. Revise valores antes do
                    próximo contato.
                  </div>
                ) : null}
              </div>

              <div className="sec">
                <h3>Equipe da oportunidade</h3>
                <div className="f">
                  <label>Vendedor responsável (fez o primeiro contato · conduz a venda)</label>
                  <select
                    value={o.vendedor}
                    disabled={ro}
                    onChange={(e) => {
                      if (e.target.value !== o.vendedor) onTrocarResponsavel(e.target.value);
                    }}
                  >
                    {[...new Set([o.vendedor, ...vendedores])].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="f" style={{ marginTop: 10 }}>
                  <label>Vendedores auxiliares</label>
                  <div className="chips">
                    {vendedores.filter((v) => v !== o.vendedor).map((v) => chip("aux", v))}
                  </div>
                </div>
                <div className="f" style={{ marginTop: 10 }}>
                  <label>Apoio técnico</label>
                  <div className="chips">
                    {tecnicos.map((t) =>
                      chip(
                        "apoio",
                        t,
                        t === o.tecnico ? (
                          <>
                            {" "}
                            <small>(fez a visita)</small>
                          </>
                        ) : null,
                      ),
                    )}
                  </div>
                </div>
                <div className="note">
                  👥 Quem participou desta oportunidade. Os valores de comissão são calculados só
                  depois do fechamento e ficam na aba <b>Comissões</b> (acesso restrito).
                </div>
              </div>
            </>
          ) : null}

          {aba === "docs" ? (
            <>
              <div className="sec">
                <h3>Orçamento e propostas anexadas</h3>
                {docs.length ? (
                  docs.map((d) => (
                    <div className="doc" key={d.id}>
                      <span className="di">{icDoc(d.nome)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            onAbrirDoc(d);
                          }}
                        >
                          {d.nome}
                        </a>
                        <div className="dm">
                          {d.etiqueta || ""} · {fdata(d.data)} · {d.autor} · {ftam(d.tam)}
                          {d.lido ? " · valores lidos automaticamente" : ""}
                        </div>
                      </div>
                      {!ro ? (
                        <button className="btn sm" title="Remover" onClick={() => onRemoverDoc(d)}>
                          ✕
                        </button>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="empty" style={{ textAlign: "left" }}>
                    Nenhum documento anexado.
                  </div>
                )}
                {!ro ? (
                  <button
                    className="btn sm"
                    style={{ marginTop: 6 }}
                    onClick={() => onAcao("anexo")}
                  >
                    📎 Anexar orçamento / proposta
                  </button>
                ) : null}
              </div>

              <div className="sec">
                <h3>Levantamento do técnico ({o.itens.length} itens)</h3>
                {o.ltNumero || o.os ? (
                  <div style={{ marginBottom: 8 }}>
                    <button
                      className="btn"
                      type="button"
                      disabled={ro || !o.itens.length}
                      onClick={() => onAcao("gerar_orcamento")}
                    >
                      Gerar orçamento
                      {o.ltNumero ? ` · ${o.ltNumero}` : ""}
                    </button>
                    <div className="note" style={{ marginTop: 6 }}>
                      Abre o orçamento local com os produtos do L.T. (preços pelo comercial). Depois
                      use &quot;Enviar pedido&quot; no módulo Orçamentos para criar a O.S. de
                      instalação no quadro — sem envio automático à Omie.
                    </div>
                  </div>
                ) : null}
                <table className="it">
                  <thead>
                    <tr>
                      <th>Qtd</th>
                      <th>Equipamento / material</th>
                      <th>Cód.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.itens.length ? (
                      o.itens.map((i, k) => (
                        <tr key={k}>
                          <td className="q">{i.q}</td>
                          <td>{i.d}</td>
                          <td>{i.codigoProduto ?? "—"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="empty">
                          Sem itens
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {aba === "hist" ? (
            <div className="sec">
              <h3>Histórico de ações</h3>
              {!ro ? (
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  <button className="btn sm" onClick={() => onAcao("nota")}>
                    + Anotação (cliente ligou, pediu algo…)
                  </button>
                </div>
              ) : null}
              <div className="tl">
                {o.hist
                  .slice()
                  .reverse()
                  .map((h, i) => (
                    <div
                      className="ev"
                      key={i}
                      style={{ "--c": CORES_HISTORICO[h.tipo] ?? "#999" } as CSSProperties}
                    >
                      <div className="h">
                        {fdata(h.data)} · {h.autor}
                      </div>
                      <div className="b">{h.texto}</div>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* 4) rodapé */}
        <div className="df">
          {acaoPrincipal[o.etapa]}
          {NEGOCIACAO.includes(o.etapa) ? btn("aprovado", "grn", "✍️ Cliente aprovou") : null}
          {SEGUIMENTO.includes(o.etapa) ? btn("final", "dark", "Finalizar") : null}
          {ro ? btn("reabrir", "", "Reabrir oportunidade") : null}
          <div className="sp" />
          <select
            className="btn"
            value={o.etapa}
            onChange={(e) => onMover(o.id, e.target.value as EtapaId)}
          >
            {ETAPAS.map((e) => (
              <option key={e.id} value={e.id}>
                Mover para: {e.nome}
              </option>
            ))}
          </select>
          {onExcluir ? (
            <button type="button" className="btn red" onClick={onExcluir}>
              Excluir
            </button>
          ) : null}
        </div>
      </aside>
    </div>
  );

  if (typeof document === "undefined") return painel;
  return createPortal(painel, document.body);
}
