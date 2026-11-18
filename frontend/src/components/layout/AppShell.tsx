import React from "react";
import {
  ClipboardList,
  Layers,
  LogOut,
  ScanBarcode,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn, ROLE_LABELS } from "@/lib/utils";
import type { UserRole } from "@/types/api";

export type AppRoute =
  | "terminal"
  | "warehouses"
  | "directory"
  | "history"
  | "products"
  | "stores"
  | "users";

interface NavItem {
  id: AppRoute;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "terminal",
    label: "ТЕРМИНАЛ",
    icon: ScanBarcode,
    roles: ["OPERATOR", "MANAGER", "DIRECTOR", "SUPER_ADMIN"],
  },
  {
    id: "warehouses",
    label: "СКЛАДЫ",
    icon: Warehouse,
    roles: ["OPERATOR", "MANAGER", "DIRECTOR", "SUPER_ADMIN"],
  },
  {
    id: "directory",
    label: "СПРАВОЧНИК",
    icon: Layers,
    roles: ["MANAGER", "DIRECTOR", "SUPER_ADMIN"],
  },
  {
    id: "history",
    label: "ИСТОРИЯ",
    icon: ClipboardList,
    roles: ["OPERATOR", "MANAGER", "DIRECTOR", "SUPER_ADMIN"],
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

  // Resolve directory subroutes to directory
  const effectiveRoute =
    activeRoute === "products" || activeRoute === "stores" || activeRoute === "users"
      ? "directory"
      : activeRoute;

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  const getInitials = (name: string): string => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase() || "П";
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F8FAFC] text-[#0F172A]">
      {/* 1. Platrum Ultra-Slim Vertical Rail Sidebar (w-[78px]) */}
      <aside className="w-[78px] shrink-0 h-screen fixed left-0 top-0 z-30 bg-white border-r border-slate-200/80 flex flex-col items-center py-4 justify-between select-none shadow-[1px_0_4px_rgba(0,0,0,0.02)]">
        {/* Top: Logo & Nav items */}
        <div className="flex flex-col items-center w-full">
          {/* Brand Logo & Name (WMS CORE) */}
          <div
            className="flex flex-col items-center cursor-pointer group select-none"
            onClick={() => onNavigate("terminal")}
            title="WMS Core — Складской учет"
          >
            <div className="w-8 h-8 rounded-lg bg-[#DC2626] text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
              <Warehouse className="h-4 w-4 text-white" strokeWidth={2} />
            </div>
            <div className="mt-1 flex items-center justify-center">
              <span className="text-[10px] font-bold tracking-tight text-[#0F172A] leading-tight">
                WMS <span className="text-[#DC2626]">CORE</span>
              </span>
            </div>
          </div>

          {/* Thin Divider */}
          <div className="w-10 border-b border-slate-100 my-2.5" />

          {/* Platrum Nav Items */}
          <nav className="w-full flex flex-col items-center gap-1">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const active = effectiveRoute === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={cn(
                    "w-full py-2.5 px-1 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors relative group",
                    active
                      ? "text-[#8B1D1D] bg-[#FEF2F2]/60 font-semibold"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-50/80 font-medium"
                  )}
                  title={item.label}
                >
                  {/* Left thin accent bar */}
                  {active && (
                    <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-[#8B1D1D] rounded-r" />
                  )}
                  <Icon
                    strokeWidth={1.5}
                    className={cn(
                      "h-5 w-5 transition-colors",
                      active ? "text-[#8B1D1D]" : "text-slate-500 group-hover:text-slate-900"
                    )}
                  />
                  <span className="text-[10px] font-medium tracking-tight leading-none text-center">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom: User avatar + Logout */}
        <div className="flex flex-col items-center gap-2 w-full px-2">
          {/* User initials circle */}
          <div
            className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 font-semibold text-xs flex items-center justify-center border border-slate-200 cursor-pointer shadow-2xs hover:border-slate-300 transition-colors"
            title={`${user.full_name}${user.store_name ? ` (${user.store_name})` : ""} • ${ROLE_LABELS[user.role]}`}
          >
            {getInitials(user.full_name)}
          </div>

          <button
            type="button"
            onClick={logout}
            title="Выйти из системы"
            className="p-2 text-slate-400 hover:text-[#8B1D1D] rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4 stroke-[1.5]" />
          </button>
        </div>
      </aside>

      {/* 2. Main Content Viewport offset by pl-[78px] */}
      <main className="flex-1 h-screen overflow-y-auto pl-[78px] bg-[#F8FAFC]">
        <div key={activeRoute} className="p-6 md:p-8 animate-page-enter">
          {children}
        </div>
      </main>
    </div>
  );
}
