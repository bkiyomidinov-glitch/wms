import React from "react";
import {
  ClipboardList,
  LogOut,
  Package,
  ScanBarcode,
  Users,
  Warehouse,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn, ROLE_LABELS } from "@/lib/utils";
import type { UserRole } from "@/types/api";

export type AppRoute =
  | "terminal"
  | "products"
  | "history"
  | "users";

interface NavItem {
  id: AppRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "terminal",
    label: "Терминал",
    icon: ScanBarcode,
    roles: ["OPERATOR", "MANAGER", "DIRECTOR", "SUPER_ADMIN"],
  },
  {
    id: "products",
    label: "Справочник товаров",
    icon: Package,
    roles: ["MANAGER", "DIRECTOR", "SUPER_ADMIN"],
  },
  {
    id: "history",
    label: "История операций",
    icon: ClipboardList,
    roles: ["MANAGER", "DIRECTOR", "SUPER_ADMIN"],
  },
  {
    id: "users",
    label: "Сотрудники",
    icon: Users,
    roles: ["MANAGER", "DIRECTOR", "SUPER_ADMIN"],
  },
];

interface AppShellProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  children: React.ReactNode;
}

export function AppShell({ activeRoute, onNavigate, children }: AppShellProps) {
  const { user, logout } = useAuth();
  if (!user) return null;

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F8FAFC] text-[#0F172A]">
      {/* 240px Fixed Left Sidebar */}
      <aside className="w-[240px] shrink-0 h-screen bg-white border-r border-[#E2E8F0] flex flex-col justify-between select-none">
        <div className="flex flex-col">
          {/* Header */}
          <div className="h-16 flex items-center px-5 border-b border-[#E2E8F0] gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#DC2626] text-white flex items-center justify-center shrink-0 shadow-xs">
              <Warehouse className="h-4 w-4 text-white" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-base font-bold tracking-tight text-[#0F172A] leading-tight truncate">
                WMS <span className="text-[#DC2626]">CORE</span>
              </span>
              <span className="text-[11px] text-[#64748B] font-medium leading-none truncate">
                Складской учет
              </span>
            </div>
          </div>

          {/* Nav Items (no scrollbars inside menu) */}
          <nav className="p-3 space-y-1">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const active = activeRoute === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm transition-all duration-150 text-left cursor-pointer",
                    active
                      ? "bg-[#FEF2F2] text-[#DC2626] font-semibold shadow-xs"
                      : "text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      active ? "text-[#DC2626]" : "text-[#64748B]"
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Current User Block */}
        <div className="p-3.5 border-t border-[#E2E8F0] bg-[#F8FAFC]">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[#0F172A] truncate">
                {user.full_name}
              </div>
              <div className="text-xs text-[#64748B] truncate">
                {ROLE_LABELS[user.role]}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={logout}
              title="Выйти"
              className="h-8 w-8 text-[#64748B] hover:text-[#DC2626] hover:bg-[#FEF2F2]"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Viewport with Smooth Animation */}
      <main className="flex-1 h-screen overflow-y-auto p-6 md:p-8 bg-[#F8FAFC]">
        <div key={activeRoute} className="mx-auto max-w-6xl animate-page-enter">
          {children}
        </div>
      </main>
    </div>
  );
}
