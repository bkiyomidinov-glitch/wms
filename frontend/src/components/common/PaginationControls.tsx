import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationControlsProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  itemName?: string;
  className?: string;
}

export function PaginationControls({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  itemName = "записей",
  className,
}: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems === 0) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, currentPage * pageSize);

  // Generate page numbers window
  const getPages = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div
      className={cn(
        "px-4 py-3 border-t border-slate-200/80 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs select-none",
        className
      )}
    >
      <div className="text-slate-500 font-medium">
        Показано <strong className="text-slate-800 font-mono">{startItem}–{endItem}</strong> из{" "}
        <strong className="text-slate-800 font-mono">{totalItems}</strong> {itemName}
      </div>

      <div className="flex items-center gap-1 self-center sm:self-auto">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none text-slate-700 font-medium transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
          title="Предыдущая страница"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Назад</span>
        </button>

        <div className="flex items-center gap-1 px-1">
          {getPages().map((page, idx) => {
            if (typeof page === "string") {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="w-7 text-center text-slate-400 font-medium"
                >
                  ...
                </span>
              );
            }
            const isActive = page === currentPage;
            return (
              <button
                key={page}
                type="button"
                onClick={() => onPageChange(page)}
                className={cn(
                  "min-w-8 h-8 px-2 rounded-lg text-xs font-semibold font-mono transition-colors cursor-pointer flex items-center justify-center shadow-2xs",
                  isActive
                    ? "bg-[#8B1D1D] text-white border border-[#8B1D1D]"
                    : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                )}
              >
                {page}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none text-slate-700 font-medium transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
          title="Следующая страница"
        >
          <span className="hidden sm:inline">Вперед</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
