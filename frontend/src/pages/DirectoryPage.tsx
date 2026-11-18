import { useState } from "react";
import { Building2, Package, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProductsCatalogPage } from "@/pages/ProductsCatalogPage";
import { StoresPage } from "@/pages/StoresPage";
import { UsersPage } from "@/pages/UsersPage";

export type DirectoryTab = "products" | "stores" | "users";

interface DirectoryPageProps {
  initialTab?: DirectoryTab;
}

export function DirectoryPage({ initialTab = "products" }: DirectoryPageProps) {
  const [activeTab, setActiveTab] = useState<DirectoryTab>(initialTab);

  return (
    <div className="space-y-6">
      {/* Centered Top Platrum Tabs */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200/80 -mx-6 md:-mx-8 -mt-6 md:-mt-8 px-6 md:px-8 mb-6 shadow-2xs">
        <div className="flex items-center justify-center gap-1 sm:gap-4 max-w-4xl mx-auto">
          <button
            type="button"
            onClick={() => setActiveTab("products")}
            className={cn(
              "px-5 py-3.5 text-sm font-medium transition-all relative flex items-center gap-2 cursor-pointer select-none",
              activeTab === "products"
                ? "text-[#8B1D1D] font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#8B1D1D]"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50/50"
            )}
          >
            <Package className="h-4 w-4 stroke-[1.5]" />
            <span>Товары</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("stores")}
            className={cn(
              "px-5 py-3.5 text-sm font-medium transition-all relative flex items-center gap-2 cursor-pointer select-none",
              activeTab === "stores"
                ? "text-[#8B1D1D] font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#8B1D1D]"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50/50"
            )}
          >
            <Building2 className="h-4 w-4 stroke-[1.5]" />
            <span>Склады</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("users")}
            className={cn(
              "px-5 py-3.5 text-sm font-medium transition-all relative flex items-center gap-2 cursor-pointer select-none",
              activeTab === "users"
                ? "text-[#8B1D1D] font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#8B1D1D]"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50/50"
            )}
          >
            <Users className="h-4 w-4 stroke-[1.5]" />
            <span>Сотрудники</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="animate-page-enter">
        {activeTab === "products" && <ProductsCatalogPage />}
        {activeTab === "stores" && <StoresPage />}
        {activeTab === "users" && <UsersPage />}
      </div>
    </div>
  );
}
