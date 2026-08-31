import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

type TablePagerProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export function TablePager({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  className,
}: TablePagerProps) {
  if (totalItems === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  return (
    <div
      className={cn(
        "flex flex-col gap-sm border-t border-outline-variant px-md py-sm sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p className="text-label-md text-on-surface-variant">
        {from}–{to} de {totalItems}
      </p>
      <div className="flex items-center gap-xs">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary disabled:opacity-40"
        >
          <Icon name="chevron_left" className="text-[18px]" />
          Anterior
        </button>
        <span className="min-w-[4.5rem] text-center text-label-md text-on-surface-variant">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs text-label-md text-primary disabled:opacity-40"
        >
          Próxima
          <Icon name="chevron_right" className="text-[18px]" />
        </button>
      </div>
    </div>
  );
}

export function paginateList<T>(items: T[], page: number, pageSize: number) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    totalItems,
  };
}
