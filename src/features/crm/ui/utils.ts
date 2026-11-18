// CRM Comercial — utilidades de APRESENTAÇÃO (nada de regra de negócio aqui; regras ficam em ../codigo/regras.ts)
import { COMISSAO_PADRAO, TIPOS_ACAO } from "../codigo/config";
import { hojeISO, MESES, mesDe } from "../codigo/regras";
import type { RegrasComissao, TipoAcaoId } from "../codigo/types";

export const tipoAcao = (id: TipoAcaoId | string) =>
  TIPOS_ACAO.find((t) => t.id === id) ?? { id, nome: id, ic: "•" };

export const ext = (n: string) => (n.split(".").pop() || "").toLowerCase();
export const icDoc = (n: string) =>
  (
    ({ pdf: "📕", docx: "📘", doc: "📘", xlsx: "📗", xls: "📗", csv: "📗" }) as Record<
      string,
      string
    >
  )[ext(n)] ?? "📄";
export const ftam = (b: number) =>
  b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";

export const mesAtual = () => mesDe(hojeISO());
/** "2026-11" → "Novembro/2026" */
export const nomeMes = (m: string) => {
  const [y, mm] = m.split("-").map(Number);
  return `${MESES[(mm ?? 1) - 1]}/${y}`;
};
export const horaAgora = () => new Date().toTimeString().slice(0, 5);

/** Tipos de contrato recorrente (as regras gravadas, ou o padrão se vier vazio) */
export const listaContratos = (R: RegrasComissao) =>
  R.contratos && R.contratos.length ? R.contratos : COMISSAO_PADRAO.contratos;

export const msgErro = (e: unknown) =>
  e instanceof Error
    ? e.message
    : typeof e === "string"
      ? e
      : "Não foi possível concluir. Tente novamente.";

export const nomeArquivoSeguro = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-");
