import { useState, type Dispatch, type SetStateAction } from "react";
import { TIPOS_VENDA, VALIDADE_PADRAO } from "../../codigo/config";
import { addDias, brl, contratoDe, extrairValores, tipoVenda } from "../../codigo/regras";
import type { Oportunidade, RegrasComissao, TipoVenda } from "../../codigo/types";
import type { DadosProposta } from "../tipos-ui";
import { ftam, icDoc, listaContratos, msgErro } from "../utils";

type CampoAuto = "tv" | "orc" | "mensal" | "total" | "prazo" | "validade";
type Info =
  | { tipo: "lendo" }
  | { tipo: "ok"; itens: { rot: string; txt: string }[] }
  | { tipo: "warn"; msg: string }
  | null;

export interface FormDoc {
  arquivo: File | null;
  lido: boolean;
  tv: TipoVenda;
  orc: string;
  modalidade: string;
  mensal: string;
  total: string;
  prazo: string;
  validade: string;
  /** campos preenchidos automaticamente (ficam amarelos) */
  auto: Partial<Record<CampoAuto, boolean>>;
  info: Info;
}

/** Estado do bloco "anexo + valores da proposta". `novaProposta` = validade = hoje + 15 dias */
export function useFormDoc(
  o: Oportunidade,
  regras: RegrasComissao,
  novaProposta: boolean,
): [FormDoc, Dispatch<SetStateAction<FormDoc>>] {
  return useState<FormDoc>(() => ({
    arquivo: null,
    lido: false,
    tv: tipoVenda(o),
    orc: o.orc || "",
    modalidade: contratoDe(o, regras).id,
    mensal: o.valor ? String(o.valor) : "",
    total: o.total ? String(o.total) : "",
    prazo: o.prazo ? String(o.prazo) : "",
    validade: novaProposta ? addDias(VALIDADE_PADRAO) : o.validade || "",
    auto: {},
    info: null,
  }));
}

/** Converte o formulário para o payload da API (mesma lógica do salvarBlocoDoc do protótipo) */
export function formParaDados(f: FormDoc, o: Oportunidade): DadosProposta {
  const rec = f.tv === "recorrente";
  return {
    tv: f.tv,
    orc: f.orc.trim(),
    modalidade: rec ? f.modalidade : undefined,
    valor: rec ? +f.mensal || 0 : 0,
    total: +f.total || 0,
    prazo: +f.prazo || o.prazo,
    validade: f.validade || o.validade,
    arquivo: f.arquivo,
    lido: f.lido,
  };
}

interface Props {
  o: Oportunidade;
  regras: RegrasComissao;
  titulo: string;
  form: FormDoc;
  setForm: Dispatch<SetStateAction<FormDoc>>;
}

export function BlocoDocumento({ o, regras, titulo, form, setForm }: Props) {
  const rec = form.tv === "recorrente";
  const cls = (c: CampoAuto) => (form.auto[c] ? "auto" : "");
  const manual = (c: CampoAuto) => (p: FormDoc) => ({ ...p, auto: { ...p.auto, [c]: false } });

  const lerArquivo = async (f: File) => {
    setForm((p) => ({ ...p, arquivo: f, info: { tipo: "lendo" } }));
    try {
      // carregado sob demanda (pdf.js / jszip / xlsx são pesados)
      const { textoDoArquivo } = await import("../../codigo/leitor-documento");
      const x = extrairValores(await textoDoArquivo(f));
      setForm((p) => {
        const auto: FormDoc["auto"] = { ...p.auto };
        const itens: { rot: string; txt: string }[] = [];
        let tv = p.tv;
        if (x.mensal && tv !== "recorrente") {
          tv = "recorrente";
          auto.tv = true;
        }
        const n: Partial<FormDoc> = {};
        if (x.orc != null) {
          n.orc = x.orc;
          auto.orc = true;
          itens.push({ rot: "Nº orçamento", txt: x.orc });
        }
        if (x.mensal != null) {
          n.mensal = String(x.mensal);
          auto.mensal = true;
          itens.push({ rot: "Mensal", txt: brl(x.mensal) });
        }
        if (x.total != null) {
          n.total = String(x.total);
          auto.total = true;
          itens.push({ rot: x.mensal ? "Total / implantação" : "Total", txt: brl(x.total) });
        }
        if (x.prazo != null) {
          n.prazo = String(x.prazo);
          auto.prazo = true;
          itens.push({ rot: "Prazo (meses)", txt: String(x.prazo) });
        }
        return {
          ...p,
          ...n,
          tv,
          auto,
          arquivo: f,
          lido: !!(x.total || x.mensal),
          info: itens.length
            ? { tipo: "ok", itens }
            : {
                tipo: "warn",
                msg: "Não encontrei valores no documento. Preencha os campos abaixo.",
              },
        };
      });
    } catch (e) {
      setForm((p) => ({
        ...p,
        info: {
          tipo: "warn",
          msg: `Arquivo anexado, mas não consegui ler os valores (${msgErro(e)}). Preencha os campos abaixo.`,
        },
      }));
    }
  };

  const contratos = listaContratos(regras);

  return (
    <>
      <div className="f">
        <label>{titulo}</label>
        <label className="drop">
          <input
            type="file"
            accept=".pdf,.docx,.xlsx,.xls,.csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void lerArquivo(f);
            }}
          />
          <span>
            {form.arquivo ? (
              <>
                {icDoc(form.arquivo.name)} <b>{form.arquivo.name}</b>{" "}
                <small>({ftam(form.arquivo.size)})</small>
              </>
            ) : (
              <>
                📎 Toque para escolher o arquivo <small>(PDF, Word .docx ou Excel)</small>
              </>
            )}
          </span>
        </label>
        {o.docs?.length ? (
          <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 4 }}>
            Já anexados: {o.docs.map((d) => d.nome).join(", ")}
          </div>
        ) : null}
        <div>
          {form.info?.tipo === "lendo" ? <div className="lido">⏳ Lendo o documento…</div> : null}
          {form.info?.tipo === "ok" ? (
            <div className="lido">
              ✔ Encontrei no documento:
              <ul>
                {form.info.itens.map((i) => (
                  <li key={i.rot}>
                    <b>{i.rot}:</b> {i.txt}
                  </li>
                ))}
              </ul>
              Os campos em amarelo foram preenchidos automaticamente. <b>Confira antes de salvar</b>{" "}
              — você pode alterar.
            </div>
          ) : null}
          {form.info?.tipo === "warn" ? <div className="lido warn">{form.info.msg}</div> : null}
        </div>
      </div>

      <div className="f">
        <label>Tipo de venda</label>
        <select
          className={cls("tv")}
          value={form.tv}
          onChange={(e) => {
            const tv = e.target.value as TipoVenda;
            setForm((p) => ({ ...manual("tv")(p), tv }));
          }}
        >
          {(Object.keys(TIPOS_VENDA) as TipoVenda[]).map((id) => (
            <option key={id} value={id}>
              {TIPOS_VENDA[id].ic} {TIPOS_VENDA[id].nome}
            </option>
          ))}
        </select>
      </div>

      <div className="grid">
        <div className="f">
          <label>Nº do orçamento</label>
          <input
            className={cls("orc")}
            value={form.orc}
            placeholder="ORC-2026-00131"
            onChange={(e) => {
              const v = e.target.value;
              setForm((p) => ({ ...manual("orc")(p), orc: v }));
            }}
          />
        </div>
        {rec ? (
          <div className="f">
            <label>Tipo de contrato</label>
            <select
              value={form.modalidade}
              onChange={(e) => {
                const v = e.target.value;
                setForm((p) => ({ ...p, modalidade: v }));
              }}
            >
              {contratos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {rec ? (
          <div className="f">
            <label>Valor mensal (R$)</label>
            <input
              className={cls("mensal")}
              type="number"
              step="0.01"
              value={form.mensal}
              onChange={(e) => {
                const v = e.target.value;
                setForm((p) => ({ ...manual("mensal")(p), mensal: v }));
              }}
            />
          </div>
        ) : null}
        <div className="f">
          <label>{rec ? "Taxa de implantação (R$)" : "Valor total da venda (R$)"}</label>
          <input
            className={cls("total")}
            type="number"
            step="0.01"
            value={form.total}
            onChange={(e) => {
              const v = e.target.value;
              setForm((p) => ({ ...manual("total")(p), total: v }));
            }}
          />
        </div>
        {rec ? (
          <div className="f">
            <label>Prazo contratual (meses)</label>
            <input
              className={cls("prazo")}
              type="number"
              value={form.prazo}
              onChange={(e) => {
                const v = e.target.value;
                setForm((p) => ({ ...manual("prazo")(p), prazo: v }));
              }}
            />
          </div>
        ) : null}
        <div className="f">
          <label>Validade da proposta</label>
          <input
            className={cls("validade")}
            type="date"
            value={form.validade}
            onChange={(e) => {
              const v = e.target.value;
              setForm((p) => ({ ...manual("validade")(p), validade: v }));
            }}
          />
        </div>
      </div>
    </>
  );
}
