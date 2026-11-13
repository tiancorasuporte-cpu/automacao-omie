import "@tanstack/react-start/server-only";

import { getDb } from "@/db/schema";
import { addOsEvent } from "@/db/assistencia";

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown) {
  return String(v ?? "").trim();
}

function nullableStr(v: unknown) {
  const s = str(v);
  return s || null;
}

function iso(v: unknown) {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const s = str(v);
  return s || null;
}

export type AssistProblemType = {
  id: number;
  name: string;
  active: boolean;
  sortOrder: number;
};

export type AssistChecklistItem = {
  id: number;
  checklistId: number;
  label: string;
  sortOrder: number;
  required: boolean;
};

export type AssistChecklist = {
  id: number;
  name: string;
  active: boolean;
  sortOrder: number;
  problemTypeIds: number[];
  items: AssistChecklistItem[];
};

export type OsChecklistAnswer = {
  itemId: number;
  label: string;
  required: boolean;
  sortOrder: number;
  result: "ok" | "nok" | null;
  note: string | null;
};

export type OsChecklistRow = {
  id: number;
  osId: number;
  checklistId: number;
  checklistName: string;
  problemTypeId: number | null;
  status: "pending" | "done";
  filledBy: string | null;
  filledAt: string | null;
  items: OsChecklistAnswer[];
};

export async function listProblemTypes(input?: { activeOnly?: boolean }) {
  const db = await getDb();
  const activeOnly = input?.activeOnly === true;
  const rows = (await db`
    select id, name, active, sort_order
    from assist_problem_types
    where (${activeOnly} = false or active = true)
    order by sort_order asc, name asc, id asc
  `) as Array<Record<string, unknown>>;
  return rows.map(
    (r): AssistProblemType => ({
      id: num(r["id"]),
      name: str(r["name"]),
      active: Boolean(r["active"]),
      sortOrder: num(r["sort_order"]),
    }),
  );
}

export async function saveProblemType(input: {
  id?: number | null;
  name: string;
  active?: boolean;
  sortOrder?: number;
}) {
  const db = await getDb();
  const name = input.name.trim().slice(0, 160);
  if (!name) throw new Error("Informe o nome do tipo de problema.");
  const active = input.active !== false;
  const sortOrder = Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 0;
  if (input.id != null && input.id > 0) {
    const rows = (await db`
      update assist_problem_types
      set name = ${name}, active = ${active}, sort_order = ${sortOrder}, updated_at = now()
      where id = ${input.id}
      returning id
    `) as Array<{ id: number }>;
    if (!rows[0]) throw new Error("Tipo de problema não encontrado.");
    return num(rows[0].id);
  }
  const rows = (await db`
    insert into assist_problem_types (name, active, sort_order)
    values (${name}, ${active}, ${sortOrder})
    returning id
  `) as Array<{ id: number }>;
  return num(rows[0]?.id);
}

export async function listChecklists(input?: { activeOnly?: boolean }) {
  const db = await getDb();
  const activeOnly = input?.activeOnly === true;
  const rows = (await db`
    select id, name, active, sort_order
    from assist_checklists
    where (${activeOnly} = false or active = true)
    order by sort_order asc, name asc, id asc
  `) as Array<Record<string, unknown>>;
  if (!rows.length) return [] as AssistChecklist[];

  const ids = rows.map((r) => num(r["id"]));
  const itemRows = (await db`
    select id, checklist_id, label, sort_order, required
    from assist_checklist_items
    where checklist_id in ${db(ids)}
    order by sort_order asc, id asc
  `) as Array<Record<string, unknown>>;
  const linkRows = (await db`
    select checklist_id, problem_type_id
    from assist_checklist_problems
    where checklist_id in ${db(ids)}
  `) as Array<Record<string, unknown>>;

  const itemsByCl = new Map<number, AssistChecklistItem[]>();
  for (const r of itemRows) {
    const checklistId = num(r["checklist_id"]);
    const list = itemsByCl.get(checklistId) ?? [];
    list.push({
      id: num(r["id"]),
      checklistId,
      label: str(r["label"]),
      sortOrder: num(r["sort_order"]),
      required: Boolean(r["required"]),
    });
    itemsByCl.set(checklistId, list);
  }
  const problemsByCl = new Map<number, number[]>();
  for (const r of linkRows) {
    const checklistId = num(r["checklist_id"]);
    const list = problemsByCl.get(checklistId) ?? [];
    list.push(num(r["problem_type_id"]));
    problemsByCl.set(checklistId, list);
  }

  return rows.map(
    (r): AssistChecklist => ({
      id: num(r["id"]),
      name: str(r["name"]),
      active: Boolean(r["active"]),
      sortOrder: num(r["sort_order"]),
      problemTypeIds: problemsByCl.get(num(r["id"])) ?? [],
      items: itemsByCl.get(num(r["id"])) ?? [],
    }),
  );
}

export async function saveChecklist(input: {
  id?: number | null;
  name: string;
  active?: boolean;
  sortOrder?: number;
  problemTypeIds?: number[];
  items?: Array<{ id?: number | null; label: string; required?: boolean; sortOrder?: number }>;
}) {
  const db = await getDb();
  const name = input.name.trim().slice(0, 160);
  if (!name) throw new Error("Informe o nome do checklist.");
  const active = input.active !== false;
  const sortOrder = Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 0;

  let checklistId = input.id != null && input.id > 0 ? input.id : 0;
  if (checklistId > 0) {
    const rows = (await db`
      update assist_checklists
      set name = ${name}, active = ${active}, sort_order = ${sortOrder}, updated_at = now()
      where id = ${checklistId}
      returning id
    `) as Array<{ id: number }>;
    if (!rows[0]) throw new Error("Checklist não encontrado.");
  } else {
    const rows = (await db`
      insert into assist_checklists (name, active, sort_order)
      values (${name}, ${active}, ${sortOrder})
      returning id
    `) as Array<{ id: number }>;
    checklistId = num(rows[0]?.id);
  }

  if (input.problemTypeIds) {
    const unique = [
      ...new Set(input.problemTypeIds.filter((id) => Number.isFinite(id) && id > 0).map(Number)),
    ];
    await db`delete from assist_checklist_problems where checklist_id = ${checklistId}`;
    for (const problemTypeId of unique) {
      await db`
        insert into assist_checklist_problems (checklist_id, problem_type_id)
        values (${checklistId}, ${problemTypeId})
        on conflict do nothing
      `;
    }
  }

  if (input.items) {
    const keepIds: number[] = [];
    let order = 0;
    for (const item of input.items) {
      const label = item.label.trim().slice(0, 240);
      if (!label) continue;
      const required = item.required !== false;
      const itemOrder = Number.isFinite(item.sortOrder) ? Number(item.sortOrder) : order;
      if (item.id != null && item.id > 0) {
        await db`
          update assist_checklist_items
          set label = ${label}, required = ${required}, sort_order = ${itemOrder}
          where id = ${item.id} and checklist_id = ${checklistId}
        `;
        keepIds.push(item.id);
      } else {
        const rows = (await db`
          insert into assist_checklist_items (checklist_id, label, sort_order, required)
          values (${checklistId}, ${label}, ${itemOrder}, ${required})
          returning id
        `) as Array<{ id: number }>;
        keepIds.push(num(rows[0]?.id));
      }
      order += 1;
    }
    if (keepIds.length) {
      await db`
        delete from assist_checklist_items
        where checklist_id = ${checklistId}
          and id not in ${db(keepIds)}
      `;
    } else {
      await db`delete from assist_checklist_items where checklist_id = ${checklistId}`;
    }
  }

  return checklistId;
}

export async function deleteChecklist(checklistId: number) {
  if (!Number.isFinite(checklistId) || checklistId <= 0) {
    throw new Error("Checklist inválido.");
  }
  const db = await getDb();
  const used = (await db`
    select id from assist_os_checklists
    where checklist_id = ${checklistId}
    limit 1
  `) as Array<{ id: number }>;
  if (used[0]) {
    throw new Error(
      "Não é possível excluir: este checklist já foi usado em OS. Desative-o em vez de excluir.",
    );
  }
  await db`delete from assist_checklist_problems where checklist_id = ${checklistId}`;
  await db`delete from assist_checklist_items where checklist_id = ${checklistId}`;
  const rows = (await db`
    delete from assist_checklists where id = ${checklistId} returning id
  `) as Array<{ id: number }>;
  if (!rows[0]) throw new Error("Checklist não encontrado.");
}

export async function listChecklistsForProblem(problemTypeId: number) {
  const all = await listChecklists({ activeOnly: true });
  return all.filter((c) => c.problemTypeIds.includes(problemTypeId));
}

async function loadOsChecklistRows(osId: number): Promise<OsChecklistRow[]> {
  const db = await getDb();
  const rows = (await db`
    select
      oc.id, oc.os_id, oc.checklist_id, oc.problem_type_id, oc.status,
      oc.filled_by, oc.filled_at::text as filled_at,
      c.name as checklist_name
    from assist_os_checklists oc
    join assist_checklists c on c.id = oc.checklist_id
    where oc.os_id = ${osId}
    order by oc.id asc
  `) as Array<Record<string, unknown>>;
  if (!rows.length) return [];

  const ocIds = rows.map((r) => num(r["id"]));
  const checklistIds = [...new Set(rows.map((r) => num(r["checklist_id"])))];
  const itemRows = (await db`
    select id, checklist_id, label, sort_order, required
    from assist_checklist_items
    where checklist_id in ${db(checklistIds)}
    order by sort_order asc, id asc
  `) as Array<Record<string, unknown>>;
  const answerRows = (await db`
    select os_checklist_id, item_id, result, note
    from assist_os_checklist_answers
    where os_checklist_id in ${db(ocIds)}
  `) as Array<Record<string, unknown>>;

  const itemsByCl = new Map<number, Array<Record<string, unknown>>>();
  for (const r of itemRows) {
    const cl = num(r["checklist_id"]);
    const list = itemsByCl.get(cl) ?? [];
    list.push(r);
    itemsByCl.set(cl, list);
  }
  const answersByKey = new Map<string, { result: string; note: string | null }>();
  for (const r of answerRows) {
    answersByKey.set(`${num(r["os_checklist_id"])}:${num(r["item_id"])}`, {
      result: str(r["result"]),
      note: nullableStr(r["note"]),
    });
  }

  return rows.map((r) => {
    const id = num(r["id"]);
    const checklistId = num(r["checklist_id"]);
    const items = (itemsByCl.get(checklistId) ?? []).map((it): OsChecklistAnswer => {
      const itemId = num(it["id"]);
      const ans = answersByKey.get(`${id}:${itemId}`);
      const resultRaw = ans?.result ?? null;
      return {
        itemId,
        label: str(it["label"]),
        required: Boolean(it["required"]),
        sortOrder: num(it["sort_order"]),
        result: resultRaw === "ok" || resultRaw === "nok" ? resultRaw : null,
        note: ans?.note ?? null,
      };
    });
    const statusRaw = str(r["status"]);
    return {
      id,
      osId: num(r["os_id"]),
      checklistId,
      checklistName: str(r["checklist_name"]),
      problemTypeId: r["problem_type_id"] == null ? null : num(r["problem_type_id"]),
      status: statusRaw === "done" ? "done" : "pending",
      filledBy: nullableStr(r["filled_by"]),
      filledAt: iso(r["filled_at"]),
      items,
    };
  });
}

export async function listOsChecklists(osId: number) {
  return loadOsChecklistRows(osId);
}

export async function setOsProblemType(input: {
  osId: number;
  problemTypeId: number | null;
  quem: string;
  userId?: number | null;
  /** When true, attach suggested checklists for the problem (skip already linked). */
  attachSuggested?: boolean;
}) {
  const db = await getDb();
  const problemTypeId =
    input.problemTypeId != null && input.problemTypeId > 0 ? input.problemTypeId : null;
  let problemName: string | null = null;
  if (problemTypeId != null) {
    const rows = (await db`
      select name from assist_problem_types where id = ${problemTypeId} limit 1
    `) as Array<{ name: string }>;
    if (!rows[0]) throw new Error("Tipo de problema não encontrado.");
    problemName = str(rows[0].name);
  }
  await db`
    update assist_os
    set problem_type_id = ${problemTypeId}, updated_at = now()
    where id = ${input.osId}
  `;
  await addOsEvent({
    osId: input.osId,
    quem: input.quem,
    userId: input.userId,
    acao: problemName
      ? `Tipo de problema: ${problemName}`
      : "Tipo de problema removido",
  });

  if (problemTypeId != null && input.attachSuggested !== false) {
    const suggested = await listChecklistsForProblem(problemTypeId);
    for (const cl of suggested) {
      await attachOsChecklist({
        osId: input.osId,
        checklistId: cl.id,
        problemTypeId,
        quem: input.quem,
        userId: input.userId,
        silent: true,
      });
    }
  }
  return listOsChecklists(input.osId);
}

export async function attachOsChecklist(input: {
  osId: number;
  checklistId: number;
  problemTypeId?: number | null;
  quem: string;
  userId?: number | null;
  silent?: boolean;
}) {
  const db = await getDb();
  const clRows = (await db`
    select id, name, active from assist_checklists where id = ${input.checklistId} limit 1
  `) as Array<{ id: number; name: string; active: boolean }>;
  if (!clRows[0]) throw new Error("Checklist não encontrado.");
  if (!clRows[0].active) throw new Error("Checklist inativo.");

  const existing = (await db`
    select id from assist_os_checklists
    where os_id = ${input.osId} and checklist_id = ${input.checklistId}
    limit 1
  `) as Array<{ id: number }>;
  if (existing[0]) return num(existing[0].id);

  const rows = (await db`
    insert into assist_os_checklists (os_id, checklist_id, problem_type_id, status)
    values (
      ${input.osId},
      ${input.checklistId},
      ${input.problemTypeId ?? null},
      'pending'
    )
    returning id
  `) as Array<{ id: number }>;
  const id = num(rows[0]?.id);
  if (!input.silent) {
    await addOsEvent({
      osId: input.osId,
      quem: input.quem,
      userId: input.userId,
      acao: `Checklist vinculado: ${str(clRows[0].name)}`,
    });
  }
  return id;
}

export async function detachOsChecklist(input: {
  osChecklistId: number;
  quem: string;
  userId?: number | null;
}) {
  const db = await getDb();
  const rows = (await db`
    select oc.id, oc.os_id, oc.status, c.name
    from assist_os_checklists oc
    join assist_checklists c on c.id = oc.checklist_id
    where oc.id = ${input.osChecklistId}
    limit 1
  `) as Array<{ id: number; os_id: number; status: string; name: string }>;
  if (!rows[0]) throw new Error("Checklist da OS não encontrado.");
  if (str(rows[0].status) === "done") {
    throw new Error("Não é possível remover um checklist já preenchido.");
  }
  await db`delete from assist_os_checklists where id = ${input.osChecklistId}`;
  await addOsEvent({
    osId: num(rows[0].os_id),
    quem: input.quem,
    userId: input.userId,
    acao: `Checklist removido: ${str(rows[0].name)}`,
  });
}

export async function saveOsChecklistAnswers(input: {
  osChecklistId: number;
  answers: Array<{ itemId: number; result: "ok" | "nok"; note?: string | null }>;
  quem: string;
  userId?: number | null;
}) {
  const db = await getDb();
  const rows = (await db`
    select oc.id, oc.os_id, oc.checklist_id, c.name
    from assist_os_checklists oc
    join assist_checklists c on c.id = oc.checklist_id
    where oc.id = ${input.osChecklistId}
    limit 1
  `) as Array<{ id: number; os_id: number; checklist_id: number; name: string }>;
  if (!rows[0]) throw new Error("Checklist da OS não encontrado.");
  const checklistId = num(rows[0].checklist_id);
  const itemRows = (await db`
    select id, label, required
    from assist_checklist_items
    where checklist_id = ${checklistId}
  `) as Array<{ id: number; label: string; required: boolean }>;
  const itemById = new Map(itemRows.map((i) => [num(i.id), i]));

  for (const ans of input.answers) {
    if (!itemById.has(ans.itemId)) {
      throw new Error(`Item ${ans.itemId} não pertence a este checklist.`);
    }
    if (ans.result !== "ok" && ans.result !== "nok") {
      throw new Error("Resultado inválido (use ok ou nok).");
    }
  }

  for (const ans of input.answers) {
    const note = ans.note?.trim() ? ans.note.trim().slice(0, 2000) : null;
    await db`
      insert into assist_os_checklist_answers (os_checklist_id, item_id, result, note)
      values (${input.osChecklistId}, ${ans.itemId}, ${ans.result}, ${note})
      on conflict (os_checklist_id, item_id) do update set
        result = excluded.result,
        note = excluded.note
    `;
  }

  const allAnswers = (await db`
    select a.item_id, a.result, i.required
    from assist_checklist_items i
    left join assist_os_checklist_answers a
      on a.item_id = i.id and a.os_checklist_id = ${input.osChecklistId}
    where i.checklist_id = ${checklistId}
  `) as Array<{ item_id: number; result: string | null; required: boolean }>;

  const incomplete = allAnswers.filter((a) => {
    if (!a.required) return false;
    return a.result !== "ok" && a.result !== "nok";
  });
  const done = incomplete.length === 0 && allAnswers.length > 0;

  if (done) {
    await db`
      update assist_os_checklists
      set status = 'done', filled_by = ${input.quem.slice(0, 120)}, filled_at = now()
      where id = ${input.osChecklistId}
    `;
    await addOsEvent({
      osId: num(rows[0].os_id),
      quem: input.quem,
      userId: input.userId,
      acao: `Checklist preenchido: ${str(rows[0].name)}`,
    });
  } else {
    await db`
      update assist_os_checklists
      set status = 'pending', filled_by = null, filled_at = null
      where id = ${input.osChecklistId}
    `;
  }

  return loadOsChecklistRows(num(rows[0].os_id));
}

/** Throws if any linked checklist is incomplete. */
export async function assertOsChecklistsComplete(osId: number) {
  const list = await listOsChecklists(osId);
  if (!list.length) return;
  const pending = list.filter((c) => c.status !== "done");
  if (!pending.length) return;
  const names = pending.map((c) => c.checklistName).join(", ");
  throw new Error(`Preencha o checklist antes de finalizar: ${names}`);
}

export async function getOsProblemTypeMeta(osId: number) {
  const db = await getDb();
  const rows = (await db`
    select o.problem_type_id, p.name as problem_type_name
    from assist_os o
    left join assist_problem_types p on p.id = o.problem_type_id
    where o.id = ${osId}
    limit 1
  `) as Array<{ problem_type_id: number | null; problem_type_name: string | null }>;
  if (!rows[0]) return { problemTypeId: null, problemTypeName: null };
  return {
    problemTypeId: rows[0].problem_type_id == null ? null : num(rows[0].problem_type_id),
    problemTypeName: nullableStr(rows[0].problem_type_name),
  };
}
