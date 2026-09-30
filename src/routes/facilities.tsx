import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { TablePager, paginateList } from "@/components/TablePager";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_NAME } from "@/lib/brand";
import {
  createFacilitiesCollaboratorFn,
  createFacilitiesPostFn,
  createFacilitiesSubstitutionFn,
  deactivateFacilitiesCollaboratorFn,
  deactivateFacilitiesPostFn,
  deleteFacilitiesSubstitutionFn,
  getFacilitiesBootstrapFn,
  importFacilitiesCollaboratorsFn,
  importFacilitiesPostsFn,
  updateFacilitiesCollaboratorFn,
  updateFacilitiesPostFn,
} from "@/lib/facilities";
import {
  currentMonthKey,
  defaultHoursForEscala,
  facilitiesMotivoPagaHoras,
  type FacilitiesEmpresaId,
  type FacilitiesEscalaId,
  type FacilitiesFuncaoId,
  type FacilitiesMotivoId,
} from "@/lib/facilities-domain";
import {
  downloadFacilitiesCollaboratorsModeloExcel,
  downloadFacilitiesPostsModeloExcel,
  parseFacilitiesCollaboratorsFromMatrix,
  parseFacilitiesPostsFromMatrix,
  readFacilitiesSpreadsheetMatrix,
} from "@/lib/facilities-cadastro-excel";
import { downloadFacilitiesFechamentoExcel } from "@/lib/facilities-excel";
import { requireModule } from "@/lib/require-auth";
import { matchesQuery } from "@/lib/text-search";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .catch(currentMonthKey()),
  tab: z.enum(["painel", "lancar", "cadastros", "fechamento"]).catch("painel"),
  postoId: z.coerce.number().int().positive().optional().catch(undefined),
  collaboratorId: z.coerce.number().int().positive().optional().catch(undefined),
  dataDe: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  dataAte: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/facilities")({
  validateSearch: searchSchema,
  beforeLoad: () => requireModule("facilities"),
  loaderDeps: ({ search }) => ({
    monthKey: search.month,
  }),
  loader: ({ deps }) =>
    getFacilitiesBootstrapFn({
      data: {
        monthKey: deps.monthKey,
      },
    }),
  head: () => ({
    meta: [{ title: `Facilities — ${APP_NAME}` }],
  }),
  component: FacilitiesPage,
});

type TabId = z.infer<typeof searchSchema>["tab"];
type PageSize = 10 | 20;

function PageSizeSelect({
  value,
  onChange,
}: {
  value: PageSize;
  onChange: (value: PageSize) => void;
}) {
  return (
    <label className="block space-y-xs">
      <span className="text-label-md text-primary">Por página</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as PageSize)}
        className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md sm:w-28"
      >
        <option value={10}>10</option>
        <option value={20}>20</option>
      </select>
    </label>
  );
}

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "painel", label: "Painel", icon: "dashboard" },
  { id: "lancar", label: "Lançar", icon: "swap_horiz" },
  { id: "cadastros", label: "Cadastros", icon: "badge" },
  { id: "fechamento", label: "Fechamento", icon: "payments" },
];

const EMPRESA_TONE: Record<string, string> = {
  angela: "bg-amber-100 text-amber-900",
  ancora: "bg-sky-100 text-sky-900",
  belfer: "bg-emerald-100 text-emerald-900",
};

function formatDateBr(value: string) {
  const iso = /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : (() => {
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return null;
        const y = parsed.getUTCFullYear();
        const m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
        const d = String(parsed.getUTCDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      })();
  if (!iso) return value;
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

function isoToBr(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  return formatDateBr(value);
}

function brToIso(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length !== 8) return null;
  const d = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  const y = digits.slice(4, 8);
  const day = Number(d);
  const month = Number(m);
  const year = Number(y);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return null;
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) {
    return null;
  }
  return `${y}-${m}-${d}`;
}

function maskBrDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function DateInputBr({
  label,
  valueIso,
  onChangeIso,
  required,
  fullWidth,
}: {
  label: string;
  valueIso: string;
  onChangeIso: (iso: string) => void;
  required?: boolean;
  fullWidth?: boolean;
}) {
  const [text, setText] = useState(() => (valueIso ? isoToBr(valueIso) : ""));
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(valueIso ? isoToBr(valueIso) : "");
  }, [valueIso]);

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
      } else {
        el.click();
      }
    } catch {
      el.click();
    }
  };

  return (
    <label className="block space-y-xs">
      <span className="text-label-md text-primary">{label}</span>
      <div className={cn("relative", fullWidth ? "w-full" : "w-full sm:w-40")}>
        <input
          type="text"
          inputMode="numeric"
          placeholder="dd/mm/aaaa"
          required={required}
          value={text}
          onChange={(e) => {
            const masked = maskBrDateInput(e.target.value);
            setText(masked);
            if (masked.length === 0) {
              onChangeIso("");
              return;
            }
            const iso = brToIso(masked);
            if (iso) onChangeIso(iso);
          }}
          onBlur={() => {
            if (!text.trim()) {
              onChangeIso("");
              setText("");
              return;
            }
            const iso = brToIso(text);
            if (iso) {
              setText(isoToBr(iso));
              onChangeIso(iso);
            } else if (valueIso) {
              setText(isoToBr(valueIso));
            } else {
              setText("");
            }
          }}
          className="w-full rounded-lg border border-outline-variant bg-surface py-sm pl-sm pr-10 text-body-md"
        />
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden
          value={/^\d{4}-\d{2}-\d{2}$/.test(valueIso) ? valueIso : ""}
          onChange={(e) => {
            const iso = e.target.value;
            onChangeIso(iso);
            setText(iso ? isoToBr(iso) : "");
          }}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Abrir calendário — ${label}`}
          onClick={openPicker}
          className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container-high hover:text-primary"
        >
          <Icon name="calendar_month" className="text-[20px]" />
        </button>
      </div>
    </label>
  );
}

function formatHours(value: number) {
  return Number(value).toLocaleString("pt-BR", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 2,
  });
}

function monthLabel(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return monthKey;
  const months = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  return `${months[m - 1]} de ${y}`;
}

function shiftMonth(monthKey: string, delta: number) {
  const [y, m] = monthKey.split("-").map(Number);
  const date = new Date(y!, (m! - 1) + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function EmpresaBadge({ id, label }: { id: string; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-sm py-xs text-label-md font-semibold",
        EMPRESA_TONE[id] ?? "bg-surface-container-high text-on-surface",
      )}
    >
      {label}
    </span>
  );
}

type SearchPickOption = {
  id: string;
  title: string;
  subtitle?: string | null;
  keywords?: Array<string | number | null | undefined>;
  disabled?: boolean;
};

function SearchablePick({
  label,
  value,
  options,
  placeholder = "Digite para buscar...",
  emptyLabel = "Nenhum resultado",
  onChange,
  allowClear = false,
  clearLabel = "Limpar",
}: {
  label: string;
  value: string;
  options: SearchPickOption[];
  placeholder?: string;
  emptyLabel?: string;
  onChange: (id: string) => void;
  allowClear?: boolean;
  clearLabel?: string;
}) {
  const selected = options.find((o) => o.id === value && !o.disabled) ?? null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!selected && open) {
      inputRef.current?.focus();
    }
  }, [selected, open]);

  const filtered = useMemo(() => {
    const list = options.filter((o) => !o.disabled);
    const matched = list.filter((o) =>
      matchesQuery(query, [o.title, o.subtitle, ...(o.keywords ?? [])]),
    );
    return matched.slice(0, 50);
  }, [options, query]);

  if (selected) {
    return (
      <div className="block space-y-xs">
        <span className="text-label-md text-primary">{label}</span>
        <div className="flex min-h-11 items-center justify-between gap-sm rounded-lg border border-outline-variant bg-surface px-sm py-sm">
          <div className="min-w-0">
            <p className="truncate text-body-md text-on-surface">{selected.title}</p>
            {selected.subtitle ? (
              <p className="truncate text-label-md text-on-surface-variant">{selected.subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg px-sm py-xs text-label-md font-semibold text-primary hover:bg-surface-container-high"
            onClick={() => {
              onChange("");
              setQuery("");
              setOpen(true);
            }}
          >
            Trocar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="block space-y-xs" ref={rootRef}>
      <span className="text-label-md text-primary">{label}</span>
      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute left-sm top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant"
        />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full rounded-lg border border-outline-variant bg-surface py-sm pl-[40px] pr-sm text-body-md min-h-11"
        />
        {open ? (
          <ul className="absolute z-20 mt-xs max-h-[min(16rem,50vh)] w-full overflow-auto rounded-lg border border-outline-variant bg-surface-container-lowest shadow-lg">
            {allowClear ? (
              <li>
                <button
                  type="button"
                  className="block w-full px-sm py-md text-left text-body-md text-on-surface-variant hover:bg-surface-container-high"
                  onClick={() => {
                    onChange("");
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  {clearLabel}
                </button>
              </li>
            ) : null}
            {filtered.length === 0 ? (
              <li className="px-sm py-md text-center text-body-md text-on-surface-variant">
                {emptyLabel}
              </li>
            ) : (
              filtered.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className="block w-full px-sm py-md text-left hover:bg-surface-container-high active:bg-surface-container"
                    onClick={() => {
                      onChange(option.id);
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    <span className="block text-body-md text-on-surface">{option.title}</span>
                    {option.subtitle ? (
                      <span className="block text-label-md text-on-surface-variant">
                        {option.subtitle}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function FacilitiesPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [subForm, setSubForm] = useState({
    data: todayIso(),
    motivo: "falta" as FacilitiesMotivoId,
    postoId: "",
    ausenteId: "",
    substitutoId: "",
    horas: "12",
    observacao: "",
  });

  const [postDialog, setPostDialog] = useState(false);
  const [postForm, setPostForm] = useState({
    id: 0,
    nome: "",
    endereco: "",
    cidade: "",
    observacao: "",
    active: true,
  });

  const [colDialog, setColDialog] = useState(false);
  const [colForm, setColForm] = useState({
    id: 0,
    nome: "",
    empresa: "ancora" as FacilitiesEmpresaId,
    funcao: "vigilante" as FacilitiesFuncaoId,
    escala: "12x36_diurno" as FacilitiesEscalaId,
    postoBaseId: "",
    telefone: "",
    active: true,
  });

  const [cadastroTab, setCadastroTab] = useState<"postos" | "colaboradores">("postos");
  const [postFilterQuery, setPostFilterQuery] = useState("");
  const [postFilterStatus, setPostFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [colFilterQuery, setColFilterQuery] = useState("");
  const [colFilterEmpresa, setColFilterEmpresa] = useState<"" | FacilitiesEmpresaId>("");
  const [colFilterFuncao, setColFilterFuncao] = useState<"" | FacilitiesFuncaoId>("");
  const [colFilterEscala, setColFilterEscala] = useState<"" | FacilitiesEscalaId>("");
  const postImportRef = useRef<HTMLInputElement>(null);
  const colImportRef = useRef<HTMLInputElement>(null);
  const [colFilterPostoId, setColFilterPostoId] = useState("");
  const [colFilterStatus, setColFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [lancPage, setLancPage] = useState(1);
  const [lancPageSize, setLancPageSize] = useState<PageSize>(10);
  const [cadPage, setCadPage] = useState(1);
  const [cadPageSize, setCadPageSize] = useState<PageSize>(10);
  const [fechPageSize, setFechPageSize] = useState<PageSize>(10);
  const [fechColPage, setFechColPage] = useState(1);
  const [fechPostoPage, setFechPostoPage] = useState(1);
  const [fechLancPage, setFechLancPage] = useState(1);
  const [copied, setCopied] = useState(false);

  const activePosts = useMemo(() => data.posts.filter((p) => p.active), [data.posts]);
  const activeCollaborators = useMemo(
    () => data.collaborators.filter((c) => c.active),
    [data.collaborators],
  );

  const selectedAusente = activeCollaborators.find((c) => String(c.id) === subForm.ausenteId);
  const selectedSubstituto = activeCollaborators.find(
    (c) => String(c.id) === subForm.substitutoId,
  );
  const selectedPostoId = Number(subForm.postoId) || 0;
  const substitutoForaBase =
    selectedSubstituto?.postoBaseId != null &&
    selectedPostoId > 0 &&
    selectedSubstituto.postoBaseId !== selectedPostoId;

  const suggestedSubstitutes = useMemo(() => {
    if (!selectedAusente) return activeCollaborators;
    return [
      ...activeCollaborators.filter(
        (c) => c.id !== selectedAusente.id && c.funcao === selectedAusente.funcao,
      ),
      ...activeCollaborators.filter(
        (c) => c.id !== selectedAusente.id && c.funcao !== selectedAusente.funcao,
      ),
    ];
  }, [activeCollaborators, selectedAusente]);

  const ausenteOptions = useMemo<SearchPickOption[]>(
    () =>
      activeCollaborators.map((c) => ({
        id: String(c.id),
        title: c.nome,
        subtitle: [c.empresaLabel, c.funcaoLabel, c.postoBaseNome].filter(Boolean).join(" · "),
        keywords: [c.empresa, c.funcao, c.escala, c.telefone],
      })),
    [activeCollaborators],
  );

  const substitutoOptions = useMemo<SearchPickOption[]>(
    () =>
      suggestedSubstitutes.map((c) => ({
        id: String(c.id),
        title: c.nome,
        subtitle: [
          c.empresaLabel,
          c.escalaLabel,
          selectedAusente && c.funcao === selectedAusente.funcao ? "mesma função" : null,
          c.postoBaseNome,
        ]
          .filter(Boolean)
          .join(" · "),
        keywords: [c.empresa, c.funcao, c.escala, c.telefone],
        disabled: String(c.id) === subForm.ausenteId,
      })),
    [suggestedSubstitutes, selectedAusente, subForm.ausenteId],
  );

  const postoOptions = useMemo<SearchPickOption[]>(
    () =>
      activePosts.map((p) => ({
        id: String(p.id),
        title: p.nome,
        subtitle: [p.cidade, p.endereco].filter(Boolean).join(" · "),
        keywords: [p.cidade, p.endereco],
      })),
    [activePosts],
  );

  const filterPostoOptions = useMemo<SearchPickOption[]>(
    () =>
      data.posts.map((p) => ({
        id: String(p.id),
        title: p.nome + (p.active ? "" : " (inativo)"),
        subtitle: p.cidade || null,
        keywords: [p.cidade, p.endereco],
      })),
    [data.posts],
  );

  const filterCollaboratorOptions = useMemo<SearchPickOption[]>(
    () =>
      data.collaborators.map((c) => ({
        id: String(c.id),
        title: c.nome + (c.active ? "" : " (inativo)"),
        subtitle: [c.empresaLabel, c.funcaoLabel].filter(Boolean).join(" · "),
        keywords: [c.empresa, c.funcao, c.telefone],
      })),
    [data.collaborators],
  );

  const visibleSubstitutions = useMemo(() => {
    return data.substitutions.filter((row) => {
      if (search.postoId && row.postoId !== search.postoId) return false;
      if (
        search.collaboratorId &&
        row.ausenteId !== search.collaboratorId &&
        row.substitutoId !== search.collaboratorId
      ) {
        return false;
      }
      if (search.dataDe && row.data < search.dataDe) return false;
      if (search.dataAte && row.data > search.dataAte) return false;
      return true;
    });
  }, [
    data.substitutions,
    search.postoId,
    search.collaboratorId,
    search.dataDe,
    search.dataAte,
  ]);

  useEffect(() => {
    setLancPage(1);
  }, [
    search.month,
    search.postoId,
    search.collaboratorId,
    search.dataDe,
    search.dataAte,
    lancPageSize,
  ]);

  useEffect(() => {
    setCadPage(1);
  }, [
    cadastroTab,
    cadPageSize,
    postFilterQuery,
    postFilterStatus,
    colFilterQuery,
    colFilterStatus,
    colFilterEmpresa,
    colFilterFuncao,
    colFilterEscala,
    colFilterPostoId,
  ]);

  useEffect(() => {
    setFechColPage(1);
    setFechPostoPage(1);
    setFechLancPage(1);
  }, [search.month, fechPageSize]);

  const pagedSubstitutions = useMemo(
    () => paginateList(visibleSubstitutions, lancPage, lancPageSize),
    [visibleSubstitutions, lancPage, lancPageSize],
  );

  const filteredPosts = useMemo(() => {
    return data.posts.filter((post) => {
      if (postFilterStatus === "active" && !post.active) return false;
      if (postFilterStatus === "inactive" && post.active) return false;
      return matchesQuery(postFilterQuery, [post.nome, post.cidade, post.endereco, post.observacao]);
    });
  }, [data.posts, postFilterQuery, postFilterStatus]);

  const filteredCollaborators = useMemo(() => {
    return data.collaborators.filter((col) => {
      if (colFilterStatus === "active" && !col.active) return false;
      if (colFilterStatus === "inactive" && col.active) return false;
      if (colFilterEmpresa && col.empresa !== colFilterEmpresa) return false;
      if (colFilterFuncao && col.funcao !== colFilterFuncao) return false;
      if (colFilterEscala && col.escala !== colFilterEscala) return false;
      if (colFilterPostoId && String(col.postoBaseId ?? "") !== colFilterPostoId) return false;
      return matchesQuery(colFilterQuery, [
        col.nome,
        col.empresaLabel,
        col.funcaoLabel,
        col.escalaLabel,
        col.postoBaseNome,
        col.telefone,
      ]);
    });
  }, [
    data.collaborators,
    colFilterQuery,
    colFilterStatus,
    colFilterEmpresa,
    colFilterFuncao,
    colFilterEscala,
    colFilterPostoId,
  ]);

  const pagedPosts = useMemo(
    () => paginateList(filteredPosts, cadPage, cadPageSize),
    [filteredPosts, cadPage, cadPageSize],
  );

  const pagedCollaborators = useMemo(
    () => paginateList(filteredCollaborators, cadPage, cadPageSize),
    [filteredCollaborators, cadPage, cadPageSize],
  );

  const fechamentoLancamentos = useMemo(
    () => [...data.substitutions].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : b.id - a.id)),
    [data.substitutions],
  );

  const pagedFechColaboradores = useMemo(
    () => paginateList(data.summary.bySubstituto, fechColPage, fechPageSize),
    [data.summary.bySubstituto, fechColPage, fechPageSize],
  );

  const pagedFechPostos = useMemo(
    () => paginateList(data.summary.byPosto, fechPostoPage, fechPageSize),
    [data.summary.byPosto, fechPostoPage, fechPageSize],
  );

  const pagedFechLancamentos = useMemo(
    () => paginateList(fechamentoLancamentos, fechLancPage, fechPageSize),
    [fechamentoLancamentos, fechLancPage, fechPageSize],
  );

  const colPostoFilterOptions = useMemo<SearchPickOption[]>(
    () =>
      data.posts.map((p) => ({
        id: String(p.id),
        title: p.nome + (p.active ? "" : " (inativo)"),
        subtitle: p.cidade || null,
      })),
    [data.posts],
  );

  const setTab = (tab: TabId) => {
    navigate({
      search: (prev) => ({ ...prev, tab }),
    });
  };

  const setMonth = (month: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        month,
        dataDe: undefined,
        dataAte: undefined,
      }),
    });
  };

  const flash = (ok: string | null, err: string | null = null) => {
    setMessage(ok);
    setError(err);
  };

  const onSelectSubstituto = (id: string) => {
    const person = activeCollaborators.find((c) => String(c.id) === id);
    setSubForm((prev) => ({
      ...prev,
      substitutoId: id,
      horas: person ? String(person.defaultHours) : prev.horas,
    }));
  };

  const onSelectAusente = (id: string) => {
    const person = activeCollaborators.find((c) => String(c.id) === id);
    setSubForm((prev) => ({
      ...prev,
      ausenteId: id,
      postoId: person?.postoBaseId ? String(person.postoBaseId) : prev.postoId,
      horas:
        prev.substitutoId && activeCollaborators.find((c) => String(c.id) === prev.substitutoId)
          ? prev.horas
          : person
            ? String(defaultHoursForEscala(person.escala))
            : prev.horas,
    }));
  };

  const submitSubstitution = async () => {
    if (!subForm.data || !/^\d{4}-\d{2}-\d{2}$/.test(subForm.data)) {
      flash(null, "Informe a data no formato dd/mm/aaaa.");
      return;
    }
    if (!subForm.ausenteId || !subForm.substitutoId || !subForm.postoId) {
      flash(null, "Selecione ausente, posto e substituto.");
      return;
    }
    setPending(true);
    flash(null);
    try {
      const result = await createFacilitiesSubstitutionFn({
        data: {
          data: subForm.data,
          motivo: subForm.motivo,
          postoId: Number(subForm.postoId),
          ausenteId: Number(subForm.ausenteId),
          substitutoId: Number(subForm.substitutoId),
          horas: Number(subForm.horas),
          observacao: subForm.observacao.trim() || null,
        },
      });
      if (!result.ok) {
        flash(null, result.error);
        return;
      }
      flash(
        result.substitution.pagaHoras
          ? `Troca lançada: ${result.substitution.substitutoNome} cobriu ${result.substitution.ausenteNome} (${formatHours(result.substitution.horas)}h a pagar).`
          : `Solicitação de troca registrada: ${result.substitution.substitutoNome} ↔ ${result.substitution.ausenteNome} (sem horas a pagar).`,
      );
      setSubForm((prev) => ({
        ...prev,
        ausenteId: "",
        substitutoId: "",
        observacao: "",
        horas: "12",
      }));
      await router.invalidate();
      navigate({ search: (prev) => ({ ...prev, tab: "painel" }) });
    } finally {
      setPending(false);
    }
  };

  const paymentText = useMemo(() => {
    const lines = [
      `Facilities — fechamento ${monthLabel(data.monthKey)}`,
      `Horas a pagar: ${formatHours(data.summary.horas)}h · ${data.summary.trocas - data.summary.permutas} cobertura(s) pagáveis` +
        (data.summary.permutas > 0
          ? ` · ${data.summary.permutas} solicitação(ões) de troca (sem pagamento)`
          : ""),
      "",
      "Por colaborador (substituto — horas a pagar):",
      ...data.summary.bySubstituto.map(
        (row) =>
          `- ${row.nome} (${row.empresa}) · ${row.trocas} cobertura(s) · ${formatHours(row.horas)}h · escala ${row.escala}`,
      ),
      "",
      "Por posto (horas a pagar):",
      ...data.summary.byPosto.map(
        (row) => `- ${row.nome} · ${row.trocas} lançamento(s) · ${formatHours(row.horas)}h`,
      ),
    ];
    return lines.join("\n");
  }, [data.monthKey, data.summary]);

  const isPermuta = !facilitiesMotivoPagaHoras(subForm.motivo);

  const copyPayment = async () => {
    try {
      await navigator.clipboard.writeText(paymentText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      flash(null, "Não foi possível copiar o resumo.");
    }
  };

  const removeSubstitution = async (id: number) => {
    if (!confirm("Excluir este lançamento?")) return;
    setPending(true);
    flash(null);
    try {
      const result = await deleteFacilitiesSubstitutionFn({ data: { id } });
      if (!result.ok) {
        flash(null, result.error);
        return;
      }
      flash("Lançamento excluído.");
      await router.invalidate();
    } finally {
      setPending(false);
    }
  };

  const formatImportResult = (created: number, skipped: number, errors: string[]) => {
    const parts = [`${created} cadastrado(s)`];
    if (skipped > 0) parts.push(`${skipped} já existia(m)`);
    if (errors.length > 0) parts.push(`${errors.length} com erro`);
    return parts.join(" · ");
  };

  const importPostsFromFile = async (file: File | null) => {
    if (!file) return;
    setPending(true);
    flash(null);
    try {
      const matrix = await readFacilitiesSpreadsheetMatrix(file);
      const parsed = parseFacilitiesPostsFromMatrix(matrix);
      if (parsed.rows.length === 0 && parsed.errors.length === 0) {
        flash(null, "Nenhuma linha válida para importar.");
        return;
      }
      if (parsed.rows.length === 0) {
        flash(null, parsed.errors.slice(0, 3).join(" "));
        return;
      }
      const result = await importFacilitiesPostsFn({ data: { rows: parsed.rows } });
      const allErrors = [...parsed.errors, ...result.errors];
      const summary = formatImportResult(result.created, result.skipped, allErrors);
      if (result.created === 0 && allErrors.length > 0) {
        flash(null, `${summary}. ${allErrors.slice(0, 2).join(" ")}`);
      } else {
        flash(`Postos: ${summary}${allErrors[0] ? `. ${allErrors[0]}` : ""}`);
      }
      await router.invalidate();
    } catch (err) {
      flash(null, err instanceof Error ? err.message : "Falha ao importar postos.");
    } finally {
      setPending(false);
      if (postImportRef.current) postImportRef.current.value = "";
    }
  };

  const importCollaboratorsFromFile = async (file: File | null) => {
    if (!file) return;
    setPending(true);
    flash(null);
    try {
      const matrix = await readFacilitiesSpreadsheetMatrix(file);
      const parsed = parseFacilitiesCollaboratorsFromMatrix(matrix);
      if (parsed.rows.length === 0 && parsed.errors.length === 0) {
        flash(null, "Nenhuma linha válida para importar.");
        return;
      }
      if (parsed.rows.length === 0) {
        flash(null, parsed.errors.slice(0, 3).join(" "));
        return;
      }
      const result = await importFacilitiesCollaboratorsFn({ data: { rows: parsed.rows } });
      const allErrors = [...parsed.errors, ...result.errors];
      const summary = formatImportResult(result.created, result.skipped, allErrors);
      if (result.created === 0 && allErrors.length > 0) {
        flash(null, `${summary}. ${allErrors.slice(0, 2).join(" ")}`);
      } else {
        flash(`Colaboradores: ${summary}${allErrors[0] ? `. ${allErrors[0]}` : ""}`);
      }
      await router.invalidate();
    } catch (err) {
      flash(null, err instanceof Error ? err.message : "Falha ao importar colaboradores.");
    } finally {
      setPending(false);
      if (colImportRef.current) colImportRef.current.value = "";
    }
  };

  return (
    <AppShell mobileTitle="Facilities">
      <main className="relative flex-1 p-margin-mobile pb-24 md:p-margin-desktop md:pb-margin-desktop">
        <div className="mx-auto max-w-6xl space-y-lg">
          <div className="flex flex-col gap-md lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-label-md font-semibold uppercase tracking-wide text-secondary">
                Operação de postos
              </p>
              <h2 className="mt-xs text-headline-md tracking-tight text-primary sm:text-headline-lg">
                Facilities
              </h2>
              <p className="mt-xs text-body-md text-on-surface-variant sm:hidden">
                Substituições, permutas e horas a pagar por posto.
              </p>
              <p className="mt-base hidden max-w-[42rem] text-body-lg text-on-surface-variant sm:block">
                Lançamento de substituições por falta e atestado, trocas por posto e horas fora da
                escala para pagamento — vigilantes, porteiros (12x36) e recepcionistas.
              </p>
            </div>
            <div className="flex w-full items-center justify-between gap-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-sm sm:w-auto sm:justify-center">
              <button
                type="button"
                className="rounded-lg p-sm text-on-surface-variant hover:bg-surface-container-high"
                onClick={() => setMonth(shiftMonth(search.month, -1))}
                aria-label="Mês anterior"
              >
                <Icon name="chevron_left" className="text-[22px]" />
              </button>
              <div className="min-w-[9.5rem] text-center">
                <p className="text-label-md text-on-surface-variant">Competência</p>
                <p className="text-title-md font-semibold text-primary">{monthLabel(search.month)}</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-sm text-on-surface-variant hover:bg-surface-container-high"
                onClick={() => setMonth(shiftMonth(search.month, 1))}
                aria-label="Próximo mês"
              >
                <Icon name="chevron_right" className="text-[22px]" />
              </button>
            </div>
          </div>

          <div className="sticky top-0 z-20 -mx-margin-mobile border-b border-outline-variant/70 bg-background/95 px-margin-mobile py-sm backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
            <div className="flex gap-sm overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] md:flex-wrap md:overflow-visible [&::-webkit-scrollbar]:hidden">
              {TABS.map((tab) => {
                const active = search.tab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTab(tab.id)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-xs rounded-lg px-md py-sm text-label-md font-semibold transition-colors",
                      active
                        ? "bg-secondary-container text-primary"
                        : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container",
                    )}
                  >
                    <Icon name={tab.icon} className="text-[18px]" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {(message || error) && (
            <div
              className={cn(
                "rounded-xl border px-md py-sm text-body-md",
                error
                  ? "border-error/40 bg-error/10 text-error"
                  : "border-secondary/30 bg-secondary-container/40 text-primary",
              )}
            >
              {error ?? message}
            </div>
          )}

          {search.tab === "painel" && (
            <section className="space-y-lg">
              <div className="grid grid-cols-2 gap-sm xl:grid-cols-4 xl:gap-md">
                {[
                  {
                    label: "Trocas no mês",
                    value: data.summary.trocas,
                    icon: "swap_horiz",
                  },
                  {
                    label: "Horas a pagar",
                    value: `${formatHours(data.summary.horas)}h`,
                    icon: "schedule",
                  },
                  {
                    label: "Solicitações de troca",
                    value: data.summary.permutas,
                    icon: "sync_alt",
                  },
                  {
                    label: "Postos / equipe",
                    value: `${data.summary.postosAtivos} / ${data.summary.colaboradoresAtivos}`,
                    icon: "groups",
                  },
                ].map((card) => (
                  <div
                    key={card.label}
                    className="rounded-xl border border-outline-variant bg-surface-container-lowest p-sm sm:p-md"
                  >
                    <div className="flex items-start justify-between gap-xs">
                      <p className="text-label-md leading-snug text-on-surface-variant">{card.label}</p>
                      <Icon name={card.icon} className="hidden text-[22px] text-secondary sm:inline" />
                    </div>
                    <p className="mt-sm text-title-lg font-semibold text-primary sm:text-headline-md">
                      {card.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="hidden gap-lg lg:grid lg:grid-cols-2">
                <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
                  <div className="border-b border-outline-variant px-md py-sm">
                    <h3 className="text-title-md text-primary">Trocas por posto</h3>
                    <p className="text-body-md text-on-surface-variant">
                      Volume e horas cobertas em cada posto de serviço.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-body-md">
                      <thead className="bg-surface-container-low text-label-md text-on-surface-variant">
                        <tr>
                          <th className="px-md py-sm">Posto</th>
                          <th className="px-md py-sm">Trocas</th>
                          <th className="px-md py-sm">Horas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.summary.byPosto.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-md py-xl text-center text-on-surface-variant">
                              Nenhuma troca neste mês.
                            </td>
                          </tr>
                        ) : (
                          data.summary.byPosto.map((row) => (
                            <tr key={row.id} className="border-t border-outline-variant/60">
                              <td className="px-md py-sm text-primary">{row.nome}</td>
                              <td className="px-md py-sm">{row.trocas}</td>
                              <td className="px-md py-sm font-semibold">{formatHours(row.horas)}h</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
                  <div className="border-b border-outline-variant px-md py-sm">
                    <h3 className="text-title-md text-primary">Top substitutos</h3>
                    <p className="text-body-md text-on-surface-variant">
                      Quem mais cobriu fora da escala — base do pagamento.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-body-md">
                      <thead className="bg-surface-container-low text-label-md text-on-surface-variant">
                        <tr>
                          <th className="px-md py-sm">Colaborador</th>
                          <th className="px-md py-sm">Empresa</th>
                          <th className="px-md py-sm">Trocas</th>
                          <th className="px-md py-sm">Horas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.summary.bySubstituto.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-md py-xl text-center text-on-surface-variant">
                              Sem substituições ainda.
                            </td>
                          </tr>
                        ) : (
                          data.summary.bySubstituto.slice(0, 8).map((row) => (
                            <tr key={row.id} className="border-t border-outline-variant/60">
                              <td className="px-md py-sm text-primary">{row.nome}</td>
                              <td className="px-md py-sm text-on-surface-variant">{row.empresa}</td>
                              <td className="px-md py-sm">{row.trocas}</td>
                              <td className="px-md py-sm font-semibold">{formatHours(row.horas)}h</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
                <div className="flex flex-col gap-sm border-b border-outline-variant px-md py-sm sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-title-md text-primary">Lançamentos do mês</h3>
                    <p className="hidden text-body-md text-on-surface-variant sm:block">
                      Filtros por posto, colaborador e data.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab("lancar")}
                    className="hidden items-center gap-xs rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-primary md:inline-flex"
                  >
                    <Icon name="add" className="text-[18px]" />
                    Nova troca
                  </button>
                </div>
                <div className="flex flex-col gap-sm border-b border-outline-variant px-md py-sm sm:flex-row sm:flex-wrap sm:items-end">
                  <div className="min-w-[16rem] flex-1">
                    <SearchablePick
                      label="Filtrar posto"
                      value={search.postoId ? String(search.postoId) : ""}
                      options={filterPostoOptions}
                      placeholder="Buscar posto..."
                      allowClear
                      clearLabel="Todos os postos"
                      onChange={(id) =>
                        navigate({
                          search: (prev) => ({
                            ...prev,
                            postoId: id ? Number(id) : undefined,
                          }),
                        })
                      }
                    />
                  </div>
                  <div className="min-w-[16rem] flex-1">
                    <SearchablePick
                      label="Filtrar colaborador"
                      value={search.collaboratorId ? String(search.collaboratorId) : ""}
                      options={filterCollaboratorOptions}
                      placeholder="Buscar colaborador..."
                      allowClear
                      clearLabel="Todos os colaboradores"
                      onChange={(id) =>
                        navigate({
                          search: (prev) => ({
                            ...prev,
                            collaboratorId: id ? Number(id) : undefined,
                          }),
                        })
                      }
                    />
                  </div>
                  <DateInputBr
                    label="Data de"
                    valueIso={search.dataDe ?? ""}
                    onChangeIso={(iso) =>
                      navigate({
                        search: (prev) => ({
                          ...prev,
                          dataDe: iso || undefined,
                        }),
                      })
                    }
                  />
                  <DateInputBr
                    label="Data até"
                    valueIso={search.dataAte ?? ""}
                    onChangeIso={(iso) =>
                      navigate({
                        search: (prev) => ({
                          ...prev,
                          dataAte: iso || undefined,
                        }),
                      })
                    }
                  />
                  <PageSizeSelect value={lancPageSize} onChange={setLancPageSize} />
                </div>
                <div className="space-y-sm p-md md:hidden">
                  {pagedSubstitutions.totalItems === 0 ? (
                    <p className="py-lg text-center text-body-md text-on-surface-variant">
                      Nenhum lançamento neste filtro.
                    </p>
                  ) : (
                    pagedSubstitutions.items.map((row) => (
                      <article
                        key={row.id}
                        className="rounded-xl border border-outline-variant bg-surface p-md"
                      >
                        <div className="flex items-start justify-between gap-sm">
                          <div>
                            <p className="text-label-md text-on-surface-variant">
                              {formatDateBr(row.data)} · {row.motivoLabel}
                            </p>
                            <p className="mt-xs text-title-md text-primary">{row.postoNome}</p>
                          </div>
                          <div className="text-right">
                            {row.pagaHoras ? (
                              <p className="text-title-md font-semibold text-primary">
                                {formatHours(row.horas)}h
                              </p>
                            ) : (
                              <p className="text-label-md font-semibold text-on-surface-variant">
                                Sem pgto
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="mt-sm grid gap-xs text-body-md">
                          <p>
                            <span className="text-on-surface-variant">Ausente: </span>
                            {row.ausenteNome}
                          </p>
                          <p>
                            <span className="text-on-surface-variant">Cobriu: </span>
                            {row.substitutoNome}
                          </p>
                          {row.createdByName ? (
                            <p>
                              <span className="text-on-surface-variant">Registrado por: </span>
                              {row.createdByName}
                            </p>
                          ) : null}
                          {row.foraDoPostoBase ? (
                            <p className="text-label-md text-secondary">Fora do posto base</p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="mt-sm text-label-md font-semibold text-error"
                          disabled={pending}
                          onClick={() => void removeSubstitution(row.id)}
                        >
                          Excluir
                        </button>
                      </article>
                    ))
                  )}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-full text-left text-body-md">
                    <thead className="bg-surface-container-low text-label-md text-on-surface-variant">
                      <tr>
                        <th className="px-md py-sm">Data</th>
                        <th className="px-md py-sm">Posto</th>
                        <th className="px-md py-sm">Ausente</th>
                        <th className="px-md py-sm">Substituto</th>
                        <th className="px-md py-sm">Motivo</th>
                        <th className="px-md py-sm">Horas</th>
                        <th className="px-md py-sm">Registrado por</th>
                        <th className="px-md py-sm" />
                      </tr>
                    </thead>
                    <tbody>
                      {pagedSubstitutions.totalItems === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-md py-xl text-center text-on-surface-variant">
                            Nenhum lançamento neste filtro.
                          </td>
                        </tr>
                      ) : (
                        pagedSubstitutions.items.map((row) => (
                          <tr key={row.id} className="border-t border-outline-variant/60">
                            <td className="px-md py-sm whitespace-nowrap">{formatDateBr(row.data)}</td>
                            <td className="px-md py-sm text-primary">
                              {row.postoNome}
                              {row.foraDoPostoBase ? (
                                <span className="mt-xs block text-label-md text-secondary">
                                  Substituto fora do posto base
                                </span>
                              ) : null}
                            </td>
                            <td className="px-md py-sm">
                              <div>{row.ausenteNome}</div>
                              <div className="text-label-md text-on-surface-variant">
                                {row.ausenteEmpresa}
                              </div>
                            </td>
                            <td className="px-md py-sm">
                              <div>{row.substitutoNome}</div>
                              <div className="text-label-md text-on-surface-variant">
                                {row.substitutoEmpresa} · {row.substitutoEscala}
                              </div>
                            </td>
                            <td className="px-md py-sm">{row.motivoLabel}</td>
                            <td className="px-md py-sm font-semibold">
                              {row.pagaHoras ? (
                                `${formatHours(row.horas)}h`
                              ) : (
                                <span className="text-label-md font-semibold text-on-surface-variant">
                                  Sem pagamento
                                </span>
                              )}
                            </td>
                            <td className="px-md py-sm text-on-surface-variant">
                              {row.createdByName ?? "—"}
                            </td>
                            <td className="px-md py-sm text-right">
                              <button
                                type="button"
                                className="text-label-md text-error hover:underline"
                                disabled={pending}
                                onClick={() => void removeSubstitution(row.id)}
                              >
                                Excluir
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <TablePager
                  page={pagedSubstitutions.page}
                  totalPages={pagedSubstitutions.totalPages}
                  totalItems={pagedSubstitutions.totalItems}
                  pageSize={lancPageSize}
                  onPageChange={setLancPage}
                />
              </div>

              {data.summary.byMotivo.length > 0 && (
                <div className="flex flex-wrap gap-sm">
                  {data.summary.byMotivo.map((row) => (
                    <div
                      key={row.motivo}
                      className="rounded-lg border border-outline-variant bg-surface-container-low px-md py-sm"
                    >
                      <p className="text-label-md text-on-surface-variant">{row.motivoLabel}</p>
                      <p className="text-title-md text-primary">
                        {row.trocas}
                        {row.pagaHoras ? ` · ${formatHours(row.horas)}h` : " · sem pgto"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {search.tab === "lancar" && (
            <section className="mx-auto w-full max-w-[42rem] space-y-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md md:p-lg">
              <div>
                <h3 className="text-title-lg text-primary">Lançar substituição</h3>
                <p className="mt-xs text-body-md text-on-surface-variant">
                  Informe quem faltou, quem cobriu e o posto. Em solicitação de troca (permuta), as
                  horas não entram no pagamento.
                </p>
              </div>

              {activePosts.length === 0 || activeCollaborators.length < 2 ? (
                <div className="rounded-lg border border-dashed border-outline-variant p-md text-body-md text-on-surface-variant">
                  Cadastre ao menos um posto e dois colaboradores ativos antes de lançar trocas.{" "}
                  <button
                    type="button"
                    className="font-semibold text-primary underline"
                    onClick={() => setTab("cadastros")}
                  >
                    Ir para cadastros
                  </button>
                </div>
              ) : (
                <form
                  className="space-y-md"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitSubstitution();
                  }}
                >
                  <div className="grid gap-md sm:grid-cols-2">
                    <DateInputBr
                      label="Data"
                      valueIso={subForm.data}
                      required
                      fullWidth
                      onChangeIso={(iso) => setSubForm((p) => ({ ...p, data: iso }))}
                    />
                    <label className="block space-y-xs">
                      <span className="text-label-md text-primary">Motivo</span>
                      <select
                        value={subForm.motivo}
                        onChange={(e) =>
                          setSubForm((p) => ({
                            ...p,
                            motivo: e.target.value as FacilitiesMotivoId,
                          }))
                        }
                        className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                      >
                        {data.catalogs.motivos.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                            {m.pagaHoras === false ? " (sem pagamento)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {isPermuta ? (
                    <div className="rounded-lg border border-secondary/30 bg-secondary-container/30 px-md py-sm text-body-md text-primary">
                      Solicitação de troca: os colaboradores permutam o dia entre si. O lançamento
                      fica registrado, mas <strong>não conta como horas a pagar</strong>.
                    </div>
                  ) : null}

                  <SearchablePick
                    label="Quem faltou (ausente)"
                    value={subForm.ausenteId}
                    options={ausenteOptions}
                    placeholder="Digite o nome do colaborador..."
                    onChange={onSelectAusente}
                  />

                  <SearchablePick
                    label="Posto da cobertura"
                    value={subForm.postoId}
                    options={postoOptions}
                    placeholder="Digite o nome do posto..."
                    onChange={(id) => setSubForm((p) => ({ ...p, postoId: id }))}
                  />

                  <div className="space-y-xs">
                    <SearchablePick
                      label="Quem cobriu (substituto)"
                      value={subForm.substitutoId}
                      options={substitutoOptions}
                      placeholder="Digite o nome de quem cobriu..."
                      onChange={onSelectSubstituto}
                    />
                    {substitutoForaBase && (
                      <p className="text-label-md text-secondary">
                        Atenção: {selectedSubstituto?.nome} está cobrindo fora do posto base (
                        {selectedSubstituto?.postoBaseNome}).
                      </p>
                    )}
                  </div>

                  <div className="grid gap-md sm:grid-cols-2">
                    <label className="block space-y-xs">
                      <span className="text-label-md text-primary">
                        {isPermuta ? "Duração do plantão (registro)" : "Horas a pagar"}
                      </span>
                      <input
                        type="number"
                        min={0.5}
                        max={24}
                        step={0.5}
                        required
                        value={subForm.horas}
                        onChange={(e) => setSubForm((p) => ({ ...p, horas: e.target.value }))}
                        className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                      />
                      {isPermuta ? (
                        <span className="text-label-md text-on-surface-variant">
                          Só para histórico — não entra no fechamento.
                        </span>
                      ) : null}
                    </label>
                    <label className="block space-y-xs">
                      <span className="text-label-md text-primary">Observação</span>
                      <input
                        value={subForm.observacao}
                        onChange={(e) => setSubForm((p) => ({ ...p, observacao: e.target.value }))}
                        placeholder="Opcional"
                        className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                      />
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={pending}
                    className="inline-flex w-full items-center justify-center gap-xs rounded-lg bg-secondary-container px-md py-md text-label-md font-semibold text-primary disabled:opacity-60 sm:w-auto sm:py-sm"
                  >
                    <Icon name="check" className="text-[18px]" />
                    {pending ? "Salvando..." : isPermuta ? "Registrar permuta" : "Registrar troca"}
                  </button>
                </form>
              )}
            </section>
          )}

          {search.tab === "cadastros" && (
            <section className="space-y-md">
              <div className="flex flex-wrap gap-sm">
                <button
                  type="button"
                  onClick={() => setCadastroTab("postos")}
                  className={cn(
                    "rounded-lg px-md py-sm text-label-md font-semibold",
                    cadastroTab === "postos"
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container-high text-on-surface-variant",
                  )}
                >
                  Postos ({filteredPosts.length}
                  {filteredPosts.length !== data.posts.length ? `/${data.posts.length}` : ""})
                </button>
                <button
                  type="button"
                  onClick={() => setCadastroTab("colaboradores")}
                  className={cn(
                    "rounded-lg px-md py-sm text-label-md font-semibold",
                    cadastroTab === "colaboradores"
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container-high text-on-surface-variant",
                  )}
                >
                  Colaboradores ({filteredCollaborators.length}
                  {filteredCollaborators.length !== data.collaborators.length
                    ? `/${data.collaborators.length}`
                    : ""}
                  )
                </button>
                <div className="flex-1" />
                {cadastroTab === "postos" ? (
                  <div className="flex flex-wrap items-center gap-sm">
                    <input
                      ref={postImportRef}
                      type="file"
                      accept=".xls,.csv,application/vnd.ms-excel,text/csv"
                      className="hidden"
                      onChange={(e) => void importPostsFromFile(e.target.files?.[0] ?? null)}
                    />
                    <button
                      type="button"
                      className="inline-flex items-center gap-xs rounded-lg border border-outline-variant bg-surface px-md py-sm text-label-md font-semibold text-primary"
                      onClick={() => downloadFacilitiesPostsModeloExcel()}
                    >
                      <Icon name="download" className="text-[18px]" />
                      Modelo Excel
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      className="inline-flex items-center gap-xs rounded-lg border border-outline-variant bg-surface px-md py-sm text-label-md font-semibold text-primary disabled:opacity-60"
                      onClick={() => postImportRef.current?.click()}
                    >
                      <Icon name="upload" className="text-[18px]" />
                      Importar Excel
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-xs rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-primary"
                      onClick={() => {
                        setPostForm({
                          id: 0,
                          nome: "",
                          endereco: "",
                          cidade: "",
                          observacao: "",
                          active: true,
                        });
                        setPostDialog(true);
                      }}
                    >
                      <Icon name="add" className="text-[18px]" />
                      Novo posto
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-sm">
                    <input
                      ref={colImportRef}
                      type="file"
                      accept=".xls,.csv,application/vnd.ms-excel,text/csv"
                      className="hidden"
                      onChange={(e) =>
                        void importCollaboratorsFromFile(e.target.files?.[0] ?? null)
                      }
                    />
                    <button
                      type="button"
                      className="inline-flex items-center gap-xs rounded-lg border border-outline-variant bg-surface px-md py-sm text-label-md font-semibold text-primary"
                      onClick={() => downloadFacilitiesCollaboratorsModeloExcel()}
                    >
                      <Icon name="download" className="text-[18px]" />
                      Modelo Excel
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      className="inline-flex items-center gap-xs rounded-lg border border-outline-variant bg-surface px-md py-sm text-label-md font-semibold text-primary disabled:opacity-60"
                      onClick={() => colImportRef.current?.click()}
                    >
                      <Icon name="upload" className="text-[18px]" />
                      Importar Excel
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-xs rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-primary"
                      onClick={() => {
                        setColForm({
                          id: 0,
                          nome: "",
                          empresa: "ancora",
                          funcao: "vigilante",
                          escala: "12x36_diurno",
                          postoBaseId: "",
                          telefone: "",
                          active: true,
                        });
                        setColDialog(true);
                      }}
                    >
                      <Icon name="person_add" className="text-[18px]" />
                      Novo colaborador
                    </button>
                  </div>
                )}
              </div>

              {cadastroTab === "postos" ? (
                <div className="flex flex-col gap-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-md sm:flex-row sm:flex-wrap sm:items-end">
                  <label className="block min-w-[14rem] flex-1 space-y-xs">
                    <span className="text-label-md text-primary">Buscar posto</span>
                    <div className="relative">
                      <Icon
                        name="search"
                        className="pointer-events-none absolute left-sm top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant"
                      />
                      <input
                        value={postFilterQuery}
                        onChange={(e) => setPostFilterQuery(e.target.value)}
                        placeholder="Nome, cidade ou endereço..."
                        className="w-full rounded-lg border border-outline-variant bg-surface py-sm pl-[40px] pr-sm text-body-md"
                      />
                    </div>
                  </label>
                  <label className="block space-y-xs">
                    <span className="text-label-md text-primary">Status</span>
                    <select
                      value={postFilterStatus}
                      onChange={(e) =>
                        setPostFilterStatus(e.target.value as "all" | "active" | "inactive")
                      }
                      className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md sm:w-40"
                    >
                      <option value="all">Todos</option>
                      <option value="active">Ativos</option>
                      <option value="inactive">Inativos</option>
                    </select>
                  </label>
                  <PageSizeSelect value={cadPageSize} onChange={setCadPageSize} />
                </div>
              ) : (
                <div className="space-y-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
                  <div className="flex flex-col gap-sm sm:flex-row sm:flex-wrap sm:items-end">
                    <label className="block min-w-[14rem] flex-1 space-y-xs">
                      <span className="text-label-md text-primary">Buscar colaborador</span>
                      <div className="relative">
                        <Icon
                          name="search"
                          className="pointer-events-none absolute left-sm top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant"
                        />
                        <input
                          value={colFilterQuery}
                          onChange={(e) => setColFilterQuery(e.target.value)}
                          placeholder="Nome, telefone, posto..."
                          className="w-full rounded-lg border border-outline-variant bg-surface py-sm pl-[40px] pr-sm text-body-md"
                        />
                      </div>
                    </label>
                    <label className="block space-y-xs">
                      <span className="text-label-md text-primary">Empresa</span>
                      <select
                        value={colFilterEmpresa}
                        onChange={(e) =>
                          setColFilterEmpresa(e.target.value as "" | FacilitiesEmpresaId)
                        }
                        className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md sm:w-36"
                      >
                        <option value="">Todas</option>
                        {data.catalogs.empresas.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-xs">
                      <span className="text-label-md text-primary">Função</span>
                      <select
                        value={colFilterFuncao}
                        onChange={(e) =>
                          setColFilterFuncao(e.target.value as "" | FacilitiesFuncaoId)
                        }
                        className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md sm:w-40"
                      >
                        <option value="">Todas</option>
                        {data.catalogs.funcoes.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-xs">
                      <span className="text-label-md text-primary">Escala</span>
                      <select
                        value={colFilterEscala}
                        onChange={(e) =>
                          setColFilterEscala(e.target.value as "" | FacilitiesEscalaId)
                        }
                        className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md sm:w-44"
                      >
                        <option value="">Todas</option>
                        {data.catalogs.escalas.map((esc) => (
                          <option key={esc.id} value={esc.id}>
                            {esc.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-xs">
                      <span className="text-label-md text-primary">Status</span>
                      <select
                        value={colFilterStatus}
                        onChange={(e) =>
                          setColFilterStatus(e.target.value as "all" | "active" | "inactive")
                        }
                        className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm text-body-md sm:w-36"
                      >
                        <option value="all">Todos</option>
                        <option value="active">Ativos</option>
                        <option value="inactive">Inativos</option>
                      </select>
                    </label>
                    <PageSizeSelect value={cadPageSize} onChange={setCadPageSize} />
                  </div>
                  <div className="w-full max-w-[28rem]">
                    <SearchablePick
                      label="Posto base"
                      value={colFilterPostoId}
                      options={colPostoFilterOptions}
                      placeholder="Filtrar por posto base..."
                      allowClear
                      clearLabel="Todos os postos"
                      onChange={setColFilterPostoId}
                    />
                  </div>
                </div>
              )}

              {cadastroTab === "postos" ? (
                <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
                  <div className="space-y-sm p-md md:hidden">
                    {filteredPosts.length === 0 ? (
                      <p className="py-lg text-center text-body-md text-on-surface-variant">
                        {data.posts.length === 0
                          ? "Nenhum posto cadastrado."
                          : "Nenhum posto neste filtro."}
                      </p>
                    ) : (
                      pagedPosts.items.map((post) => (
                        <article
                          key={post.id}
                          className="rounded-xl border border-outline-variant bg-surface p-md"
                        >
                          <div className="flex items-start justify-between gap-sm">
                            <div className="min-w-0">
                              <p className="font-medium text-primary">{post.nome}</p>
                              <p className="text-label-md text-on-surface-variant">
                                {post.cidade ?? "Sem cidade"}
                                {post.endereco ? ` · ${post.endereco}` : ""}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "shrink-0 text-label-md",
                                post.active ? "text-secondary" : "text-on-surface-variant",
                              )}
                            >
                              {post.active ? "Ativo" : "Inativo"}
                            </span>
                          </div>
                          <div className="mt-sm flex gap-md">
                            <button
                              type="button"
                              className="text-label-md font-semibold text-primary"
                              onClick={() => {
                                setPostForm({
                                  id: post.id,
                                  nome: post.nome,
                                  endereco: post.endereco ?? "",
                                  cidade: post.cidade ?? "",
                                  observacao: post.observacao ?? "",
                                  active: post.active,
                                });
                                setPostDialog(true);
                              }}
                            >
                              Editar
                            </button>
                            {post.active ? (
                              <button
                                type="button"
                                className="text-label-md font-semibold text-error"
                                onClick={async () => {
                                  if (!confirm(`Desativar posto ${post.nome}?`)) return;
                                  setPending(true);
                                  try {
                                    await deactivateFacilitiesPostFn({ data: { id: post.id } });
                                    await router.invalidate();
                                  } finally {
                                    setPending(false);
                                  }
                                }}
                              >
                                Desativar
                              </button>
                            ) : null}
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-full text-left text-body-md">
                    <thead className="bg-surface-container-low text-label-md text-on-surface-variant">
                      <tr>
                        <th className="px-md py-sm">Posto</th>
                        <th className="px-md py-sm">Cidade</th>
                        <th className="px-md py-sm">Status</th>
                        <th className="px-md py-sm" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPosts.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-md py-xl text-center text-on-surface-variant">
                            {data.posts.length === 0
                              ? "Nenhum posto cadastrado."
                              : "Nenhum posto neste filtro."}
                          </td>
                        </tr>
                      ) : (
                        pagedPosts.items.map((post) => (
                          <tr key={post.id} className="border-t border-outline-variant/60">
                            <td className="px-md py-sm">
                              <div className="font-medium text-primary">{post.nome}</div>
                              {post.endereco ? (
                                <div className="text-label-md text-on-surface-variant">
                                  {post.endereco}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-md py-sm">{post.cidade ?? "—"}</td>
                            <td className="px-md py-sm">
                              {post.active ? (
                                <span className="text-secondary">Ativo</span>
                              ) : (
                                <span className="text-on-surface-variant">Inativo</span>
                              )}
                            </td>
                            <td className="px-md py-sm text-right">
                              <button
                                type="button"
                                className="mr-sm text-label-md text-primary hover:underline"
                                onClick={() => {
                                  setPostForm({
                                    id: post.id,
                                    nome: post.nome,
                                    endereco: post.endereco ?? "",
                                    cidade: post.cidade ?? "",
                                    observacao: post.observacao ?? "",
                                    active: post.active,
                                  });
                                  setPostDialog(true);
                                }}
                              >
                                Editar
                              </button>
                              {post.active ? (
                                <button
                                  type="button"
                                  className="text-label-md text-error hover:underline"
                                  onClick={async () => {
                                    if (!confirm(`Desativar posto ${post.nome}?`)) return;
                                    setPending(true);
                                    try {
                                      await deactivateFacilitiesPostFn({ data: { id: post.id } });
                                      await router.invalidate();
                                    } finally {
                                      setPending(false);
                                    }
                                  }}
                                >
                                  Desativar
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  </div>
                  <TablePager
                    page={pagedPosts.page}
                    totalPages={pagedPosts.totalPages}
                    totalItems={pagedPosts.totalItems}
                    pageSize={cadPageSize}
                    onPageChange={setCadPage}
                  />
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
                  <div className="space-y-sm p-md md:hidden">
                    {filteredCollaborators.length === 0 ? (
                      <p className="py-lg text-center text-body-md text-on-surface-variant">
                        {data.collaborators.length === 0
                          ? "Nenhum colaborador cadastrado."
                          : "Nenhum colaborador neste filtro."}
                      </p>
                    ) : (
                      pagedCollaborators.items.map((col) => (
                        <article
                          key={col.id}
                          className="rounded-xl border border-outline-variant bg-surface p-md"
                        >
                          <div className="flex items-start justify-between gap-sm">
                            <div className="min-w-0">
                              <p className="font-medium text-primary">{col.nome}</p>
                              <p className="text-label-md text-on-surface-variant">
                                {col.funcaoLabel} · {col.escalaLabel}
                              </p>
                              <p className="text-label-md text-on-surface-variant">
                                {col.postoBaseNome ?? "Sem posto base"}
                              </p>
                            </div>
                            <EmpresaBadge id={col.empresa} label={col.empresaLabel} />
                          </div>
                          {!col.active ? (
                            <p className="mt-xs text-label-md text-on-surface-variant">Inativo</p>
                          ) : null}
                          <div className="mt-sm flex gap-md">
                            <button
                              type="button"
                              className="text-label-md font-semibold text-primary"
                              onClick={() => {
                                setColForm({
                                  id: col.id,
                                  nome: col.nome,
                                  empresa: col.empresa,
                                  funcao: col.funcao,
                                  escala: col.escala,
                                  postoBaseId: col.postoBaseId ? String(col.postoBaseId) : "",
                                  telefone: col.telefone ?? "",
                                  active: col.active,
                                });
                                setColDialog(true);
                              }}
                            >
                              Editar
                            </button>
                            {col.active ? (
                              <button
                                type="button"
                                className="text-label-md font-semibold text-error"
                                onClick={async () => {
                                  if (!confirm(`Desativar ${col.nome}?`)) return;
                                  setPending(true);
                                  try {
                                    await deactivateFacilitiesCollaboratorFn({
                                      data: { id: col.id },
                                    });
                                    await router.invalidate();
                                  } finally {
                                    setPending(false);
                                  }
                                }}
                              >
                                Desativar
                              </button>
                            ) : null}
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-full text-left text-body-md">
                    <thead className="bg-surface-container-low text-label-md text-on-surface-variant">
                      <tr>
                        <th className="px-md py-sm">Nome</th>
                        <th className="px-md py-sm">Empresa</th>
                        <th className="px-md py-sm">Função / Escala</th>
                        <th className="px-md py-sm">Posto base</th>
                        <th className="px-md py-sm" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCollaborators.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-md py-xl text-center text-on-surface-variant">
                            {data.collaborators.length === 0
                              ? "Nenhum colaborador cadastrado."
                              : "Nenhum colaborador neste filtro."}
                          </td>
                        </tr>
                      ) : (
                        pagedCollaborators.items.map((col) => (
                          <tr key={col.id} className="border-t border-outline-variant/60">
                            <td className="px-md py-sm">
                              <div className="font-medium text-primary">{col.nome}</div>
                              {!col.active ? (
                                <div className="text-label-md text-on-surface-variant">Inativo</div>
                              ) : null}
                            </td>
                            <td className="px-md py-sm">
                              <EmpresaBadge id={col.empresa} label={col.empresaLabel} />
                            </td>
                            <td className="px-md py-sm">
                              <div>{col.funcaoLabel}</div>
                              <div className="text-label-md text-on-surface-variant">
                                {col.escalaLabel} · {col.defaultHours}h
                              </div>
                            </td>
                            <td className="px-md py-sm">{col.postoBaseNome ?? "—"}</td>
                            <td className="px-md py-sm text-right">
                              <button
                                type="button"
                                className="mr-sm text-label-md text-primary hover:underline"
                                onClick={() => {
                                  setColForm({
                                    id: col.id,
                                    nome: col.nome,
                                    empresa: col.empresa,
                                    funcao: col.funcao,
                                    escala: col.escala,
                                    postoBaseId: col.postoBaseId ? String(col.postoBaseId) : "",
                                    telefone: col.telefone ?? "",
                                    active: col.active,
                                  });
                                  setColDialog(true);
                                }}
                              >
                                Editar
                              </button>
                              {col.active ? (
                                <button
                                  type="button"
                                  className="text-label-md text-error hover:underline"
                                  onClick={async () => {
                                    if (!confirm(`Desativar ${col.nome}?`)) return;
                                    setPending(true);
                                    try {
                                      await deactivateFacilitiesCollaboratorFn({
                                        data: { id: col.id },
                                      });
                                      await router.invalidate();
                                    } finally {
                                      setPending(false);
                                    }
                                  }}
                                >
                                  Desativar
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  </div>
                  <TablePager
                    page={pagedCollaborators.page}
                    totalPages={pagedCollaborators.totalPages}
                    totalItems={pagedCollaborators.totalItems}
                    pageSize={cadPageSize}
                    onPageChange={setCadPage}
                  />
                </div>
              )}
            </section>
          )}

          {search.tab === "fechamento" && (
            <section className="space-y-lg">
              <div className="rounded-xl border border-outline-variant bg-gradient-to-br from-secondary-container/50 to-surface-container-lowest p-md md:p-lg">
                <div className="flex flex-col gap-md md:flex-row md:items-end md:justify-between">
                  <div>
                    <h3 className="text-title-lg text-primary">
                      Fechamento — {monthLabel(data.monthKey)}
                    </h3>
                    <p className="mt-xs text-body-md text-on-surface-variant">
                      Resumo das horas a pagar (faltas, atestados e folgas). Solicitações de troca
                      entre colegas ficam de fora.
                    </p>
                    <p className="mt-md text-headline-md font-semibold text-primary">
                      {formatHours(data.summary.horas)}h a pagar
                      {data.summary.permutas > 0 ? (
                        <span className="ml-sm text-title-md font-normal text-on-surface-variant">
                          · {data.summary.permutas} permuta(s)
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex w-full flex-col gap-sm sm:w-auto sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          downloadFacilitiesFechamentoExcel({
                            monthKey: data.monthKey,
                            monthLabel: monthLabel(data.monthKey),
                            horasPagar: data.summary.horas,
                            trocas: data.summary.trocas,
                            permutas: data.summary.permutas,
                            bySubstituto: data.summary.bySubstituto,
                            byPosto: data.summary.byPosto,
                            lancamentos: data.substitutions.map((row) => ({
                              data: row.data,
                              postoNome: row.postoNome,
                              ausenteNome: row.ausenteNome,
                              ausenteEmpresa: row.ausenteEmpresa,
                              substitutoNome: row.substitutoNome,
                              substitutoEmpresa: row.substitutoEmpresa,
                              motivoLabel: row.motivoLabel,
                              horas: row.horas,
                              pagaHoras: row.pagaHoras,
                              observacao: row.observacao,
                              registradoPor: row.createdByName,
                            })),
                          });
                          flash("Excel do fechamento baixado.");
                        } catch (err) {
                          flash(
                            null,
                            err instanceof Error ? err.message : "Falha ao exportar Excel.",
                          );
                        }
                      }}
                      className="inline-flex w-full items-center justify-center gap-xs rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-primary sm:w-auto"
                    >
                      <Icon name="download" className="text-[18px]" />
                      Exportar Excel
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyPayment()}
                      className="inline-flex w-full items-center justify-center gap-xs rounded-lg bg-primary px-md py-sm text-label-md font-semibold text-on-primary sm:w-auto"
                    >
                      <Icon name="content_copy" className="text-[18px]" />
                      {copied ? "Copiado!" : "Copiar resumo"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-end justify-between gap-sm">
                <p className="text-body-md text-on-surface-variant">
                  Listas do fechamento com datas e paginação.
                </p>
                <PageSizeSelect value={fechPageSize} onChange={setFechPageSize} />
              </div>

              <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
                <div className="border-b border-outline-variant px-md py-sm">
                  <h4 className="text-title-md text-primary">Pagamento por colaborador</h4>
                </div>
                <div className="space-y-sm p-md md:hidden">
                  {pagedFechColaboradores.totalItems === 0 ? (
                    <p className="py-lg text-center text-body-md text-on-surface-variant">
                      Sem horas a pagar neste mês.
                    </p>
                  ) : (
                    pagedFechColaboradores.items.map((row, index) => (
                      <article
                        key={row.id}
                        className="flex items-center justify-between gap-sm rounded-xl border border-outline-variant bg-surface p-md"
                      >
                        <div className="min-w-0">
                          <p className="text-label-md text-on-surface-variant">
                            #{(pagedFechColaboradores.page - 1) * fechPageSize + index + 1}
                          </p>
                          <p className="font-medium text-primary">{row.nome}</p>
                          <p className="text-label-md text-on-surface-variant">
                            {row.empresa} · {row.trocas} cobertura(s)
                          </p>
                        </div>
                        <p className="shrink-0 text-title-md font-semibold text-primary">
                          {formatHours(row.horas)}h
                        </p>
                      </article>
                    ))
                  )}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-full text-left text-body-md">
                    <thead className="bg-surface-container-low text-label-md text-on-surface-variant">
                      <tr>
                        <th className="px-md py-sm">#</th>
                        <th className="px-md py-sm">Colaborador</th>
                        <th className="px-md py-sm">Empresa</th>
                        <th className="px-md py-sm">Escala</th>
                        <th className="px-md py-sm">Trocas</th>
                        <th className="px-md py-sm">Horas a pagar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedFechColaboradores.totalItems === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-md py-xl text-center text-on-surface-variant">
                            Sem horas a pagar neste mês.
                          </td>
                        </tr>
                      ) : (
                        pagedFechColaboradores.items.map((row, index) => (
                          <tr key={row.id} className="border-t border-outline-variant/60">
                            <td className="px-md py-sm text-on-surface-variant">
                              {(pagedFechColaboradores.page - 1) * fechPageSize + index + 1}
                            </td>
                            <td className="px-md py-sm font-medium text-primary">{row.nome}</td>
                            <td className="px-md py-sm">{row.empresa}</td>
                            <td className="px-md py-sm text-on-surface-variant">{row.escala}</td>
                            <td className="px-md py-sm">{row.trocas}</td>
                            <td className="px-md py-sm text-title-md font-semibold text-primary">
                              {formatHours(row.horas)}h
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <TablePager
                  page={pagedFechColaboradores.page}
                  totalPages={pagedFechColaboradores.totalPages}
                  totalItems={pagedFechColaboradores.totalItems}
                  pageSize={fechPageSize}
                  onPageChange={setFechColPage}
                />
              </div>

              <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
                <div className="border-b border-outline-variant px-md py-sm">
                  <h4 className="text-title-md text-primary">Por posto de serviço</h4>
                </div>
                <div className="space-y-sm p-md md:hidden">
                  {pagedFechPostos.totalItems === 0 ? (
                    <p className="py-lg text-center text-body-md text-on-surface-variant">
                      Sem lançamentos neste mês.
                    </p>
                  ) : (
                    pagedFechPostos.items.map((row) => (
                      <article
                        key={row.id}
                        className="flex items-center justify-between gap-sm rounded-xl border border-outline-variant bg-surface p-md"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-primary">{row.nome}</p>
                          <p className="text-label-md text-on-surface-variant">
                            {row.trocas} lançamento(s)
                          </p>
                        </div>
                        <p className="shrink-0 text-title-md font-semibold text-primary">
                          {formatHours(row.horas)}h
                        </p>
                      </article>
                    ))
                  )}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-full text-left text-body-md">
                    <thead className="bg-surface-container-low text-label-md text-on-surface-variant">
                      <tr>
                        <th className="px-md py-sm">Posto</th>
                        <th className="px-md py-sm">Trocas</th>
                        <th className="px-md py-sm">Horas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedFechPostos.items.map((row) => (
                        <tr key={row.id} className="border-t border-outline-variant/60">
                          <td className="px-md py-sm text-primary">{row.nome}</td>
                          <td className="px-md py-sm">{row.trocas}</td>
                          <td className="px-md py-sm font-semibold">{formatHours(row.horas)}h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePager
                  page={pagedFechPostos.page}
                  totalPages={pagedFechPostos.totalPages}
                  totalItems={pagedFechPostos.totalItems}
                  pageSize={fechPageSize}
                  onPageChange={setFechPostoPage}
                />
              </div>

              <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
                <div className="border-b border-outline-variant px-md py-sm">
                  <h4 className="text-title-md text-primary">Lançamentos com data</h4>
                  <p className="text-body-md text-on-surface-variant">
                    Detalhe do mês — inclui permutas (sem pagamento).
                  </p>
                </div>
                <div className="space-y-sm p-md md:hidden">
                  {pagedFechLancamentos.totalItems === 0 ? (
                    <p className="py-lg text-center text-body-md text-on-surface-variant">
                      Nenhum lançamento neste mês.
                    </p>
                  ) : (
                    pagedFechLancamentos.items.map((row) => (
                      <article
                        key={row.id}
                        className="rounded-xl border border-outline-variant bg-surface p-md"
                      >
                        <div className="flex items-start justify-between gap-sm">
                          <div>
                            <p className="text-label-md text-on-surface-variant">
                              {formatDateBr(row.data)} · {row.motivoLabel}
                            </p>
                            <p className="mt-xs text-title-md text-primary">{row.postoNome}</p>
                          </div>
                          {row.pagaHoras ? (
                            <p className="text-title-md font-semibold text-primary">
                              {formatHours(row.horas)}h
                            </p>
                          ) : (
                            <p className="text-label-md font-semibold text-on-surface-variant">
                              Sem pgto
                            </p>
                          )}
                        </div>
                        <div className="mt-sm grid gap-xs text-body-md">
                          <p>
                            <span className="text-on-surface-variant">Ausente: </span>
                            {row.ausenteNome}
                          </p>
                          <p>
                            <span className="text-on-surface-variant">Cobriu: </span>
                            {row.substitutoNome}
                          </p>
                          {row.createdByName ? (
                            <p>
                              <span className="text-on-surface-variant">Registrado por: </span>
                              {row.createdByName}
                            </p>
                          ) : null}
                        </div>
                      </article>
                    ))
                  )}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-full text-left text-body-md">
                    <thead className="bg-surface-container-low text-label-md text-on-surface-variant">
                      <tr>
                        <th className="px-md py-sm">Data</th>
                        <th className="px-md py-sm">Posto</th>
                        <th className="px-md py-sm">Ausente</th>
                        <th className="px-md py-sm">Substituto</th>
                        <th className="px-md py-sm">Motivo</th>
                        <th className="px-md py-sm">Horas</th>
                        <th className="px-md py-sm">Registrado por</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedFechLancamentos.totalItems === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-md py-xl text-center text-on-surface-variant">
                            Nenhum lançamento neste mês.
                          </td>
                        </tr>
                      ) : (
                        pagedFechLancamentos.items.map((row) => (
                          <tr key={row.id} className="border-t border-outline-variant/60">
                            <td className="px-md py-sm whitespace-nowrap">{formatDateBr(row.data)}</td>
                            <td className="px-md py-sm text-primary">{row.postoNome}</td>
                            <td className="px-md py-sm">
                              <div>{row.ausenteNome}</div>
                              <div className="text-label-md text-on-surface-variant">
                                {row.ausenteEmpresa}
                              </div>
                            </td>
                            <td className="px-md py-sm">
                              <div>{row.substitutoNome}</div>
                              <div className="text-label-md text-on-surface-variant">
                                {row.substitutoEmpresa}
                              </div>
                            </td>
                            <td className="px-md py-sm">{row.motivoLabel}</td>
                            <td className="px-md py-sm font-semibold">
                              {row.pagaHoras ? (
                                `${formatHours(row.horas)}h`
                              ) : (
                                <span className="text-label-md text-on-surface-variant">
                                  Sem pagamento
                                </span>
                              )}
                            </td>
                            <td className="px-md py-sm text-on-surface-variant">
                              {row.createdByName ?? "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <TablePager
                  page={pagedFechLancamentos.page}
                  totalPages={pagedFechLancamentos.totalPages}
                  totalItems={pagedFechLancamentos.totalItems}
                  pageSize={fechPageSize}
                  onPageChange={setFechLancPage}
                />
              </div>
            </section>
          )}
        </div>

        {search.tab === "painel" ? (
          <button
            type="button"
            onClick={() => setTab("lancar")}
            className="fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom,0px))] right-margin-mobile z-40 inline-flex items-center gap-xs rounded-full bg-secondary-container px-md py-sm text-label-md font-semibold text-primary shadow-lg md:hidden"
          >
            <Icon name="add" className="text-[20px]" />
            Nova troca
          </button>
        ) : null}
      </main>

      <Dialog open={postDialog} onOpenChange={setPostDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{postForm.id ? "Editar posto" : "Novo posto de serviço"}</DialogTitle>
            <DialogDescription>Local onde a equipe faz a jornada.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-md"
            onSubmit={async (e) => {
              e.preventDefault();
              setPending(true);
              flash(null);
              try {
                const payload = {
                  nome: postForm.nome,
                  endereco: postForm.endereco.trim() || null,
                  cidade: postForm.cidade.trim() || null,
                  observacao: postForm.observacao.trim() || null,
                  active: postForm.active,
                };
                const result = postForm.id
                  ? await updateFacilitiesPostFn({ data: { id: postForm.id, ...payload } })
                  : await createFacilitiesPostFn({ data: payload });
                if (!result.ok) {
                  flash(null, result.error);
                  return;
                }
                setPostDialog(false);
                flash(postForm.id ? "Posto atualizado." : "Posto cadastrado.");
                await router.invalidate();
              } finally {
                setPending(false);
              }
            }}
          >
            <label className="block space-y-xs">
              <span className="text-label-md">Nome</span>
              <input
                required
                value={postForm.nome}
                onChange={(e) => setPostForm((p) => ({ ...p, nome: e.target.value }))}
                className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
              />
            </label>
            <div className="grid gap-md sm:grid-cols-2">
              <label className="block space-y-xs">
                <span className="text-label-md">Cidade</span>
                <input
                  value={postForm.cidade}
                  onChange={(e) => setPostForm((p) => ({ ...p, cidade: e.target.value }))}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                />
              </label>
              <label className="block space-y-xs">
                <span className="text-label-md">Endereço</span>
                <input
                  value={postForm.endereco}
                  onChange={(e) => setPostForm((p) => ({ ...p, endereco: e.target.value }))}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                />
              </label>
            </div>
            <label className="block space-y-xs">
              <span className="text-label-md">Observação</span>
              <textarea
                rows={2}
                value={postForm.observacao}
                onChange={(e) => setPostForm((p) => ({ ...p, observacao: e.target.value }))}
                className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
              />
            </label>
            {postForm.id > 0 && (
              <label className="flex items-center gap-sm text-body-md">
                <input
                  type="checkbox"
                  checked={postForm.active}
                  onChange={(e) => setPostForm((p) => ({ ...p, active: e.target.checked }))}
                />
                Ativo
              </label>
            )}
            <DialogFooter>
              <button
                type="button"
                className="rounded-lg px-md py-sm text-label-md"
                onClick={() => setPostDialog(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-primary"
              >
                {pending ? "Salvando..." : "Salvar"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={colDialog} onOpenChange={setColDialog}>
        <DialogContent className="w-[min(36rem,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle>
              {colForm.id ? "Editar colaborador" : "Novo colaborador"}
            </DialogTitle>
            <DialogDescription>
              Empresa (Angela, Âncora ou Belfer), função, escala e posto base.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-md"
            onSubmit={async (e) => {
              e.preventDefault();
              setPending(true);
              flash(null);
              try {
                const payload = {
                  nome: colForm.nome,
                  empresa: colForm.empresa,
                  funcao: colForm.funcao,
                  escala: colForm.escala,
                  postoBaseId: colForm.postoBaseId ? Number(colForm.postoBaseId) : null,
                  telefone: colForm.telefone.trim() || null,
                  active: colForm.active,
                };
                const result = colForm.id
                  ? await updateFacilitiesCollaboratorFn({
                      data: { id: colForm.id, ...payload },
                    })
                  : await createFacilitiesCollaboratorFn({ data: payload });
                if (!result.ok) {
                  flash(null, result.error);
                  return;
                }
                setColDialog(false);
                flash(colForm.id ? "Colaborador atualizado." : "Colaborador cadastrado.");
                await router.invalidate();
              } finally {
                setPending(false);
              }
            }}
          >
            <label className="block space-y-xs">
              <span className="text-label-md">Nome</span>
              <input
                required
                value={colForm.nome}
                onChange={(e) => setColForm((p) => ({ ...p, nome: e.target.value }))}
                className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
              />
            </label>
            <div className="grid gap-md sm:grid-cols-3">
              <label className="block space-y-xs">
                <span className="text-label-md">Empresa</span>
                <select
                  value={colForm.empresa}
                  onChange={(e) =>
                    setColForm((p) => ({
                      ...p,
                      empresa: e.target.value as FacilitiesEmpresaId,
                    }))
                  }
                  className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                >
                  {data.catalogs.empresas.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-xs">
                <span className="text-label-md">Função</span>
                <select
                  value={colForm.funcao}
                  onChange={(e) => {
                    const funcao = e.target.value as FacilitiesFuncaoId;
                    setColForm((p) => ({
                      ...p,
                      funcao,
                      escala:
                        funcao === "recepcionista" && p.escala !== "comercial"
                          ? "comercial"
                          : funcao !== "recepcionista" && p.escala === "comercial"
                            ? "12x36_diurno"
                            : p.escala,
                    }));
                  }}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                >
                  {data.catalogs.funcoes.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-xs">
                <span className="text-label-md">Escala</span>
                <select
                  value={colForm.escala}
                  onChange={(e) =>
                    setColForm((p) => ({
                      ...p,
                      escala: e.target.value as FacilitiesEscalaId,
                    }))
                  }
                  className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                >
                  {data.catalogs.escalas.map((esc) => (
                    <option key={esc.id} value={esc.id}>
                      {esc.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-md sm:grid-cols-2">
              <label className="block space-y-xs">
                <span className="text-label-md">Posto base</span>
                <select
                  value={colForm.postoBaseId}
                  onChange={(e) => setColForm((p) => ({ ...p, postoBaseId: e.target.value }))}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                >
                  <option value="">Sem posto fixo</option>
                  {activePosts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-xs">
                <span className="text-label-md">Telefone</span>
                <input
                  value={colForm.telefone}
                  onChange={(e) => setColForm((p) => ({ ...p, telefone: e.target.value }))}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-sm py-sm"
                />
              </label>
            </div>
            {colForm.id > 0 && (
              <label className="flex items-center gap-sm text-body-md">
                <input
                  type="checkbox"
                  checked={colForm.active}
                  onChange={(e) => setColForm((p) => ({ ...p, active: e.target.checked }))}
                />
                Ativo
              </label>
            )}
            <DialogFooter>
              <button
                type="button"
                className="rounded-lg px-md py-sm text-label-md"
                onClick={() => setColDialog(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-primary"
              >
                {pending ? "Salvando..." : "Salvar"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
