import { useState } from "react";
import { createCrmOmieClienteFn } from "@/lib/crm";
import { Modal, ModalErro, useSubmeter } from "../Modal";

export type ClienteOmieCriado = {
  omieAppId: string;
  codigoClienteOmie: number;
  razaoSocial: string;
  nomeFantasia: string;
  telefone: string;
  contato: string;
  cidade: string;
};

interface Props {
  /** Prefill a partir do modal Nova oportunidade */
  razaoSocialPadrao?: string;
  contatoPadrao?: string;
  telefonePadrao?: string;
  cidadePadrao?: string;
  onSuccess: (cliente: ClienteOmieCriado) => void;
  onCancel: () => void;
}

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

function soDigitos(v: string) {
  return v.replace(/\D/g, "");
}

export function ModalCadastroClienteOmie({
  razaoSocialPadrao = "",
  contatoPadrao = "",
  telefonePadrao = "",
  cidadePadrao = "",
  onSuccess,
  onCancel,
}: Props) {
  const [razaoSocial, setRazaoSocial] = useState(razaoSocialPadrao);
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [cnpjCpf, setCnpjCpf] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState(telefonePadrao);
  const [contato, setContato] = useState(contatoPadrao);
  const [endereco, setEndereco] = useState("");
  const [enderecoNumero, setEnderecoNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState(cidadePadrao);
  const [estado, setEstado] = useState("SP");
  const [cep, setCep] = useState("");
  const { erro, ocupado, enviar } = useSubmeter();

  const salvar = () =>
    enviar(async (): Promise<string | void> => {
      const digitosDoc = soDigitos(cnpjCpf);
      if (digitosDoc.length !== 11 && digitosDoc.length !== 14) {
        return "CNPJ (14) ou CPF (11) inválido.";
      }
      const digitosTel = soDigitos(telefone);
      if (digitosTel.length < 10 || digitosTel.length > 11) {
        return "Telefone com DDD (10 ou 11 dígitos).";
      }
      if (soDigitos(cep).length !== 8) return "CEP inválido (8 dígitos).";
      if (!razaoSocial.trim()) return "Informe a razão social / nome.";
      if (!endereco.trim() || !enderecoNumero.trim() || !bairro.trim() || !cidade.trim()) {
        return "Preencha endereço, número, bairro e cidade.";
      }

      const created = await createCrmOmieClienteFn({
        data: {
          razaoSocial: razaoSocial.trim(),
          nomeFantasia: nomeFantasia.trim() || null,
          cnpjCpf: digitosDoc,
          email: email.trim() || null,
          telefone: digitosTel,
          contato: contato.trim() || null,
          endereco: endereco.trim(),
          enderecoNumero: enderecoNumero.trim(),
          complemento: complemento.trim() || null,
          bairro: bairro.trim(),
          cidade: cidade.trim(),
          estado: estado.trim().toUpperCase(),
          cep: soDigitos(cep),
        },
      });

      onSuccess({
        omieAppId: created.omieAppId,
        codigoClienteOmie: created.codigoClienteOmie,
        razaoSocial: created.razaoSocial,
        nomeFantasia: created.nomeFantasia,
        telefone: created.telefone,
        contato: created.contato,
        cidade: created.cidade,
      });
    });

  return (
    <Modal
      titulo="Cadastrar cliente na Omie"
      onClose={onCancel}
      largo
      rodape={
        <>
          <button className="btn" onClick={onCancel} disabled={ocupado}>
            Voltar
          </button>
          <button className="btn pri" onClick={salvar} disabled={ocupado}>
            {ocupado ? "Enviando…" : "Enviar para Omie"}
          </button>
        </>
      }
    >
      <div className="note" style={{ marginTop: 0 }}>
        Cadastro na empresa Belfer (mesma de Orçamentos/Produtos). Depois o nome e o telefone voltam
        para a oportunidade.
      </div>
      <div className="grid">
        <div className="f full">
          <label>Razão social / Nome *</label>
          <input value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} />
        </div>
        <div className="f">
          <label>Nome fantasia</label>
          <input value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} />
        </div>
        <div className="f">
          <label>CNPJ / CPF *</label>
          <input
            value={cnpjCpf}
            onChange={(e) => setCnpjCpf(e.target.value)}
            placeholder="Somente números"
          />
        </div>
        <div className="f">
          <label>E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="opcional"
          />
        </div>
        <div className="f">
          <label>Telefone (com DDD) *</label>
          <input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="11999999999"
          />
        </div>
        <div className="f">
          <label>Contato</label>
          <input value={contato} onChange={(e) => setContato(e.target.value)} />
        </div>
        <div className="f">
          <label>CEP *</label>
          <input value={cep} onChange={(e) => setCep(e.target.value)} placeholder="00000-000" />
        </div>
        <div className="f">
          <label>UF *</label>
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>
        <div className="f full">
          <label>Endereço *</label>
          <input value={endereco} onChange={(e) => setEndereco(e.target.value)} />
        </div>
        <div className="f">
          <label>Número *</label>
          <input value={enderecoNumero} onChange={(e) => setEnderecoNumero(e.target.value)} />
        </div>
        <div className="f">
          <label>Complemento</label>
          <input value={complemento} onChange={(e) => setComplemento(e.target.value)} />
        </div>
        <div className="f">
          <label>Bairro *</label>
          <input value={bairro} onChange={(e) => setBairro(e.target.value)} />
        </div>
        <div className="f">
          <label>Cidade *</label>
          <input value={cidade} onChange={(e) => setCidade(e.target.value)} />
        </div>
      </div>
      <ModalErro msg={erro} />
    </Modal>
  );
}
