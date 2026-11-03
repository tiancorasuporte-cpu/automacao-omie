import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { AppShell, useShellSearch } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_NAME } from "@/lib/brand";
import {
  createMonthlyServiceFn,
  deleteMonthlyServiceFn,
  getTabelaPrecosBootstrapFn,
  updateMonthlyServiceFn,
} from "@/lib/orcamentos";
import { requireModule } from "@/lib/require-auth";
import { matchesQuery } from "@/lib/text-search";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tabela-precos")({
  beforeLoad: () => requireModule("orcamentos"),
  loader: () => getTabelaPrecosBootstrapFn(),
  head: () => ({
    meta: [{ title: `Tabela de preços — ${APP_NAME}` }],
  }),
  component: TabelaPrecosPage,
});

type ServiceRow = {
  id: number;
  nome: string;
  descricao: string;
  valor: number;
  custo: number;
  active: boolean;
  showInOrcamento: boolean;
};

type Bootstrap = Awaited<ReturnType<typeof getTabelaPrecosBootstrapFn>>;

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPct(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function parseMoneyInput(raw: string) {
  const normalized = raw.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

function marginPct(custo: number, venda: number) {
  if (!(venda > 0)) return null;
  return ((venda - custo) / venda) * 100;
}

function toServiceRow(s: Bootstrap["services"][number]): ServiceRow {
  return {
    id: s.id,
    nome: s.nome,
    descricao: s.descricao ?? "",
    valor: Number(s.valor) || 0,
    custo: Number(s.custo) || 0,
    active: Boolean(s.active),
    showInOrcamento: s.showInOrcamento !== false,
  };
}

function TabelaPrecosPage() {
  const bootstrap = Route.useLoaderData();
  return (
    <AppShell mobileTitle="Tabela de preços" searchPlaceholder="Buscar serviço...">
      <TabelaPrecosContent bootstrap={bootstrap} />
    </AppShell>
  );
}

function TabelaPrecosContent({ bootstrap }: { bootstrap: Bootstrap }) {
  // Precisa ficar DENTRO do AppShell para o search do header funcionar.
  const router = useRouter();
  const { query, setQuery } = useShellSearch();
  const canManage = bootstrap.canManage === true;

  const [services, setServices] = useState<ServiceRow[]>(
    () => (bootstrap.services ?? []).map(toServiceRow),
  );

  useEffect(() => {
    setServices((bootstrap.services ?? []).map(toServiceRow));
  }, [bootstrap.services]);

  const [showInactive, setShowInactive] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [custoText, setCustoText] = useState("");
  const [vendaText, setVendaText] = useState("");
  const [showInOrcamento, setShowInOrcamento] = useState(true);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editDescricao, setEditDescricao] = useState("");
  const [editCusto, setEditCusto] = useState("");
  const [editVenda, setEditVenda] = useState("");
  const [editShowInOrcamento, setEditShowInOrcamento] = useState(true);
  const [descView, setDescView] = useState<ServiceRow | null>(null);

  const filtered = useMemo(() => {
    return services
      .filter((s) => (showInactive ? true : s.active))
      .filter((s) => matchesQuery(query, [s.nome, s.descricao]))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [services, showInactive, query]);

  function startEdit(row: ServiceRow) {
    setEditingId(row.id);
    setEditNome(row.nome);
    setEditDescricao(row.descricao ?? "");
    setEditCusto(
      row.custo.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    );
    setEditVenda(
      row.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    );
    setEditShowInOrcamento(row.showInOrcamento !== false);
    setFeedback(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    const custo = parseMoneyInput(custoText || "0");
    const valor = parseMoneyInput(vendaText);
    if (!nome.trim()) {
      setFeedback({ type: "error", text: "Informe o nome do serviço." });
      return;
    }
    if (!Number.isFinite(valor) || valor < 0) {
      setFeedback({ type: "error", text: "Preço de venda inválido." });
      return;
    }
    if (!Number.isFinite(custo) || custo < 0) {
      setFeedback({ type: "error", text: "Preço de custo inválido." });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const result = await createMonthlyServiceFn({
        data: {
          nome: nome.trim(),
          descricao: descricao.trim(),
          valor,
          custo,
          showInOrcamento,
        },
      });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      setServices((prev) => [...prev, toServiceRow(result.service)]);
      setNome("");
      setDescricao("");
      setCustoText("");
      setVendaText("");
      setShowInOrcamento(true);
      setFeedback({ type: "ok", text: "Serviço cadastrado." });
      await router.invalidate();
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao cadastrar.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(id: number) {
    if (!canManage) return;
    const custo = parseMoneyInput(editCusto || "0");
    const valor = parseMoneyInput(editVenda);
    if (!editNome.trim()) {
      setFeedback({ type: "error", text: "Informe o nome do serviço." });
      return;
    }
    if (!Number.isFinite(valor) || valor < 0) {
      setFeedback({ type: "error", text: "Preço de venda inválido." });
      return;
    }
    if (!Number.isFinite(custo) || custo < 0) {
      setFeedback({ type: "error", text: "Preço de custo inválido." });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const result = await updateMonthlyServiceFn({
        data: {
          id,
          nome: editNome.trim(),
          descricao: editDescricao.trim(),
          valor,
          custo,
          active: true,
          showInOrcamento: editShowInOrcamento,
        },
      });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      setServices((prev) =>
        prev.map((s) => (s.id === id ? toServiceRow(result.service) : s)),
      );
      setEditingId(null);
      setFeedback({ type: "ok", text: "Serviço atualizado." });
      await router.invalidate();
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao salvar.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleOrcamento(row: ServiceRow) {
    if (!canManage) return;
    setSaving(true);
    setFeedback(null);
    try {
      const result = await updateMonthlyServiceFn({
        data: {
          id: row.id,
          nome: row.nome,
          descricao: row.descricao ?? "",
          valor: row.valor,
          custo: row.custo,
          active: row.active,
          showInOrcamento: !row.showInOrcamento,
        },
      });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      setServices((prev) =>
        prev.map((s) => (s.id === row.id ? toServiceRow(result.service) : s)),
      );
      setFeedback({
        type: "ok",
        text: result.service.showInOrcamento
          ? "Serviço visível no orçamento."
          : "Serviço oculto no orçamento.",
      });
      await router.invalidate();
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao alterar visibilidade.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: ServiceRow) {
    if (!canManage) return;
    const ok = window.confirm(
      `Apagar o serviço “${row.nome}”? Essa ação não pode ser desfeita.\nOrçamentos já salvos mantêm o valor que foi usado.`,
    );
    if (!ok) return;
    setSaving(true);
    setFeedback(null);
    try {
      const result = await deleteMonthlyServiceFn({ data: { id: row.id } });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      setServices((prev) => prev.filter((s) => s.id !== row.id));
      if (editingId === row.id) setEditingId(null);
      setFeedback({ type: "ok", text: "Serviço apagado." });
      await router.invalidate();
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao apagar.",
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
              Comercial
            </p>
            <h1 className="text-headline-sm text-primary">Tabela de preços</h1>
            <p className="text-body-md text-on-surface-variant">
              Catálogo de serviços com custo, venda e descrição. Controle o que aparece no
              Orçamentos.
            </p>
          </div>
          <label className="inline-flex shrink-0 items-center gap-2 pb-1 text-sm text-on-surface">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="size-4 accent-primary"
            />
            Mostrar inativos
          </label>
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
              placeholder="Filtrar por nome ou descrição..."
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

        {canManage ? (
          <form
            onSubmit={(e) => void handleCreate(e)}
            className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md"
          >
            <h2 className="text-title-md font-semibold text-on-surface">Novo serviço</h2>
            <div className="mt-md grid gap-sm sm:grid-cols-2 lg:grid-cols-4">
              <label className="block space-y-xs text-body-md sm:col-span-2 lg:col-span-2">
                <span className="font-medium text-on-surface">Serviço</span>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                  placeholder="Ex.: Portaria diurna 12x36"
                  required
                />
              </label>
              <label className="block space-y-xs text-body-md">
                <span className="font-medium text-on-surface">Preço de custo (R$)</span>
                <input
                  value={custoText}
                  onChange={(e) => setCustoText(e.target.value)}
                  inputMode="decimal"
                  className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                  placeholder="0,00"
                />
              </label>
              <label className="block space-y-xs text-body-md">
                <span className="font-medium text-on-surface">Preço de venda (R$)</span>
                <input
                  value={vendaText}
                  onChange={(e) => setVendaText(e.target.value)}
                  inputMode="decimal"
                  className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                  placeholder="0,00"
                  required
                />
              </label>
              <label className="block space-y-xs text-body-md sm:col-span-2 lg:col-span-4">
                <span className="font-medium text-on-surface">Descrição</span>
                <textarea
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                  placeholder="Detalhes do serviço (opcional)"
                />
              </label>
            </div>
            <div className="mt-md flex flex-wrap items-center gap-md">
              <label className="inline-flex items-center gap-2 text-sm text-on-surface">
                <input
                  type="checkbox"
                  checked={showInOrcamento}
                  onChange={(e) => setShowInOrcamento(e.target.checked)}
                  className="size-4 accent-primary"
                />
                Aparecer no orçamento
              </label>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-xs rounded-lg bg-primary px-md py-sm text-label-md text-on-primary disabled:opacity-50"
              >
                <Icon name="add" className="text-[18px]" />
                Cadastrar
              </button>
            </div>
          </form>
        ) : (
          <p className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low px-md py-sm text-body-md text-on-surface-variant">
            Você pode consultar os preços. Para cadastrar ou editar, peça a um administrador a
            permissão “Cadastrar serviços / tabela de preços”.
          </p>
        )}

        <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-body-md">
              <thead className="bg-surface-container-low text-xs uppercase tracking-wide text-on-surface-variant">
                <tr>
                  <th className="px-md py-sm font-semibold">Serviço</th>
                  <th className="px-md py-sm text-right font-semibold">Custo</th>
                  <th className="px-md py-sm text-right font-semibold">Venda</th>
                  <th className="px-md py-sm text-right font-semibold">Margem</th>
                  <th className="px-md py-sm font-semibold">Orçamento</th>
                  {canManage ? (
                    <th className="px-md py-sm text-right font-semibold">Ações</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canManage ? 6 : 5}
                      className="px-md py-xl text-center text-on-surface-variant"
                    >
                      Nenhum serviço encontrado.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => {
                    const editing = editingId === row.id;
                    const margem = marginPct(row.custo, row.valor);
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          "border-t border-outline-variant",
                          !row.active && "bg-surface-container-low/60 text-on-surface-variant",
                        )}
                      >
                        <td className="px-md py-sm">
                          {editing ? (
                            <div className="space-y-xs min-w-[16rem]">
                              <input
                                value={editNome}
                                onChange={(e) => setEditNome(e.target.value)}
                                className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                                placeholder="Nome"
                              />
                              <textarea
                                value={editDescricao}
                                onChange={(e) => setEditDescricao(e.target.value)}
                                rows={2}
                                className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                                placeholder="Descrição"
                              />
                              <label className="inline-flex items-center gap-2 text-xs text-on-surface">
                                <input
                                  type="checkbox"
                                  checked={editShowInOrcamento}
                                  onChange={(e) => setEditShowInOrcamento(e.target.checked)}
                                  className="size-3.5 accent-primary"
                                />
                                Aparecer no orçamento
                              </label>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-on-surface">{row.nome}</span>
                              {(row.descricao ?? "").trim() ? (
                                <button
                                  type="button"
                                  onClick={() => setDescView(row)}
                                  className="inline-flex items-center gap-0.5 rounded-md border border-outline-variant px-2 py-0.5 text-xs text-on-surface-variant hover:bg-surface-container-low"
                                  title="Ver descrição"
                                >
                                  <Icon name="notes" className="text-[14px]" />
                                  Descrição
                                </button>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="px-md py-sm text-right tabular-nums">
                          {editing ? (
                            <input
                              value={editCusto}
                              onChange={(e) => setEditCusto(e.target.value)}
                              inputMode="decimal"
                              className="ml-auto w-28 rounded-lg border border-outline-variant bg-surface px-sm py-sm text-right"
                            />
                          ) : (
                            formatMoney(row.custo)
                          )}
                        </td>
                        <td className="px-md py-sm text-right font-medium tabular-nums">
                          {editing ? (
                            <input
                              value={editVenda}
                              onChange={(e) => setEditVenda(e.target.value)}
                              inputMode="decimal"
                              className="ml-auto w-28 rounded-lg border border-outline-variant bg-surface px-sm py-sm text-right"
                            />
                          ) : (
                            formatMoney(row.valor)
                          )}
                        </td>
                        <td className="px-md py-sm text-right tabular-nums">
                          {margem == null ? "—" : formatPct(margem)}
                        </td>
                        <td className="px-md py-sm">
                          {canManage && !editing ? (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void handleToggleOrcamento(row)}
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-xs font-medium disabled:opacity-50",
                                row.showInOrcamento
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-stone-200 text-stone-700",
                              )}
                              title="Alternar visibilidade no orçamento"
                            >
                              {row.showInOrcamento ? "Visível" : "Oculto"}
                            </button>
                          ) : (
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                                row.showInOrcamento
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-stone-200 text-stone-700",
                              )}
                            >
                              {row.showInOrcamento ? "Visível" : "Oculto"}
                            </span>
                          )}
                        </td>
                        {canManage ? (
                          <td className="px-md py-sm">
                            <div className="flex flex-wrap justify-end gap-xs">
                              {editing ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => void handleSaveEdit(row.id)}
                                    className="inline-flex items-center rounded-lg bg-primary px-sm py-xs text-label-md text-on-primary disabled:opacity-50"
                                  >
                                    Salvar
                                  </button>
                                  <button
                                    type="button"
                                    disabled={saving}
                                    onClick={cancelEdit}
                                    className="inline-flex items-center rounded-lg border border-outline-variant px-sm py-xs text-label-md"
                                  >
                                    Cancelar
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => startEdit(row)}
                                    className="inline-flex items-center rounded-lg border border-outline-variant px-sm py-xs text-label-md disabled:opacity-40"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => void handleDelete(row)}
                                    className="inline-flex items-center rounded-lg border border-red-200 px-sm py-xs text-label-md text-red-700 disabled:opacity-50"
                                  >
                                    Apagar
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className="border-t border-outline-variant px-md py-sm text-xs text-on-surface-variant">
            {filtered.length} serviço(s)
            {query.trim() ? ` · filtro “${query.trim()}”` : ""}
          </p>
        </section>

        <Dialog open={descView != null} onOpenChange={(open) => !open && setDescView(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{descView?.nome ?? "Descrição"}</DialogTitle>
              <DialogDescription>Detalhes do serviço</DialogDescription>
            </DialogHeader>
            <p className="whitespace-pre-wrap text-body-md text-on-surface">
              {descView?.descricao?.trim() || "Sem descrição."}
            </p>
          </DialogContent>
        </Dialog>
      </div>
  );
}
