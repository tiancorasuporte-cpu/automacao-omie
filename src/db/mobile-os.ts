import { getDb } from "@/db/schema";
import { getOsById, type AssistOs } from "@/db/assistencia";

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** O.S. visíveis ao técnico: nome igual ou equipe com user_id vinculado. */
export async function listOsForTecnico(input: {
  userId: number;
  userName: string;
  stage?: number | null;
}) {
  const db = await getDb();
  const name = input.userName.trim();
  const stage = input.stage ?? null;
  const rows = (await db`
    select o.*, t.name as team_name
    from assist_os o
    left join assist_teams t on t.id = o.team_id
    where o.stage in (4, 5, 6)
      and (
        (
          o.tecnico_nome is not null
          and lower(trim(o.tecnico_nome)) = lower(${name})
        )
        or exists (
          select 1
          from assist_team_members m
          where m.team_id = o.team_id
            and m.user_id = ${input.userId}
            and coalesce(m.active, true) = true
        )
      )
      and (${stage}::int is null or o.stage = ${stage})
    order by
      case when o.stage = 5 then 0 when o.stage = 4 then 1 else 2 end,
      o.ag_date asc nulls last,
      o.updated_at desc
    limit 300
  `) as Record<string, unknown>[];

  const result: AssistOs[] = [];
  for (const row of rows) {
    const os = await getOsById(num(row["id"]));
    if (os) result.push(os);
  }
  return result;
}

export async function assertOsOwnedByTecnico(
  osId: number,
  user: { id: number; name: string },
) {
  const os = await getOsById(osId);
  if (!os) return { ok: false as const, error: "O.S. não encontrada." };
  const byName =
    Boolean(os.tecnicoNome?.trim()) &&
    os.tecnicoNome!.trim().toLowerCase() === user.name.trim().toLowerCase();
  if (byName) return { ok: true as const, os };

  if (os.teamId) {
    const db = await getDb();
    const [member] = await db<{ id: number }[]>`
      select id from assist_team_members
      where team_id = ${os.teamId}
        and user_id = ${user.id}
        and coalesce(active, true) = true
      limit 1
    `;
    if (member) return { ok: true as const, os };
  }
  return { ok: false as const, error: "O.S. não direcionada a você." };
}
