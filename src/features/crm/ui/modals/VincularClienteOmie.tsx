import { useEffect, useRef, useState } from "react";
import { getCrmOmieClienteDetalhesFn, searchCrmOmieClientesFn } from "@/lib/crm";
import { Modal, ModalErro, useSubmeter } from "../Modal";
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

export type ClienteOmieVinculo = {
  omieAppId: string;
  codigoClienteOmie: number;
  cliente: string;
  contato: string;
  tel: string;
  cidade: string;
};

interface Props {
  clientePadrao?: string;
  contatoPadrao?: string;
  telefonePadrao?: string;
  cidadePadrao?: string;
  onConfirm: (c: ClienteOmieVinculo) => Promise<void>;
  onCancel: () => void;
}

/**
 * Gate ao avançar OP sem Omie: buscar cliente existente ou cadastrar na Omie.
 */
export function ModalVincularClienteOmie({
  clientePadrao = "",
  contatoPadrao = "",
  telefonePadrao = "",
  cidadePadrao = "",
  onConfirm,
  onCancel,
}: Props) {
  const [query, setQuery] = useState(clientePadrao);
  const [omieAppId, setOmieAppId] = useState<string | null>(null);
  const [sugestoes, setSugestoes] = useState<ClienteBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [cadastro, setCadastro] = useState(false);
  const buscaSeq = useRef(0);
  const { erro, ocupado, enviar } = useSubmeter();

  useEffect(() => {
    if (cadastro) return;
    const q = query.trim();
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
  }, [query, cadastro]);

  const confirmar = (c: ClienteOmieVinculo) =>
    enviar(async () => {
      await onConfirm(c);
    });

  const selecionar = (c: ClienteBusca) =>
    enviar(async (): Promise<string | void> => {
      let app = omieAppId;
      let nome = c.nome;
      let contato = c.contato || contatoPadrao;
      let tel = telefonePadrao;
      let cidade = c.cidade || cidadePadrao;
      try {
        const det = await getCrmOmieClienteDetalhesFn({ data: { clientCode: c.codigo } });
        if (det) {
          app = det.omieAppId;
          nome = det.nome || nome;
          if (det.contato) contato = det.contato;
          if (det.telefone) tel = det.telefone;
          if (det.cidade) cidade = det.cidade;
        }
      } catch {
        // mantém dados da busca
      }
      if (!app) return "App Omie não disponível. Tente de novo.";
      await onConfirm({
        omieAppId: app,
        codigoClienteOmie: c.codigo,
        cliente: nome,
        contato,
        tel,
        cidade,
      });
    });

  if (cadastro) {
    return (
      <ModalCadastroClienteOmie
        razaoSocialPadrao={clientePadrao || query}
        contatoPadrao={contatoPadrao}
        telefonePadrao={telefonePadrao}
        cidadePadrao={cidadePadrao}
        onCancel={() => setCadastro(false)}
        onSuccess={(c: ClienteOmieCriado) => {
          void confirmar({
            omieAppId: c.omieAppId,
            codigoClienteOmie: c.codigoClienteOmie,
            cliente: c.nomeFantasia || c.razaoSocial,
            contato: c.contato || contatoPadrao,
            tel: c.telefone || telefonePadrao,
            cidade: c.cidade || cidadePadrao,
          });
        }}
      />
    );
  }

  return (
    <Modal
      titulo="Cliente Omie obrigatório"
      onClose={onCancel}
      rodape={
        <>
          <button className="btn" onClick={onCancel} disabled={ocupado}>
            Cancelar
          </button>
          <button className="btn pri" onClick={() => setCadastro(true)} disabled={ocupado}>
            Cadastrar na Omie
          </button>
        </>
      }
    >
      <div className="note" style={{ marginTop: 0 }}>
        Para avançar no funil, vincule um cliente já existente na Omie ou cadastre agora.
      </div>
      <div className="f">
        <label>Buscar na Omie</label>
        <div className="cliente-omie-busca">
          <input
            value={query}
            placeholder="Nome, fantasia ou documento (mín. 2 letras)"
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
          />
          {buscando ? <div className="cliente-omie-hint">Buscando…</div> : null}
          {sugestoes.length > 0 ? (
            <ul className="cliente-omie-lista">
              {sugestoes.map((c) => (
                <li key={c.codigo}>
                  <button type="button" disabled={ocupado} onClick={() => void selecionar(c)}>
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
      </div>
      <ModalErro msg={erro} />
    </Modal>
  );
}
