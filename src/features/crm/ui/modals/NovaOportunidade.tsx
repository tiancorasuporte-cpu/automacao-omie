import { useEffect, useRef, useState } from "react";
import { getCrmOmieClienteDetalhesFn, searchCrmOmieClientesFn } from "@/lib/crm";
import { SERV_RECORRENTE, SERVICOS, TIPOS_VENDA } from "../../codigo/config";
import type { TipoVenda } from "../../codigo/types";
import { Modal, ModalErro, useSubmeter } from "../Modal";
import type { NovaOportunidadeDados } from "../tipos-ui";
import {
  ModalCadastroClienteOmie,
  type ClienteOmieCriado,
} from "./CadastroClienteOmie";

type ClienteBusca = {
  codigo: number;
  nome: string;
  cnpjCpf: string | null;
  cidade: string | null;
  contato: string | null;
};

interface Props {
  vendedores: string[];
  /** vendedor pré-selecionado (ex.: quem está logado) */
  vendedorPadrao?: string | undefined;
  onConfirm: (d: NovaOportunidadeDados) => Promise<void>;
  onCancel: () => void;
}

const sugerirTv = (servico: string): TipoVenda =>
  SERV_RECORRENTE.includes(servico) ? "recorrente" : "execucao";

export function ModalNovaOportunidade({ vendedores, vendedorPadrao, onConfirm, onCancel }: Props) {
  const [cliente, setCliente] = useState("");
  const [contato, setContato] = useState("");
  const [tel, setTel] = useState("");
  const [cidade, setCidade] = useState("");
  const [servico, setServico] = useState<string>(SERVICOS[0] ?? "");
  const [tv, setTv] = useState<TipoVenda>(sugerirTv(SERVICOS[0] ?? ""));
  const [vendedor, setVendedor] = useState(
    vendedorPadrao && vendedores.includes(vendedorPadrao) ? vendedorPadrao : (vendedores[0] ?? ""),
  );
  const [omieAppId, setOmieAppId] = useState<string | null>(null);
  const [codigoClienteOmie, setCodigoClienteOmie] = useState<number | null>(null);
  const [cadastroOmie, setCadastroOmie] = useState(false);
  const [sugestoes, setSugestoes] = useState<ClienteBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [vinculado, setVinculado] = useState(false);
  const buscaSeq = useRef(0);
  const { erro, ocupado, enviar } = useSubmeter();

  useEffect(() => {
    if (vinculado || cadastroOmie) {
      setSugestoes([]);
      setBuscando(false);
      return;
    }
    const q = cliente.trim();
    if (q.length < 2) {
      setSugestoes([]);
      setBuscando(false);
      return;
    }
    const seq = ++buscaSeq.current;
    setBuscando(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await searchCrmOmieClientesFn({ data: { query: q } });
          if (seq !== buscaSeq.current) return;
          setOmieAppId((prev) => prev ?? res.omieAppId);
          setSugestoes(
            res.items.map((c) => ({
              codigo: c.codigo,
              nome: c.nome,
              cnpjCpf: c.cnpjCpf,
              cidade: c.cidade,
              contato: c.contato,
            })),
          );
        } catch {
          if (seq !== buscaSeq.current) return;
          setSugestoes([]);
        } finally {
          if (seq === buscaSeq.current) setBuscando(false);
        }
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [cliente, vinculado, cadastroOmie]);

  const limparVinculoOmie = () => {
    setCodigoClienteOmie(null);
    setOmieAppId(null);
    setVinculado(false);
  };

  const aplicarClienteOmie = (c: ClienteOmieCriado) => {
    setCliente(c.nomeFantasia || c.razaoSocial);
    setContato(c.contato || contato);
    setTel(c.telefone || tel);
    setCidade(c.cidade || cidade);
    setOmieAppId(c.omieAppId);
    setCodigoClienteOmie(c.codigoClienteOmie);
    setVinculado(true);
    setSugestoes([]);
    setCadastroOmie(false);
  };

  const selecionarClienteOmie = (c: ClienteBusca) => {
    setCliente(c.nome);
    if (c.contato) setContato(c.contato);
    if (c.cidade) setCidade(c.cidade);
    setCodigoClienteOmie(c.codigo);
    setVinculado(true);
    setSugestoes([]);
    void (async () => {
      try {
        const det = await getCrmOmieClienteDetalhesFn({ data: { clientCode: c.codigo } });
        if (!det) return;
        setOmieAppId(det.omieAppId);
        setCliente(det.nome || c.nome);
        if (det.contato) setContato(det.contato);
        if (det.telefone) setTel(det.telefone);
        if (det.cidade) setCidade(det.cidade);
      } catch {
        // mantém dados da busca local
      }
    })();
  };

  const criar = () =>
    enviar(async (): Promise<string | void> => {
      const c = cliente.trim();
      if (!c) return "Informe o cliente.";
      await onConfirm({
        cliente: c,
        contato,
        tel,
        cidade,
        servico,
        tv,
        vendedor,
        omieAppId,
        codigoClienteOmie,
      });
    });

  if (cadastroOmie) {
    return (
      <ModalCadastroClienteOmie
        razaoSocialPadrao={cliente}
        contatoPadrao={contato}
        telefonePadrao={tel}
        cidadePadrao={cidade}
        onCancel={() => setCadastroOmie(false)}
        onSuccess={aplicarClienteOmie}
      />
    );
  }

  return (
    <Modal
      titulo="Nova oportunidade (sem visita técnica)"
      onClose={onCancel}
      rodape={
        <>
          <button className="btn" onClick={onCancel} disabled={ocupado}>
            Cancelar
          </button>
          <button className="btn pri" onClick={criar} disabled={ocupado}>
            Criar
          </button>
        </>
      }
    >
      <div className="note" style={{ marginTop: 0 }}>
        Normalmente a oportunidade nasce sozinha quando o técnico finaliza uma OS de orçamento. Use
        aqui para indicação, cliente que ligou etc.
      </div>
      <div className="f">
        <label>Cliente *</label>
        {vinculado && codigoClienteOmie ? (
          <div className="cliente-omie-pick">
            <div className="cliente-omie-pick-info">
              <div className="cliente-omie-pick-nome">{cliente}</div>
              <div className="note" style={{ marginTop: 4 }}>
                Omie #{codigoClienteOmie} — será gravado na oportunidade.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button
                type="button"
                className="btn sm"
                disabled={ocupado}
                onClick={() => {
                  limparVinculoOmie();
                  setCliente("");
                  setSugestoes([]);
                }}
              >
                Trocar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div className="cliente-omie-busca" style={{ flex: 1 }}>
                <input
                  value={cliente}
                  placeholder="Buscar cliente Omie (mín. 2 letras)"
                  autoComplete="off"
                  onChange={(e) => {
                    setCliente(e.target.value);
                    limparVinculoOmie();
                  }}
                />
                {buscando ? (
                  <div className="cliente-omie-hint">Buscando na Omie…</div>
                ) : null}
                {sugestoes.length > 0 ? (
                  <ul className="cliente-omie-lista">
                    {sugestoes.map((c) => (
                      <li key={c.codigo}>
                        <button type="button" onClick={() => selecionarClienteOmie(c)}>
                          <span className="cliente-omie-lista-nome">{c.nome}</span>
                          <span className="cliente-omie-lista-meta">
                            #{c.codigo}
                            {c.cnpjCpf ? ` · ${c.cnpjCpf}` : ""}
                            {c.cidade ? ` · ${c.cidade}` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <button
                type="button"
                className="btn sm"
                disabled={ocupado}
                onClick={() => setCadastroOmie(true)}
                title="Abrir formulário e enviar cadastro para a Omie"
              >
                Cadastrar na Omie
              </button>
            </div>
          </>
        )}
      </div>
      <div className="grid">
        <div className="f">
          <label>Contato</label>
          <input value={contato} onChange={(e) => setContato(e.target.value)} />
        </div>
        <div className="f">
          <label>Telefone</label>
          <input value={tel} onChange={(e) => setTel(e.target.value)} />
        </div>
        <div className="f">
          <label>Cidade</label>
          <input value={cidade} onChange={(e) => setCidade(e.target.value)} />
        </div>
        <div className="f">
          <label>Serviço</label>
          <select
            value={servico}
            onChange={(e) => {
              setServico(e.target.value);
              setTv(sugerirTv(e.target.value));
            }}
          >
            {SERVICOS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="f">
          <label>Tipo de venda</label>
          <select value={tv} onChange={(e) => setTv(e.target.value as TipoVenda)}>
            {(Object.keys(TIPOS_VENDA) as TipoVenda[]).map((id) => (
              <option key={id} value={id}>
                {TIPOS_VENDA[id].ic} {TIPOS_VENDA[id].nome}
              </option>
            ))}
          </select>
        </div>
        <div className="f">
          <label>Vendedor</label>
          <select value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
            {vendedores.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>
      <ModalErro msg={erro} />
    </Modal>
  );
}
