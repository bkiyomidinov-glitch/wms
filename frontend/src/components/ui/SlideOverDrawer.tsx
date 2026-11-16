import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SlideOverDrawerProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClass?: string;
}

export function SlideOverDrawer({
  open,
  onClose,
  title,
  subtitle,
  badge,
  children,
  footer,
  maxWidthClass = "max-w-[540px]",
}: SlideOverDrawerProps) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Lock body scrolling when drawer is open
  useEffect(() => {
    if (open) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-hidden select-none"
    >
      {/* 1. Backdrop strictly covering the entire 100vw x 100vh viewport */}
      <div
        className="fixed inset-0 bg-slate-900/35 backdrop-blur-[2px] transition-opacity animate-backdrop-in cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 2. Full-height right drawer container */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10 pointer-events-none">
        <aside
          className={cn(
            "pointer-events-auto w-screen h-screen bg-white border-l border-slate-200 shadow-2xl flex flex-col justify-between animate-drawer-in select-text",
            maxWidthClass
          )}
        >
          {/* Header block (shrink-0) */}
          <div className="shrink-0 px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-white">
            <div className="min-w-0 pr-4">
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold text-slate-900 tracking-tight truncate">
                  {title}
                </h2>
                {badge}
              </div>
              {subtitle && (
                <p className="text-xs text-slate-500 mt-1 leading-normal truncate">
                  {subtitle}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              title="Закрыть (Esc)"
              className="h-8 w-8 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Body block (flex-1 overflow-y-auto px-6 py-6 space-y-6) */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {children}
          </div>

          {/* Footer block (shrink-0 px-6 py-4 border-t border-slate-200 bg-slate-50) */}
          {footer && (
            <div className="shrink-0 px-6 py-4 border-t border-slate-200 bg-slate-50/90 flex items-center justify-end gap-3">
              {footer}
            </div>
          )}
        </aside>
      </div>
    </div>,
    document.body
  );
}
