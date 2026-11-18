import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { AppShell, useShellSearch } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { PageSection, PageTitle } from "@/components/PageChrome";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_NAME } from "@/lib/brand";
import {
  addContratoMoniContaFn,
  getContratoDetalheFn,
  getContratosBootstrapFn,
  listContratosClienteFn,
  listContratosClientesFn,
  listMoniEmpresasFn,
  removeContratoMoniContaFn,
  searchMoniContasFn,
  syncMoniContasFn,
  syncOmieContratosFn,
} from "@/lib/contratos";
import { requireModule } from "@/lib/require-auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/contratos")({
  beforeLoad: () => requireModule("contratos"),
  loader: async () => getContratosBootstrapFn(),
  head: () => ({
    meta: [{ title: `Contratos — ${APP_NAME}` }],
  }),
  component: ContratosPage,
});

type ClienteGrupo = Awaited<ReturnType<typeof getContratosBootstrapFn>>["clientes"][number];
type ContratoRow = Awaited<ReturnType<typeof listContratosClienteFn>>[number];
type ContratoDetalhe = NonNullable<Awaited<ReturnType<typeof getContratoDetalheFn>>>;
type MoniContaBusca = Awaited<ReturnType<typeof searchMoniContasFn>>["items"][number];
type PageSize = 10 | 20 | 50 | 100;
const PAGE_SIZES: PageSize[] = [10, 20, 50, 100];

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatCnpjCpf(value: string | null | undefined) {
  const d = String(value ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return value || "—";
}

function formatDateBr(value: string | null | undefined) {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return value;
}

function situacaoClass(situacao: string) {
  if (situacao === "10") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (situacao === "90") return "bg-amber-50 text-amber-900 border-amber-200";
  if (situacao === "99") return "bg-red-50 text-red-800 border-red-200";
  return "bg-surface-container-high text-on-surface-variant border-outline-variant";
}

function ContratosPage() {
  const bootstrap = Route.useLoaderData();
  return (
    <AppShell mobileTitle="Contratos" searchPlaceholder="Buscar cliente ou CNPJ…">
      <ContratosContent
        initialApps={bootstrap.apps}
        initialClientes={bootstrap.clientes}
        initialClientesTotal={bootstrap.clientesTotal}
        initialContratoCount={bootstrap.contratoCount}
        initialMoniConfigured={bootstrap.moniConfigured}
        initialMoniContaCount={bootstrap.moniContaCount}
        initialDefaultMoniEmpresa={bootstrap.defaultMoniEmpresa}
        initialMoniEmpresas={bootstrap.moniEmpresas}
      />
    </AppShell>
  );
}

function ContratosContent({
  initialApps,
  initialClientes,
  initialClientesTotal,
  initialContratoCount,
  initialMoniConfigured,
  initialMoniContaCount,
  initialDefaultMoniEmpresa,
  initialMoniEmpresas,
}: {
  initialApps: Array<{ id: string; name: string }>;
  initialClientes: ClienteGrupo[];
  initialClientesTotal: number;
  initialContratoCount: number;
  initialMoniConfigured: boolean;
  initialMoniContaCount: number;
  initialDefaultMoniEmpresa: number;
  initialMoniEmpresas: number[];
}) {
  const router = useRouter();
  const { query } = useShellSearch();
  const [apps] = useState(initialApps);
  const [omieAppId, setOmieAppId] = useState("");
  const [clienteQuery, setClienteQuery] = useState("");
  const [pageSize, setPageSize] = useState<PageSize>(20);
  const [page, setPage] = useState(1);
  const [clientes, setClientes] = useState(initialClientes);
  const [clientesTotal, setClientesTotal] = useState(initialClientesTotal);
  const [contratoCount, setContratoCount] = useState(initialContratoCount);
  const [syncing, setSyncing] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const [selected, setSelected] = useState<ClienteGrupo | null>(null);
  const [contratos, setContratos] = useState<ContratoRow[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [detalhe, setDetalhe] = useState<ContratoDetalhe | null>(null);
  const [loadingContrato, setLoadingContrato] = useState(false);
  const [moniConfigured, setMoniConfigured] = useState(initialMoniConfigured);
  const [moniContaCount, setMoniContaCount] = useState(initialMoniContaCount);
  const [defaultMoniEmpresa, setDefaultMoniEmpresa] = useState(initialDefaultMoniEmpresa || 1);
  const [moniEmpresas, setMoniEmpresas] = useState(
    initialMoniEmpresas.length ? initialMoniEmpresas : [initialDefaultMoniEmpresa || 1],
  );
  const [moniEmpresa, setMoniEmpresa] = useState(initialDefaultMoniEmpresa || 1);
  const [moniEmpresaCustom, setMoniEmpresaCustom] = useState("");
  const [moniQuery, setMoniQuery] = useState("");
  const [moniSugestoes, setMoniSugestoes] = useState<MoniContaBusca[]>([]);
  const [buscandoMoni, setBuscandoMoni] = useState(false);
  const [syncingMoni, setSyncingMoni] = useState(false);
  const [savingMoni, setSavingMoni] = useState(false);

  const empresaSelectValue = useMemo(() => {
    if (moniEmpresas.includes(moniEmpresa)) return String(moniEmpresa);
    return "__custom__";
  }, [moniEmpresa, moniEmpresas]);

  useEffect(() => {
    setClientes(initialClientes);
    setClientesTotal(initialClientesTotal);
    setContratoCount(initialContratoCount);
    setMoniConfigured(initialMoniConfigured);
    setMoniContaCount(initialMoniContaCount);
    setDefaultMoniEmpresa(initialDefaultMoniEmpresa || 1);
    setMoniEmpresas(
      initialMoniEmpresas.length ? initialMoniEmpresas : [initialDefaultMoniEmpresa || 1],
    );
  }, [
    initialClientes,
    initialClientesTotal,
    initialContratoCount,
    initialMoniConfigured,
    initialMoniContaCount,
    initialDefaultMoniEmpresa,
    initialMoniEmpresas,
  ]);

  useEffect(() => {
    if (!detalhe) {
      setMoniSugestoes([]);
      return;
    }
    const q = moniQuery.trim();
    if (q.length < 1) {
      setMoniSugestoes([]);
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        setBuscandoMoni(true);
        try {
          const res = await searchMoniContasFn({
            data: { query: q, empresa: moniEmpresa, limit: 30 },
          });
          setMoniSugestoes(res.items);
        } catch {
          setMoniSugestoes([]);
        } finally {
          setBuscandoMoni(false);
        }
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [moniQuery, moniEmpresa, detalhe]);

  const buscaCliente = clienteQuery.trim() || query.trim();

  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        setLoadingList(true);
        try {
          const result = await listContratosClientesFn({
            data: {
              ...(omieAppId ? { omieAppId } : {}),
              ...(buscaCliente ? { query: buscaCliente } : {}),
              limit: pageSize,
              offset: (Math.max(1, page) - 1) * pageSize,
            },
          });
          setClientes(result.items);
          setClientesTotal(result.total);
          const maxPage = Math.max(1, Math.ceil(result.total / pageSize));
          if (page > maxPage) setPage(maxPage);
        } catch (error) {
          setFeedback({
            type: "error",
            text: error instanceof Error ? error.message : "Falha ao listar clientes.",
          });
        } finally {
          setLoadingList(false);
        }
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [omieAppId, buscaCliente, page, pageSize]);

  async function openCliente(cliente: ClienteGrupo) {
    setSelected(cliente);
    setDetalhe(null);
    setLoadingDetail(true);
    setContratos([]);
    try {
      const rows = await listContratosClienteFn({
        data: {
          groupKey: cliente.groupKey,
          ...(omieAppId ? { omieAppId } : {}),
        },
      });
      setContratos(rows);
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao carregar contratos.",
      });
    } finally {
      setLoadingDetail(false);
    }
  }

  async function openContrato(id: number) {
    setLoadingContrato(true);
    setMoniQuery("");
    setMoniSugestoes([]);
    setMoniEmpresa(defaultMoniEmpresa || 1);
    setMoniEmpresaCustom("");
    try {
      const data = await getContratoDetalheFn({ data: { id } });
      if (!data) {
        setFeedback({ type: "error", text: "Contrato não encontrado." });
        return;
      }
      setDetalhe(data);
      if (data.defaultMoniEmpresa) {
        setMoniEmpresa(data.defaultMoniEmpresa);
        setDefaultMoniEmpresa(data.defaultMoniEmpresa);
      }
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao abrir contrato.",
      });
    } finally {
      setLoadingContrato(false);
    }
  }

  async function refreshDetalhe(id: number) {
    const data = await getContratoDetalheFn({ data: { id } });
    if (data) setDetalhe(data);
    if (selected) {
      const rows = await listContratosClienteFn({
        data: {
          groupKey: selected.groupKey,
          ...(omieAppId ? { omieAppId } : {}),
        },
      });
      setContratos(rows);
    }
  }

  async function handleVincularMoni(conta: MoniContaBusca) {
    if (!detalhe) return;
    setSavingMoni(true);
    try {
      const empresa = conta.empresa || moniEmpresa;
      await addContratoMoniContaFn({
        data: {
          omieContratoId: detalhe.contrato.id,
          moniEmpresa: empresa,
          moniContaCodigo: String(conta.codigo),
          moniContaNome: conta.nome,
          moniContaIdExt: conta.segundoCodigo,
        },
      });
      setMoniQuery("");
      setMoniSugestoes([]);
      if (!moniEmpresas.includes(empresa)) {
        setMoniEmpresas((prev) => [...prev, empresa].sort((a, b) => a - b));
      }
      await refreshDetalhe(detalhe.contrato.id);
      setFeedback({
        type: "ok",
        text: `Conta Moni Emp.${empresa} · ${conta.segundoCodigo || conta.codigo} vinculada.`,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao vincular conta Moni.",
      });
    } finally {
      setSavingMoni(false);
    }
  }

  async function handleSyncMoni() {
    setSyncingMoni(true);
    setFeedback(null);
    try {
      const result = await syncMoniContasFn();
      setMoniContaCount(result.count);
      setMoniConfigured(true);
      try {
        const emp = await listMoniEmpresasFn();
        setMoniEmpresas(emp.empresas);
        setDefaultMoniEmpresa(emp.defaultEmpresa);
        if (!emp.empresas.includes(moniEmpresa)) {
          setMoniEmpresa(emp.defaultEmpresa);
        }
      } catch {
        // ignore
      }
      setFeedback({
        type: "ok",
        text: `${result.count} conta(s) Moni sincronizada(s).`,
      });
      await router.invalidate();
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao sincronizar Moni.",
      });
    } finally {
      setSyncingMoni(false);
    }
  }

  async function handleRemoveMoni(id: number) {
    if (!detalhe) return;
    setSavingMoni(true);
    try {
      await removeContratoMoniContaFn({ data: { id } });
      await refreshDetalhe(detalhe.contrato.id);
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao remover vínculo Moni.",
      });
    } finally {
      setSavingMoni(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setFeedback(null);
    try {
      const result = await syncOmieContratosFn();
      const errors = result.perApp.filter((e) => e.error);
      setFeedback({
        type: errors.length ? "error" : "ok",
        text: errors.length
          ? `Sync parcial: ${result.total} contratos. ${errors
              .map((e) => `${e.appName}: ${e.error}`)
              .join(" · ")}`
          : `${result.total} contratos sincronizados em ${result.perApp.length} empresa(s).`,
      });
      await router.invalidate();
      const q = clienteQuery.trim() || query.trim();
      const listed = await listContratosClientesFn({
        data: {
          ...(omieAppId ? { omieAppId } : {}),
          ...(q ? { query: q } : {}),
          limit: pageSize,
          offset: 0,
        },
      });
      setPage(1);
      setClientes(listed.items);
      setClientesTotal(listed.total);
      setContratoCount(result.total);
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao sincronizar contratos.",
      });
    } finally {
      setSyncing(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(clientesTotal / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const from = clientesTotal === 0 ? 0 : (pageSafe - 1) * pageSize + 1;
  const to = Math.min(pageSafe * pageSize, clientesTotal);

  const subtitle = useMemo(() => {
    const emp = omieAppId ? apps.find((a) => a.id === omieAppId)?.name : "Todas as empresas";
    return `${clientesTotal} cliente(s) com contrato ativo · ${contratoCount} contrato(s) na base · ${emp}`;
  }, [apps, clientesTotal, contratoCount, omieAppId]);

  const ctr = detalhe?.contrato;
  const itens = ctr?.detalhes?.itens ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-md px-margin-mobile py-md md:px-margin-desktop md:py-lg">
      <PageTitle title="Contratos" subtitle={subtitle}>
        <button
          type="button"
          className="inline-flex items-center gap-xs rounded-lg bg-white px-md py-sm text-label-md font-semibold text-primary disabled:opacity-60"
          disabled={syncingMoni}
          onClick={() => void handleSyncMoni()}
          title={
            moniConfigured
              ? `${moniContaCount} conta(s) na base local`
              : "Configure MONI_BASE_URL / USERNAME / PASSWORD no .env"
          }
        >
          <Icon name="sensors" className={cn("text-[18px]", syncingMoni && "animate-spin")} />
          {syncingMoni ? "Sync Moni…" : `Sync Moni (${moniContaCount})`}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-xs rounded-lg bg-white px-md py-sm text-label-md font-semibold text-primary disabled:opacity-60"
          disabled={syncing}
          onClick={() => void handleSync()}
        >
          <Icon name="sync" className={cn("text-[18px]", syncing && "animate-spin")} />
          {syncing ? "Sincronizando…" : "Sincronizar Omie"}
        </button>
      </PageTitle>

      <PageSection>
        <div className="flex flex-wrap items-end gap-md">
          <label className="flex min-w-[220px] flex-1 flex-col gap-2xs text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
            Buscar cliente
            <div className="relative">
              <Icon
                name="search"
                className="pointer-events-none absolute left-sm top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant"
              />
              <input
                value={clienteQuery}
                onChange={(e) => {
                  setClienteQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Nome ou CNPJ/CPF"
                className="w-full rounded-lg border border-outline-variant bg-white py-sm pl-xl pr-md text-body-md font-normal normal-case tracking-normal text-on-surface"
              />
            </div>
          </label>
          <label className="flex min-w-[200px] flex-col gap-2xs text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
            Empresa
            <select
              value={omieAppId}
              onChange={(e) => {
                setOmieAppId(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-outline-variant bg-white px-md py-sm text-body-md font-normal normal-case tracking-normal text-on-surface"
            >
              <option value="">Todas</option>
              {apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[120px] flex-col gap-2xs text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
            Por página
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) as PageSize);
                setPage(1);
              }}
              className="rounded-lg border border-outline-variant bg-white px-md py-sm text-body-md font-normal normal-case tracking-normal text-on-surface"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-sm text-label-md text-on-surface-variant">
          Clique no cliente e depois no contrato para ver o detalhe completo e vincular contas Moni.
        </p>

        {feedback ? (
          <p
            className={cn(
              "mt-md rounded-lg border px-md py-sm text-body-md",
              feedback.type === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-red-200 bg-red-50 text-red-900",
            )}
          >
            {feedback.text}
          </p>
        ) : null}

        {loadingList ? (
          <p className="mt-md text-label-md text-on-surface-variant">Atualizando lista…</p>
        ) : null}

        {clientes.length === 0 ? (
          <p className="mt-md rounded-xl border border-dashed border-outline-variant p-lg text-center text-body-md text-on-surface-variant">
            Nenhum cliente com contrato ativo
            {contratoCount === 0 ? ". Use Sincronizar Omie para importar." : " neste filtro."}
          </p>
        ) : (
          <div className="mt-md overflow-x-auto rounded-xl border border-outline-variant">
            <table className="w-full min-w-[720px] border-collapse text-left text-body-md">
              <thead className="bg-surface-container-low text-label-sm uppercase tracking-wide text-on-surface-variant">
                <tr>
                  <th className="px-md py-sm font-semibold">Cliente</th>
                  <th className="px-md py-sm font-semibold">CNPJ/CPF</th>
                  <th className="px-md py-sm font-semibold">Empresas</th>
                  <th className="px-md py-sm font-semibold text-right">Ativos</th>
                  <th className="px-md py-sm font-semibold text-right">Valor mensal ativo</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => (
                  <tr
                    key={c.groupKey}
                    className="cursor-pointer border-t border-outline-variant hover:bg-surface-container-low/80"
                    onClick={() => void openCliente(c)}
                  >
                    <td className="px-md py-sm font-medium text-on-surface">{c.nome}</td>
                    <td className="px-md py-sm text-on-surface-variant">{formatCnpjCpf(c.cnpjCpf)}</td>
                    <td className="px-md py-sm">
                      <div className="flex flex-wrap gap-2xs">
                        {c.apps.map((a) => (
                          <span
                            key={a.id}
                            className="rounded-md border border-outline-variant bg-white px-xs py-2xs text-label-sm text-on-surface-variant"
                          >
                            {a.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-md py-sm text-right tabular-nums">
                      {c.qtdAtivos}
                      {c.qtdTotal > c.qtdAtivos ? (
                        <span className="text-on-surface-variant"> / {c.qtdTotal}</span>
                      ) : null}
                    </td>
                    <td className="px-md py-sm text-right tabular-nums font-medium">
                      {formatMoney(c.valorMensalAtivos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {clientesTotal > 0 ? (
          <div className="mt-md flex flex-wrap items-center justify-between gap-sm">
            <p className="text-label-md text-on-surface-variant">
              Mostrando {from}–{to} de {clientesTotal}
            </p>
            <div className="flex items-center gap-sm">
              <button
                type="button"
                className="rounded-lg border border-outline-variant bg-white px-md py-sm text-label-md font-medium text-on-surface disabled:opacity-50"
                disabled={pageSafe <= 1 || loadingList}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <span className="text-label-md text-on-surface-variant">
                Página {pageSafe} / {totalPages}
              </span>
              <button
                type="button"
                className="rounded-lg border border-outline-variant bg-white px-md py-sm text-label-md font-medium text-on-surface disabled:opacity-50"
                disabled={pageSafe >= totalPages || loadingList}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Próxima
              </button>
            </div>
          </div>
        ) : null}
      </PageSection>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setContratos([]);
            setDetalhe(null);
          }
        }}
      >
        <DialogContent className="dialog-2xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-sm">
              {detalhe ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-2xs rounded-md border border-outline-variant px-sm py-2xs text-label-md font-medium text-on-surface hover:bg-surface-container-low"
                  onClick={() => setDetalhe(null)}
                >
                  <Icon name="arrow_back" className="text-[16px]" />
                  Voltar
                </button>
              ) : null}
              <span>
                {detalhe
                  ? `Contrato ${detalhe.contrato.numero || `#${detalhe.contrato.codigoContrato}`}`
                  : (selected?.nome ?? "Contratos")}
              </span>
            </DialogTitle>
            <DialogDescription>
              {detalhe ? (
                <>
                  {detalhe.contrato.clienteNome || selected?.nome} ·{" "}
                  {formatCnpjCpf(detalhe.contrato.cnpjCpf || selected?.cnpjCpf)} ·{" "}
                  {detalhe.contrato.omieAppName}
                </>
              ) : (
                <>
                  {selected?.cnpjCpf
                    ? `CNPJ/CPF ${formatCnpjCpf(selected.cnpjCpf)}`
                    : "Cliente sem CNPJ/CPF"}
                  {" · "}
                  clique em um contrato para ver o detalhe e contas Moni
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {loadingDetail || loadingContrato ? (
            <p className="text-label-md text-on-surface-variant">Carregando…</p>
          ) : detalhe && ctr ? (
            <div className="flex flex-col gap-lg">
              <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-4">
                <InfoCard label="Situação">
                  <span
                    className={cn(
                      "inline-flex rounded-md border px-xs py-2xs text-label-sm font-medium",
                      situacaoClass(ctr.situacao),
                    )}
                  >
                    {ctr.situacaoLabel}
                  </span>
                </InfoCard>
                <InfoCard label="Valor mensal">{formatMoney(ctr.valorMensal)}</InfoCard>
                <InfoCard label="Faturamento">
                  {ctr.tipoFatLabel || "—"}
                  {ctr.diaFat ? ` · dia ${ctr.diaFat}` : ""}
                </InfoCard>
                <InfoCard label="Empresa Omie">{ctr.omieAppName}</InfoCard>
                <InfoCard label="Vigência">
                  {formatDateBr(ctr.vigenciaIni)} → {formatDateBr(ctr.vigenciaFim)}
                </InfoCard>
                <InfoCard label="Código Omie">#{ctr.codigoContrato}</InfoCard>
                <InfoCard label="Contato">{ctr.contato || "—"}</InfoCard>
                <InfoCard label="Cidade prestação">{ctr.cidadePrestacao || "—"}</InfoCard>
              </div>

              {ctr.descricaoResumo || ctr.observacoes ? (
                <div className="grid gap-md lg:grid-cols-2">
                  {ctr.descricaoResumo ? (
                    <div className="rounded-xl border border-outline-variant bg-white p-md">
                      <h3 className="text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
                        Serviço / resumo
                      </h3>
                      <p className="mt-xs whitespace-pre-wrap text-body-md text-on-surface">
                        {ctr.descricaoResumo}
                      </p>
                    </div>
                  ) : null}
                  {ctr.observacoes ? (
                    <div className="rounded-xl border border-outline-variant bg-white p-md">
                      <h3 className="text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
                        Observações
                      </h3>
                      <p className="mt-xs whitespace-pre-wrap text-body-md text-on-surface">
                        {ctr.observacoes}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-xl border border-outline-variant bg-white overflow-hidden">
                <div className="border-b border-outline-variant px-md py-sm">
                  <h3 className="text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
                    Itens do contrato
                  </h3>
                </div>
                {itens.length === 0 ? (
                  <p className="px-md py-md text-body-md text-on-surface-variant">
                    Nenhum item sincronizado. Rode Sincronizar Omie novamente.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] border-collapse text-left text-body-md">
                      <thead className="bg-surface-container-low text-label-sm text-on-surface-variant">
                        <tr>
                          <th className="px-md py-sm font-semibold">#</th>
                          <th className="px-md py-sm font-semibold">Descrição</th>
                          <th className="px-md py-sm font-semibold text-right">Qtd</th>
                          <th className="px-md py-sm font-semibold text-right">Unit.</th>
                          <th className="px-md py-sm font-semibold text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itens.map((item, idx) => (
                          <tr key={`${item.seq ?? idx}-${item.descricao}`} className="border-t border-outline-variant">
                            <td className="px-md py-sm text-on-surface-variant">{item.seq ?? idx + 1}</td>
                            <td className="px-md py-sm">{item.descricao || "—"}</td>
                            <td className="px-md py-sm text-right tabular-nums">{item.quantidade ?? "—"}</td>
                            <td className="px-md py-sm text-right tabular-nums">{formatMoney(item.valorUnit)}</td>
                            <td className="px-md py-sm text-right tabular-nums font-medium">
                              {formatMoney(item.valorTotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-outline-variant bg-white p-md">
                <div className="flex flex-wrap items-start justify-between gap-sm">
                  <div>
                    <h3 className="text-title-md text-on-surface">Contas Moni</h3>
                    <p className="mt-2xs text-label-md text-on-surface-variant">
                      Busque e vincule uma ou mais contas do Moni a este contrato.
                      {moniContaCount === 0
                        ? " Use Sync Moni para importar as contas."
                        : ` ${moniContaCount} conta(s) na base local.`}
                    </p>
                  </div>
                  <span className="rounded-md border border-outline-variant bg-surface-container-low px-sm py-2xs text-label-sm text-on-surface-variant">
                    {detalhe.moniDetalhes.length} vinculada(s)
                  </span>
                </div>

                <div className="relative mt-md grid gap-sm sm:grid-cols-[minmax(0,11rem)_1fr]">
                  <label className="flex flex-col gap-2xs text-label-sm font-semibold text-on-surface-variant">
                    Empresa Moni
                    <select
                      value={empresaSelectValue}
                      disabled={savingMoni}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__custom__") {
                          setMoniEmpresaCustom(String(moniEmpresa));
                          return;
                        }
                        setMoniEmpresa(Number(v));
                        setMoniEmpresaCustom("");
                        setMoniSugestoes([]);
                      }}
                      className="rounded-lg border border-outline-variant bg-white px-md py-sm text-body-md font-normal text-on-surface disabled:opacity-60"
                    >
                      {moniEmpresas.map((emp) => (
                        <option key={emp} value={emp}>
                          Empresa {emp}
                          {emp === defaultMoniEmpresa ? " (padrão)" : ""}
                        </option>
                      ))}
                      <option value="__custom__">Outra…</option>
                    </select>
                  </label>
                  {empresaSelectValue === "__custom__" ? (
                    <label className="flex flex-col gap-2xs text-label-sm font-semibold text-on-surface-variant">
                      Código da empresa
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={moniEmpresaCustom || String(moniEmpresa)}
                        disabled={savingMoni}
                        onChange={(e) => {
                          setMoniEmpresaCustom(e.target.value);
                          const n = Number(e.target.value);
                          if (Number.isFinite(n) && n > 0) {
                            setMoniEmpresa(Math.trunc(n));
                            setMoniSugestoes([]);
                          }
                        }}
                        className="rounded-lg border border-outline-variant bg-white px-md py-sm text-body-md font-normal text-on-surface disabled:opacity-60"
                      />
                    </label>
                  ) : (
                    <label className="flex flex-col gap-2xs text-label-sm font-semibold text-on-surface-variant">
                      Buscar conta Moni
                      <input
                        value={moniQuery}
                        onChange={(e) => setMoniQuery(e.target.value)}
                        placeholder="Código, nome ou CNPJ…"
                        disabled={savingMoni}
                        className="rounded-lg border border-outline-variant bg-white px-md py-sm text-body-md font-normal text-on-surface disabled:opacity-60"
                      />
                    </label>
                  )}
                  {empresaSelectValue === "__custom__" ? (
                    <label className="flex flex-col gap-2xs text-label-sm font-semibold text-on-surface-variant sm:col-span-2">
                      Buscar conta Moni
                      <input
                        value={moniQuery}
                        onChange={(e) => setMoniQuery(e.target.value)}
                        placeholder="Código, nome ou CNPJ…"
                        disabled={savingMoni}
                        className="rounded-lg border border-outline-variant bg-white px-md py-sm text-body-md font-normal text-on-surface disabled:opacity-60"
                      />
                    </label>
                  ) : null}
                  {buscandoMoni ? (
                    <p className="text-label-md text-on-surface-variant sm:col-span-2">Buscando…</p>
                  ) : null}
                  {moniSugestoes.length > 0 ? (
                    <ul className="absolute left-0 right-0 top-full z-10 mt-xs max-h-56 overflow-auto rounded-lg border border-outline-variant bg-white shadow-lg sm:col-span-2">
                      {moniSugestoes.map((conta) => (
                        <li key={`${conta.empresa}-${conta.codigo}`}>
                          <button
                            type="button"
                            className="block w-full px-md py-sm text-left hover:bg-surface-container-low"
                            disabled={savingMoni}
                            onClick={() => void handleVincularMoni(conta)}
                          >
                            <span className="block font-medium text-on-surface">
                              {conta.segundoCodigo ? `${conta.segundoCodigo} · ` : ""}
                              {conta.nome}
                            </span>
                            <span className="block text-label-md text-on-surface-variant">
                              Emp.{conta.empresa} · #{conta.codigo}
                              {conta.cgc ? ` · ${conta.cgc}` : ""}
                              {conta.tipoLabel ? ` · ${conta.tipoLabel}` : ""}
                              {conta.suspenso ? " · Suspenso" : ""}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                {detalhe.moniDetalhes.length === 0 ? (
                  <p className="mt-md rounded-lg border border-dashed border-outline-variant px-md py-md text-body-md text-on-surface-variant">
                    Nenhuma conta Moni vinculada neste contrato.
                  </p>
                ) : (
                  <ul className="mt-md divide-y divide-outline-variant rounded-xl border border-outline-variant">
                    {detalhe.moniDetalhes.map(({ link, conta }) => (
                      <li
                        key={link.id}
                        className="flex flex-wrap items-start justify-between gap-sm px-md py-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-on-surface">
                            {conta?.segundoCodigo || link.moniContaIdExt
                              ? `${conta?.segundoCodigo || link.moniContaIdExt} · `
                              : ""}
                            {conta?.nome || link.moniContaNome || `Conta ${link.moniContaCodigo}`}
                          </p>
                          <p className="text-label-md text-on-surface-variant">
                            <span className="mr-xs inline-flex rounded-md border border-outline-variant bg-surface-container-low px-2xs py-2xs text-label-sm">
                              Emp.{link.moniEmpresa || conta?.empresa || "?"}
                            </span>
                            Código Moni #{conta?.codigo ?? link.moniContaCodigo}
                            {conta?.cgc ? ` · CNPJ/CPF ${conta.cgc}` : ""}
                            {conta?.tipoLabel ? ` · ${conta.tipoLabel}` : ""}
                          </p>
                          {conta ? (
                            <p className="mt-2xs text-label-md text-on-surface-variant">
                              {conta.suspenso ? (
                                <span className="font-medium text-amber-800">Suspenso</span>
                              ) : (
                                <span className="font-medium text-emerald-800">Ativo</span>
                              )}
                              {conta.endereco
                                ? ` · ${conta.endereco}${conta.bairro ? ` — ${conta.bairro}` : ""}`
                                : ""}
                            </p>
                          ) : (
                            <p className="mt-2xs text-label-sm text-on-surface-variant">
                              Dados Moni não encontrados na base local — rode Sync Moni.
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={savingMoni}
                          className="text-label-md font-medium text-red-700 hover:underline disabled:opacity-60"
                          onClick={() => void handleRemoveMoni(link.id)}
                        >
                          Remover
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : contratos.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">Nenhum contrato encontrado.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-outline-variant">
              <table className="w-full min-w-[720px] border-collapse text-left text-body-md">
                <thead className="bg-surface-container-low text-label-sm uppercase tracking-wide text-on-surface-variant">
                  <tr>
                    <th className="px-md py-sm font-semibold">Empresa</th>
                    <th className="px-md py-sm font-semibold">Nº</th>
                    <th className="px-md py-sm font-semibold">Situação</th>
                    <th className="px-md py-sm font-semibold">Vigência</th>
                    <th className="px-md py-sm font-semibold text-right">Valor/mês</th>
                    <th className="px-md py-sm font-semibold">Moni</th>
                    <th className="px-md py-sm font-semibold">Serviço</th>
                  </tr>
                </thead>
                <tbody>
                  {contratos.map((row) => (
                    <tr
                      key={`${row.omieAppId}-${row.codigoContrato}`}
                      className="cursor-pointer border-t border-outline-variant hover:bg-surface-container-low/80"
                      onClick={() => void openContrato(row.id)}
                    >
                      <td className="px-md py-sm">
                        <span className="rounded-md border border-outline-variant bg-white px-xs py-2xs text-label-sm">
                          {row.omieAppName}
                        </span>
                      </td>
                      <td className="px-md py-sm font-medium">{row.numero || `#${row.codigoContrato}`}</td>
                      <td className="px-md py-sm">
                        <span
                          className={cn(
                            "inline-flex rounded-md border px-xs py-2xs text-label-sm font-medium",
                            situacaoClass(row.situacao),
                          )}
                        >
                          {row.situacaoLabel}
                        </span>
                      </td>
                      <td className="px-md py-sm text-on-surface-variant whitespace-nowrap">
                        {formatDateBr(row.vigenciaIni)} → {formatDateBr(row.vigenciaFim)}
                      </td>
                      <td className="px-md py-sm text-right tabular-nums">{formatMoney(row.valorMensal)}</td>
                      <td className="px-md py-sm">
                        {row.moniQtd > 0 ? (
                          <span className="rounded-md border border-outline-variant bg-white px-xs py-2xs text-label-sm">
                            {row.moniQtd} conta(s)
                          </span>
                        ) : (
                          <span className="text-on-surface-variant">—</span>
                        )}
                      </td>
                      <td
                        className="px-md py-sm text-on-surface-variant max-w-[220px] truncate"
                        title={row.descricaoResumo ?? undefined}
                      >
                        {row.descricaoResumo || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-white px-md py-sm">
      <div className="text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
        {label}
      </div>
      <div className="mt-2xs text-body-md font-medium text-on-surface">{children}</div>
    </div>
  );
}
