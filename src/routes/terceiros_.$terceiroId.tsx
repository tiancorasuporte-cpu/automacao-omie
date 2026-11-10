import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_NAME } from "@/lib/brand";
import { requireModule } from "@/lib/require-auth";
import { downloadTerceiroExcel } from "@/lib/terceiros-excel";
import { downloadTerceiroPdf } from "@/lib/terceiros-pdf";
import { buildTerceiroReport } from "@/lib/terceiros-report";
import {
  createContaExcecaoFn,
  createContaProporcionalFn,
  createTerceiroServicoFn,
  deleteContaExcecaoFn,
  deleteContaProporcionalFn,
  deleteTerceiroFn,
  deleteTerceiroServicoFn,
  getTerceiroDetailFn,
  lancarContaProporcionalFn,
  markServicoReviewedFn,
  markTerceiroReviewedFn,
  searchTerceirosOmieClientsFn,
  updateContaExcecaoFn,
  updateContaProporcionalFn,
  updateMonitoramentoFn,
  updateTerceiroFn,
  updateTerceiroServicoFn,
} from "@/lib/terceiros";
import { cn } from "@/lib/utils";

type OmieClientPick = {
  codigo: number;
  nome: string;
  cnpjCpf: string | null;
  contato: string | null;
};

export const Route = createFileRoute("/terceiros_/$terceiroId")({
  beforeLoad: () => requireModule("terceiros"),
  loader: async ({ params }) => {
    const result = await getTerceiroDetailFn({ data: { id: Number(params.terceiroId) } });
    if (!result.ok) throw new Error(result.error);
    return {
      detail: result.detail,
      canChecar: result.canChecar === true,
      priceTable: result.priceTable ?? [],
    };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.detail.nome ?? "Terceiro"} — ${APP_NAME}` }],
  }),
  component: TerceiroDetailPage,
});

type Detail = Awaited<ReturnType<typeof getTerceiroDetailFn>> extends { ok: true; detail: infer D }
  ? D
  : never;
type PriceTableItem = Awaited<ReturnType<typeof getTerceiroDetailFn>> extends {
  ok: true;
  priceTable: infer P;
}
  ? P extends Array<infer I>
    ? I
    : never
  : never;
type Conta = Detail["contasExcecao"][number];
type Servico = Detail["servicos"][number];
type Proporcional = Detail["contasProporcionais"][number];
type AddKind = "particularidade" | "proporcional" | "servico";

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseMoneyInput(raw: string) {
  const normalized = raw.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

function moneyDraft(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateBr(iso: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  }
  return iso;
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

function daysPreview(inicio: string, fim: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) return null;
  const a = new Date(`${inicio}T12:00:00`);
  const b = new Date(`${fim}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return null;
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

function TerceiroDetailPage() {
  const loaded = Route.useLoaderData();
  return (
    <AppShell mobileTitle={loaded.detail.nome} searchPlaceholder="Buscar...">
      <TerceiroDetailContent
        initial={loaded.detail}
        canChecar={loaded.canChecar}
        priceTable={loaded.priceTable}
      />
    </AppShell>
  );
}

function KanbanColumn({
  title,
  subtitle,
  count,
  accent,
  children,
}: {
  title: string;
  subtitle: string;
  count?: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-h-[26rem] min-w-[17rem] flex-1 flex-col rounded-xl border bg-surface-container-low/60",
        accent,
      )}
    >
      <header className="border-b border-outline-variant/60 px-md py-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-title-md font-semibold text-on-surface">{title}</h2>
          {count ? (
            <span className="rounded-full bg-surface-container-lowest px-2 py-0.5 text-xs font-medium tabular-nums text-on-surface-variant">
              {count}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-on-surface-variant">{subtitle}</p>
      </header>
      <div className="flex flex-1 flex-col gap-sm overflow-y-auto p-sm">{children}</div>
    </section>
  );
}

function TerceiroDetailContent({
  initial,
  canChecar,
  priceTable,
}: {
  initial: Detail;
  canChecar: boolean;
  priceTable: PriceTableItem[];
}) {
  const router = useRouter();
  const [detail, setDetail] = useState(initial);
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [empresaOpen, setEmpresaOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<AddKind>("servico");

  const [nome, setNome] = useState(detail.nome);
  const [documento, setDocumento] = useState(detail.documento ?? "");
  const [contato, setContato] = useState(detail.contato ?? "");
  const [observacao, setObservacao] = useState(detail.observacao);
  const [active, setActive] = useState(detail.active);
  const [empresaSource, setEmpresaSource] = useState<"omie" | "manual">(
    detail.omieClientCode ? "omie" : "manual",
  );
  const [omieAppId, setOmieAppId] = useState<string | null>(detail.omieAppId);
  const [selectedOmie, setSelectedOmie] = useState<OmieClientPick | null>(
    detail.omieClientCode
      ? {
          codigo: detail.omieClientCode,
          nome: detail.nome,
          cnpjCpf: detail.documento,
          contato: detail.contato,
        }
      : null,
  );
  const [omieQuery, setOmieQuery] = useState("");
  const [omieResults, setOmieResults] = useState<OmieClientPick[]>([]);
  const [searchingOmie, setSearchingOmie] = useState(false);

  const [qtdContas, setQtdContas] = useState(String(detail.monitoramento.qtdContas));
  const [precoUnitario, setPrecoUnitario] = useState(moneyDraft(detail.monitoramento.precoUnitario));
  const [monObs, setMonObs] = useState(detail.monitoramento.observacao);

  const [formNome, setFormNome] = useState("");
  const [formValor, setFormValor] = useState("");
  const [formQtd, setFormQtd] = useState("1");
  const [formObs, setFormObs] = useState("");
  const [formBaseTipo, setFormBaseTipo] = useState<"padrao" | "particularidade">("padrao");
  const [formInicio, setFormInicio] = useState("");
  const [formFim, setFormFim] = useState("");
  const [formCatalogId, setFormCatalogId] = useState("");
  const [formCatalogValor, setFormCatalogValor] = useState<number | null>(null);

  const [editingContaId, setEditingContaId] = useState<number | null>(null);
  const [editContaId, setEditContaId] = useState("");
  const [editContaValor, setEditContaValor] = useState("");
  const [editContaObs, setEditContaObs] = useState("");

  const [editingSvcId, setEditingSvcId] = useState<number | null>(null);
  const [editSvcNome, setEditSvcNome] = useState("");
  const [editSvcQtd, setEditSvcQtd] = useState("");
  const [editSvcValor, setEditSvcValor] = useState("");
  const [editSvcObs, setEditSvcObs] = useState("");

  const [editingPropId, setEditingPropId] = useState<number | null>(null);
  const [editPropId, setEditPropId] = useState("");
  const [editPropBase, setEditPropBase] = useState<"padrao" | "particularidade">("padrao");
  const [editPropValor, setEditPropValor] = useState("");
  const [editPropInicio, setEditPropInicio] = useState("");
  const [editPropFim, setEditPropFim] = useState("");
  const [editPropObs, setEditPropObs] = useState("");

  const previewDias = useMemo(
    () => daysPreview(formInicio, formFim),
    [formInicio, formFim],
  );

  function applyDetail(next: Detail) {
    setDetail(next);
    setNome(next.nome);
    setDocumento(next.documento ?? "");
    setContato(next.contato ?? "");
    setObservacao(next.observacao);
    setActive(next.active);
    setOmieAppId(next.omieAppId);
    setEmpresaSource(next.omieClientCode ? "omie" : "manual");
    setSelectedOmie(
      next.omieClientCode
        ? {
            codigo: next.omieClientCode,
            nome: next.nome,
            cnpjCpf: next.documento,
            contato: next.contato,
          }
        : null,
    );
    setOmieQuery("");
    setOmieResults([]);
    setQtdContas(String(next.monitoramento.qtdContas));
    setPrecoUnitario(moneyDraft(next.monitoramento.precoUnitario));
    setMonObs(next.monitoramento.observacao);
  }

  useEffect(() => {
    if (!empresaOpen || empresaSource !== "omie" || selectedOmie || omieQuery.trim().length < 2) {
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
  }, [empresaOpen, empresaSource, omieQuery, selectedOmie]);

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
  }

  function resetAddForm() {
    setFormNome("");
    setFormValor("");
    setFormQtd("1");
    setFormObs("");
    setFormBaseTipo("padrao");
    setFormInicio("");
    setFormFim("");
    setFormCatalogId("");
    setFormCatalogValor(null);
  }

  function selectFromPriceTable(idRaw: string) {
    setFormCatalogId(idRaw);
    const id = Number(idRaw);
    const item = priceTable.find((s) => s.id === id);
    if (!item) {
      setFormCatalogValor(null);
      return;
    }
    setFormNome(item.nome);
    setFormValor(moneyDraft(item.valor));
    setFormCatalogValor(item.valor);
  }

  function openAdd(kind: AddKind = "servico") {
    setAddKind(kind);
    resetAddForm();
    setAddOpen(true);
  }

  async function handleSaveEmpresa(e: FormEvent) {
    e.preventDefault();
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
    setSaving(true);
    setFeedback(null);
    try {
      const result = await updateTerceiroFn({
        data: {
          id: detail.id,
          nome: empresaNome,
          documento: documento.trim() || null,
          contato: contato.trim() || null,
          observacao: observacao.trim(),
          omieClientCode:
            empresaSource === "omie" && selectedOmie ? selectedOmie.codigo : null,
          omieAppId: empresaSource === "omie" && selectedOmie ? omieAppId : null,
          active,
        },
      });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      applyDetail(result.detail);
      setEmpresaOpen(false);
      setFeedback({ type: "ok", text: "Dados da empresa salvos." });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao salvar.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMonitoramento(e: FormEvent) {
    e.preventDefault();
    const qtd = Number(qtdContas);
    const preco = parseMoneyInput(precoUnitario || "0");
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
      const result = await updateMonitoramentoFn({
        data: {
          terceiroId: detail.id,
          qtdContas: Math.floor(qtd),
          precoUnitario: preco,
          observacao: monObs.trim(),
        },
      });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      applyDetail(result.detail);
      setFeedback({ type: "ok", text: "Monitoramento atualizado." });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao salvar monitoramento.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleAddSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      if (addKind === "particularidade") {
        const valor = parseMoneyInput(formValor);
        if (!formNome.trim()) {
          setFeedback({ type: "error", text: "Informe o identificador da conta." });
          return;
        }
        if (!Number.isFinite(valor) || valor < 0) {
          setFeedback({ type: "error", text: "Valor inválido." });
          return;
        }
        const result = await createContaExcecaoFn({
          data: {
            terceiroId: detail.id,
            identificador: formNome.trim(),
            valor,
            observacao: formObs.trim(),
          },
        });
        if (!result.ok) {
          setFeedback({ type: "error", text: result.error });
          return;
        }
        applyDetail(result.detail);
        setFeedback({ type: "ok", text: "Particularidade cadastrada." });
      } else if (addKind === "proporcional") {
        if (!formNome.trim()) {
          setFeedback({ type: "error", text: "Informe o identificador da conta." });
          return;
        }
        if (!formInicio || !formFim) {
          setFeedback({ type: "error", text: "Informe o período (de / até)." });
          return;
        }
        let valorMensal: number | undefined;
        if (formBaseTipo === "particularidade") {
          const valor = parseMoneyInput(formValor);
          if (!Number.isFinite(valor) || valor <= 0) {
            setFeedback({ type: "error", text: "Informe o valor mensal da particularidade." });
            return;
          }
          valorMensal = valor;
        }
        const result = await createContaProporcionalFn({
          data: {
            terceiroId: detail.id,
            identificador: formNome.trim(),
            valorBaseTipo: formBaseTipo,
            ...(valorMensal != null ? { valorMensal } : {}),
            dataInicio: formInicio,
            dataFim: formFim,
            observacao: formObs.trim(),
          },
        });
        if (!result.ok) {
          setFeedback({ type: "error", text: result.error });
          return;
        }
        applyDetail(result.detail);
        setFeedback({ type: "ok", text: "Conta proporcional cadastrada." });
      } else {
        const catalogId = formCatalogId ? Number(formCatalogId) : NaN;
        const catalogItem = priceTable.find((s) => s.id === catalogId);
        if (!catalogItem) {
          setFeedback({
            type: "error",
            text:
              priceTable.length === 0
                ? "Cadastre serviços na Tabela de preços antes de adicionar aqui."
                : "Selecione um serviço da Tabela de preços.",
          });
          return;
        }
        const valor = parseMoneyInput(formValor);
        const qtd = formQtd.trim() ? Number(formQtd) : 1;
        if (!Number.isFinite(valor) || valor < 0) {
          setFeedback({ type: "error", text: "Valor inválido." });
          return;
        }
        if (!Number.isFinite(qtd) || qtd <= 0) {
          setFeedback({ type: "error", text: "Quantidade inválida." });
          return;
        }
        const result = await createTerceiroServicoFn({
          data: {
            terceiroId: detail.id,
            nome: catalogItem.nome,
            quantidade: qtd,
            valor,
            observacao: formObs.trim(),
            monthlyServiceId: catalogItem.id,
          },
        });
        if (!result.ok) {
          setFeedback({ type: "error", text: result.error });
          return;
        }
        applyDetail(result.detail);
        setFeedback({ type: "ok", text: "Serviço cadastrado." });
      }
      setAddOpen(false);
      resetAddForm();
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao cadastrar.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveConta(id: number) {
    const valor = parseMoneyInput(editContaValor);
    if (!editContaId.trim() || !Number.isFinite(valor) || valor < 0) {
      setFeedback({ type: "error", text: "Dados da conta inválidos." });
      return;
    }
    const current = detail.contasExcecao.find((c) => c.id === id);
    setSaving(true);
    try {
      const result = await updateContaExcecaoFn({
        data: {
          id,
          identificador: editContaId.trim(),
          valor,
          observacao: editContaObs.trim(),
          active: current?.active !== false,
        },
      });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      applyDetail(result.detail);
      setEditingContaId(null);
      setFeedback({ type: "ok", text: "Conta atualizada." });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveServico(id: number) {
    const valor = parseMoneyInput(editSvcValor);
    const qtd = editSvcQtd.trim() ? Number(editSvcQtd) : 1;
    if (!editSvcNome.trim() || !Number.isFinite(valor) || valor < 0 || !(qtd > 0)) {
      setFeedback({ type: "error", text: "Dados do serviço inválidos." });
      return;
    }
    const current = detail.servicos.find((s) => s.id === id);
    setSaving(true);
    try {
      const result = await updateTerceiroServicoFn({
        data: {
          id,
          nome: editSvcNome.trim(),
          quantidade: qtd,
          valor,
          observacao: editSvcObs.trim(),
          active: current?.active !== false,
        },
      });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      applyDetail(result.detail);
      setEditingSvcId(null);
      setFeedback({ type: "ok", text: "Serviço atualizado." });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveProp(id: number) {
    let valorMensal: number | undefined;
    if (editPropBase === "particularidade") {
      const valor = parseMoneyInput(editPropValor);
      if (!Number.isFinite(valor) || valor <= 0) {
        setFeedback({ type: "error", text: "Informe o valor mensal." });
        return;
      }
      valorMensal = valor;
    }
    setSaving(true);
    try {
      const result = await updateContaProporcionalFn({
        data: {
          id,
          identificador: editPropId.trim(),
          valorBaseTipo: editPropBase,
          ...(valorMensal != null ? { valorMensal } : {}),
          dataInicio: editPropInicio,
          dataFim: editPropFim,
          observacao: editPropObs.trim(),
        },
      });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      applyDetail(result.detail);
      setEditingPropId(null);
      setFeedback({ type: "ok", text: "Proporcional atualizado." });
    } finally {
      setSaving(false);
    }
  }

  async function handleLancarProp(prop: Proporcional) {
    const destino =
      prop.valorBaseTipo === "padrao"
        ? "preço comum (+1 conta) na próxima cobrança"
        : "particularidades (valor mensal cheio) na próxima cobrança";
    if (
      !window.confirm(
        `Lançar “${prop.identificador}”?\nEsta competência fica com o valor proporcional.\nDepois a conta vai para: ${destino}.`,
      )
    ) {
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const result = await lancarContaProporcionalFn({ data: { id: prop.id } });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      applyDetail(result.detail);
      setFeedback({
        type: "ok",
        text:
          prop.valorBaseTipo === "padrao"
            ? "Lançada: próxima cobrança no preço comum."
            : "Lançada: próxima cobrança como particularidade.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao lançar.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTerceiro() {
    if (!window.confirm(`Apagar o terceiro “${detail.nome}”?`)) return;
    setSaving(true);
    try {
      const result = await deleteTerceiroFn({ data: { id: detail.id } });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      await router.invalidate();
      await router.navigate({ to: "/terceiros" });
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkReviewed() {
    setSaving(true);
    setFeedback(null);
    try {
      const result = await markTerceiroReviewedFn({ data: { id: detail.id } });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      applyDetail(result.detail);
      setFeedback({ type: "ok", text: "Alterações marcadas como vistas." });
      await router.invalidate();
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao marcar como visto.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkServicoReviewed(servicoId: number) {
    setSaving(true);
    setFeedback(null);
    try {
      const result = await markServicoReviewedFn({ data: { id: servicoId } });
      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      applyDetail(result.detail);
      setFeedback({ type: "ok", text: "Serviço marcado como visto." });
      await router.invalidate();
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao marcar serviço como visto.",
      });
    } finally {
      setSaving(false);
    }
  }

  const pendingServicos = detail.servicos.filter((s) => s.pendingReview);

  function handleExportExcel() {
    try {
      downloadTerceiroExcel(buildTerceiroReport(detail));
      setFeedback({ type: "ok", text: "Excel exportado." });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao exportar Excel.",
      });
    }
  }

  async function handleExportPdf() {
    setExporting(true);
    try {
      await downloadTerceiroPdf(buildTerceiroReport(detail));
      setFeedback({ type: "ok", text: "PDF gerado." });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao gerar PDF.",
      });
    } finally {
      setExporting(false);
    }
  }

  const { totais } = detail;
  const propsAbertas = detail.contasProporcionais.filter((c) => c.status === "aberta");
  const propsLancadas = detail.contasProporcionais.filter((c) => c.status === "lancada");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-md p-margin-mobile md:p-margin-desktop">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="min-w-0 flex-1">
          <Link
            to="/terceiros"
            onClick={() => {
              void router.invalidate();
            }}
            className="inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary"
          >
            <Icon name="arrow_back" className="text-[18px]" />
            Voltar à lista
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-sm">
            <h1 className="text-headline-lg tracking-tight text-primary">{detail.nome}</h1>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                detail.active ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-700",
              )}
            >
              {detail.active ? "Ativo" : "Inativo"}
            </span>
            {detail.omieClientCode ? (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
                Omie #{detail.omieClientCode}
              </span>
            ) : (
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">
                Sem Omie
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-on-surface-variant">
            {totais.qtdContasTotal} conta(s): {totais.qtdContasPadrao} comum ·{" "}
            {totais.qtdContasExcecao} part. · {totais.qtdContasProporcionais} proporcional
          </p>
        </div>
        <div className="flex flex-wrap gap-sm">
          <button
            type="button"
            onClick={() => openAdd("servico")}
            className="inline-flex items-center gap-xs rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container"
          >
            <Icon name="add" className="text-[18px]" />
            Adicionar
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={handleExportExcel}
            className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-md py-sm text-label-md disabled:opacity-50"
          >
            <Icon name="table_view" className="text-[18px]" />
            Excel
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleExportPdf()}
            className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-md py-sm text-label-md disabled:opacity-50"
          >
            <Icon name="picture_as_pdf" className="text-[18px]" />
            {exporting ? "Gerando..." : "PDF"}
          </button>
          <button
            type="button"
            onClick={() => setEmpresaOpen((v) => !v)}
            className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-md py-sm text-label-md"
          >
            <Icon name="edit" className="text-[18px]" />
            Empresa
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleDeleteTerceiro()}
            className="inline-flex items-center rounded-lg border border-red-200 px-md py-sm text-label-md text-red-700 disabled:opacity-50"
          >
            Apagar
          </button>
        </div>
      </div>

      <section className="grid gap-sm rounded-xl border border-primary/20 bg-primary/5 p-md sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl bg-surface-container-lowest px-md py-sm">
          <p className="text-xs uppercase text-on-surface-variant">Contas totais</p>
          <p className="mt-1 text-lg font-bold tabular-nums">{totais.qtdContasTotal}</p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest px-md py-sm">
          <p className="text-xs uppercase text-on-surface-variant">Preço comum</p>
          <p className="mt-1 font-semibold tabular-nums">{formatMoney(totais.monitoramentoPadrao)}</p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest px-md py-sm">
          <p className="text-xs uppercase text-on-surface-variant">Particularidades</p>
          <p className="mt-1 font-semibold tabular-nums">{formatMoney(totais.contasExcecao)}</p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest px-md py-sm">
          <p className="text-xs uppercase text-on-surface-variant">Proporcionais</p>
          <p className="mt-1 font-semibold tabular-nums">
            {formatMoney(totais.contasProporcionais)}
          </p>
        </div>
        <div className="rounded-xl border border-primary/30 bg-surface-container-lowest px-md py-sm">
          <p className="text-xs uppercase text-on-surface-variant">Total mensal</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-primary">
            {formatMoney(totais.totalMensal)}
          </p>
          <p className="text-xs text-on-surface-variant">
            + serviços {formatMoney(totais.outrosServicos)}
          </p>
        </div>
      </section>

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

      {detail.pendingReview || pendingServicos.length > 0 ? (
        <div className="space-y-sm rounded-xl border border-amber-300 bg-amber-50 px-md py-sm text-amber-950">
          <div className="flex flex-wrap items-center justify-between gap-md">
            <div className="min-w-0">
              <p className="font-semibold">Alteração pendente de checagem</p>
              <p className="text-sm">
                {[
                  detail.lastChangeSummary,
                  detail.lastChangeByName ? `por ${detail.lastChangeByName}` : null,
                  formatDateTimeBr(detail.lastChangeAt),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            {canChecar ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleMarkReviewed()}
                className="inline-flex items-center gap-xs rounded-lg bg-amber-900 px-md py-sm text-label-md text-amber-50 disabled:opacity-50"
              >
                <Icon name="done_all" className="text-[18px]" />
                Marcar tudo como visto
              </button>
            ) : (
              <p className="text-xs text-amber-900/70">
                Aguardando checagem do faturamento
              </p>
            )}
          </div>
          {pendingServicos.length > 0 ? (
            <ul className="space-y-1 border-t border-amber-200 pt-sm text-sm">
              {pendingServicos.map((svc) => (
                <li key={svc.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">Serviço: {svc.nome}</span>
                    {svc.lastChangeSummary ? ` — ${svc.lastChangeSummary}` : ""}
                    {svc.lastChangeByName ? ` · por ${svc.lastChangeByName}` : ""}
                    {formatDateTimeBr(svc.lastChangeAt)
                      ? ` · ${formatDateTimeBr(svc.lastChangeAt)}`
                      : ""}
                  </span>
                  {canChecar ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleMarkServicoReviewed(svc.id)}
                      className="rounded-lg border border-amber-800/30 px-sm py-xs text-xs font-medium disabled:opacity-50"
                    >
                      Checar este serviço
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : detail.reviewedAt ? (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-md py-sm text-sm text-on-surface-variant">
          Última checagem
          {detail.reviewedByName ? ` por ${detail.reviewedByName}` : ""}
          {formatDateTimeBr(detail.reviewedAt)
            ? ` em ${formatDateTimeBr(detail.reviewedAt)}`
            : ""}
          {detail.lastChangeSummary
            ? ` · última alteração: ${detail.lastChangeSummary}`
            : ""}
          {detail.lastChangeByName ? ` (${detail.lastChangeByName})` : ""}
        </div>
      ) : null}

      {empresaOpen ? (
        <form
          onSubmit={(e) => void handleSaveEmpresa(e)}
          className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md"
        >
          <h2 className="text-title-md font-semibold">Dados da empresa</h2>
          <div className="mt-md flex flex-wrap gap-sm">
            <button
              type="button"
              onClick={() => {
                setEmpresaSource("omie");
                if (!selectedOmie && detail.omieClientCode) {
                  setSelectedOmie({
                    codigo: detail.omieClientCode,
                    nome: detail.nome,
                    cnpjCpf: detail.documento,
                    contato: detail.contato,
                  });
                }
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
          <div className="mt-md grid gap-sm sm:grid-cols-2">
            {empresaSource === "omie" ? (
              <div className="relative space-y-xs text-body-md sm:col-span-2">
                <span className="font-medium">Empresa (Omie)</span>
                {selectedOmie ? (
                  <div className="flex items-center justify-between gap-sm rounded-lg border border-outline-variant bg-surface px-sm py-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{selectedOmie.nome}</p>
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
                <span className="font-medium">Nome</span>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                  required
                />
              </label>
            )}
            <label className="block space-y-xs text-body-md">
              <span className="font-medium">CNPJ / documento</span>
              <input
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
              />
            </label>
            <label className="block space-y-xs text-body-md">
              <span className="font-medium">Contato</span>
              <input
                value={contato}
                onChange={(e) => setContato(e.target.value)}
                className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
              />
            </label>
            <label className="block space-y-xs text-body-md sm:col-span-2">
              <span className="font-medium">Observação</span>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="size-4 accent-primary"
              />
              Ativo
            </label>
          </div>
          <div className="mt-md flex gap-sm">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container disabled:opacity-50"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => {
                applyDetail(detail);
                setEmpresaOpen(false);
              }}
              className="rounded-lg border border-outline-variant px-md py-sm text-label-md"
            >
              Fechar
            </button>
          </div>
        </form>
      ) : null}

      <div className="flex gap-md overflow-x-auto pb-md">
        <KanbanColumn
          title="Preço comum"
          subtitle="Contas no valor unitário padrão"
          count={`${totais.qtdContasPadrao}`}
          accent="border-outline-variant"
        >
          <form
            onSubmit={(e) => void handleSaveMonitoramento(e)}
            className="space-y-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-sm"
          >
            <label className="block space-y-xs text-sm">
              <span className="font-medium">Qtd. no preço comum</span>
              <input
                value={qtdContas}
                onChange={(e) => setQtdContas(e.target.value)}
                inputMode="numeric"
                className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
              />
            </label>
            <label className="block space-y-xs text-sm">
              <span className="font-medium">Preço unitário (R$)</span>
              <input
                value={precoUnitario}
                onChange={(e) => setPrecoUnitario(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
              />
            </label>
            <label className="block space-y-xs text-sm">
              <span className="font-medium">Observação</span>
              <input
                value={monObs}
                onChange={(e) => setMonObs(e.target.value)}
                className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
              />
            </label>
            <div className="rounded-lg bg-surface-container-low px-sm py-sm text-sm">
              Subtotal:{" "}
              <span className="font-semibold tabular-nums">
                {formatMoney(totais.monitoramentoPadrao)}
              </span>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container disabled:opacity-50"
            >
              Salvar
            </button>
          </form>
        </KanbanColumn>

        <KanbanColumn
          title="Particularidades"
          subtitle="Valor próprio · à parte do preço comum"
          count={`${totais.qtdContasExcecao}`}
          accent="border-amber-200"
        >
          {detail.contasExcecao.length === 0 ? (
            <p className="px-sm py-md text-center text-sm text-on-surface-variant">
              Nenhuma particularidade.
            </p>
          ) : (
            detail.contasExcecao.map((conta) => {
              const editing = editingContaId === conta.id;
              return (
                <article
                  key={conta.id}
                  className={cn(
                    "rounded-xl border border-outline-variant bg-surface-container-lowest p-sm",
                    !conta.active && "opacity-60",
                  )}
                >
                  {editing ? (
                    <div className="space-y-sm">
                      <input
                        value={editContaId}
                        onChange={(e) => setEditContaId(e.target.value)}
                        className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-sm"
                      />
                      <input
                        value={editContaValor}
                        onChange={(e) => setEditContaValor(e.target.value)}
                        inputMode="decimal"
                        className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-sm"
                      />
                      <input
                        value={editContaObs}
                        onChange={(e) => setEditContaObs(e.target.value)}
                        className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-sm"
                        placeholder="Obs."
                      />
                      <div className="flex gap-xs">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleSaveConta(conta.id)}
                          className="rounded-lg bg-secondary-container px-sm py-xs text-xs font-semibold text-on-secondary-container"
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingContaId(null)}
                          className="rounded-lg border border-outline-variant px-sm py-xs text-xs"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between gap-2">
                        <div>
                          <p className="font-medium">{conta.identificador}</p>
                          {conta.observacao ? (
                            <p className="text-xs text-on-surface-variant">{conta.observacao}</p>
                          ) : null}
                        </div>
                        <p className="font-semibold tabular-nums text-primary">
                          {formatMoney(conta.valor)}
                        </p>
                      </div>
                      <div className="mt-sm flex flex-wrap gap-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingContaId(conta.id);
                            setEditContaId(conta.identificador);
                            setEditContaValor(moneyDraft(conta.valor));
                            setEditContaObs(conta.observacao);
                          }}
                          className="rounded-lg border border-outline-variant px-sm py-xs text-xs"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            void updateContaExcecaoFn({
                              data: {
                                id: conta.id,
                                identificador: conta.identificador,
                                valor: conta.valor,
                                observacao: conta.observacao,
                                active: !conta.active,
                              },
                            }).then((r) => r.ok && applyDetail(r.detail))
                          }
                          className="rounded-lg border border-outline-variant px-sm py-xs text-xs"
                        >
                          {conta.active ? "Desativar" : "Reativar"}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => {
                            if (!window.confirm("Apagar esta conta?")) return;
                            void deleteContaExcecaoFn({ data: { id: conta.id } }).then(
                              (r) => r.ok && applyDetail(r.detail),
                            );
                          }}
                          className="rounded-lg border border-red-200 px-sm py-xs text-xs text-red-700"
                        >
                          Apagar
                        </button>
                      </div>
                    </>
                  )}
                </article>
              );
            })
          )}
        </KanbanColumn>

        <KanbanColumn
          title="Proporcionais"
          subtitle="Período parcial · depois lance para cobrança normal"
          count={`${propsAbertas.length}`}
          accent="border-violet-200"
        >
          {propsAbertas.length === 0 && propsLancadas.length === 0 ? (
            <p className="px-sm py-md text-center text-sm text-on-surface-variant">
              Nenhuma conta proporcional.
            </p>
          ) : null}

          {propsAbertas.map((prop) => {
            const editing = editingPropId === prop.id;
            return (
              <article
                key={prop.id}
                className="rounded-xl border border-violet-200 bg-surface-container-lowest p-sm"
              >
                {editing ? (
                  <div className="space-y-sm">
                    <input
                      value={editPropId}
                      onChange={(e) => setEditPropId(e.target.value)}
                      className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-sm"
                    />
                    <select
                      value={editPropBase}
                      onChange={(e) =>
                        setEditPropBase(e.target.value as "padrao" | "particularidade")
                      }
                      className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-sm"
                    >
                      <option value="padrao">Base: preço comum</option>
                      <option value="particularidade">Base: particularidade</option>
                    </select>
                    {editPropBase === "particularidade" ? (
                      <input
                        value={editPropValor}
                        onChange={(e) => setEditPropValor(e.target.value)}
                        inputMode="decimal"
                        className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-sm"
                        placeholder="Valor mensal"
                      />
                    ) : null}
                    <div className="grid grid-cols-2 gap-sm">
                      <input
                        type="date"
                        value={editPropInicio}
                        onChange={(e) => setEditPropInicio(e.target.value)}
                        className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-sm"
                      />
                      <input
                        type="date"
                        value={editPropFim}
                        onChange={(e) => setEditPropFim(e.target.value)}
                        className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-sm"
                      />
                    </div>
                    <input
                      value={editPropObs}
                      onChange={(e) => setEditPropObs(e.target.value)}
                      className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-sm"
                      placeholder="Obs."
                    />
                    <div className="flex gap-xs">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleSaveProp(prop.id)}
                        className="rounded-lg bg-secondary-container px-sm py-xs text-xs font-semibold text-on-secondary-container"
                      >
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingPropId(null)}
                        className="rounded-lg border border-outline-variant px-sm py-xs text-xs"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between gap-2">
                      <div>
                        <p className="font-medium">{prop.identificador}</p>
                        <p className="text-xs text-on-surface-variant">
                          {formatDateBr(prop.dataInicio)} → {formatDateBr(prop.dataFim)} ·{" "}
                          {prop.dias} dia(s)
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          Base:{" "}
                          {prop.valorBaseTipo === "padrao"
                            ? "preço comum"
                            : `particularidade (${formatMoney(prop.valorMensal)}/mês)`}
                        </p>
                      </div>
                      <p className="font-semibold tabular-nums text-primary">
                        {formatMoney(prop.valorProporcional)}
                      </p>
                    </div>
                    <div className="mt-sm flex flex-wrap gap-xs">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleLancarProp(prop)}
                        className="rounded-lg bg-secondary-container px-sm py-xs text-xs font-semibold text-on-secondary-container"
                      >
                        Lançar p/ próxima
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPropId(prop.id);
                          setEditPropId(prop.identificador);
                          setEditPropBase(prop.valorBaseTipo);
                          setEditPropValor(moneyDraft(prop.valorMensal));
                          setEditPropInicio(prop.dataInicio);
                          setEditPropFim(prop.dataFim);
                          setEditPropObs(prop.observacao);
                        }}
                        className="rounded-lg border border-outline-variant px-sm py-xs text-xs"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          if (!window.confirm("Apagar proporcional?")) return;
                          void deleteContaProporcionalFn({ data: { id: prop.id } }).then(
                            (r) => r.ok && applyDetail(r.detail),
                          );
                        }}
                        className="rounded-lg border border-red-200 px-sm py-xs text-xs text-red-700"
                      >
                        Apagar
                      </button>
                    </div>
                  </>
                )}
              </article>
            );
          })}

          {propsLancadas.length > 0 ? (
            <p className="px-sm pt-sm text-xs font-medium uppercase text-on-surface-variant">
              Já lançadas
            </p>
          ) : null}
          {propsLancadas.map((prop) => (
            <article
              key={prop.id}
              className="rounded-xl border border-outline-variant bg-surface-container-low/80 p-sm opacity-70"
            >
              <p className="font-medium">{prop.identificador}</p>
              <p className="text-xs text-on-surface-variant">
                {formatDateBr(prop.dataInicio)} → {formatDateBr(prop.dataFim)} ·{" "}
                {formatMoney(prop.valorProporcional)} · enviada para{" "}
                {prop.valorBaseTipo === "padrao" ? "preço comum" : "particularidade"}
              </p>
            </article>
          ))}
        </KanbanColumn>

        <KanbanColumn
          title="Outros serviços"
          subtitle="Serviços mensais adicionais"
          count={`${detail.servicos.filter((s) => s.active).length}`}
          accent="border-sky-200"
        >
          {detail.servicos.length === 0 ? (
            <p className="px-sm py-md text-center text-sm text-on-surface-variant">
              Nenhum serviço adicional.
            </p>
          ) : (
            detail.servicos.map((svc) => {
              const editing = editingSvcId === svc.id;
              return (
                <article
                  key={svc.id}
                  className={cn(
                    "rounded-xl border bg-surface-container-lowest p-sm",
                    svc.pendingReview
                      ? "border-amber-400 ring-1 ring-amber-200"
                      : "border-outline-variant",
                    !svc.active && "opacity-60",
                  )}
                >
                  {editing ? (
                    <div className="space-y-sm">
                      <input
                        value={editSvcNome}
                        onChange={(e) => setEditSvcNome(e.target.value)}
                        className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-sm"
                      />
                      <div className="grid grid-cols-2 gap-sm">
                        <input
                          value={editSvcQtd}
                          onChange={(e) => setEditSvcQtd(e.target.value)}
                          className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-sm"
                          placeholder="Qtd."
                        />
                        <input
                          value={editSvcValor}
                          onChange={(e) => setEditSvcValor(e.target.value)}
                          className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-sm"
                          placeholder="Valor"
                        />
                      </div>
                      <input
                        value={editSvcObs}
                        onChange={(e) => setEditSvcObs(e.target.value)}
                        className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-sm"
                        placeholder="Obs."
                      />
                      <div className="flex gap-xs">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleSaveServico(svc.id)}
                          className="rounded-lg bg-secondary-container px-sm py-xs text-xs font-semibold text-on-secondary-container"
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingSvcId(null)}
                          className="rounded-lg border border-outline-variant px-sm py-xs text-xs"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1">
                            <p className="font-medium">{svc.nome}</p>
                            {svc.monthlyServiceId ? (
                              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-800">
                                Tabela
                              </span>
                            ) : null}
                            {svc.pendingReview ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                                Pendente
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-on-surface-variant">
                            {svc.quantidade} × {formatMoney(svc.valor)}
                            {svc.observacao ? ` · ${svc.observacao}` : ""}
                          </p>
                          {svc.pendingReview ? (
                            <p className="mt-1 text-[11px] text-amber-900/80">
                              {[
                                svc.lastChangeSummary,
                                svc.lastChangeByName ? `por ${svc.lastChangeByName}` : null,
                                formatDateTimeBr(svc.lastChangeAt),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          ) : null}
                        </div>
                        <p className="font-semibold tabular-nums text-primary">
                          {formatMoney(svc.subtotal)}
                        </p>
                      </div>
                      <div className="mt-sm flex flex-wrap gap-xs">
                        {svc.pendingReview && canChecar ? (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void handleMarkServicoReviewed(svc.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-amber-900 px-sm py-xs text-xs text-amber-50 disabled:opacity-50"
                          >
                            <Icon name="check" className="text-[14px]" />
                            Checar
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSvcId(svc.id);
                            setEditSvcNome(svc.nome);
                            setEditSvcQtd(String(svc.quantidade));
                            setEditSvcValor(moneyDraft(svc.valor));
                            setEditSvcObs(svc.observacao);
                          }}
                          className="rounded-lg border border-outline-variant px-sm py-xs text-xs"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            void updateTerceiroServicoFn({
                              data: {
                                id: svc.id,
                                nome: svc.nome,
                                quantidade: svc.quantidade,
                                valor: svc.valor,
                                observacao: svc.observacao,
                                active: !svc.active,
                              },
                            }).then((r) => r.ok && applyDetail(r.detail))
                          }
                          className="rounded-lg border border-outline-variant px-sm py-xs text-xs"
                        >
                          {svc.active ? "Desativar" : "Reativar"}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => {
                            if (!window.confirm("Apagar serviço?")) return;
                            void deleteTerceiroServicoFn({ data: { id: svc.id } }).then(
                              (r) => r.ok && applyDetail(r.detail),
                            );
                          }}
                          className="rounded-lg border border-red-200 px-sm py-xs text-xs text-red-700"
                        >
                          Apagar
                        </button>
                      </div>
                    </>
                  )}
                </article>
              );
            })
          )}
        </KanbanColumn>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent
          className="overflow-hidden"
          style={{ width: "min(48rem, calc(100vw - 2rem))", maxHeight: "min(92vh, 56rem)" }}
        >
          <DialogHeader>
            <DialogTitle>Adicionar item</DialogTitle>
            <DialogDescription>
              Escolha o tipo e preencha os dados. Contas proporcionais cobram só o período e, ao
              lançar, vão para a cobrança normal na próxima competência.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => void handleAddSubmit(e)} className="space-y-sm">
            <div className="flex flex-wrap gap-xs">
              {(
                [
                  ["servico", "Serviço"],
                  ["particularidade", "Particularidade"],
                  ["proporcional", "Proporcional"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAddKind(id)}
                  className={cn(
                    "rounded-full border px-md py-xs text-sm",
                    addKind === id
                      ? "border-primary bg-primary text-on-primary"
                      : "border-outline-variant bg-surface",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {addKind === "servico" ? (
              <>
                <label className="block space-y-xs text-sm">
                  <span className="font-medium">Serviço (Tabela de preços)</span>
                  <select
                    value={formCatalogId}
                    onChange={(e) => selectFromPriceTable(e.target.value)}
                    className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                    required
                  >
                    <option value="">
                      {priceTable.length === 0
                        ? "Nenhum serviço na Tabela de preços"
                        : "Selecione um serviço..."}
                    </option>
                    {priceTable.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome} ({formatMoney(item.valor)}/mês)
                      </option>
                    ))}
                  </select>
                  {priceTable.length === 0 ? (
                    <span className="text-xs text-on-surface-variant">
                      Cadastre itens em Comercial → Tabela de preços.
                    </span>
                  ) : null}
                </label>
                <div className="grid grid-cols-2 gap-sm">
                  <label className="block space-y-xs text-sm">
                    <span className="font-medium">Qtd.</span>
                    <input
                      value={formQtd}
                      onChange={(e) => setFormQtd(e.target.value)}
                      className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                    />
                  </label>
                  <label className="block space-y-xs text-sm">
                    <span className="font-medium">Valor unit. (R$)</span>
                    <input
                      value={formValor}
                      onChange={(e) => setFormValor(e.target.value)}
                      inputMode="decimal"
                      className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                      required
                      disabled={!formCatalogId}
                    />
                    {formCatalogId && formCatalogValor != null ? (
                      <span className="text-xs text-on-surface-variant">
                        Tabela: {formatMoney(formCatalogValor)}
                        {Number.isFinite(parseMoneyInput(formValor)) &&
                        Math.abs(parseMoneyInput(formValor) - formCatalogValor) > 0.009
                          ? " · valor alterado para este terceiro"
                          : " · pode alterar se precisar"}
                      </span>
                    ) : null}
                  </label>
                </div>
              </>
            ) : (
              <label className="block space-y-xs text-sm">
                <span className="font-medium">Identificador da conta</span>
                <input
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                  required
                />
              </label>
            )}

            {addKind === "particularidade" ? (
              <label className="block space-y-xs text-sm">
                <span className="font-medium">Valor mensal (R$)</span>
                <input
                  value={formValor}
                  onChange={(e) => setFormValor(e.target.value)}
                  inputMode="decimal"
                  className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                  required
                />
              </label>
            ) : null}

            {addKind === "proporcional" ? (
              <>
                <fieldset className="space-y-xs text-sm">
                  <legend className="font-medium">Base do valor</legend>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="base"
                      checked={formBaseTipo === "padrao"}
                      onChange={() => setFormBaseTipo("padrao")}
                    />
                    Preço comum (unitário do monitoramento)
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="base"
                      checked={formBaseTipo === "particularidade"}
                      onChange={() => setFormBaseTipo("particularidade")}
                    />
                    Particularidade (valor próprio)
                  </label>
                </fieldset>
                {formBaseTipo === "particularidade" ? (
                  <label className="block space-y-xs text-sm">
                    <span className="font-medium">Valor mensal cheio (R$)</span>
                    <input
                      value={formValor}
                      onChange={(e) => setFormValor(e.target.value)}
                      inputMode="decimal"
                      className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                      required
                    />
                  </label>
                ) : (
                  <p className="text-xs text-on-surface-variant">
                    Usará {formatMoney(detail.monitoramento.precoUnitario)} / mês como base.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-sm">
                  <label className="block space-y-xs text-sm">
                    <span className="font-medium">De</span>
                    <input
                      type="date"
                      value={formInicio}
                      onChange={(e) => setFormInicio(e.target.value)}
                      className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                      required
                    />
                  </label>
                  <label className="block space-y-xs text-sm">
                    <span className="font-medium">Até</span>
                    <input
                      type="date"
                      value={formFim}
                      onChange={(e) => setFormFim(e.target.value)}
                      className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                      required
                    />
                  </label>
                </div>
                {previewDias != null ? (
                  <p className="text-xs text-on-surface-variant">
                    {previewDias} dia(s) no período · valor = (mensal ÷ dias do mês) × dias
                  </p>
                ) : null}
              </>
            ) : null}

            <label className="block space-y-xs text-sm">
              <span className="font-medium">Observação / particularidade</span>
              <input
                value={formObs}
                onChange={(e) => setFormObs(e.target.value)}
                className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
              />
            </label>

            <DialogFooter className="gap-sm">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="rounded-lg border border-outline-variant px-md py-sm text-label-md"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Cadastrar"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
