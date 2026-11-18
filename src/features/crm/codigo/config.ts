// CRM Comercial — SGO Âncora
// Configuração (listas, prazos, cores). Valores idênticos ao protótipo.
// Vendedores, técnicos e serviços devem vir do cadastro do sistema (aqui só como exemplo).
import type { EtapaId, RegrasComissao, TipoAcaoId, TipoVenda, Papel } from './types';

export const ETAPAS: { id: EtapaId; nome: string; desc: string; cor: string }[] = [
  { id: 'montar',   nome: 'Orçamento a montar',    desc: 'Chegou da visita técnica. Prazo: 2 dias úteis.', cor: '#9a9a94' },
  { id: 'montado',  nome: 'Montado · a enviar',    desc: 'Proposta pronta. Enviar em até 1 dia útil.', cor: '#2563eb' },
  { id: 'enviado',  nome: 'Enviado ao cliente',    desc: '1ª ação: proposta enviada. Agendar a 2ª ação em até 3 dias úteis.', cor: '#FFD200' },
  { id: 'acao2',    nome: '2ª ação',               desc: 'Ação agendada com o cliente.', cor: '#f59e0b' },
  { id: 'acao3',    nome: '3ª ação',               desc: 'Última ação antes de encerrar.', cor: '#ea580c' },
  { id: 'aprovado', nome: 'Aprovado · aguardando', desc: 'Cliente deu OK. Aguardando assinatura do contrato ou autorização de instalação.', cor: '#1f9d55' },
  { id: 'final',    nome: 'Finalizado',            desc: 'Fechado ou não fechado (com motivo).', cor: '#141414' },
];

/** Etapas "em seguimento" (proposta já enviada): mostram Finalizar e entram na previsão de comissão */
export const SEGUIMENTO: EtapaId[] = ['enviado', 'acao2', 'acao3', 'aprovado'];
/** Em negociação (ainda sem o OK do cliente): somam em "em negociação" no painel */
export const NEGOCIACAO: EtapaId[] = ['enviado', 'acao2', 'acao3'];

/** Prazos em DIAS ÚTEIS (contados a partir de `desde`, o próprio dia não conta) */
export const SLA = { montar: 2, montado: 1, enviado: 3 } as const;
/** Data sugerida para a ação (dias úteis a partir de hoje) */
export const PROX_PADRAO = { acao2: 3, acao3: 5 } as const;
/** Dias úteis sugeridos para receber a assinatura na etapa Aprovado */
export const PRAZO_APROVADO = 5;

/** Feriados nacionais fixos (MM-DD). Os móveis (Carnaval, Sexta-feira Santa, Corpus Christi) são calculados pela Páscoa. */
export const FERIADOS_FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];
/** Feriados municipais / da empresa (AAAA-MM-DD). Ideal: cadastro no sistema. */
export const FERIADOS_EXTRA: string[] = [];
/** Segunda e terça de Carnaval não contam como dia útil */
export const CONTAR_CARNAVAL = true;
/** Exige orçamento/proposta anexada para registrar o envio */
export const ANEXO_OBRIGATORIO_NO_ENVIO = true;

export const TIPOS_ACAO: { id: TipoAcaoId; nome: string; ic: string }[] = [
  { id: 'ligacao',  nome: 'Ligação telefônica',         ic: '📞' },
  { id: 'whatsapp', nome: 'Contato por WhatsApp',       ic: '💬' },
  { id: 'email',    nome: 'Contato por e-mail',         ic: '✉️' },
  { id: 'apresent', nome: 'Reunião de apresentação',    ic: '📊' },
  { id: 'online',   nome: 'Reunião on-line',            ic: '💻' },
  { id: 'visita',   nome: 'Visita presencial',          ic: '🚗' },
  { id: 'revisao',  nome: 'Enviar proposta revisada',   ic: '📄' },
  { id: 'assemb',   nome: 'Apresentação em assembleia', ic: '🏢' },
];

export const TIPOS_VENDA: Record<TipoVenda, { nome: string; curto: string; ic: string; cls: 'exe' | 'rec' }> = {
  execucao:   { nome: 'Venda de execução',            curto: 'Execução',   ic: '🔧', cls: 'exe' },
  recorrente: { nome: 'Venda recorrente (contratos)', curto: 'Recorrente', ic: '🔁', cls: 'rec' },
};
/** Serviços que, por padrão, são venda recorrente (o usuário pode trocar no card) */
export const SERV_RECORRENTE = ['Portaria remota', 'Portaria híbrida', 'Alarme monitorado'];

export const SERVICOS = ['Portaria remota', 'Portaria híbrida', 'CFTV', 'Alarme monitorado', 'Controle de acesso', 'Cerca elétrica'];
export const CANAIS = ['WhatsApp', 'Telefone', 'E-mail', 'Visita presencial', 'Reunião on-line'];
export const MOTIVOS = [
  'Preço acima do esperado', 'Fechou com concorrente', 'Projeto adiado / sem verba', 'Cliente sem retorno (3 contatos)',
  'Desistiu do projeto', 'Condições de pagamento / contrato', 'Prazo de instalação', 'Reprovado em assembleia (condomínio)', 'Outro',
];
export const AGUARDANDO = [
  'Assinatura do contrato', 'Autorização de instalação', 'Assinatura + autorização de instalação',
  'Pagamento da entrada', 'Aprovação em assembleia (ata)', 'Pedido de compra do cliente', 'Outro',
];
export const TIPOS_DOCUMENTO = ['Orçamento padrão', 'Proposta comercial', 'Proposta revisada', 'Contrato assinado', 'Aceite do cliente', 'Outro'];

export const PAPEIS: Record<Papel, string> = { responsavel: 'Responsável', auxiliar: 'Vendedor auxiliar', apoio: 'Apoio técnico' };

/** Valores de EXEMPLO — os reais são definidos pelo Guilherme na tela "Regras de comissão" (gravar no banco) */
export const COMISSAO_PADRAO: RegrasComissao = {
  execucao:   { venda: 3,  equipe: 2 },
  recorrente: { implantacao: false, inicio: 0 },
  contratos: [   // % de cada mensalidade (mensal) ou % da 1ª parcela (uma vez) — valores de EXEMPLO
    { id: 'portaria',   nome: 'Portaria remota',          modo: 'mensal',   venda: 3,  equipe: 2 },
    { id: 'hibrida',    nome: 'Portaria híbrida',         modo: 'mensal',   venda: 3,  equipe: 2 },
    { id: 'acesso',     nome: 'Controle de acesso',       modo: 'mensal',   venda: 3,  equipe: 2 },
    { id: 'monit',      nome: 'Monitoramento 24 horas',   modo: 'primeira', venda: 80, equipe: 20 },
    { id: 'comodato',   nome: 'Comodato de equipamentos', modo: 'primeira', venda: 80, equipe: 20 },
    { id: 'comodmonit', nome: 'Comodato + monitoramento', modo: 'primeira', venda: 80, equipe: 20 },
    { id: 'rastreio',   nome: 'Rastreamento',             modo: 'primeira', venda: 80, equipe: 20 },
  ],
  pesos: { auxiliar: 1, apoio: 1 }, // o responsável não entra na divisão da comissão de equipe
};

/** Cores da linha do tempo do histórico, por tipo de evento */
export const CORES_HISTORICO: Record<string, string> = {
  sis: '#9a9a94', etapa: '#2563eb', contato: '#FFD200', acao: '#f59e0b', feito: '#1f9d55', final: '#141414', nota: '#9a9a94',
};

/** Exemplo (protótipo): no SGO vem do cadastro de usuários */
export const VENDEDORES_EXEMPLO = ['Marcos Lima', 'Juliana Prado', 'Rafael Teixeira'];
export const TECNICOS_EXEMPLO = ['Alex Souza', 'Diego Ramos', 'Paulo Henrique'];

/** Validade da proposta: sempre preenchida com hoje + N dias CORRIDOS ao montar/enviar a proposta (o usuário pode alterar) */
export const VALIDADE_PADRAO = 15;

/** Sugestão do tipo de contrato pelo serviço (o vendedor pode trocar na proposta) */
export const CONTRATO_POR_SERVICO: Record<string, string> = { 'Portaria remota': 'portaria', 'Portaria híbrida': 'hibrida', 'Controle de acesso': 'acesso', 'Alarme monitorado': 'monit' };
