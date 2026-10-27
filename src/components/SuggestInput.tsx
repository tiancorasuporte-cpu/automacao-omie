import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

export type SuggestOption = {
  value: string;
  label: string;
  hint?: string | null;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SuggestOption[];
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  required?: boolean;
  /** Se true, aceita texto livre (não precisa existir na lista). */
  freeText?: boolean;
  emptyLabel?: string;
  leading?: React.ReactNode;
};

export function SuggestInput({
  value,
  onChange,
  options,
  placeholder = "Digite ou selecione…",
  className,
  inputClassName,
  disabled,
  required,
  freeText = true,
  emptyLabel = "Nenhuma opção encontrada",
  leading,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  /** Só filtra depois que o usuário digita; ao abrir pela seta mostra a lista toda. */
  const [typing, setTyping] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setTyping(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    if (!typing) return options;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => {
      const hay = `${opt.label} ${opt.hint ?? ""} ${opt.value}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, query, typing]);

  const inputValue = open && typing ? query : (selected?.label ?? (freeText ? value : ""));

  function openList(browse = true) {
    setOpen(true);
    if (browse) {
      setTyping(false);
      setQuery("");
    }
  }

  function pick(opt: SuggestOption) {
    onChange(opt.value);
    setQuery(opt.label);
    setTyping(false);
    setOpen(false);
  }

  function onTyped(next: string) {
    setTyping(true);
    setQuery(next);
    setOpen(true);
    if (freeText) {
      onChange(next);
      return;
    }
    const match = options.find(
      (o) =>
        o.value === next ||
        o.label.toLowerCase() === next.trim().toLowerCase() ||
        (o.hint != null && o.hint.toLowerCase() === next.trim().toLowerCase()),
    );
    if (match) onChange(match.value);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex w-full items-center gap-sm rounded-xl border border-outline-variant bg-surface px-md py-sm outline-none transition focus-within:border-primary",
          disabled && "opacity-60",
          inputClassName,
        )}
      >
        {leading ? <span className="shrink-0">{leading}</span> : null}
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          required={required && !value}
          placeholder={placeholder}
          value={inputValue}
          className="min-w-0 flex-1 bg-transparent text-body-md text-on-surface outline-none placeholder:text-on-surface-variant"
          onFocus={() => openList(true)}
          onClick={() => openList(true)}
          onChange={(e) => onTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setTyping(false);
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              openList(true);
            }
            if (e.key === "Enter" && open && filtered[0]) {
              e.preventDefault();
              pick(filtered[0]!);
            }
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          className="shrink-0 text-on-surface-variant"
          aria-label={open ? "Fechar lista" : "Abrir lista"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (open) {
              setOpen(false);
              setTyping(false);
            } else {
              openList(true);
            }
          }}
        >
          <Icon name={open ? "expand_less" : "expand_more"} className="text-xl" />
        </button>
      </div>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-40 mt-xs max-h-60 w-full overflow-auto rounded-xl border border-outline-variant bg-surface-container-lowest py-xs shadow-lg"
        >
          {!filtered.length ? (
            <li className="px-md py-sm text-body-sm text-on-surface-variant">{emptyLabel}</li>
          ) : (
            filtered.map((opt) => (
              <li key={opt.value || opt.label}>
                <button
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  className={cn(
                    "flex w-full flex-col items-start gap-2xs px-md py-sm text-left transition hover:bg-surface-container-low",
                    opt.value === value && "bg-primary/10",
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(opt)}
                >
                  <span className="text-body-md font-medium text-on-surface">{opt.label}</span>
                  {opt.hint ? (
                    <span className="text-body-sm text-on-surface-variant">{opt.hint}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
          {freeText &&
          typing &&
          query.trim() &&
          !options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase()) ? (
            <li>
              <button
                type="button"
                className="flex w-full border-t border-outline-variant px-md py-sm text-left text-body-sm text-on-surface-variant hover:bg-surface-container-low"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(query.trim());
                  setTyping(false);
                  setOpen(false);
                }}
              >
                Usar “{query.trim()}”
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
