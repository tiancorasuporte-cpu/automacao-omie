// CRM Comercial — SGO Âncora
// Tipos de dados (TypeScript). Espelham exatamente o protótipo crm-comercial.html.
// Datas sempre em ISO "AAAA-MM-DD" (data local, fuso America/Sao_Paulo).

export type EtapaId =
  | 'montar'    // Orçamento a montar (nasce da OS de orçamento)
  | 'montado'   // Montado · a enviar
  | 'enviado'   // Enviado ao cliente (1ª ação)
  | 'acao2'     // 2ª ação
  | 'acao3'     // 3ª ação
  | 'aprovado'  // Aprovado · aguardando assinatura/autorização
  | 'final';    // Finalizado (fechado ou não fechado)

export type TipoVenda = 'execucao' | 'recorrente';
export type Papel = 'responsavel' | 'auxiliar' | 'apoio';
export type TipoAcaoId = 'ligacao' | 'whatsapp' | 'email' | 'apresent' | 'online' | 'visita' | 'revisao' | 'assemb';
export type TipoEvento = 'sis' | 'etapa' | 'contato' | 'acao' | 'feito' | 'final' | 'nota';

export interface ItemLevantamento {
  q: number;      // quantidade
  d: string;      // descrição do equipamento/material (vem da OS do técnico)
}

/** Ação agendada na 2ª ou 3ª ação */
export interface Acao {
  n: 2 | 3;
  tipo: TipoAcaoId;
  data: string;          // AAAA-MM-DD
  hora?: string;         // HH:MM (opcional)
  obj?: string;          // objetivo da ação
  feita: boolean;
  resultado?: string;    // preenchido ao registrar o resultado
}

/** Cliente deu OK; aguardando assinatura/autorização */
export interface Aprovacao {
  data: string;          // data do OK do cliente
  aguardando: string;    // um dos valores de AGUARDANDO
  prev: string;          // previsão de recebimento
  obs?: string;
}

/** Resultado da finalização */
export interface Resultado {
  st: 'ganho' | 'perdido';
  data: string;
  motivo: string;        // obrigatório quando perdido (um de MOTIVOS)
  obs: string;
  concorrente?: string;  // quando motivo = "Fechou com concorrente"
  retomar?: string;      // data para retomar contato (opcional, perdido)
}

/** Arquivo anexado (no SGO: guardado no R2 / storage; aqui só os metadados) */
export interface Documento {
  id: string;            // chave do arquivo no storage
  nome: string;
  tam: number;           // bytes
  data: string;
  autor: string;
  etiqueta: 'Orçamento padrão' | 'Proposta enviada' | 'Proposta comercial' | 'Proposta revisada'
          | 'Contrato assinado' | 'Aceite do cliente' | 'Outro' | string;
  lido?: boolean;        // valores lidos automaticamente do documento
}

export interface EventoHistorico {
  data: string;
  tipo: TipoEvento;      // define a cor da bolinha na linha do tempo
  texto: string;
  autor: string;
}

export interface Oportunidade {
  id: number;
  cod: string;               // "OP-00031" (sequencial, 5 dígitos)
  cliente: string;
  contato: string;
  tel: string;
  cidade: string;
  servico: string;           // um de SERVICOS
  tv?: TipoVenda;            // se vazio, sugere pelo serviço (SERV_RECORRENTE)
  os: string;                // OS de origem ("OS-00142") ou "" se cadastro manual
  tecnico: string;           // técnico que fez a visita
  visita: string;            // data da visita
  vendedor: string;          // RESPONSÁVEL (fez o 1º contato, conduz a venda)
  aux?: string[];            // vendedores auxiliares
  apoio?: string[];          // apoio técnico
  etapa: EtapaId;
  desde: string;             // data em que entrou na etapa atual (base dos prazos)
  criado?: string;           // data de criação (se vazio: 1º evento do histórico)
  valor: number;             // valor MENSAL (recorrente)
  total?: number;            // valor TOTAL (execução) ou TAXA DE IMPLANTAÇÃO (recorrente)
  prazo: number;             // prazo contratual em meses (recorrente)
  validade: string;          // validade da proposta
  orc?: string;              // nº do orçamento "ORC-2026-00131"
  itens: ItemLevantamento[];
  acao?: Acao;
  aprov?: Aprovacao;
  res?: Resultado;
  docs?: Documento[];
  hist: EventoHistorico[];
  modalidade?: string;                            // id do TipoContrato (só recorrente); vazio = sugerido pelo serviço
  comRegras?: RegrasComissao;                     // regras de comissão gravadas no dia do fechamento (não mudam depois)
  contrato?: { fim: string; motivo: string };     // encerramento antecipado do contrato recorrente (as parcelas param)
  /** App Omie (ex.: Belfer) quando o cliente foi cadastrado/vinculado */
  omieAppId?: string;
  /** Código do cliente na Omie */
  codigoClienteOmie?: number;
}

/** Tipo de contrato recorrente (Portaria remota, Comodato de equipamentos, Rastreamento…) */
export interface TipoContrato {
  id: string;
  nome: string;
  modo: 'mensal' | 'primeira';   // mensal = % de cada mensalidade durante o contrato · primeira = % da 1ª parcela, uma vez
  venda: number;                 // % (responsável)
  equipe: number;                // % (dividido entre auxiliares e apoio técnico)
}

export interface RegrasComissao {
  execucao:   { venda: number; equipe: number };                        // % sobre o valor total
  recorrente: {
    implantacao: boolean;            // paga também sobre a taxa de implantação (uma vez, junto com a 1ª parcela)
    inicio: 0 | 1;                   // 1ª parcela: 0 = no mês do fechamento · 1 = no mês seguinte
  };
  contratos: TipoContrato[];         // tipos de contrato recorrente — o TIPO define a forma de pagar (só o administrador edita)
  pesos: Record<Exclude<Papel, 'responsavel'>, number>;                // divisão da comissão de equipe (só participantes)
}

export interface Alerta {
  cls: '' | 'red' | 'amb' | 'grn' | 'blu';   // cor da etiqueta no card
  txt: string;
  late?: boolean;                            // entra no filtro "Só atrasados" e borda vermelha
  lim?: string;                              // data limite da etapa (montar/montado/enviado)
}

export interface ComissaoPessoa {
  nome: string;
  papel: Papel;
  venda: number;    // só o responsável recebe            (recorrente: valor POR PARCELA/mês)
  equipe: number;   // parte da comissão de equipe        (recorrente: valor POR PARCELA/mês)
  total: number;
  implVenda: number;   // recorrente: comissão sobre a implantação (uma vez, na 1ª parcela)
  implEquipe: number;
}

/** Um lançamento de comissão: uma pessoa × uma oportunidade × um mês */
export interface LancamentoComissao {
  o: Oportunidade; c: CalculoComissao; p: ComissaoPessoa;
  mes: string;                 // AAAA-MM (competência)
  k: number;                   // nº da parcela (recorrente) — 0 na execução
  tipo: 'novo' | 'rec';        // novo = venda fechada / 1ª parcela · rec = parcelas seguintes
  desc: string;                // "Venda fechada" · "Parcela 5/36" · "Parcela 1/36 + implantação"
  venda: number; equipe: number; total: number;
}

export interface CalculoComissao {
  rec: boolean;
  unica: boolean;    // paga uma vez (execução ou contrato do tipo "% da 1ª parcela")
  contrato: string;  // nome do tipo de contrato (recorrente)
  impl: number;      // taxa de implantação considerada (0 se a regra não paga sobre ela)
  parcelas: number;  // recorrente: prazo do contrato em meses (0 = sem prazo, até o encerramento) · execução: 1
  inicio: number;    // 0 ou 1 (mês da 1ª parcela em relação ao fechamento)
  base: number;      // execução: valor total · recorrente: valor mensal
  baseTxt: string;
  pVenda: number;
  pEquipe: number;
  venda: number;
  pool: number;     // comissão de equipe total a dividir
  pessoas: ComissaoPessoa[];
}

export interface ValoresLidos {
  mensal?: number;
  total?: number;
  orc?: string;
  prazo?: number;
  validade?: string;
  trecho: { mensal?: string; total?: string };
}

export interface Usuario {
  nome: string;
  perfil: string;
  comissoes: boolean;   // permissão do item de menu "Comissões"
}
