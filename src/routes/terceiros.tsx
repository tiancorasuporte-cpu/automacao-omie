import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { AppShell, useShellSearch } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { APP_NAME } from "@/lib/brand";
import { requireModule } from "@/lib/require-auth";
import { matchesQuery } from "@/lib/text-search";
import { downloadTerceirosConsolidadoExcel } from "@/lib/terceiros-excel";
import { downloadTerceirosConsolidadoPdf } from "@/lib/terceiros-pdf";
import { buildTerceirosConsolidadoReport } from "@/lib/terceiros-report";
import {
  createTerceiroFn,
  getTerceirosBootstrapFn,
  searchTerceirosOmieClientsFn,
} from "@/lib/terceiros";
import { cn } from "@/lib/utils";

type OmieClientPick = {
  codigo: number;
  nome: string;
  cnpjCpf: string | null;
  contato: string | null;
};

export const Route = createFileRoute("/terceiros")({
  beforeLoad: () => requireModule("terceiros"),
  loader: () => getTerceirosBootstrapFn(),
  head: () => ({
    meta: [{ title: `Terceiros — ${APP_NAME}` }],
  }),
  component: TerceirosPage,
});

type ListItem = Awaited<ReturnType<typeof getTerceirosBootstrapFn>>["items"][number];

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseMoneyInput(raw: string) {
  const normalized = raw.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

function formatDateTimeBr(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TerceirosPage() {
  const bootstrap = Route.useLoaderData();
  return (
    <AppShell mobileTitle="Terceiros" searchPlaceholder="Buscar terceiro...">
      <TerceirosContent
        initialItems={bootstrap.items ?? []}
        canChecar={bootstrap.canChecar === true}
      />
    </AppShell>
  );
}

function TerceirosContent({
  initialItems,
  canChecar,
}: {
  initialItems: ListItem[];
  canChecar: boolean;
}) {
  const router = useRouter();
  const { query, setQuery } = useShellSearch();
  const [items, setItems] = useState(initialItems);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);
  const [showInactive, setShowInactive] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [contato, setContato] = useState("");
  const [observacao, setObservacao] = useState("");
  const [qtdContas, setQtdContas] = useState("");
  const [precoUnitario, setPrecoUnitario] = useState("");
  const [exporting, setExporting] = useState(false);
  const [empresaSource, setEmpresaSource] = useState<"omie" | "manual">("omie");
  const [omieAppId, setOmieAppId] = useState<string | null>(null);
  const [selectedOmie, setSelectedOmie] = useState<OmieClientPick | null>(null);
  const [omieQuery, setOmieQuery] = useState("");
  const [omieResults, setOmieResults] = useState<OmieClientPick[]>([]);
  const [searchingOmie, setSearchingOmie] = useState(false);

  useEffect(() => {
    if (empresaSource !== "omie" || selectedOmie || omieQuery.trim().length < 2) {
      setOmieResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchingOmie(true);
      try {
        const result = await searchTerceirosOmieClientsFn({
          data: { query: omieQuery.trim() },
        });
        if (cancelled) return;
        if (result.appId) setOmieAppId(result.appId);
        setOmieResults(
          result.items.map((item) => ({
            codigo: item.codigo,
            nome: item.nome,
            cnpjCpf: item.cnpjCpf,
            contato: item.contato,
          })),
        );
      } catch {
        if (!cancelled) setOmieResults([]);
      } finally {
        if (!cancelled) setSearchingOmie(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [empresaSource, omieQuery, selectedOmie]);

  function resetCreateForm() {
    setNome("");
    setDocumento("");
    setContato("");
    setObservacao("");
    setQtdContas("");
    setPrecoUnitario("");
    setSelectedOmie(null);
    setOmieQuery("");
    setOmieResults([]);
    setEmpresaSource("omie");
  }

  function selectOmieClient(client: OmieClientPick) {
    setSelectedOmie(client);
    setOmieQuery(client.nome);
    setOmieResults([]);
    setNome(client.nome);
    setDocumento(client.cnpjCpf ?? "");
    if (client.contato) setContato(client.contato);
  }

  function clearOmieSelection() {
    setSelectedOmie(null);
    setOmieQuery("");
    setOmieResults([]);
    setNome("");
    setDocumento("");
  }

  const pendingCount = useMemo(
    () => items.filter((item) => item.active && item.pendingReview).length,
    [items],
  );

  const filtered = useMemo(() => {
    return items
      .filter((item) => (showInactive ? true : item.active))
      .filter((item) => (onlyPending ? item.pendingReview : true))
      .filter((item) =>
        matchesQuery(query, [
          item.nome,
          item.documento,
          item.contato,
          item.observacao,
          item.lastChangeByName,
          item.lastChangeSummary,
        ]),
      )
      .sort(
        (a, b) =>
          Number(b.pendingReview) - Number(a.pendingReview) ||
          Number(b.active) - Number(a.active) ||
          a.nome.localeCompare(b.nome, "pt-BR"),
      );
  }, [items, showInactive, onlyPending, query]);

  const totalGeral = useMemo(
    () => filtered.reduce((sum, item) => sum + (item.active ? item.totais.totalMensal : 0), 0),
    [filtered],
  );

  function reportSource() {
    return buildTerceirosConsolidadoReport(filtered, { onlyActive: !showInactive });
  }

  function handleExportExcel() {
    try {
      downloadTerceirosConsolidadoExcel(reportSource());
      setFeedback({ type: "ok", text: "Excel consolidado exportado." });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao exportar Excel.",
      });
    }
  }

  async function handleExportPdf() {
    setExporting(true);
    setFeedback(null);
    try {
      await downloadTerceirosConsolidadoPdf(reportSource());
      setFeedback({ type: "ok", text: "PDF consolidado gerado." });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao gerar PDF.",
      });
    } finally {
      setExporting(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const qtd = qtdContas.trim() ? Number(qtdContas) : 0;
    const preco = precoUnitario.trim() ? parseMoneyInput(precoUnitario) : 0;
    const empresaNome =
      empresaSource === "omie" ? (selectedOmie?.nome ?? nome).trim() : nome.trim();
    if (empresaSource === "omie" && !selectedOmie) {
      setFeedback({ type: "error", text: "Selecione um cliente da Omie ou escolha cadastro manual." });
      return;
    }
    if (!empresaNome) {
      setFeedback({ type: "error", text: "Informe o nome da empresa." });
      return;
    }
    if (!Number.isFinite(qtd) || qtd < 0) {
      setFeedback({ type: "error", text: "Quantidade de contas inválida." });
      return;
    }
    if (!Number.isFinite(preco) || preco < 0) {
      setFeedback({ type: "error", text: "Preço por conta inválido." });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const result = await createTerceiroFn({
        data: {
          nome: empresaNome,
          documento: documento.trim() || null,
          contato: contato.trim() || null,
          observacao: observacao.trim(),
          omieClientCode:
            empresaSource === "omie" && selectedOmie ? selectedOmie.codigo : null,
          omieAppId: empresaSource === "omie" && selectedOmie ? omieAppId : null,
          qtdContas: Math.floor(qtd),
          precoUnitario: preco,
        },
      });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      resetCreateForm();
      setFormOpen(false);
      setFeedback({ type: "ok", text: "Terceiro cadastrado." });
      await router.invalidate();
      await router.navigate({
        to: "/terceiros/$terceiroId",
        params: { terceiroId: String(result.detail.id) },
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao cadastrar.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-lg p-margin-mobile md:p-margin-desktop">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div className="min-w-0 w-full flex-1 sm:min-w-[16rem]">
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            Operações
          </p>
          <h1 className="text-headline-sm text-primary">Terceiros</h1>
          <p className="text-body-md text-on-surface-variant">
            Cadastro de empresas terceiras, contas monitoradas e serviços mensais para o
            faturamento cobrar com clareza.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-sm">
          <label className="inline-flex items-center gap-2 text-sm text-on-surface">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="size-4 accent-primary"
            />
            Mostrar inativos
          </label>
          {canChecar || pendingCount > 0 ? (
            <label className="inline-flex items-center gap-2 text-sm text-on-surface">
              <input
                type="checkbox"
                checked={onlyPending}
                onChange={(e) => setOnlyPending(e.target.checked)}
                className="size-4 accent-primary"
              />
              Só alterações pendentes
              {pendingCount > 0 ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                  {pendingCount}
                </span>
              ) : null}
            </label>
          ) : null}
          <button
            type="button"
            disabled={exporting || filtered.length === 0}
            onClick={handleExportExcel}
            className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-md py-sm text-label-md disabled:opacity-50"
          >
            <Icon name="table_view" className="text-[18px]" />
            Excel
          </button>
          <button
            type="button"
            disabled={exporting || filtered.length === 0}
            onClick={() => void handleExportPdf()}
            className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-md py-sm text-label-md disabled:opacity-50"
          >
            <Icon name="picture_as_pdf" className="text-[18px]" />
            {exporting ? "Gerando..." : "PDF"}
          </button>
          <button
            type="button"
            onClick={() => setFormOpen((v) => !v)}
            className="inline-flex items-center gap-xs rounded-lg bg-primary px-md py-sm text-label-md text-on-primary"
          >
            <Icon name="add" className="text-[18px]" />
            Novo terceiro
          </button>
        </div>
      </div>

      <div className="w-full max-w-xl">
        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute left-sm top-1/2 z-10 -translate-y-1/2 text-on-surface-variant"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar por nome, CNPJ ou contato..."
            className="input-glow box-border block h-11 w-full min-w-[16rem] rounded-lg border border-outline-variant bg-surface py-sm pl-[40px] pr-10 text-body-md text-on-surface outline-none placeholder:text-on-surface-variant focus:border-outline"
          />
          {query.trim() ? (
            <button
              type="button"
              aria-label="Limpar filtro"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-on-surface-variant hover:bg-surface-container-high"
            >
              <Icon name="close" className="text-[18px]" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-md py-sm text-body-md">
        <span className="text-on-surface-variant">Total mensal (ativos filtrados): </span>
        <span className="font-semibold tabular-nums text-primary">{formatMoney(totalGeral)}</span>
        <span className="text-on-surface-variant"> · {filtered.length} terceiro(s)</span>
      </div>

      {feedback ? (
        <div
          className={cn(
            "rounded-lg border px-md py-sm text-body-md",
            feedback.type === "ok"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-red-300 bg-red-50 text-red-900",
          )}
        >
          {feedback.text}
        </div>
      ) : null}

      {formOpen ? (
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md"
        >
          <h2 className="text-title-md font-semibold text-on-surface">Novo terceiro</h2>
          <div className="mt-md flex flex-wrap gap-sm">
            <button
              type="button"
              onClick={() => {
                setEmpresaSource("omie");
                setNome("");
                setDocumento("");
                setSelectedOmie(null);
                setOmieQuery("");
                setOmieResults([]);
              }}
              className={cn(
                "rounded-lg border px-md py-sm text-label-md",
                empresaSource === "omie"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-outline-variant text-on-surface",
              )}
            >
              Cliente Omie
            </button>
            <button
              type="button"
              onClick={() => {
                setEmpresaSource("manual");
                setSelectedOmie(null);
                setOmieQuery("");
                setOmieResults([]);
              }}
              className={cn(
                "rounded-lg border px-md py-sm text-label-md",
                empresaSource === "manual"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-outline-variant text-on-surface",
              )}
            >
              Sem Omie (manual)
            </button>
          </div>
          <div className="mt-md grid gap-sm sm:grid-cols-2 lg:grid-cols-4">
            {empresaSource === "omie" ? (
              <div className="relative space-y-xs text-body-md sm:col-span-2">
                <span className="font-medium text-on-surface">Empresa (Omie)</span>
                {selectedOmie ? (
                  <div className="flex items-center justify-between gap-sm rounded-lg border border-outline-variant bg-surface px-sm py-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-on-surface">{selectedOmie.nome}</p>
                      <p className="text-sm text-on-surface-variant">
                        #{selectedOmie.codigo}
                        {selectedOmie.cnpjCpf ? ` · ${selectedOmie.cnpjCpf}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearOmieSelection}
                      className="shrink-0 text-label-md text-primary"
                    >
                      Trocar
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      value={omieQuery}
                      onChange={(e) => setOmieQuery(e.target.value)}
                      placeholder="Buscar razão social ou CNPJ (mín. 2 letras)"
                      className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                    />
                    {searchingOmie ? (
                      <p className="text-sm text-on-surface-variant">Buscando na Omie...</p>
                    ) : null}
                    {omieResults.length > 0 ? (
                      <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-outline-variant bg-surface shadow-lg">
                        {omieResults.map((client) => (
                          <li key={client.codigo}>
                            <button
                              type="button"
                              className="block w-full px-sm py-sm text-left hover:bg-surface-container-high"
                              onClick={() => selectOmieClient(client)}
                            >
                              {client.nome}
                              <span className="ml-xs text-sm text-on-surface-variant">
                                #{client.codigo}
                                {client.cnpjCpf ? ` · ${client.cnpjCpf}` : ""}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                )}
              </div>
            ) : (
              <label className="block space-y-xs text-body-md sm:col-span-2">
                <span className="font-medium text-on-surface">Empresa</span>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                  required
                />
              </label>
            )}
            <label className="block space-y-xs text-body-md">
              <span className="font-medium text-on-surface">CNPJ / documento</span>
              <input
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
              />
            </label>
            <label className="block space-y-xs text-body-md">
              <span className="font-medium text-on-surface">Contato</span>
              <input
                value={contato}
                onChange={(e) => setContato(e.target.value)}
                className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
              />
            </label>
            <label className="block space-y-xs text-body-md">
              <span className="font-medium text-on-surface">Contas no preço comum</span>
              <input
                value={qtdContas}
                onChange={(e) => setQtdContas(e.target.value)}
                inputMode="numeric"
                className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                placeholder="0"
              />
            </label>
            <label className="block space-y-xs text-body-md">
              <span className="font-medium text-on-surface">Preço comum / conta (R$)</span>
              <input
                value={precoUnitario}
                onChange={(e) => setPrecoUnitario(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                placeholder="0,00"
              />
            </label>
            <label className="block space-y-xs text-body-md sm:col-span-2 lg:col-span-2">
              <span className="font-medium text-on-surface">Observação</span>
              <input
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
              />
            </label>
          </div>
          <div className="mt-md flex flex-wrap gap-sm">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-xs rounded-lg bg-primary px-md py-sm text-label-md text-on-primary disabled:opacity-50"
            >
              <Icon name="add" className="text-[18px]" />
              Cadastrar
            </button>
            <button
              type="button"
              onClick={() => {
                resetCreateForm();
                setFormOpen(false);
              }}
              className="inline-flex items-center rounded-lg border border-outline-variant px-md py-sm text-label-md"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-body-md">
            <thead className="bg-surface-container-low text-xs uppercase tracking-wide text-on-surface-variant">
              <tr>
                <th className="px-md py-sm font-semibold">Empresa</th>
                <th className="px-md py-sm text-right font-semibold">Contas</th>
                <th className="px-md py-sm text-right font-semibold">Total mensal</th>
                <th className="px-md py-sm font-semibold">Status</th>
                <th className="px-md py-sm text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-md py-xl text-center text-on-surface-variant">
                    Nenhum terceiro encontrado.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr
                    key={item.id}
                    className={cn(
                      "border-t border-outline-variant",
                      !item.active && "bg-surface-container-low/60 text-on-surface-variant",
                    )}
                  >
                    <td className="px-md py-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-on-surface">{item.nome}</span>
                        {item.omieClientCode ? (
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">
                            Omie #{item.omieClientCode}
                          </span>
                        ) : null}
                        {item.pendingReview ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                            Alteração pendente
                          </span>
                        ) : null}
                      </div>
                      {item.documento || item.contato ? (
                        <div className="text-sm text-on-surface-variant">
                          {[item.documento, item.contato].filter(Boolean).join(" · ")}
                        </div>
                      ) : null}
                      {item.pendingReview ? (
                        <div className="mt-1 text-xs text-amber-900/80">
                          {[item.lastChangeSummary, item.lastChangeByName ? `por ${item.lastChangeByName}` : null, formatDateTimeBr(item.lastChangeAt)]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-md py-sm text-right tabular-nums">
                      {item.totais.qtdContasTotal}
                      <span className="block text-xs text-on-surface-variant">
                        {item.totais.qtdContasPadrao} comum
                        {item.totais.qtdContasExcecao
                          ? ` + ${item.totais.qtdContasExcecao} part. (à parte)`
                          : ""}
                      </span>
                    </td>
                    <td className="px-md py-sm text-right font-semibold tabular-nums text-primary">
                      {formatMoney(item.totais.totalMensal)}
                    </td>
                    <td className="px-md py-sm">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                          item.active
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-stone-200 text-stone-700",
                        )}
                      >
                        {item.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-md py-sm text-right">
                      <Link
                        to="/terceiros/$terceiroId"
                        params={{ terceiroId: String(item.id) }}
                        className="inline-flex items-center rounded-lg border border-outline-variant px-sm py-xs text-label-md hover:bg-surface-container-low"
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
