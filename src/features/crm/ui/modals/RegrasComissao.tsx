import { useState } from "react";
import { COMISSAO_PADRAO } from "../../codigo/config";
import type { RegrasComissao, TipoContrato } from "../../codigo/types";
import { Modal, ModalErro, useSubmeter } from "../Modal";
import { listaContratos } from "../utils";

interface Props {
  regras: RegrasComissao;
  onConfirm: (r: RegrasComissao) => Promise<void>;
  onCancel: () => void;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// estilos das linhas da tabela de tipos de contrato (iguais ao <style> inline do protótipo)
const CSS_TROW =
  ".trow{display:grid;grid-template-columns:1fr 210px 74px 74px 38px;gap:6px;align-items:center;margin:4px 0}.trow.th{font-size:11.5px;color:var(--mut);font-weight:600}.trow input,.trow select{border:1px solid var(--line);border-radius:8px;padding:7px 8px;font:inherit;min-width:0;background:#fff}@media(max-width:700px){.trow{grid-template-columns:1fr 1fr 60px 60px 34px}}";

type Linha = {
  id: string;
  nome: string;
  modo: "mensal" | "primeira";
  venda: string;
  equipe: string;
};
const paraLinhas = (L: TipoContrato[]): Linha[] =>
  L.map((t) => ({
    id: t.id,
    nome: t.nome,
    modo: t.modo,
    venda: String(t.venda),
    equipe: String(t.equipe),
  }));

/** Regras de comissão — só Administrador / Financeiro (quem chama já esconde sem a permissão) */
export function ModalRegrasComissao({ regras, onConfirm, onCancel }: Props) {
  const inicial = (R: RegrasComissao) => ({
    ev: String(R.execucao.venda),
    ee: String(R.execucao.equipe),
    inicio: String(+R.recorrente?.inicio || 0),
    impl: !!R.recorrente?.implantacao,
    wa: String(R.pesos.auxiliar),
    wt: String(R.pesos.apoio),
    tipos: paraLinhas(listaContratos(R)),
  });
  const [f, setF] = useState(() => inicial(regras));
  const { erro, setErro, ocupado, enviar } = useSubmeter();

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const setTipo = (i: number, k: keyof Linha, v: string) =>
    setF((p) => ({ ...p, tipos: p.tipos.map((t, j) => (j === i ? { ...t, [k]: v } : t)) }));

  const remover = (i: number) => {
    if (f.tipos.length <= 1) {
      setErro("Mantenha pelo menos um tipo de contrato.");
      return;
    }
    setErro("");
    setF((p) => ({ ...p, tipos: p.tipos.filter((_, j) => j !== i) }));
  };
  const adicionar = () =>
    setF((p) => ({
      ...p,
      tipos: [
        ...p.tipos,
        {
          id: "t" + Date.now().toString(36),
          nome: "Novo tipo",
          modo: "primeira",
          venda: "0",
          equipe: "0",
        },
      ],
    }));
  const voltarPadrao = () => {
    setErro("");
    setF(inicial(clone(COMISSAO_PADRAO)));
  };

  const salvar = () =>
    enviar(async (): Promise<string | void> => {
      if (f.tipos.some((t) => !t.nome.trim())) return "Dê um nome a cada tipo de contrato.";
      const n = (s: string) => +s || 0;
      await onConfirm({
        execucao: { venda: n(f.ev), equipe: n(f.ee) },
        recorrente: { implantacao: f.impl, inicio: +f.inicio === 1 ? 1 : 0 },
        contratos: f.tipos.map((t) => ({
          id: t.id,
          nome: t.nome.trim(),
          modo: t.modo === "mensal" ? ("mensal" as const) : ("primeira" as const),
          venda: n(t.venda),
          equipe: n(t.equipe),
        })),
        pesos: { auxiliar: n(f.wa), apoio: n(f.wt) },
      });
    });

  const num = (id: string, v: string, rot: string, onChange: (v: string) => void) => (
    <div className="f">
      <label>{rot}</label>
      <input
        type="number"
        step="0.1"
        min="0"
        id={id}
        value={v}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );

  return (
    <Modal
      titulo="Regras de comissão"
      largo
      onClose={onCancel}
      rodape={
        <>
          <button className="btn" onClick={voltarPadrao} disabled={ocupado}>
            Voltar padrão
          </button>
          <div className="sp" />
          <button className="btn" onClick={onCancel} disabled={ocupado}>
            Cancelar
          </button>
          <button className="btn pri" onClick={salvar} disabled={ocupado}>
            Salvar
          </button>
        </>
      }
    >
      <div className="note" style={{ marginTop: 0 }}>
        Só o administrador / financeiro vê e altera estas regras; o vendedor só escolhe o tipo de
        venda e de contrato e a comissão é calculada sozinha. Cada fechamento grava as regras do
        dia. O <b>responsável</b> recebe a <b>comissão de venda</b>; a <b>comissão de equipe</b> é{" "}
        <b>dividida</b> entre auxiliares e apoio técnico (sem participantes, não é paga).
      </div>
      <b>🔧 Venda de execução</b>{" "}
      <small style={{ color: "var(--mut)" }}>(sobre o valor total, paga uma vez)</small>
      <div className="grid">
        {num("cEv", f.ev, "Comissão de venda (%)", (v) => set("ev", v))}
        {num("cEe", f.ee, "Comissão de equipe (%)", (v) => set("ee", v))}
      </div>
      <b>🔁 Venda recorrente — por tipo de contrato</b>
      <style>{CSS_TROW}</style>
      <div style={{ margin: "6px 0" }}>
        <div className="trow th">
          <span>Tipo de contrato</span>
          <span>Forma de pagar</span>
          <span>Venda %</span>
          <span>Equipe %</span>
          <span></span>
        </div>
        {f.tipos.map((t, i) => (
          <div className="trow" key={t.id}>
            <input value={t.nome} onChange={(e) => setTipo(i, "nome", e.target.value)} />
            <select value={t.modo} onChange={(e) => setTipo(i, "modo", e.target.value)}>
              <option value="mensal">Mensal durante o contrato</option>
              <option value="primeira">% da 1ª parcela (uma vez)</option>
            </select>
            <input
              type="number"
              step="0.1"
              min="0"
              value={t.venda}
              onChange={(e) => setTipo(i, "venda", e.target.value)}
            />
            <input
              type="number"
              step="0.1"
              min="0"
              value={t.equipe}
              onChange={(e) => setTipo(i, "equipe", e.target.value)}
            />
            <button className="btn" onClick={() => remover(i)} title="Remover">
              ✕
            </button>
          </div>
        ))}
      </div>
      <button className="btn" onClick={adicionar}>
        + Tipo de contrato
      </button>
      <small style={{ color: "var(--mut)", display: "block", marginTop: 6 }}>
        <b>Mensal:</b> % de cada mensalidade, todo mês, pelo prazo do contrato (36 meses = 36
        parcelas). <b>% da 1ª parcela:</b> paga uma vez só — ex.: 80% de uma mensalidade de R$ 300 =
        R$ 240.
      </small>
      <div className="grid" style={{ marginTop: 8 }}>
        <div className="f">
          <label>Mês da 1ª parcela da comissão</label>
          <select value={f.inicio} onChange={(e) => set("inicio", e.target.value)}>
            <option value="0">No mês do fechamento</option>
            <option value="1">No mês seguinte</option>
          </select>
        </div>
        <div className="f">
          <label>&nbsp;</label>
          <label className="chk">
            <input
              type="checkbox"
              checked={f.impl}
              onChange={(e) => set("impl", e.target.checked)}
            />{" "}
            Pagar também sobre a taxa de implantação (uma vez, com a 1ª parcela)
          </label>
        </div>
      </div>
      <b>Divisão da comissão de equipe entre os participantes (peso de cada papel)</b>
      <div className="grid">
        {num("cWa", f.wa, "Vendedor auxiliar", (v) => set("wa", v))}
        {num("cWt", f.wt, "Apoio técnico", (v) => set("wt", v))}
      </div>
      <ModalErro msg={erro} />
    </Modal>
  );
}
