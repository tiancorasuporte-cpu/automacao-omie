import { useMemo, useState } from "react";

import { Icon } from "@/components/Icon";
import { PageSection } from "@/components/PageChrome";
import {
  SoftDialogBody,
  SoftDialogContent,
  SoftDialogFooter,
  SoftDialogHeader,
  softCancelBtnClass,
  softPrimaryBtnClass,
} from "@/components/SoftOsDialog";
import { Dialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteAssistChecklistFn,
  saveAssistChecklistFn,
  saveAssistProblemTypeFn,
} from "@/lib/assistencia";
import { cn } from "@/lib/utils";

export type ProblemTypeRow = {
  id: number;
  name: string;
  active: boolean;
  sortOrder: number;
};

export type ChecklistRow = {
  id: number;
  name: string;
  active: boolean;
  sortOrder: number;
  problemTypeIds: number[];
  items: Array<{
    id: number;
    checklistId: number;
    label: string;
    sortOrder: number;
    required: boolean;
  }>;
};

type Props = {
  problemTypes: ProblemTypeRow[];
  checklists: ChecklistRow[];
  canEdit: boolean;
  onRefresh: (next: { problemTypes: ProblemTypeRow[]; checklists: ChecklistRow[] }) => void;
  busy: boolean;
  setBusy: (v: boolean) => void;
  setFeedback: (v: { type: "ok" | "error"; text: string } | null) => void;
};

const btnPrimary =
  "inline-flex items-center gap-xs rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container disabled:opacity-50";
const btnOutline =
  "inline-flex items-center gap-xs rounded-lg border border-outline-variant bg-surface px-md py-sm text-label-md font-semibold text-on-surface disabled:opacity-50";

export function AssistChecklistConfig({
  problemTypes,
  checklists,
  canEdit,
  onRefresh,
  busy,
  setBusy,
  setFeedback,
}: Props) {
  const [problemName, setProblemName] = useState("");
  const [editingProblemId, setEditingProblemId] = useState<number | null>(null);

  const [clName, setClName] = useState("");
  const [editingClId, setEditingClId] = useState<number | null>(null);
  const [clProblemIds, setClProblemIds] = useState<number[]>([]);
  const [clItems, setClItems] = useState<
    Array<{ key: string; id?: number | null; label: string; required: boolean }>
  >([{ key: "new-1", label: "", required: true }]);

  const [listOpen, setListOpen] = useState(false);
  const [listQuery, setListQuery] = useState("");
  const [itemsOpenId, setItemsOpenId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ChecklistRow | null>(null);
  const [problemLinkQuery, setProblemLinkQuery] = useState("");

  const activeProblems = useMemo(
    () => problemTypes.filter((p) => p.active),
    [problemTypes],
  );

  const linkedProblems = useMemo(
    () => activeProblems.filter((p) => clProblemIds.includes(p.id)),
    [activeProblems, clProblemIds],
  );

  const problemsToLink = useMemo(() => {
    const q = problemLinkQuery.trim().toLowerCase();
    if (!q) return [];
    return activeProblems.filter(
      (p) => !clProblemIds.includes(p.id) && p.name.toLowerCase().includes(q),
    );
  }, [activeProblems, clProblemIds, problemLinkQuery]);

  const filteredChecklists = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return checklists;
    return checklists.filter((cl) => {
      if (cl.name.toLowerCase().includes(q)) return true;
      if (cl.items.some((it) => it.label.toLowerCase().includes(q))) return true;
      return cl.problemTypeIds.some((id) =>
        (problemTypes.find((p) => p.id === id)?.name ?? "").toLowerCase().includes(q),
      );
    });
  }, [checklists, listQuery, problemTypes]);

  function resetChecklistForm() {
    setEditingClId(null);
    setClName("");
    setClProblemIds([]);
    setProblemLinkQuery("");
    setClItems([{ key: `new-${Date.now()}`, label: "", required: true }]);
  }

  function loadChecklist(cl: ChecklistRow) {
    setEditingClId(cl.id);
    setClName(cl.name);
    setClProblemIds([...cl.problemTypeIds]);
    setProblemLinkQuery("");
    setClItems(
      cl.items.length
        ? cl.items.map((it) => ({
            key: `it-${it.id}`,
            id: it.id,
            label: it.label,
            required: it.required,
          }))
        : [{ key: `new-${Date.now()}`, label: "", required: true }],
    );
    setListOpen(false);
  }

  async function saveProblem() {
    if (!canEdit || !problemName.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      const next = await saveAssistProblemTypeFn({
        data: {
          id: editingProblemId,
          name: problemName.trim(),
          active: true,
        },
      });
      onRefresh({ problemTypes: next, checklists });
      setProblemName("");
      setEditingProblemId(null);
      setFeedback({ type: "ok", text: "Tipo de problema salvo." });
    } catch (e) {
      setFeedback({
        type: "error",
        text: e instanceof Error ? e.message : "Falha ao salvar problema.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function toggleProblemActive(p: ProblemTypeRow) {
    if (!canEdit) return;
    setBusy(true);
    try {
      const next = await saveAssistProblemTypeFn({
        data: { id: p.id, name: p.name, active: !p.active, sortOrder: p.sortOrder },
      });
      onRefresh({ problemTypes: next, checklists });
    } catch (e) {
      setFeedback({
        type: "error",
        text: e instanceof Error ? e.message : "Falha ao atualizar problema.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveChecklist() {
    if (!canEdit || !clName.trim()) return;
    const items = clItems
      .map((it, idx) => ({
        id: it.id,
        label: it.label.trim(),
        required: it.required,
        sortOrder: idx,
      }))
      .filter((it) => it.label);
    if (!items.length) {
      setFeedback({ type: "error", text: "Inclua ao menos um item no checklist." });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const next = await saveAssistChecklistFn({
        data: {
          id: editingClId,
          name: clName.trim(),
          active: true,
          problemTypeIds: clProblemIds,
          items,
        },
      });
      onRefresh({ problemTypes, checklists: next });
      resetChecklistForm();
      setFeedback({ type: "ok", text: "Checklist salvo." });
    } catch (e) {
      setFeedback({
        type: "error",
        text: e instanceof Error ? e.message : "Falha ao salvar checklist.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function toggleChecklistActive(cl: ChecklistRow) {
    if (!canEdit) return;
    setBusy(true);
    try {
      const next = await saveAssistChecklistFn({
        data: {
          id: cl.id,
          name: cl.name,
          active: !cl.active,
          sortOrder: cl.sortOrder,
          problemTypeIds: cl.problemTypeIds,
          items: cl.items.map((it, idx) => ({
            id: it.id,
            label: it.label,
            required: it.required,
            sortOrder: idx,
          })),
        },
      });
      onRefresh({ problemTypes, checklists: next });
    } catch (e) {
      setFeedback({
        type: "error",
        text: e instanceof Error ? e.message : "Falha ao atualizar checklist.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function excludeChecklist(cl: ChecklistRow) {
    if (!canEdit) return;
    setBusy(true);
    setFeedback(null);
    try {
      const next = await deleteAssistChecklistFn({ data: { id: cl.id } });
      onRefresh({ problemTypes, checklists: next });
      if (editingClId === cl.id) resetChecklistForm();
      setDeleteConfirm(null);
      setFeedback({ type: "ok", text: "Checklist excluído." });
    } catch (e) {
      setFeedback({
        type: "error",
        text: e instanceof Error ? e.message : "Falha ao excluir checklist.",
      });
      setDeleteConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-lg lg:grid-cols-2">
      <PageSection>
        <p className="text-title-md text-on-surface">Tipos de problema</p>
        <p className="mb-md text-label-md text-on-surface-variant">
          Cadastre os problemas da OS e vincule checklists a eles.
        </p>
        {canEdit ? (
          <div className="mb-md flex flex-wrap gap-sm">
            <input
              value={problemName}
              onChange={(e) => setProblemName(e.target.value)}
              placeholder="Nome do problema"
              className="min-w-[12rem] flex-1 rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
            />
            <button type="button" disabled={busy} onClick={() => void saveProblem()} className={btnPrimary}>
              {editingProblemId ? "Atualizar" : "Adicionar"}
            </button>
            {editingProblemId ? (
              <button
                type="button"
                className={btnOutline}
                onClick={() => {
                  setEditingProblemId(null);
                  setProblemName("");
                }}
              >
                Cancelar
              </button>
            ) : null}
          </div>
        ) : null}
        <ul className="space-y-xs">
          {problemTypes.map((p) => (
            <li
              key={p.id}
              className={cn(
                "flex items-center justify-between gap-sm rounded-lg border border-outline-variant px-sm py-sm",
                !p.active && "opacity-60",
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-body-md font-semibold text-on-surface">{p.name}</p>
                <p className="text-label-sm text-on-surface-variant">
                  {p.active ? "Ativo" : "Inativo"} ·{" "}
                  {checklists.filter((c) => c.problemTypeIds.includes(p.id)).length} checklist(s)
                </p>
              </div>
              {canEdit ? (
                <div className="flex shrink-0 gap-xs">
                  <button
                    type="button"
                    className={btnOutline}
                    onClick={() => {
                      setEditingProblemId(p.id);
                      setProblemName(p.name);
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className={btnOutline}
                    disabled={busy}
                    onClick={() => void toggleProblemActive(p)}
                  >
                    {p.active ? "Desativar" : "Ativar"}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
          {!problemTypes.length ? (
            <p className="text-body-md text-on-surface-variant">Nenhum tipo cadastrado.</p>
          ) : null}
        </ul>
      </PageSection>

      <PageSection>
        <div className="mb-md flex flex-wrap items-start justify-between gap-sm">
          <div>
            <p className="text-title-md text-on-surface">
              {editingClId ? "Editar checklist" : "Checklists"}
            </p>
            <p className="text-label-md text-on-surface-variant">
              Itens com OK / Não OK. Vincule a um ou mais tipos de problema.
            </p>
          </div>
          <button
            type="button"
            className={btnOutline}
            onClick={() => {
              setListQuery("");
              setItemsOpenId(null);
              setListOpen(true);
            }}
          >
            <Icon name="checklist" className="text-[16px]" />
            Ver checklists ({checklists.length})
          </button>
        </div>

        {canEdit ? (
          <div className="space-y-sm rounded-xl border border-outline-variant bg-surface-container-low p-md">
            <input
              value={clName}
              onChange={(e) => setClName(e.target.value)}
              placeholder="Nome do checklist"
              className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
            />
            <div className="space-y-xs">
              <p className="text-label-md font-semibold text-on-surface-variant">
                Problemas vinculados
              </p>
              {linkedProblems.length ? (
                <div className="flex flex-wrap gap-xs">
                  {linkedProblems.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setClProblemIds((prev) => prev.filter((id) => id !== p.id))
                      }
                      className="inline-flex items-center gap-2xs rounded-full bg-secondary-container px-sm py-1 text-label-md font-semibold text-on-secondary-container"
                      title="Remover vínculo"
                    >
                      {p.name}
                      <Icon name="close" className="text-[14px]" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-label-md text-on-surface-variant">
                  Nenhum problema vinculado ainda.
                </p>
              )}
              {!activeProblems.length ? (
                <p className="text-label-md text-on-surface-variant">
                  Cadastre um problema ativo primeiro.
                </p>
              ) : (
                <div className="space-y-xs">
                  <label className="flex items-center gap-sm rounded-lg border border-outline-variant bg-surface px-sm py-sm">
                    <Icon
                      name="search"
                      className="shrink-0 text-[20px] text-on-surface-variant"
                    />
                    <input
                      value={problemLinkQuery}
                      onChange={(e) => setProblemLinkQuery(e.target.value)}
                      placeholder="Buscar problema para vincular…"
                      className="min-w-0 flex-1 bg-transparent text-body-md outline-none placeholder:text-on-surface-variant"
                    />
                  </label>
                  {problemLinkQuery.trim() ? (
                    problemsToLink.length ? (
                      <ul className="max-h-40 overflow-auto rounded-lg border border-outline-variant bg-surface">
                        {problemsToLink.map((p) => (
                          <li
                            key={p.id}
                            className="border-b border-outline-variant last:border-b-0"
                          >
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-sm px-sm py-sm text-left text-body-md hover:bg-surface-container-high"
                              onClick={() => {
                                setClProblemIds((prev) =>
                                  prev.includes(p.id) ? prev : [...prev, p.id],
                                );
                                setProblemLinkQuery("");
                              }}
                            >
                              <span className="truncate">{p.name}</span>
                              <span className="shrink-0 text-label-md font-semibold text-primary">
                                Vincular
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-label-md text-on-surface-variant">
                        Nenhum problema encontrado para “{problemLinkQuery.trim()}”.
                      </p>
                    )
                  ) : null}
                </div>
              )}
            </div>
            <div className="space-y-xs">
              <p className="text-label-md font-semibold text-on-surface-variant">Itens</p>
              {clItems.map((it, idx) => (
                <div key={it.key} className="flex flex-wrap items-center gap-xs">
                  <input
                    value={it.label}
                    onChange={(e) =>
                      setClItems((prev) =>
                        prev.map((row) =>
                          row.key === it.key ? { ...row, label: e.target.value } : row,
                        ),
                      )
                    }
                    placeholder={`Item ${idx + 1}`}
                    className="min-w-[10rem] flex-1 rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
                  />
                  <label className="flex items-center gap-2xs text-label-md text-on-surface">
                    <input
                      type="checkbox"
                      checked={it.required}
                      onChange={(e) =>
                        setClItems((prev) =>
                          prev.map((row) =>
                            row.key === it.key ? { ...row, required: e.target.checked } : row,
                          ),
                        )
                      }
                    />
                    Obrigatório
                  </label>
                  <button
                    type="button"
                    className={btnOutline}
                    onClick={() =>
                      setClItems((prev) =>
                        prev.length <= 1 ? prev : prev.filter((row) => row.key !== it.key),
                      )
                    }
                  >
                    <Icon name="close" className="text-[16px]" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className={btnOutline}
                onClick={() =>
                  setClItems((prev) => [
                    ...prev,
                    { key: `new-${Date.now()}`, label: "", required: true },
                  ])
                }
              >
                <Icon name="add" className="text-[16px]" />
                Item
              </button>
            </div>
            <div className="flex flex-wrap gap-sm">
              <button type="button" disabled={busy} onClick={() => void saveChecklist()} className={btnPrimary}>
                {editingClId ? "Atualizar checklist" : "Salvar checklist"}
              </button>
              {editingClId ? (
                <button type="button" className={btnOutline} onClick={resetChecklistForm}>
                  Novo
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-body-md text-on-surface-variant">Sem permissão para editar.</p>
        )}
      </PageSection>

      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <SoftDialogContent size="lg">
          <SoftDialogHeader eyebrow="ASSISTÊNCIA" title="CHECKLISTS CADASTRADOS" />
          <SoftDialogBody>
            <label className="mb-md flex items-center gap-sm rounded-lg border border-outline-variant bg-surface px-sm py-sm">
              <Icon name="search" className="shrink-0 text-[20px] text-on-surface-variant" />
              <input
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                placeholder="Filtrar por nome, item ou problema…"
                className="min-w-0 flex-1 bg-transparent text-body-md outline-none placeholder:text-on-surface-variant"
                autoFocus
              />
            </label>
            <ul className="divide-y divide-outline-variant rounded-lg border border-outline-variant">
              {filteredChecklists.map((cl) => {
                const itemsVisible = itemsOpenId === cl.id;
                return (
                  <li
                    key={cl.id}
                    className={cn("px-sm py-xs", !cl.active && "opacity-60")}
                  >
                    <div className="flex items-center gap-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body-md font-semibold text-on-surface">
                          {cl.name}
                        </p>
                        <p className="truncate text-label-sm text-on-surface-variant">
                          {cl.items.length} item(ns) ·{" "}
                          {cl.problemTypeIds.length
                            ? cl.problemTypeIds
                                .map(
                                  (id) =>
                                    problemTypes.find((p) => p.id === id)?.name ?? `#${id}`,
                                )
                                .join(", ")
                            : "sem problema vinculado"}
                          {!cl.active ? " · inativo" : ""}
                        </p>
                      </div>
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-outline-variant bg-surface text-on-surface hover:bg-surface-container-high"
                            aria-label={`Ações de ${cl.name}`}
                          >
                            <Icon name="more_vert" className="text-[20px]" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[10rem]">
                          <DropdownMenuItem
                            onSelect={() =>
                              setItemsOpenId((prev) => (prev === cl.id ? null : cl.id))
                            }
                          >
                            {itemsVisible ? "Ocultar itens" : "Ver itens"}
                          </DropdownMenuItem>
                          {canEdit ? (
                            <>
                              <DropdownMenuItem onSelect={() => loadChecklist(cl)}>
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={busy}
                                onSelect={() => void toggleChecklistActive(cl)}
                              >
                                {cl.active ? "Desativar" : "Ativar"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={busy}
                                className="text-destructive focus:text-destructive"
                                onSelect={() => setDeleteConfirm(cl)}
                              >
                                Excluir
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {itemsVisible ? (
                      cl.items.length ? (
                        <ul className="mt-xs list-disc pl-md text-label-md text-on-surface-variant">
                          {cl.items.map((it) => (
                            <li key={it.id}>
                              {it.label}
                              {it.required ? "" : " (opc.)"}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-xs text-label-md text-on-surface-variant">
                          Nenhum item cadastrado.
                        </p>
                      )
                    ) : null}
                  </li>
                );
              })}
              {!filteredChecklists.length ? (
                <li className="px-sm py-md text-body-md text-on-surface-variant">
                  Nenhum checklist encontrado
                  {listQuery.trim() ? ` para “${listQuery.trim()}”` : ""}.
                </li>
              ) : null}
            </ul>
          </SoftDialogBody>
          <SoftDialogFooter>
            <button
              type="button"
              className={softCancelBtnClass}
              onClick={() => setListOpen(false)}
            >
              Fechar
            </button>
            <button
              type="button"
              className={softPrimaryBtnClass}
              onClick={() => setListOpen(false)}
            >
              OK
            </button>
          </SoftDialogFooter>
        </SoftDialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteConfirm)}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirm(null);
        }}
      >
        <SoftDialogContent size="md">
          <SoftDialogHeader eyebrow="ASSISTÊNCIA" title="EXCLUIR CHECKLIST" />
          <SoftDialogBody>
            <p className="text-body-md text-on-surface">
              Excluir permanentemente o checklist{" "}
              <span className="font-semibold">{deleteConfirm?.name}</span>? Esta ação não
              pode ser desfeita.
            </p>
          </SoftDialogBody>
          <SoftDialogFooter>
            <button
              type="button"
              className={softCancelBtnClass}
              disabled={busy}
              onClick={() => setDeleteConfirm(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={softPrimaryBtnClass}
              disabled={busy || !deleteConfirm}
              onClick={() => {
                if (deleteConfirm) void excludeChecklist(deleteConfirm);
              }}
            >
              Excluir
            </button>
          </SoftDialogFooter>
        </SoftDialogContent>
      </Dialog>
    </div>
  );
}
