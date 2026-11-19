import { useCallback, useEffect, useMemo, useState } from "react";
import "../estilo/crm-comercial.css";
import { SERVICOS } from "../codigo/config";
import { brl, fdata, filtrar, kpisPainel, movimento, valorPrincipal } from "../codigo/regras";
import type { EtapaId, Oportunidade, RegrasComissao, TipoVenda } from "../codigo/types";
import { ComissoesView } from "./ComissoesView";
import { KanbanBoard } from "./KanbanBoard";
import { ModalAgendarAcao } from "./modals/AgendarAcao";
import { ModalAnexo } from "./modals/Anexo";
import { ModalAprovado } from "./modals/Aprovado";
import { ModalEncerrarContrato } from "./modals/EncerrarContrato";
import { ModalEnvio } from "./modals/Envio";
import { ModalFinalizar } from "./modals/Finalizar";
import { ModalMontado } from "./modals/Montado";
import { ModalNota } from "./modals/Nota";
import { ModalNovaOportunidade } from "./modals/NovaOportunidade";
import { ModalRegrasComissao } from "./modals/RegrasComissao";
import { ModalResultadoAcao } from "./modals/ResultadoAcao";
import { ModalVincularClienteOmie } from "./modals/VincularClienteOmie";
import { ModalVoltarReabrir } from "./modals/VoltarReabrir";
import { OpportunityDrawer, type AbaGaveta, type AcaoGaveta } from "./OpportunityDrawer";
import { RelatoriosView } from "./RelatoriosView";
import { useToast } from "./Toast";
import type { CrmAcoes, CrmView, UsuarioCrm } from "./tipos-ui";
import { msgErro, tipoAcao } from "./utils";

export interface CrmPageProps extends CrmAcoes {
  oportunidades: Oportunidade[];
  vendedores: string[];
  tecnicos: string[];
  eu: UsuarioCrm;
  regras: RegrasComissao;
  view: CrmView;
  onViewChange: (v: CrmView) => void;
}

/** Modal aberto no momento (os dados da oportunidade são sempre lidos de `oportunidades`, pelo id) */
type ModalAberto =
  | { k: "montado"; id: number }
  | { k: "envio"; id: number }
  | { k: "agendar"; id: number; n: 2 | 3; modo: "mover" | "reagendar" }
  | { k: "resultado"; id: number }
  | { k: "aprovado"; id: number; soPrevisao: boolean }
  | { k: "final"; id: number; pre?: "ganho" }
  | { k: "nota"; id: number }
  | { k: "anexo"; id: number }
  | { k: "nova" }
  | { k: "voltar"; id: number; destino: EtapaId }
  | { k: "reabrir"; id: number }
  | { k: "responsavel"; id: number; novo: string }
  | { k: "encerrar"; id: number }
  | { k: "omie"; id: number; destino: EtapaId }
  | { k: "regras" };

const NOME_ETAPA: Record<string, string> = {
  montar: "Orçamento a montar",
  montado: "Montado · a enviar",
  enviado: "Enviado ao cliente",
  acao2: "2ª ação",
  acao3: "3ª ação",
  aprovado: "Aprovado · aguardando",
  final: "Finalizado",
};

export function CrmPage(props: CrmPageProps) {
  const { oportunidades, vendedores, tecnicos, eu, regras, view, onViewChange } = props;
  const { toast, node: toastNode } = useToast();

  /* ---------- filtros ---------- */
  const [busca, setBusca] = useState("");
  const [fVend, setFVend] = useState("");
  const [fTipo, setFTipo] = useState<TipoVenda | "">("");
  const [fServ, setFServ] = useState("");
  const [soAtrasados, setSoAtrasados] = useState(false);
  const filtradas = useMemo(
    () =>
      filtrar(oportunidades, { busca, vendedor: fVend, servico: fServ, tipo: fTipo, soAtrasados }),
    [oportunidades, busca, fVend, fServ, fTipo, soAtrasados],
  );
  const kp = kpisPainel(filtradas);

  /* ---------- gaveta e modais ---------- */
  const [abertoId, setAbertoId] = useState<number | null>(null);
  const [aba, setAba] = useState<AbaGaveta>("resumo");
  const [modal, setModal] = useState<ModalAberto | null>(null);
  const aberta = abertoId != null ? oportunidades.find((o) => o.id === abertoId) : undefined;
  const op = (id: number) => oportunidades.find((o) => o.id === id);

  const abrir = (id: number) => {
    if (abertoId !== id) setAba("resumo");
    setAbertoId(id);
  };
  const fechar = useCallback(() => setAbertoId(null), []);
  const fecharModal = useCallback(() => setModal(null), []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (modal) setModal(null);
      else if (abertoId != null) setAbertoId(null);
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [modal, abertoId]);

  // se a oportunidade aberta sumiu da lista (ex.: removida), fecha a gaveta
  useEffect(() => {
    if (abertoId != null && !aberta && oportunidades.length) setAbertoId(null);
  }, [abertoId, aberta, oportunidades.length]);

  /** Roda a API; fecha o modal cedo para a UI não ficar presa; depois atualiza a lista. */
  const executar = async (fn: () => Promise<void>, msg?: string, depois?: () => void) => {
    await fn();
    setModal(null);
    if (msg) toast(msg);
    depois?.();
    try {
      await props.refresh();
    } catch (e) {
      toast(msgErro(e));
    }
  };
  /** Ações fora de modal: erro vira toast */
  const silencioso = async (fn: () => Promise<void>, msg?: string) => {
    try {
      await fn();
      await props.refresh();
      if (msg) toast(msg);
    } catch (e) {
      toast(msgErro(e));
    }
  };

  /* ---------- movimentação (arrastar ou "Mover para") ---------- */
  const mover = (id: number, destino: EtapaId) => {
    const o = op(id);
    if (!o) return;
    const r = movimento(o, destino);
    if (!r.ok) {
      if (r.precisaOmie) {
        toast(r.erro);
        abrir(id);
        setModal({ k: "omie", id, destino });
        return;
      }
      if (r.erro) {
        toast(r.erro);
        if (
          !valorPrincipal(o) &&
          (destino === "acao2" || destino === "acao3" || destino === "aprovado") &&
          o.etapa !== "final"
        )
          abrir(id);
      }
      return;
    }
    // nunca muda a etapa direto: abre o modal; cancelar não altera nada
    switch (r.modal) {
      case "voltar":
        setModal({ k: "voltar", id, destino });
        break;
      case "montado":
        setModal({ k: "montado", id });
        break;
      case "envio":
        setModal({ k: "envio", id });
        break;
      case "agendar2":
        setModal({ k: "agendar", id, n: 2, modo: "mover" });
        break;
      case "agendar3":
        setModal({ k: "agendar", id, n: 3, modo: "mover" });
        break;
      case "aprovado":
        setModal({ k: "aprovado", id, soPrevisao: false });
        break;
      case "final":
        setModal({ k: "final", id });
        break;
    }
  };

  const acaoGaveta = (o: Oportunidade, a: AcaoGaveta) => {
    switch (a) {
      case "montado":
        return mover(o.id, "montado");
      case "enviado":
        return mover(o.id, "enviado");
      case "acao2":
        return mover(o.id, "acao2");
      case "acao3":
        return mover(o.id, "acao3");
      case "aprovado":
        return mover(o.id, "aprovado");
      case "final":
        return mover(o.id, "final");
      case "nota":
        setAba("hist");
        return setModal({ k: "nota", id: o.id });
      case "anexo":
        return setModal({ k: "anexo", id: o.id });
      case "recebido":
        return setModal({ k: "final", id: o.id, pre: "ganho" });
      case "reprev":
        return setModal({ k: "aprovado", id: o.id, soPrevisao: true });
      case "feita":
        return setModal({ k: "resultado", id: o.id });
      case "reagendar":
        return setModal({
          k: "agendar",
          id: o.id,
          n: o.etapa === "acao3" ? 3 : 2,
          modo: "reagendar",
        });
      case "reabrir":
        return setModal({ k: "reabrir", id: o.id });
      case "encerrar":
        return setModal({ k: "encerrar", id: o.id });
      case "reativar":
        return void silencioso(
          () => props.encerrarContrato(o.id, null),
          "Encerramento do contrato desfeito",
        );
      case "gerar_orcamento":
        return void (async () => {
          try {
            const res = await props.gerarOrcamento(o.id);
            toast(
              res.already
                ? `Orçamento já existia: ${res.numeroInterno}`
                : `Orçamento criado: ${res.numeroInterno}`,
            );
            await props.refresh();
            if (typeof window !== "undefined") {
              window.open(`/orcamentos?quoteId=${res.quoteId}`, "_blank");
            }
          } catch (e) {
            toast(msgErro(e));
          }
        })();
    }
  };

  /* ---------- modal atual ---------- */
  const renderModal = () => {
    if (!modal) return null;
    if (modal.k === "nova") {
      return (
        <ModalNovaOportunidade
          vendedores={vendedores}
          vendedorPadrao={eu.nome}
          onCancel={fecharModal}
          onConfirm={async (d) => {
            // create já atualiza a lista local — evita listCrmOportunidadesFn extra.
            await props.create(d);
            setModal(null);
            toast("Oportunidade criada em “Orçamento a montar”");
          }}
        />
      );
    }
    if (modal.k === "regras") {
      if (!eu.comissoes) return null;
      return (
        <ModalRegrasComissao
          regras={regras}
          onCancel={fecharModal}
          onConfirm={(r) => executar(() => props.saveRegras(r), "Regras de comissão salvas")}
        />
      );
    }
    if (modal.k === "omie") {
      const oOmie = op(modal.id);
      if (!oOmie) return null;
      const destinoOmie = modal.destino;
      return (
        <ModalVincularClienteOmie
          clientePadrao={oOmie.cliente}
          contatoPadrao={oOmie.contato}
          telefonePadrao={oOmie.tel}
          cidadePadrao={oOmie.cidade}
          onCancel={fecharModal}
          onConfirm={async (c) => {
            await props.vincularOmie(oOmie.id, c);
            toast("Cliente vinculado à Omie");
            // Estado do pai ainda pode estar velho neste tick — segue com OP já vinculada.
            const comOmie: Oportunidade = {
              ...oOmie,
              omieAppId: c.omieAppId,
              codigoClienteOmie: c.codigoClienteOmie,
              cliente: c.cliente || oOmie.cliente,
              contato: c.contato || oOmie.contato,
              tel: c.tel || oOmie.tel,
              cidade: c.cidade || oOmie.cidade,
            };
            const r = movimento(comOmie, destinoOmie);
            if (!r.ok) {
              setModal(null);
              if (r.erro) toast(r.erro);
              return;
            }
            switch (r.modal) {
              case "voltar":
                setModal({ k: "voltar", id: oOmie.id, destino: destinoOmie });
                break;
              case "montado":
                setModal({ k: "montado", id: oOmie.id });
                break;
              case "envio":
                setModal({ k: "envio", id: oOmie.id });
                break;
              case "agendar2":
                setModal({ k: "agendar", id: oOmie.id, n: 2, modo: "mover" });
                break;
              case "agendar3":
                setModal({ k: "agendar", id: oOmie.id, n: 3, modo: "mover" });
                break;
              case "aprovado":
                setModal({ k: "aprovado", id: oOmie.id, soPrevisao: false });
                break;
              case "final":
                setModal({ k: "final", id: oOmie.id });
                break;
            }
          }}
        />
      );
    }
    const o = op(modal.id);
    if (!o) return null;
    const id = o.id;
    switch (modal.k) {
      case "montado":
        return (
          <ModalMontado
            o={o}
            regras={regras}
            onCancel={fecharModal}
            onConfirm={(d) =>
              executar(() => props.montado(id, d), "Movido para “Montado · a enviar”")
            }
          />
        );
      case "envio":
        return (
          <ModalEnvio
            o={o}
            regras={regras}
            onCancel={fecharModal}
            onConfirm={(d) =>
              executar(() => props.envio(id, d), "Movido para “Enviado ao cliente”")
            }
          />
        );
      case "agendar":
        return (
          <ModalAgendarAcao
            o={o}
            n={modal.n}
            modo={modal.modo}
            onCancel={fecharModal}
            onConfirm={(d) =>
              executar(
                () => props.agendar(id, d),
                `${d.n}ª ação agendada: ${tipoAcao(d.tipo).nome} · ${fdata(d.data)}${d.hora ? " " + d.hora : ""}`,
              )
            }
          />
        );
      case "resultado":
        return (
          <ModalResultadoAcao
            o={o}
            onCancel={fecharModal}
            onConfirm={(d) =>
              executar(
                () => props.resultado(id, d),
                d.proximo === "aguardar"
                  ? "Resultado registrado. Defina o próximo passo depois."
                  : undefined,
                () => {
                  if (d.proximo === "acao3") setModal({ k: "agendar", id, n: 3, modo: "mover" });
                  else if (d.proximo === "final") setModal({ k: "final", id });
                },
              )
            }
          />
        );
      case "aprovado":
        return modal.soPrevisao ? (
          <ModalAprovado
            o={o}
            soPrevisao
            onCancel={fecharModal}
            onConfirm={(d) => executar(() => props.previsao(id, d), "Previsão atualizada")}
          />
        ) : (
          <ModalAprovado
            o={o}
            soPrevisao={false}
            onCancel={fecharModal}
            onConfirm={(d) =>
              executar(() => props.aprovar(id, d), "Movido para “Aprovado · aguardando”")
            }
          />
        );
      case "final":
        return (
          <ModalFinalizar
            o={o}
            pre={modal.pre}
            onCancel={fecharModal}
            onConfirm={(d) =>
              executar(
                () => props.finalizar(id, d),
                d.st === "ganho"
                  ? "Fechado! OS de instalação criada no Quadro de OS."
                  : "Finalizado como não fechado.",
              )
            }
          />
        );
      case "nota":
        return (
          <ModalNota
            o={o}
            onCancel={fecharModal}
            onConfirm={(t) => executar(() => props.nota(id, t), "Anotação registrada")}
          />
        );
      case "anexo":
        return (
          <ModalAnexo
            o={o}
            regras={regras}
            onCancel={fecharModal}
            onConfirm={(d) => executar(() => props.uploadDoc(id, d), "Documento anexado")}
          />
        );
      case "voltar":
        return (
          <ModalVoltarReabrir
            titulo={`Voltar para “${NOME_ETAPA[modal.destino] ?? modal.destino}”`}
            rotulo="Por que está voltando esta oportunidade?"
            onCancel={fecharModal}
            onConfirm={(t) =>
              executar(
                () => props.voltar(id, modal.destino, t),
                `Voltou para “${NOME_ETAPA[modal.destino] ?? modal.destino}”`,
              )
            }
          />
        );
      case "reabrir":
        return (
          <ModalVoltarReabrir
            titulo="Reabrir oportunidade"
            rotulo="Motivo da reabertura (ex.: cliente voltou a negociar)"
            onCancel={fecharModal}
            onConfirm={(t) =>
              executar(
                () => props.reabrir(id, t),
                "Oportunidade reaberta",
                () => setModal({ k: "agendar", id, n: 2, modo: "reagendar" }),
              )
            }
          />
        );
      case "responsavel":
        return (
          <ModalVoltarReabrir
            titulo={`Trocar responsável: ${o.vendedor} → ${modal.novo}`}
            rotulo="Motivo da troca (o responsável é quem fez o primeiro contato)"
            onCancel={fecharModal}
            onConfirm={(t) =>
              executar(
                () => props.equipe(id, { vendedor: modal.novo, motivo: t }),
                "Responsável alterado",
              )
            }
          />
        );
      case "encerrar":
        return (
          <ModalEncerrarContrato
            o={o}
            onCancel={fecharModal}
            onConfirm={(d) =>
              executar(() => props.encerrarContrato(id, d), "Encerramento do contrato registrado")
            }
          />
        );
    }
  };

  /* ---------- tela ---------- */
  const filtrosAtivos = { vendedor: fVend, tipo: fTipo, servico: fServ };
  const sm = (t: string) => (
    <small style={{ fontSize: 12, color: "var(--mut)", fontWeight: 400 }}>{t}</small>
  );
  const aprovTxt =
    [
      kp.aprovadosExe ? "🔧 " + brl(kp.aprovadosExe) : "",
      kp.aprovadosRec ? "🔁 " + brl(kp.aprovadosRec) + "/mês" : "",
    ]
      .filter(Boolean)
      .join(" · ") || "—";

  return (
    <div className="crm-root" style={{ padding: "16px 20px 24px", maxWidth: "100%", overflowX: "hidden" }}>
      <div className="main">
        <div className="top" style={{ borderRadius: 12, paddingLeft: 20, paddingRight: 20 }}>
          <div>
            <div className="crumb">Comercial › CRM</div>
            <h1>Oportunidades</h1>
          </div>
          <div className="sp" />
          <div className="seg">
            <button
              className={view === "quadro" ? "on" : ""}
              onClick={() => onViewChange("quadro")}
            >
              Quadro
            </button>
            <button
              className={view === "relatorios" ? "on" : ""}
              onClick={() => onViewChange("relatorios")}
            >
              Relatórios
            </button>
            {eu.comissoes || eu.isVendedor ? (
              <button
                className={view === "comissoes" ? "on" : ""}
                onClick={() => onViewChange("comissoes")}
              >
                {eu.comissoes ? "🔒 Comissões" : "💰 Minhas comissões"}
              </button>
            ) : null}
          </div>
          <button className="btn pri" onClick={() => setModal({ k: "nova" })}>
            + Nova oportunidade
          </button>
        </div>

        <div className="filters">
          <input
            type="search"
            placeholder="Buscar cliente, cidade, nº OP ou OS…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <select value={fVend} onChange={(e) => setFVend(e.target.value)}>
            <option value="">Todos os vendedores</option>
            {vendedores.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select value={fTipo} onChange={(e) => setFTipo(e.target.value as TipoVenda | "")}>
            <option value="">Execução e recorrente</option>
            <option value="execucao">🔧 Venda de execução</option>
            <option value="recorrente">🔁 Venda recorrente (contratos)</option>
          </select>
          <select value={fServ} onChange={(e) => setFServ(e.target.value)}>
            <option value="">Todos os serviços</option>
            {SERVICOS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label className="chk">
            <input
              type="checkbox"
              checked={soAtrasados}
              onChange={(e) => setSoAtrasados(e.target.checked)}
            />{" "}
            Só atrasados / vencendo hoje
          </label>
          <div className="sp" />
          <span style={{ fontSize: 12, color: "var(--mut)" }}>
            Arraste os cards entre as colunas (ou abra o card → “Mover para”)
          </span>
        </div>

        <div className="kpis">
          <div className="kpi">
            <span>Oportunidades em aberto</span>
            <b>{kp.abertos}</b>
            <span>
              🔧 {kp.abertosExe} execução · 🔁 {kp.abertosRec} recorrente
            </span>
          </div>
          <div className="kpi exe">
            <span>🔧 Execução em negociação</span>
            <b>{brl(kp.negociacaoExe)}</b>
            <span>valor total das vendas</span>
          </div>
          <div className="kpi rec">
            <span>🔁 Recorrente em negociação</span>
            <b>
              {brl(kp.negociacaoRec)}
              {sm(" /mês")}
            </b>
            <span>contratos</span>
          </div>
          <div className="kpi exe">
            <span>🔧 Execução fechada (30 dias)</span>
            <b>{brl(kp.fechadoExe30)}</b>
            <span>{kp.qtdExe30} venda(s)</span>
          </div>
          <div className="kpi rec">
            <span>🔁 Recorrente fechado (30 dias)</span>
            <b>
              {brl(kp.fechadoRec30)}
              {sm(" /mês")}
            </b>
            <span>{kp.qtdRec30} contrato(s)</span>
          </div>
          <div className="kpi apr">
            <span>✍️ Aprovados · aguardando assinatura</span>
            <b>{kp.aprovados}</b>
            <span>{aprovTxt}</span>
          </div>
          <div className={`kpi ${kp.pendencias ? "alert" : ""}`.trim()}>
            <span>Pendências / atrasadas</span>
            <b>{kp.pendencias}</b>
          </div>
          <div className="kpi">
            <span>Conversão (30 dias)</span>
            <b>{kp.conversao30}%</b>
            <span>
              {kp.ganhos30} de {kp.finalizados30} finalizadas
            </span>
          </div>
        </div>

        {view === "quadro" ? (
          <KanbanBoard oportunidades={filtradas} onOpen={abrir} onMove={mover} />
        ) : null}
        {view === "relatorios" ? (
          <RelatoriosView
            oportunidades={filtradas}
            vendedores={vendedores}
            eu={eu}
            regras={regras}
            filtros={filtrosAtivos}
            onToast={toast}
          />
        ) : null}
        {view === "comissoes" ? (
          <ComissoesView
            oportunidades={filtradas}
            vendedores={vendedores}
            eu={eu}
            regras={regras}
            onRegras={() => setModal({ k: "regras" })}
            onToast={toast}
          />
        ) : null}
      </div>

      {aberta ? (
        <OpportunityDrawer
          key={aberta.id}
          o={aberta}
          vendedores={vendedores}
          tecnicos={tecnicos}
          regras={regras}
          eu={eu}
          aba={aba}
          onAba={setAba}
          onFechar={fechar}
          onMover={mover}
          onAcao={(a) => acaoGaveta(aberta, a)}
          onPatch={(campos) => void silencioso(() => props.patch(aberta.id, campos))}
          onEquipe={(d) => void silencioso(() => props.equipe(aberta.id, d))}
          onTrocarResponsavel={(novo) => setModal({ k: "responsavel", id: aberta.id, novo })}
          onAbrirDoc={(d) =>
            props.abrirDocumento
              ? props.abrirDocumento(d)
              : toast("Arquivo indisponível neste navegador.")
          }
          onRemoverDoc={(d) => {
            if (window.confirm("Remover " + d.nome + "?"))
              void silencioso(() => props.deleteDoc(aberta.id, d.id), "Anexo removido");
          }}
          onExcluir={() => {
            if (
              !window.confirm(
                `Excluir a oportunidade ${aberta.cod} (${aberta.cliente})? Esta ação não pode ser desfeita.`,
              )
            ) {
              return;
            }
            void silencioso(async () => {
              await props.deleteOportunidade(aberta.id);
              fechar();
            }, "Oportunidade excluída");
          }}
        />
      ) : null}

      {renderModal()}
      {toastNode}
    </div>
  );
}
