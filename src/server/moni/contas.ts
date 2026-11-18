import "@tanstack/react-start/server-only";

import {
  getMoniContaByCodigo,
  normalizeMoniEmpresa,
  upsertMoniConta,
  type MoniConta,
} from "@/db/moni";
import { moniLerDados, sanitizeMoniSqlLiteral } from "@/server/moni/client";

type MoniClienteRow = {
  EMPRESA?: number | string | null;
  Empresa?: number | string | null;
  CODIGO?: number | string;
  Codigo?: number | string;
  SEGUNDOCODIGO?: string | null;
  SegundoCodigo?: string | null;
  NOME?: string | null;
  Nome?: string | null;
  RAZAOSOCIAL?: string | null;
  RazaoSocial?: string | null;
  CGC?: number | string | null;
  Cgc?: number | string | null;
  TIPO?: number | string | null;
  Tipo?: number | string | null;
  SUSPENSO?: number | string | boolean | null;
  Suspenso?: number | string | boolean | null;
  ENDERECO?: string | null;
  Endereco?: string | null;
  BAIRRO?: string | null;
  Bairro?: string | null;
  CEP?: number | string | null;
  Cep?: number | string | null;
};

function pick(row: MoniClienteRow, ...keys: Array<keyof MoniClienteRow>) {
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return null;
}

function toBool(value: unknown) {
  if (typeof value === "boolean") return value;
  const n = Number(value);
  if (Number.isFinite(n)) return n === 1;
  return String(value ?? "").trim() === "1";
}

function normalizeConta(row: MoniClienteRow) {
  const codigo = Number(pick(row, "CODIGO", "Codigo") ?? 0);
  if (!codigo) return null;
  const empresa = normalizeMoniEmpresa(pick(row, "EMPRESA", "Empresa") ?? 1);
  const nome = String(pick(row, "NOME", "Nome") ?? `Conta ${codigo}`).trim();
  const cgcRaw = pick(row, "CGC", "Cgc");
  const cgc = cgcRaw == null ? null : String(cgcRaw).replace(/\D/g, "") || null;
  const tipoRaw = pick(row, "TIPO", "Tipo");
  const tipo = tipoRaw == null ? null : Number(tipoRaw);
  const cepRaw = pick(row, "CEP", "Cep");
  return {
    empresa,
    codigo,
    segundoCodigo: String(pick(row, "SEGUNDOCODIGO", "SegundoCodigo") ?? "").trim() || null,
    nome,
    razaoSocial: String(pick(row, "RAZAOSOCIAL", "RazaoSocial") ?? "").trim() || null,
    cgc,
    tipo: Number.isFinite(tipo as number) ? (tipo as number) : null,
    suspenso: toBool(pick(row, "SUSPENSO", "Suspenso") ?? 0),
    endereco: String(pick(row, "ENDERECO", "Endereco") ?? "").trim() || null,
    bairro: String(pick(row, "BAIRRO", "Bairro") ?? "").trim() || null,
    cep: cepRaw == null ? null : String(cepRaw).replace(/\D/g, "") || null,
  };
}

const SELECT_COLS =
  "EMPRESA, CODIGO, SEGUNDOCODIGO, NOME, RAZAOSOCIAL, CGC, TIPO, SUSPENSO, ENDERECO, BAIRRO, CEP";

async function upsertAndMap(rows: MoniClienteRow[]): Promise<MoniConta[]> {
  const out: MoniConta[] = [];
  for (const raw of rows) {
    const conta = normalizeConta(raw);
    if (!conta) continue;
    await upsertMoniConta(conta);
    const saved = await getMoniContaByCodigo(conta.codigo, conta.empresa);
    if (saved) out.push(saved);
  }
  return out;
}

/** Sync completo das contas (clientes) Moni para a base local. */
export async function syncMoniContas() {
  const rows = await moniLerDados<MoniClienteRow>(
    `SELECT ${SELECT_COLS} FROM Clientes ORDER BY EMPRESA, CODIGO`,
  );
  let count = 0;
  for (const raw of rows) {
    const conta = normalizeConta(raw);
    if (!conta) continue;
    await upsertMoniConta(conta);
    count += 1;
  }
  return { count };
}

/** Busca live no Moni e atualiza cache local. */
export async function searchMoniContasLive(
  query: string,
  opts?: { empresa?: number | null; limit?: number },
): Promise<MoniConta[]> {
  const q = sanitizeMoniSqlLiteral(query);
  if (q.length < 1) return [];
  const lim = Math.min(Math.max(opts?.limit ?? 40, 1), 100);
  const digits = q.replace(/\D/g, "");
  const like = `%${q}%`;
  const cgcClause =
    digits.length >= 3 ? ` OR CAST(CGC AS VARCHAR(32)) LIKE '%${digits}%'` : "";
  const empresa =
    opts?.empresa == null || opts.empresa <= 0 ? null : normalizeMoniEmpresa(opts.empresa);
  const empresaClause = empresa != null ? ` AND EMPRESA=${empresa}` : "";

  const rows = await moniLerDados<MoniClienteRow>(
    `SELECT ${SELECT_COLS} FROM Clientes WHERE (NOME LIKE '${like}' OR RAZAOSOCIAL LIKE '${like}' OR SEGUNDOCODIGO LIKE '${like}' OR CAST(CODIGO AS VARCHAR(20)) LIKE '${like}'${cgcClause})${empresaClause} ORDER BY EMPRESA, NOME`,
  );
  return upsertAndMap(rows.slice(0, lim));
}

export async function getMoniContaLive(
  codigo: number,
  empresa?: number | null,
): Promise<MoniConta | null> {
  const code = Math.trunc(codigo);
  if (!code) return null;
  const emp = empresa == null || empresa <= 0 ? null : normalizeMoniEmpresa(empresa);
  const empresaClause = emp != null ? ` AND EMPRESA=${emp}` : "";
  const rows = await moniLerDados<MoniClienteRow>(
    `SELECT ${SELECT_COLS} FROM Clientes WHERE CODIGO=${code}${empresaClause}`,
  );
  const mapped = await upsertAndMap(rows);
  return mapped[0] ?? null;
}

export async function listMoniEmpresasLive(): Promise<number[]> {
  const rows = await moniLerDados<{ EMPRESA?: number | string; Empresa?: number | string }>(
    "SELECT DISTINCT EMPRESA FROM Clientes WHERE EMPRESA IS NOT NULL ORDER BY EMPRESA",
  );
  const set = new Set<number>();
  for (const row of rows) {
    const n = normalizeMoniEmpresa(row.EMPRESA ?? row.Empresa ?? 0, 0);
    if (n > 0) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}
