"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { SearchableSelect } from "./searchable-select";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100].map((n) => ({ value: String(n), label: String(n) }));

interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (items: number) => void;
}

export function TablePagination({
  currentPage,
  totalPages,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange
}: TablePaginationProps) {
  const getVisiblePages = () => {
    const pages = [];
    if (totalPages <= 3) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage === 1) {
        pages.push(1, 2, 3);
      } else if (currentPage === totalPages) {
        pages.push(totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(currentPage - 1, currentPage, currentPage + 1);
      }
    }
    return pages;
  };

  const visiblePages = getVisiblePages();

  return (
    <div className="flex flex-col-reverse items-center gap-3 sm:flex-row sm:justify-between mt-4 text-sm text-gray-500 dark:text-gray-400 px-2">
      <div className="flex items-center gap-2">
        <span>Rows per page</span>
        <div className="w-[4.5rem]">
          <SearchableSelect
            size="sm"
            searchable={false}
            aria-label="Rows per page"
            value={String(itemsPerPage)}
            onChange={(v) => onItemsPerPageChange(Number(v))}
            options={PAGE_SIZE_OPTIONS}
          />
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button 
          onClick={() => onPageChange(1)} 
          disabled={currentPage === 1 || totalPages === 0}
          className="grid size-9 place-items-center rounded-md hover:bg-accent hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button 
          onClick={() => onPageChange(Math.max(1, currentPage - 1))} 
          disabled={currentPage === 1 || totalPages === 0}
          className="grid size-9 place-items-center rounded-md hover:bg-accent hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        
        <div className="flex items-center px-2 gap-1">
          {visiblePages.map(pageNum => (
            <button 
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              className={`min-w-9 h-9 flex items-center justify-center rounded-md cursor-pointer transition-colors ${
                currentPage === pageNum 
                  ? 'border border-input bg-card text-brand-text font-bold shadow-xs' 
                  : 'hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {pageNum}
            </button>
          ))}
          {totalPages > 3 && !visiblePages.includes(totalPages) && (
            <span className="px-1 text-gray-400">...</span>
          )}
        </div>

        <button 
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} 
          disabled={currentPage === totalPages || totalPages === 0}
          className="grid size-9 place-items-center rounded-md hover:bg-accent hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button 
          onClick={() => onPageChange(totalPages)} 
          disabled={currentPage === totalPages || totalPages === 0}
          className="grid size-9 place-items-center rounded-md hover:bg-accent hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
