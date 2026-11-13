import { useEffect, useMemo, useState } from "react";

import {
  attachOsChecklistFn,
  detachOsChecklistFn,
  listOsChecklistsFn,
  saveOsChecklistAnswersFn,
  setOsProblemTypeFn,
} from "@/lib/assistencia";
import { cn } from "@/lib/utils";

export type OsChecklistView = {
  id: number;
  osId: number;
  checklistId: number;
  checklistName: string;
  problemTypeId: number | null;
  status: "pending" | "done";
  filledBy: string | null;
  filledAt: string | null;
  items: Array<{
    itemId: number;
    label: string;
    required: boolean;
    sortOrder: number;
    result: "ok" | "nok" | null;
    note: string | null;
  }>;
};

type ProblemType = { id: number; name: string; active: boolean };
type ChecklistCatalog = {
  id: number;
  name: string;
  active: boolean;
  problemTypeIds: number[];
};

type Props = {
  osId: number;
  problemTypeId: number | null;
  problemTypeName: string | null;
  problemTypes: ProblemType[];
  checklistCatalog: ChecklistCatalog[];
  canEdit: boolean;
  canFill: boolean;
  busy: boolean;
  setBusy: (v: boolean) => void;
  setFeedback: (v: { type: "ok" | "error"; text: string } | null) => void;
  onOsUpdated?: (os: unknown) => void;
};

const btnPrimary =
  "inline-flex items-center gap-xs rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container disabled:opacity-50";
const btnOutline =
  "inline-flex items-center gap-xs rounded-lg border border-outline-variant bg-surface px-md py-sm text-label-md font-semibold text-on-surface disabled:opacity-50";

export function AssistOsChecklistPanel({
  osId,
  problemTypeId,
  problemTypeName,
  problemTypes,
  checklistCatalog,
  canEdit,
  canFill,
  busy,
  setBusy,
  setFeedback,
  onOsUpdated,
}: Props) {
  const [rows, setRows] = useState<OsChecklistView[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<
    Record<number, Record<number, { result: "ok" | "nok" | null; note: string }>>
  >({});
  const [addChecklistId, setAddChecklistId] = useState("");

  const activeProblems = useMemo(
    () => problemTypes.filter((p) => p.active),
    [problemTypes],
  );
  const availableToAdd = useMemo(() => {
    const linked = new Set(rows.map((r) => r.checklistId));
    return checklistCatalog.filter((c) => c.active && !linked.has(c.id));
  }, [checklistCatalog, rows]);

  async function reload() {
    setLoading(true);
    try {
      const list = await listOsChecklistsFn({ data: { osId } });
      setRows(list as OsChecklistView[]);
      const nextDrafts: typeof drafts = {};
      for (const row of list as OsChecklistView[]) {
        nextDrafts[row.id] = {};
        for (const it of row.items) {
          nextDrafts[row.id]![it.itemId] = {
            result: it.result,
            note: it.note ?? "",
          };
        }
      }
      setDrafts(nextDrafts);
    } catch (e) {
      setFeedback({
        type: "error",
        text: e instanceof Error ? e.message : "Falha ao carregar checklists.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osId]);

  async function changeProblem(nextId: string) {
    if (!canEdit) return;
    const problemTypeIdNum = nextId ? Number(nextId) : null;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await setOsProblemTypeFn({
        data: {
          osId,
          problemTypeId: problemTypeIdNum && problemTypeIdNum > 0 ? problemTypeIdNum : null,
          attachSuggested: true,
        },
      });
      onOsUpdated?.(result.os);
      setRows(result.checklists as OsChecklistView[]);
      setFeedback({ type: "ok", text: "Tipo de problema atualizado." });
    } catch (e) {
      setFeedback({
        type: "error",
        text: e instanceof Error ? e.message : "Falha ao definir problema.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function addChecklist() {
    const checklistId = Number(addChecklistId);
    if (!canEdit || !checklistId) return;
    setBusy(true);
    try {
      const list = await attachOsChecklistFn({
        data: { osId, checklistId, problemTypeId },
      });
      setRows(list as OsChecklistView[]);
      setAddChecklistId("");
      setFeedback({ type: "ok", text: "Checklist vinculado à OS." });
    } catch (e) {
      setFeedback({
        type: "error",
        text: e instanceof Error ? e.message : "Falha ao vincular checklist.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeChecklist(osChecklistId: number) {
    if (!canEdit) return;
    setBusy(true);
    try {
      const list = await detachOsChecklistFn({ data: { osChecklistId } });
      setRows(list as OsChecklistView[]);
      setFeedback({ type: "ok", text: "Checklist removido." });
    } catch (e) {
      setFeedback({
        type: "error",
        text: e instanceof Error ? e.message : "Falha ao remover checklist.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveAnswers(row: OsChecklistView) {
    if (!canFill) return;
    const draft = drafts[row.id] ?? {};
    const answers = row.items
      .map((it) => {
        const d = draft[it.itemId];
        if (!d?.result) return null;
        return {
          itemId: it.itemId,
          result: d.result,
          note: d.note.trim() || null,
        };
      })
      .filter(Boolean) as Array<{ itemId: number; result: "ok" | "nok"; note: string | null }>;

    const missingRequired = row.items.filter((it) => {
      if (!it.required) return false;
      return !draft[it.itemId]?.result;
    });
    if (missingRequired.length) {
      setFeedback({
        type: "error",
        text: `Marque OK/Não OK em: ${missingRequired.map((i) => i.label).join(", ")}`,
      });
      return;
    }
    if (!answers.length) {
      setFeedback({ type: "error", text: "Nenhuma resposta para salvar." });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const list = await saveOsChecklistAnswersFn({
        data: { osChecklistId: row.id, answers },
      });
      setRows(list as OsChecklistView[]);
      setFeedback({ type: "ok", text: `Checklist "${row.checklistName}" salvo.` });
    } catch (e) {
      setFeedback({
        type: "error",
        text: e instanceof Error ? e.message : "Falha ao salvar checklist.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-md rounded-xl border border-outline-variant bg-surface-container-low p-md">
      <div>
        <p className="text-title-md text-on-surface">Checklist / problema</p>
        <p className="text-label-md text-on-surface-variant">
          Vincule checklists e preencha OK/Não OK antes de finalizar a OS.
          {problemTypeName ? ` · Problema: ${problemTypeName}` : ""}
        </p>
      </div>

      {canEdit ? (
        <label className="block space-y-2xs">
          <span className="text-label-md font-semibold text-on-surface-variant">
            Tipo de problema
          </span>
          <select
            value={problemTypeId ?? ""}
            disabled={busy}
            onChange={(e) => void changeProblem(e.target.value)}
            className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
          >
            <option value="">— Sem problema —</option>
            {activeProblems.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      ) : problemTypeName ? (
        <p className="text-body-md text-on-surface">Problema: {problemTypeName}</p>
      ) : null}

      {canEdit && availableToAdd.length ? (
        <div className="flex flex-wrap items-end gap-sm">
          <label className="min-w-[12rem] flex-1 space-y-2xs">
            <span className="text-label-md font-semibold text-on-surface-variant">
              Adicionar checklist
            </span>
            <select
              value={addChecklistId}
              onChange={(e) => setAddChecklistId(e.target.value)}
              className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md"
            >
              <option value="">— Selecionar —</option>
              {availableToAdd.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !addChecklistId}
            className={btnPrimary}
            onClick={() => void addChecklist()}
          >
            Vincular
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="text-body-md text-on-surface-variant">Carregando checklists…</p>
      ) : !rows.length ? (
        <p className="text-body-md text-on-surface-variant">
          Nenhum checklist vinculado. Escolha um tipo de problema ou adicione manualmente.
        </p>
      ) : (
        <div className="space-y-md">
          {rows.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border border-outline-variant bg-surface px-md py-sm"
            >
              <div className="mb-sm flex flex-wrap items-center justify-between gap-sm">
                <div>
                  <p className="text-body-md font-semibold text-on-surface">{row.checklistName}</p>
                  <p
                    className={cn(
                      "text-label-md font-semibold",
                      row.status === "done" ? "text-emerald-800" : "text-amber-800",
                    )}
                  >
                    {row.status === "done"
                      ? `Preenchido${row.filledBy ? ` · ${row.filledBy}` : ""}`
                      : "Pendente"}
                  </p>
                </div>
                {canEdit && row.status !== "done" ? (
                  <button
                    type="button"
                    className={btnOutline}
                    disabled={busy}
                    onClick={() => void removeChecklist(row.id)}
                  >
                    Remover
                  </button>
                ) : null}
              </div>
              <ul className="space-y-sm">
                {row.items.map((it) => {
                  const draft = drafts[row.id]?.[it.itemId] ?? {
                    result: it.result,
                    note: it.note ?? "",
                  };
                  return (
                    <li key={it.itemId} className="rounded-md border border-outline-variant/70 p-sm">
                      <p className="text-body-md text-on-surface">
                        {it.label}
                        {it.required ? (
                          <span className="text-error"> *</span>
                        ) : (
                          <span className="text-label-sm text-on-surface-variant"> (opc.)</span>
                        )}
                      </p>
                      <div className="mt-xs flex flex-wrap gap-xs">
                        {(["ok", "nok"] as const).map((r) => (
                          <button
                            key={r}
                            type="button"
                            disabled={!canFill || busy || row.status === "done"}
                            onClick={() =>
                              setDrafts((prev) => ({
                                ...prev,
                                [row.id]: {
                                  ...(prev[row.id] ?? {}),
                                  [it.itemId]: {
                                    result: r,
                                    note: prev[row.id]?.[it.itemId]?.note ?? draft.note,
                                  },
                                },
                              }))
                            }
                            className={cn(
                              "rounded-full px-sm py-1 text-label-md font-semibold disabled:opacity-60",
                              draft.result === r
                                ? r === "ok"
                                  ? "bg-emerald-600 text-white"
                                  : "bg-red-600 text-white"
                                : "border border-outline-variant bg-surface text-on-surface",
                            )}
                          >
                            {r === "ok" ? "OK" : "Não OK"}
                          </button>
                        ))}
                      </div>
                      <input
                        value={draft.note}
                        disabled={!canFill || busy || row.status === "done"}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: {
                              ...(prev[row.id] ?? {}),
                              [it.itemId]: {
                                result: prev[row.id]?.[it.itemId]?.result ?? draft.result,
                                note: e.target.value,
                              },
                            },
                          }))
                        }
                        placeholder="Observação (opcional)"
                        className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-sm py-xs text-body-md disabled:opacity-60"
                      />
                    </li>
                  );
                })}
              </ul>
              {canFill && row.status !== "done" ? (
                <button
                  type="button"
                  className={cn(btnPrimary, "mt-sm")}
                  disabled={busy}
                  onClick={() => void saveAnswers(row)}
                >
                  Salvar checklist
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
