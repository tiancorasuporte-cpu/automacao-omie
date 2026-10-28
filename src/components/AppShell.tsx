import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { HelpChat } from "@/components/HelpChat";
import { Icon } from "@/components/Icon";
import { logoutFn } from "@/lib/auth";
import { APP_NAME } from "@/lib/brand";
import { consumeLoginEnter } from "@/lib/login-enter";
import { isAdmin, isSuperadmin, canAccessModule, roleLabel } from "@/lib/require-auth";
import { cn } from "@/lib/utils";
import { Route as RootRoute } from "@/routes/__root";
import type { AppUser } from "@/db/schema";
import type { AppModuleId } from "@/lib/modules";

const ShellSearchContext = createContext<{
  query: string;
  setQuery: (value: string) => void;
}>({ query: "", setQuery: () => undefined });

export function useShellSearch() {
  return useContext(ShellSearchContext);
}

type NavPath =
  | "/dashboard"
  | "/vencimentos"
  | "/orcamentos"
  | "/produtos"
  | "/facilities"
  | "/uniformes"
  | "/frota"
  | "/notificacoes"
  | "/settings"
  | "/users";

type NavLeaf = {
  to: NavPath;
  label: string;
  icon: string;
  adminOnly?: boolean;
  module?: AppModuleId;
};

type NavEntry =
  | ({ kind: "link" } & NavLeaf)
  | {
      kind: "group";
      id: string;
      label: string;
      icon: string;
      children: NavLeaf[];
    };

const NAV: NavEntry[] = [
  { kind: "link", to: "/dashboard", label: "Painel", icon: "dashboard", module: "dashboard" },
  {
    kind: "group",
    id: "cobranca",
    label: "Cobrança",
    icon: "payments",
    children: [
      { to: "/vencimentos", label: "Vencimentos", icon: "event", module: "vencimentos" },
      { to: "/notificacoes", label: "Notificações", icon: "history", module: "notificacoes" },
    ],
  },
  {
    kind: "group",
    id: "comercial",
    label: "Comercial",
    icon: "storefront",
    children: [
      { to: "/orcamentos", label: "Orçamentos", icon: "request_quote", module: "orcamentos" },
      { to: "/produtos", label: "Produtos", icon: "inventory_2", module: "produtos" },
    ],
  },
  {
    kind: "group",
    id: "operacoes",
    label: "Operações",
    icon: "build",
    children: [
      { to: "/facilities", label: "Facilities", icon: "apartment", module: "facilities" },
      { to: "/uniformes", label: "Uniformes", icon: "checkroom", module: "uniformes" },
      { to: "/frota", label: "Frota", icon: "directions_car", module: "frota" },
    ],
  },
  { kind: "link", to: "/settings", label: "Configurações", icon: "settings", adminOnly: true },
  { kind: "link", to: "/users", label: "Usuários", icon: "manage_accounts", adminOnly: true },
];

function canSeeLeaf(user: AppUser | null, item: NavLeaf) {
  if (item.adminOnly) return isAdmin(user);
  if (item.module) return canAccessModule(user, item.module);
  return true;
}

function isPathActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

function visibleNav(user: AppUser | null): NavEntry[] {
  const out: NavEntry[] = [];
  for (const entry of NAV) {
    if (entry.kind === "link") {
      if (canSeeLeaf(user, entry)) out.push(entry);
      continue;
    }
    const children = entry.children.filter((child) => canSeeLeaf(user, child));
    if (children.length) out.push({ ...entry, children });
  }
  return out;
}

function leafItems(user: AppUser | null, opts?: { includeAdmin?: boolean }) {
  const includeAdmin = opts?.includeAdmin ?? false;
  const leaves: NavLeaf[] = [];
  for (const entry of visibleNav(user)) {
    if (entry.kind === "link") {
      if (!includeAdmin && entry.adminOnly) continue;
      leaves.push(entry);
      continue;
    }
    leaves.push(...entry.children);
  }
  return leaves;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`.toUpperCase();
}

const SIDEBAR_COLLAPSED_KEY = "ancora.sidebar.collapsed";
const SIDEBAR_WIDTH = 280;
const SIDEBAR_COLLAPSED_WIDTH = 76;

function NavLinkItem({
  item,
  pathname,
  onNavigate,
  nested = false,
  collapsed = false,
}: {
  item: NavLeaf;
  pathname: string;
  onNavigate?: (() => void) | undefined;
  nested?: boolean;
  collapsed?: boolean;
}) {
  const active = isPathActive(pathname, item.to);
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center gap-sm rounded-lg py-sm text-label-md transition-colors",
        collapsed ? "justify-center px-sm" : nested ? "px-md pl-10" : "px-md",
        active
          ? collapsed
            ? "bg-secondary-container text-on-secondary-container"
            : "border-r-4 border-secondary-container bg-surface-container-low font-bold text-primary"
          : "text-on-surface-variant hover:bg-surface-container-high",
      )}
    >
      <Icon name={item.icon} filled={active} className="text-xl" />
      {!collapsed ? <span>{item.label}</span> : null}
    </Link>
  );
}

function NavGroupItem({
  entry,
  pathname,
  onNavigate,
  collapsed = false,
}: {
  entry: Extract<NavEntry, { kind: "group" }>;
  pathname: string;
  onNavigate?: (() => void) | undefined;
  collapsed?: boolean;
}) {
  const childActive = entry.children.some((child) => isPathActive(pathname, child.to));
  const [open, setOpen] = useState(childActive);

  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive, pathname]);

  if (collapsed) {
    return (
      <div className="space-y-0.5">
        {entry.children.map((child) => (
          <NavLinkItem
            key={child.to}
            item={child}
            pathname={pathname}
            onNavigate={onNavigate}
            collapsed
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full items-center gap-sm rounded-lg px-md py-sm text-left text-label-md transition-colors",
          childActive
            ? "bg-surface-container-low font-semibold text-primary"
            : "text-on-surface-variant hover:bg-surface-container-high",
        )}
      >
        <Icon name={entry.icon} filled={childActive} className="text-xl" />
        <span className="flex-1">{entry.label}</span>
        <Icon
          name={open ? "expand_less" : "expand_more"}
          className="text-lg text-on-surface-variant"
        />
      </button>
      {open ? (
        <div className="space-y-0.5">
          {entry.children.map((child) => (
            <NavLinkItem
              key={child.to}
              item={child}
              pathname={pathname}
              onNavigate={onNavigate}
              nested
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NavList({
  pathname,
  user,
  onNavigate,
  collapsed = false,
}: {
  pathname: string;
  user: AppUser | null;
  onNavigate?: (() => void) | undefined;
  collapsed?: boolean;
}) {
  const items = visibleNav(user);
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto">
      {items.map((entry) =>
        entry.kind === "link" ? (
          <NavLinkItem
            key={entry.to}
            item={entry}
            pathname={pathname}
            onNavigate={onNavigate}
            collapsed={collapsed}
          />
        ) : (
          <NavGroupItem
            key={entry.id}
            entry={entry}
            pathname={pathname}
            onNavigate={onNavigate}
            collapsed={collapsed}
          />
        ),
      )}
    </nav>
  );
}

function MobileBottomNav({
  pathname,
  user,
}: {
  pathname: string;
  user: AppUser | null;
}) {
  const items = leafItems(user, { includeAdmin: false });
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Módulos"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-outline-variant bg-surface/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-stretch overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const active = isPathActive(pathname, item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-0.5 px-2 py-2 text-center transition-colors",
                active
                  ? "text-primary"
                  : "text-on-surface-variant active:bg-surface-container-high",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                  active && "bg-secondary-container text-on-secondary-container",
                )}
              >
                <Icon name={item.icon} filled={active} className="text-[22px]" />
              </span>
              <span
                className={cn(
                  "max-w-[4.75rem] truncate text-[0.65rem] leading-tight",
                  active ? "font-bold" : "font-medium",
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function SidebarInner({
  onNavigate,
  pathname,
  user,
  collapsed = false,
  onToggleCollapsed,
}: {
  onNavigate?: (() => void) | undefined;
  pathname: string;
  user: AppUser | null;
  collapsed?: boolean;
  onToggleCollapsed?: (() => void) | undefined;
}) {
  const navigate = useNavigate();

  return (
    <div className={cn("flex h-full flex-col py-xl", collapsed ? "px-sm" : "px-md")}>
      <div className={cn("mb-lg flex items-center gap-md", collapsed ? "justify-center px-0" : "px-xs")}>
        <BrandLogo className={cn("w-auto shrink-0", collapsed ? "h-9" : "h-12")} />
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-title-lg leading-tight text-primary">{APP_NAME}</p>
            <p className="text-label-md uppercase tracking-wider text-on-surface-variant">
              Integração Omie + WAHA
            </p>
          </div>
        ) : null}
      </div>

      {onToggleCollapsed ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expandir menu" : "Encolher menu"}
          title={collapsed ? "Expandir menu" : "Encolher menu"}
          className={cn(
            "mb-md flex items-center gap-sm rounded-lg py-sm text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-high",
            collapsed ? "justify-center px-sm" : "px-md",
          )}
        >
          <Icon name={collapsed ? "keyboard_double_arrow_right" : "keyboard_double_arrow_left"} className="text-xl" />
          {!collapsed ? <span>Encolher</span> : null}
        </button>
      ) : null}

      <NavList pathname={pathname} user={user} onNavigate={onNavigate} collapsed={collapsed} />

      <div className="mt-auto space-y-1 border-t border-outline-variant pt-lg">
        <button
          type="button"
          title={collapsed ? "Sair" : undefined}
          onClick={async () => {
            onNavigate?.();
            await logoutFn();
            await navigate({ to: "/" });
          }}
          className={cn(
            "flex w-full items-center gap-sm rounded-lg py-sm text-left text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-high",
            collapsed ? "justify-center px-sm" : "px-md",
          )}
        >
          <Icon name="logout" className="text-xl" />
          {!collapsed ? <span>Sair</span> : null}
        </button>
        {isSuperadmin(user) && !collapsed ? (
          <p className="px-xs pt-sm text-[0.65rem] uppercase tracking-wider text-on-surface-variant">
            Superadmin
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ProfileMenu({ user }: { user: AppUser | null }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  if (!user) return null;

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        aria-label="Perfil"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-xs rounded-full p-1 transition-colors hover:bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-secondary-container"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant bg-secondary-container text-label-md font-bold text-on-secondary-container">
          {initials(user.name)}
        </span>
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-sm w-64 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1">
          <div className="border-b border-outline-variant px-md py-sm">
            <p className="truncate text-title-lg text-primary">{user.name}</p>
            <p className="text-label-md text-on-surface-variant">{roleLabel(user.role)}</p>
          </div>
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-sm px-md py-sm text-left text-label-md text-on-surface hover:bg-surface-container-low"
          >
            <Icon name="person" className="text-sm" />
            Meu perfil
          </Link>
          {isAdmin(user) ? (
            <Link
              to="/users"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-sm px-md py-sm text-left text-label-md text-on-surface hover:bg-surface-container-low"
            >
              <Icon name="manage_accounts" className="text-sm" />
              Usuários
            </Link>
          ) : null}
          <button
            type="button"
            onClick={async () => {
              setOpen(false);
              await logoutFn();
              await navigate({ to: "/" });
            }}
            className="flex w-full items-center gap-sm px-md py-sm text-left text-label-md text-on-surface hover:bg-surface-container-low"
          >
            <Icon name="logout" className="text-sm" />
            Sair
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({
  children,
  mobileTitle,
  searchPlaceholder = "Buscar...",
  fullHeight = false,
}: {
  children: ReactNode;
  mobileTitle: string;
  searchPlaceholder?: string;
  /** Preenche a viewport e evita scroll da página (ex.: inbox de conversas). */
  fullHeight?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = RootRoute.useRouteContext();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [query, setQuery] = useState("");
  const [enterAnim, setEnterAnim] = useState(false);
  const search = useMemo(() => ({ query, setQuery }), [query]);
  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  useEffect(() => {
    setQuery("");
  }, [pathname]);

  useEffect(() => {
    if (!consumeLoginEnter()) return;
    setEnterAnim(true);
    const timer = window.setTimeout(() => setEnterAnim(false), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [collapsed]);

  return (
    <ShellSearchContext.Provider value={search}>
      <div
        className={cn(
          "relative flex bg-background text-on-background",
          fullHeight ? "h-dvh overflow-hidden" : "min-h-screen",
          enterAnim && "animate-[shell-enter_0.85s_cubic-bezier(0.22,1,0.36,1)_both]",
        )}
      >
        <aside
          className="fixed left-0 top-0 z-40 hidden h-full border-r border-outline-variant bg-surface transition-[width] duration-200 ease-out md:block"
          style={{ width: sidebarWidth }}
        >
          <SidebarInner
            pathname={pathname}
            user={user}
            collapsed={collapsed}
            onToggleCollapsed={() => setCollapsed((value) => !value)}
          />
        </aside>

        {open ? (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              aria-label="Fechar menu"
              className="absolute inset-0 bg-inverse-surface/40"
              onClick={() => setOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full w-[280px] border-r border-outline-variant bg-surface">
              <SidebarInner pathname={pathname} user={user} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        ) : null}

        <div
          className={cn(
            "flex w-full min-w-0 flex-1 flex-col transition-[padding] duration-200 ease-out",
            collapsed ? "md:pl-[76px]" : "md:pl-[280px]",
            fullHeight ? "h-dvh min-h-0 overflow-hidden" : "min-h-screen",
          )}
        >
          <header className="z-30 flex w-full shrink-0 items-center justify-between border-b border-outline-variant bg-surface px-margin-mobile py-md md:sticky md:top-0 md:px-margin-desktop">
            <button
              type="button"
              aria-label="Abrir menu"
              onClick={() => setOpen(true)}
              className="rounded-full p-2 text-on-surface transition-colors hover:bg-surface-container md:hidden"
            >
              <Icon name="menu" />
            </button>

            <div className="hidden min-w-0 max-w-[28rem] flex-1 items-center md:flex">
              <div className="relative w-full">
                <Icon
                  name="search"
                  className="absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="input-glow w-full rounded-full border border-transparent bg-surface-container-low py-sm pl-[40px] pr-sm text-body-md text-on-surface outline-none transition-all placeholder:text-on-surface-variant focus:border-outline focus:bg-surface-container-lowest"
                />
              </div>
            </div>

            <div className="text-headline-md font-bold text-primary md:hidden">{mobileTitle}</div>
            <ProfileMenu user={user} />
          </header>
          {fullHeight ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:pb-0">
              {children}
            </div>
          ) : (
            <div className="pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:pb-0">{children}</div>
          )}
        </div>
        <MobileBottomNav pathname={pathname} user={user} />
        {!fullHeight ? <HelpChat /> : null}
      </div>
    </ShellSearchContext.Provider>
  );
}
