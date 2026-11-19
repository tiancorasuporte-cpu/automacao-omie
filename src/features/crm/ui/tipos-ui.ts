// CRM Comercial — tipos das props/callbacks da UI (só contrato entre a tela e a API; regras ficam em ../codigo/regras.ts)
import type {
  Documento,
  EtapaId,
  Oportunidade,
  RegrasComissao,
  TipoAcaoId,
  TipoVenda,
} from "../codigo/types";

export type CrmView = "quadro" | "relatorios" | "comissoes";

export interface UsuarioCrm {
  nome: string;
  /** permissão "CRM · Painel de comissões" (ver todos / regras / pagamento) */
  comissoes: boolean;
  /** flag de vendedor — entra no plano e vê as próprias comissões */
  isVendedor: boolean;
}

/** Dados da proposta (bloco de anexo + valores) usados em Montado, Envio e Anexo */
export interface DadosProposta {
  tv: TipoVenda;
  orc: string;
  /** só recorrente */
  modalidade?: string | undefined;
  /** valor mensal (recorrente) — 0 na execução */
  valor: number;
  /** valor total (execução) ou taxa de implantação (recorrente) */
  total: number;
  prazo: number;
  validade: string;
  arquivo: File | null;
  /** valores lidos automaticamente do documento */
  lido: boolean;
}

export interface NovaOportunidadeDados {
  cliente: string;
  contato: string;
  tel: string;
  cidade: string;
  servico: string;
  tv: TipoVenda;
  vendedor: string;
  omieAppId?: string | null;
  codigoClienteOmie?: number | null;
}

export type CamposPatch = Partial<{
  contato: string;
  tel: string;
  cidade: string;
  servico: string;
  tv: TipoVenda;
  modalidade: string;
  valor: number;
  prazo: number;
  total: number;
  validade: string;
  orc: string;
}>;

export interface MontadoDados extends DadosProposta {
  obs: string;
}
export interface EnvioDados extends DadosProposta {
  canal: string;
  data: string;
  obs: string;
}
export interface UploadDocDados extends DadosProposta {
  etiqueta: string;
}

export interface AgendarDados {
  n: 2 | 3;
  modo: "mover" | "reagendar";
  tipo: TipoAcaoId;
  data: string;
  hora: string;
  obj: string;
  /** preenchido quando a ação anterior ainda não tinha resultado */
  resultadoAnterior: string;
  /** preenchido no reagendamento */
  motivoReagendar: string;
}

export interface ResultadoDados {
  resultado: string;
  proximo: "acao3" | "final" | "aguardar";
}
export interface AprovarDados {
  aguardando: string;
  data: string;
  prev: string;
  obs: string;
}
export interface PrevisaoDados {
  aguardando: string;
  prev: string;
  obs: string;
}

export interface FinalizarDados {
  st: "ganho" | "perdido";
  motivo: string;
  obs: string;
  concorrente: string;
  /** data para retomar contato ('' = não retomar) */
  retomar: string;
  arquivo: File | null;
}

export interface EquipeDados {
  /** novo responsável (exige motivo) */
  vendedor?: string | undefined;
  motivo?: string | undefined;
  /** lista completa de vendedores auxiliares */
  aux?: string[] | undefined;
  /** lista completa do apoio técnico */
  apoio?: string[] | undefined;
}

/**
 * Callbacks para a API. Todos devolvem Promise: a tela espera terminar, chama `refresh()` e só então fecha o modal.
 * Se a Promise rejeitar, a mensagem do erro aparece em vermelho no modal (ou em toast fora dele).
 */
export interface CrmAcoes {
  refresh: () => Promise<void>;
  create: (d: NovaOportunidadeDados) => Promise<void>;
  patch: (id: number, campos: CamposPatch) => Promise<void>;
  montado: (id: number, d: MontadoDados) => Promise<void>;
  envio: (id: number, d: EnvioDados) => Promise<void>;
  agendar: (id: number, d: AgendarDados) => Promise<void>;
  resultado: (id: number, d: ResultadoDados) => Promise<void>;
  aprovar: (id: number, d: AprovarDados) => Promise<void>;
  previsao: (id: number, d: PrevisaoDados) => Promise<void>;
  finalizar: (id: number, d: FinalizarDados) => Promise<void>;
  reabrir: (id: number, motivo: string) => Promise<void>;
  voltar: (id: number, destino: EtapaId, motivo: string) => Promise<void>;
  nota: (id: number, texto: string) => Promise<void>;
  equipe: (id: number, d: EquipeDados) => Promise<void>;
  uploadDoc: (id: number, d: UploadDocDados) => Promise<void>;
  deleteDoc: (id: number, docId: string) => Promise<void>;
  /** Remove a oportunidade e dependências (documentos, histórico…). */
  deleteOportunidade: (id: number) => Promise<void>;
  vincularOmie: (
    id: number,
    d: {
      omieAppId: string;
      codigoClienteOmie: number;
      cliente?: string | null;
      contato?: string | null;
      tel?: string | null;
      cidade?: string | null;
    },
  ) => Promise<void>;
  saveRegras: (r: RegrasComissao) => Promise<void>;
  /** `null` = desfazer o encerramento */
  encerrarContrato: (id: number, d: { fim: string; motivo: string } | null) => Promise<void>;
  /** Gera orçamento local a partir do L.T. (não envia Omie). */
  gerarOrcamento: (
    id: number,
  ) => Promise<{ quoteId: number; numeroInterno: string; already: boolean }>;
  /** abrir/baixar um documento anexado (opcional) */
  abrirDocumento?: ((doc: Documento) => void) | undefined;
}

export type { Oportunidade };
