import type { MoniVinculoInfo } from "@/db/moni";

/** Linha curta para cards/tabelas. */
export function moniShortLabel(
  moni:
    | {
        moniEmpresa?: number | null;
        moniContaCodigo?: string | null;
        moniContaNome?: string | null;
        moniContaIdExt?: string | null;
        moniDetalhe?: MoniVinculoInfo | null;
      }
    | null
    | undefined,
) {
  const d = moni?.moniDetalhe;
  const empresa = d?.empresa ?? moni?.moniEmpresa;
  const codigo = d?.idExt || d?.codigo || moni?.moniContaIdExt || moni?.moniContaCodigo;
  if (!codigo) return null;
  const nome = d?.nome || moni?.moniContaNome;
  return `Emp.${empresa ?? "—"} · ${codigo}${nome ? ` · ${nome}` : ""}`;
}

/** Linhas extras (CGC, tipo, suspenso, endereço) para detalhe. */
export function moniDetailLines(detalhe: MoniVinculoInfo | null | undefined): string[] {
  if (!detalhe) return [];
  const lines: string[] = [];
  if (detalhe.razaoSocial && detalhe.razaoSocial !== detalhe.nome) {
    lines.push(detalhe.razaoSocial);
  }
  if (detalhe.cgc) lines.push(`CGC ${detalhe.cgc}`);
  if (detalhe.tipoLabel) lines.push(detalhe.tipoLabel);
  if (detalhe.suspenso != null) lines.push(detalhe.suspenso ? "Suspenso" : "Ativo");
  const end = [detalhe.endereco, detalhe.bairro].filter(Boolean).join(" · ");
  if (end) lines.push(end);
  return lines;
}
