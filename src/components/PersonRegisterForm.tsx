import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { DeviceTargetPicker, type DeviceOption } from "@/components/DeviceTargetPicker";
import { FaceCapture } from "@/components/FaceCapture";
import { Icon } from "@/components/Icon";
import { createPersonFn } from "@/lib/people";
import { formatCpf, formatPhone, toDateTimeInput } from "@/lib/stay";

const ROOM_TYPES = ["Simples", "Duplo", "Triplo", "Suíte", "Premium"] as const;

function defaultCheckOut(kind: "guest" | "staff") {
  const date = new Date();
  date.setDate(date.getDate() + (kind === "staff" ? 365 : 1));
  date.setHours(12, 0, 0, 0);
  return date;
}

export function PersonRegisterForm({
  kind,
  devices,
}: {
  kind: "guest" | "staff";
  devices: DeviceOption[];
}) {
  const navigate = useNavigate();
  const listTo = kind === "staff" ? "/staff" : "/people";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<"cpf" | "rg" | "passport">("cpf");
  const [documentNumber, setDocumentNumber] = useState("");
  const [targetAll, setTargetAll] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [room, setRoom] = useState("");
  const [phone, setPhone] = useState("");
  const [roomNote, setRoomNote] = useState<string | null>(null);

  const fieldClass =
    "input-glow mt-base w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-md py-sm text-body-md text-on-surface outline-none focus:border-primary";

  const checkInDefault = useMemo(() => toDateTimeInput(new Date()), []);
  const checkOutDefault = useMemo(() => toDateTimeInput(defaultCheckOut(kind)), [kind]);

  return (
    <AppShell
      mobileTitle={kind === "staff" ? "Novo funcionário" : "Novo hóspede"}
      searchPlaceholder="Buscar cadastros..."
    >
      <form
        className="flex flex-1 flex-col"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          if (!photo) {
            setError("Capture ou carregue uma foto para enviar ao Face Max.");
            return;
          }
          if (!targetAll && selectedIds.length === 0) {
            setError("Selecione pelo menos um equipamento.");
            return;
          }
          const form = new FormData(event.currentTarget);
          setPending(true);
          try {
            const payload: Parameters<typeof createPersonFn>[0]["data"] = {
              name: String(form.get("fullName") ?? ""),
              documentType,
              cpf: documentNumber,
              kind,
              checkIn: String(form.get("checkIn") ?? ""),
              checkOut: String(form.get("checkOut") ?? ""),
              targetAll,
              deviceIds: targetAll ? [] : selectedIds,
              photoBase64: photo,
              photoMime: "image/jpeg",
            };
            const roomValue = room.trim();
            const roomType = String(form.get("roomType") ?? "").trim();
            const department = String(form.get("department") ?? "").trim();
            if (kind === "guest") {
              if (roomValue) payload.room = roomValue;
              if (roomType) payload.roomType = roomType;
              payload.phone = phone;
            } else if (department) {
              payload.department = department;
            }

            const result = await createPersonFn({ data: payload });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            if (result.stay.errors.length) {
              setError(result.stay.errors.join(" • "));
              return;
            }
            await navigate({ to: listTo });
          } catch {
            setError("Não foi possível salvar o cadastro.");
          } finally {
            setPending(false);
          }
        }}
      >
        <header className="flex flex-col gap-md border-b border-outline-variant bg-background px-margin-mobile py-lg md:flex-row md:items-end md:justify-between md:px-margin-desktop">
          <div>
            <div className="mb-xs flex items-center gap-xs text-label-md text-on-surface-variant">
              <Link to={listTo} className="hover:text-primary">
                {kind === "staff" ? "Funcionários" : "Hóspedes"}
              </Link>
              <Icon name="chevron_right" className="text-sm" />
              <span className="font-bold text-primary">Cadastro</span>
            </div>
            <h2 className="text-headline-lg tracking-tight text-primary">
              {kind === "staff" ? "Cadastrar funcionário" : "Cadastrar hóspede"}
            </h2>
            <p className="mt-base text-body-md text-on-surface-variant">
              {kind === "staff"
                ? "A foto vai para o Face Max no início da vigência e é removida no fim do período."
                : "Informe o WhatsApp. A foto vai para o Face Max no check-in e é apagada no check-out. O hóspede recebe a confirmação pelo WhatsApp."}
            </p>
          </div>
          <div className="flex gap-sm">
            <Link
              to={listTo}
              className="flex h-12 items-center justify-center rounded-lg border border-outline bg-surface-container-lowest px-md text-sm font-semibold text-primary"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={pending}
              className="flex h-12 items-center justify-center rounded-lg bg-primary px-md text-sm font-semibold text-on-primary disabled:opacity-70"
            >
              {pending ? "Salvando…" : "Salvar cadastro"}
            </button>
          </div>
        </header>

        <div className="grid flex-1 grid-cols-1 items-start gap-gutter p-margin-mobile md:p-margin-desktop lg:grid-cols-12">
          <div className="space-y-gutter lg:col-span-8">
            <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
              <h3 className="mb-md text-title-lg text-primary">Dados pessoais</h3>
              <div className="space-y-md">
                <label className="block text-label-md text-on-surface-variant">
                  Nome completo
                  <input name="fullName" required className={fieldClass} />
                </label>
                <div className="grid grid-cols-1 gap-md md:grid-cols-2">
                  <label className="block text-label-md text-on-surface-variant">
                    Tipo de documento
                    <select
                      className={fieldClass}
                      value={documentType}
                      onChange={(event) => {
                        setDocumentType(event.target.value as "cpf" | "rg" | "passport");
                        setDocumentNumber("");
                      }}
                    >
                      <option value="cpf">CPF</option>
                      <option value="rg">RG</option>
                      <option value="passport">Passaporte</option>
                    </select>
                  </label>
                  <label className="block text-label-md text-on-surface-variant">
                    Número do documento
                    <input
                      required
                      value={documentNumber}
                      onChange={(event) =>
                        setDocumentNumber(
                          documentType === "cpf" ? formatCpf(event.target.value) : event.target.value,
                        )
                      }
                      placeholder={documentType === "cpf" ? "000.000.000-00" : "Número"}
                      className={fieldClass}
                    />
                  </label>
                </div>
                {kind === "staff" ? (
                  <label className="block text-label-md text-on-surface-variant">
                    Setor / função
                    <input name="department" required placeholder="Recepção, governança, segurança…" className={fieldClass} />
                  </label>
                ) : (
                  <label className="block text-label-md text-on-surface-variant">
                    WhatsApp
                    <input
                      required
                      name="phone"
                      value={phone}
                      onChange={(event) => setPhone(formatPhone(event.target.value))}
                      placeholder="(11) 99999-9999"
                      inputMode="tel"
                      autoComplete="tel"
                      className={fieldClass}
                    />
                  </label>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
              <h3 className="mb-md text-title-lg text-primary">
                {kind === "staff" ? "Vigência no Face Max" : "Período da estadia"}
              </h3>
              <div className="grid grid-cols-1 gap-md md:grid-cols-2">
                <label className="block text-label-md text-on-surface-variant">
                  {kind === "staff" ? "Início (data e hora)" : "Check-in (data e hora)"}
                  <input
                    name="checkIn"
                    type="datetime-local"
                    required
                    defaultValue={checkInDefault}
                    className={fieldClass}
                  />
                </label>
                <label className="block text-label-md text-on-surface-variant">
                  {kind === "staff" ? "Fim (data e hora)" : "Check-out (data e hora)"}
                  <input
                    name="checkOut"
                    type="datetime-local"
                    required
                    defaultValue={checkOutDefault}
                    className={fieldClass}
                  />
                </label>
              </div>
            </section>

            {kind === "guest" ? (
              <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
                <h3 className="mb-md text-title-lg text-primary">Quarto</h3>
                <div className="grid grid-cols-1 gap-md md:grid-cols-[1fr_1fr_auto]">
                  <label className="block text-label-md text-on-surface-variant">
                    Tipo de quarto
                    <select name="roomType" defaultValue="Simples" className={fieldClass}>
                      {ROOM_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-label-md text-on-surface-variant">
                    Número do quarto
                    <input
                      value={room}
                      onChange={(event) => setRoom(event.target.value)}
                      className={fieldClass}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!room.trim()) return;
                      const { lookupRoomFn } = await import("@/lib/people");
                      const result = await lookupRoomFn({ data: { room: room.trim() } });
                      setRoomNote(
                        result.ok ? `Quarto encontrado: ${result.person.name}` : result.error,
                      );
                    }}
                    className="mt-auto flex h-[46px] items-center justify-center gap-xs rounded-lg bg-secondary-container px-md text-sm font-bold text-on-secondary-container"
                  >
                    <Icon name="search" className="text-sm" />
                    Puxar quarto
                  </button>
                </div>
                {roomNote ? <p className="mt-sm text-label-md text-on-surface-variant">{roomNote}</p> : null}
              </section>
            ) : null}
          </div>

          <aside className="space-y-gutter lg:col-span-4">
            <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
              <h3 className="mb-md text-title-lg text-primary">Foto para o Face Max</h3>
              <FaceCapture value={photo} onChange={setPhoto} />
            </section>
            <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
              <h3 className="mb-md text-title-lg text-primary">Destino da biometria</h3>
              <DeviceTargetPicker
                devices={devices}
                targetAll={targetAll}
                selectedIds={selectedIds}
                onChange={(next) => {
                  setTargetAll(next.targetAll);
                  setSelectedIds(next.selectedIds);
                }}
              />
            </section>
            <div className="rounded-lg bg-secondary-fixed/40 px-md py-sm text-label-md text-on-surface-variant">
              Fotos nítidas e bem iluminadas melhoram o reconhecimento facial.
            </div>
          </aside>
        </div>

        {error ? (
          <div className="px-margin-mobile pb-lg md:px-margin-desktop">
            <p className="rounded-lg bg-error-container px-sm py-sm text-label-md text-on-error-container">
              {error}
            </p>
          </div>
        ) : null}
      </form>
    </AppShell>
  );
}
