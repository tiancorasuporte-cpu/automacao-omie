import { Icon } from "@/components/Icon";
import { useShellSearch } from "@/components/AppShell";
import { cn } from "@/lib/utils";

export function FilterChips<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-xs">
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={cn(
              "rounded-full border px-md py-xs text-label-md transition-colors",
              active
                ? "border-secondary-container bg-secondary-fixed/40 font-bold text-primary"
                : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function MobileSearch({ placeholder }: { placeholder: string }) {
  const { query, setQuery } = useShellSearch();
  return (
    <div className="relative md:hidden">
      <Icon
        name="search"
        className="absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant"
      />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        className="input-glow w-full rounded-full border border-outline-variant bg-surface-container-lowest py-sm pl-[40px] pr-sm text-body-md text-on-surface outline-none placeholder:text-on-surface-variant focus:border-primary"
      />
    </div>
  );
}
