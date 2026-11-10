import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import {
  btnDanger,
  btnMuted,
  btnOutline,
  btnPrimary,
  feedbackErrClass,
  feedbackOkClass,
  fieldClass,
  PageSection,
  PageTitle,
} from "@/components/PageChrome";
import {
  getEquipesBootstrapFn,
  saveTeamFn,
  saveTeamMemberFn,
} from "@/lib/assistencia";
import { APP_NAME } from "@/lib/brand";
import {
  canAccessModule,
  canOsWorkflow,
  firstAccessiblePath,
  requireAuth,
} from "@/lib/require-auth";
import { cn } from "@/lib/utils";
import { redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/equipes")({
  beforeLoad: async () => {
    const { user } = await requireAuth();
    const ok =
      canAccessModule(user, "equipes") ||
      canAccessModule(user, "assistencia") ||
      canOsWorkflow(user, "assistencia");
    if (!ok) throw redirect({ to: firstAccessiblePath(user) });
  },
  loader: async () => getEquipesBootstrapFn(),
  head: () => ({
    meta: [{ title: `Equipes — ${APP_NAME}` }],
  }),
  component: EquipesPage,
});

type Team = Awaited<ReturnType<typeof getEquipesBootstrapFn>>["teams"][number];

function EquipesPage() {
  const boot = Route.useLoaderData();
  const [teams, setTeams] = useState<Team[]>(boot.teams);
  const [tecnicos] = useState(boot.tecnicos);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(
    boot.teams[0]?.id ?? null,
  );
  const [addUserId, setAddUserId] = useState<number | "">("");
  const [showInactive, setShowInactive] = useState(false);

  const selected = useMemo(
    () => teams.find((t) => t.id === selectedTeamId) ?? null,
    [teams, selectedTeamId],
  );

  const visibleTeams = useMemo(
    () => (showInactive ? teams : teams.filter((t) => t.active)),
    [teams, showInactive],
  );

  const availableTecnicos = useMemo(() => {
    if (!selected) return tecnicos;
    const linked = new Set(
      selected.members.filter((m) => m.active && m.userId).map((m) => m.userId),
    );
    return tecnicos.filter((t) => !linked.has(t.id));
  }, [tecnicos, selected]);

  async function refreshTeams(next: Team[]) {
    setTeams(next);
    if (selectedTeamId && !next.some((t) => t.id === selectedTeamId)) {
      setSelectedTeamId(next[0]?.id ?? null);
    }
  }

  async function createTeam() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const next = await saveTeamFn({ data: { name, active: true } });
      await refreshTeams(next);
      const created = next.find((t) => t.name === name);
      if (created) setSelectedTeamId(created.id);
      setNewName("");
      setFeedback("Equipe criada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar equipe");
    } finally {
      setBusy(false);
    }
  }

  async function toggleTeamActive(team: Team) {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const next = await saveTeamFn({
        data: { id: team.id, name: team.name, active: !team.active },
      });
      await refreshTeams(next);
      setFeedback(team.active ? "Equipe desativada." : "Equipe reativada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar equipe");
    } finally {
      setBusy(false);
    }
  }

  async function renameTeam(team: Team, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === team.name) return;
    setBusy(true);
    setError(null);
    try {
      const next = await saveTeamFn({
        data: { id: team.id, name: trimmed, active: team.active },
      });
      await refreshTeams(next);
      setFeedback("Nome atualizado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao renomear");
    } finally {
      setBusy(false);
    }
  }

  async function addMember() {
    if (!selected || addUserId === "") return;
    const tech = tecnicos.find((t) => t.id === addUserId);
    if (!tech) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const next = await saveTeamMemberFn({
        data: {
          teamId: selected.id,
          name: tech.name,
          userId: tech.id,
          active: true,
        },
      });
      await refreshTeams(next);
      setAddUserId("");
      setFeedback(`${tech.name} vinculado à equipe.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao vincular técnico");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(memberId: number, name: string) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const member = selected.members.find((m) => m.id === memberId);
      if (!member) return;
      const next = await saveTeamMemberFn({
        data: {
          id: member.id,
          teamId: selected.id,
          name: member.name,
          userId: member.userId,
          active: false,
        },
      });
      await refreshTeams(next);
      setFeedback(`${name} removido da equipe.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao remover");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell mobileTitle="Equipes" searchPlaceholder="Buscar…">
      <div className="flex flex-col gap-md px-margin-mobile py-md md:px-margin-desktop md:py-lg">
        <PageTitle
          title="Equipes"
          subtitle="Cadastre equipes e vincule técnicos (marcados em Usuários)."
        />

        {feedback ? <p className={feedbackOkClass}>{feedback}</p> : null}
        {error ? <p className={feedbackErrClass}>{error}</p> : null}

        <div className="grid gap-md lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
          <PageSection className="space-y-md">
            <div className="flex items-center justify-between gap-sm">
              <h2 className="text-title-md text-on-surface">Equipes</h2>
              <label className="flex items-center gap-xs text-label-md text-on-surface-variant">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                />
                Inativas
              </label>
            </div>

            <div className="flex gap-xs">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nova equipe…"
                className={cn(fieldClass, "mt-0")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createTeam();
                  }
                }}
              />
              <button
                type="button"
                disabled={busy || !newName.trim()}
                onClick={() => void createTeam()}
                className={btnPrimary}
              >
                <Icon name="add" className="text-[16px]" />
                Criar
              </button>
            </div>

            <ul className="space-y-xs">
              {visibleTeams.map((team) => (
                <li key={team.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedTeamId(team.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-sm rounded-lg border px-sm py-sm text-left",
                      selectedTeamId === team.id
                        ? "border-primary bg-secondary-container/30"
                        : "border-outline-variant hover:bg-surface-container-high",
                      !team.active && "opacity-60",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-on-surface">
                        {team.name}
                      </span>
                      <span className="text-label-sm text-on-surface-variant">
                        {team.members.filter((m) => m.active).length} técnico(s)
                        {!team.active ? " · inativa" : ""}
                      </span>
                    </span>
                    <Icon name="chevron_right" className="text-[18px] text-on-surface-variant" />
                  </button>
                </li>
              ))}
              {!visibleTeams.length ? (
                <p className="text-body-md text-on-surface-variant">Nenhuma equipe.</p>
              ) : null}
            </ul>
          </PageSection>

          <PageSection className="space-y-md">
            {selected ? (
              <>
                <div className="flex flex-wrap items-end justify-between gap-md">
                  <label className="min-w-[12rem] flex-1 text-label-md text-on-surface-variant">
                    Nome da equipe
                    <input
                      key={selected.id}
                      defaultValue={selected.name}
                      className={fieldClass}
                      onBlur={(e) => void renameTeam(selected, e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleTeamActive(selected)}
                    className={selected.active ? btnDanger : btnMuted}
                  >
                    {selected.active ? "Desativar" : "Reativar"}
                  </button>
                </div>

                <div>
                  <h3 className="mb-sm text-label-md font-semibold text-on-surface-variant">
                    Técnicos da equipe
                  </h3>
                  <ul className="mb-md space-y-xs">
                    {selected.members
                      .filter((m) => m.active)
                      .map((m) => (
                        <li
                          key={m.id}
                          className="flex items-center justify-between gap-sm rounded-lg border border-outline-variant px-sm py-xs"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-on-surface">{m.name}</p>
                            <p className="text-label-sm text-on-surface-variant">
                              {m.userId
                                ? `Usuário #${m.userId}`
                                : "Sem vínculo de usuário"}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            className={btnOutline}
                            onClick={() => void removeMember(m.id, m.name)}
                          >
                            Remover
                          </button>
                        </li>
                      ))}
                    {!selected.members.some((m) => m.active) ? (
                      <p className="text-body-md text-on-surface-variant">
                        Nenhum técnico vinculado.
                      </p>
                    ) : null}
                  </ul>

                  <div className="flex flex-wrap items-end gap-xs">
                    <label className="min-w-[14rem] flex-1 text-label-md text-on-surface-variant">
                      Adicionar técnico
                      <select
                        value={addUserId}
                        onChange={(e) =>
                          setAddUserId(e.target.value ? Number(e.target.value) : "")
                        }
                        className={fieldClass}
                      >
                        <option value="">Selecione…</option>
                        {availableTecnicos.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} (@{t.username})
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={busy || addUserId === ""}
                      onClick={() => void addMember()}
                      className={btnPrimary}
                    >
                      Vincular
                    </button>
                  </div>
                  {!tecnicos.length ? (
                    <p className="mt-sm text-label-md text-on-surface-variant">
                      Nenhum usuário marcado como técnico. Ative em Usuários.
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-body-md text-on-surface-variant">
                Selecione ou crie uma equipe.
              </p>
            )}
          </PageSection>
        </div>
      </div>
    </AppShell>
  );
}
