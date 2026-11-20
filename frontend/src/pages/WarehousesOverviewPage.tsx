import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Building2,
  Check,
  CheckSquare,
  ChevronRight,
  Clock,
  Filter,
  MapPin,
  Package,
  RotateCw,
  Search,
  SlidersHorizontal,
  Square,
  TrendingUp,
  Warehouse,
  X,
} from "lucide-react";
import { PaginationControls } from "@/components/common/PaginationControls";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api";
import { cn, formatDushanbeDateTime, formatInt } from "@/lib/utils";
import type {
  StoreInventorySummary,
  StoreProductItem,
  InventoryTransaction,
} from "@/types/api";

type SortOption = "stock_desc" | "stock_asc" | "name_asc" | "name_desc" | "items_desc";

export function WarehousesOverviewPage() {
  // Search on the main page
  const [searchQuery, setSearchQuery] = useState("");

  // Sort state
  const [sortBy, setSortBy] = useState<SortOption>("stock_desc");

  // Filter modal state
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [activeFilterTab, setActiveFilterTab] = useState<"stores" | "products" | "params">("stores");

  // Selected filters
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [onlyWithStock, setOnlyWithStock] = useState(false);

  // Search queries inside filter modal
  const [storeSearchInFilter, setStoreSearchInFilter] = useState("");
  const [prodSearchInFilter, setProdSearchInFilter] = useState("");

  // Main page pagination (warehouses)
  const [warehousePage, setWarehousePage] = useState(1);
  const warehousePageSize = 6;

  // Selected store for detail modal («в новом окне»)
  const [detailStore, setDetailStore] = useState<StoreInventorySummary | null>(null);
  const [detailProductSearch, setDetailProductSearch] = useState("");
  const [detailCategory, setDetailCategory] = useState<string>("ALL");
  const [detailProductPage, setDetailProductPage] = useState(1);
  const detailProductPageSize = 8;

  // Product movement history modal (sub-modal from detail store)
  const [historyProduct, setHistoryProduct] = useState<StoreProductItem | null>(null);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 6;

  // 1. Fetch stores inventory summary
  const {
    data: stores = [],
    isLoading: storesLoading,
    isError: storesError,
    refetch,
  } = useQuery({
    queryKey: ["stores", "inventory-summary"],
    queryFn: () => apiRequest<StoreInventorySummary[]>("/api/v1/stores/inventory-summary"),
  });

  // Extract all unique products across all stores
  const allProductsList = useMemo(() => {
    const map = new Map<string, { id: string; name: string; barcode: string; category: string }>();
    stores.forEach((st) => {
      st.products.forEach((p) => {
        if (!map.has(p.product_id)) {
          map.set(p.product_id, {
            id: p.product_id,
            name: p.name,
            barcode: p.barcode,
            category: p.category_name || "Без категории",
          });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [stores]);

  // Extract all unique categories
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    stores.forEach((st) => {
      st.products.forEach((p) => {
        if (p.category_name) cats.add(p.category_name);
      });
    });
    return Array.from(cats).sort((a, b) => a.localeCompare(b, "ru"));
  }, [stores]);

  // Network-wide KPI metrics
  const kpis = useMemo(() => {
    const totalStores = stores.length;
    const totalStock = stores.reduce((acc, s) => acc + (s.total_stock || 0), 0);
    const uniquePositionsCount = allProductsList.length;
    return { totalStores, totalStock, uniquePositionsCount };
  }, [stores, allProductsList]);

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedStoreIds.length > 0) count += selectedStoreIds.length;
    if (selectedProductIds.length > 0) count += selectedProductIds.length;
    if (selectedCategories.length > 0) count += selectedCategories.length;
    if (onlyWithStock) count += 1;
    return count;
  }, [selectedStoreIds, selectedProductIds, selectedCategories, onlyWithStock]);

  // Filter & sort stores
  const filteredStores = useMemo(() => {
    return stores
      .filter((store) => {
        // Filter by selected stores
        if (selectedStoreIds.length > 0 && !selectedStoreIds.includes(store.id)) {
          return false;
        }

        // Filter by onlyWithStock
        if (onlyWithStock && store.total_stock <= 0) {
          return false;
        }

        // Filter by selected products
        if (selectedProductIds.length > 0) {
          const hasSelectedProd = store.products.some(
            (p) => selectedProductIds.includes(p.product_id) && p.current_store_stock > 0
          );
          if (!hasSelectedProd) return false;
        }

        // Filter by categories
        if (selectedCategories.length > 0) {
          const hasCat = store.products.some(
            (p) => selectedCategories.includes(p.category_name) && p.current_store_stock > 0
          );
          if (!hasCat) return false;
        }

        // Main text search
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchStore =
            store.name.toLowerCase().includes(q) ||
            (store.code && store.code.toLowerCase().includes(q)) ||
            (store.address && store.address.toLowerCase().includes(q));

          const matchProduct = store.products.some(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              p.barcode.toLowerCase().includes(q) ||
              p.sku.toLowerCase().includes(q)
          );

          if (!matchStore && !matchProduct) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "stock_desc") return b.total_stock - a.total_stock;
        if (sortBy === "stock_asc") return a.total_stock - b.total_stock;
        if (sortBy === "name_asc") return a.name.localeCompare(b.name, "ru");
        if (sortBy === "name_desc") return b.name.localeCompare(a.name, "ru");
        if (sortBy === "items_desc") return b.products_count - a.products_count;
        return 0;
      });
  }, [
    stores,
    selectedStoreIds,
    selectedProductIds,
    selectedCategories,
    onlyWithStock,
    searchQuery,
    sortBy,
  ]);

  // Reset main warehouse pagination on filter change
  useEffect(() => {
    setWarehousePage(1);
  }, [searchQuery, selectedStoreIds, selectedProductIds, selectedCategories, onlyWithStock, sortBy]);

  // Paginated warehouses for main view
  const paginatedStores = useMemo(() => {
    const start = (warehousePage - 1) * warehousePageSize;
    return filteredStores.slice(start, start + warehousePageSize);
  }, [filteredStores, warehousePage]);

  // Detail modal products filtering & pagination
  const detailModalProducts = useMemo(() => {
    if (!detailStore) return [];
    let list = detailStore.products;

    if (detailCategory !== "ALL") {
      list = list.filter((p) => p.category_name === detailCategory);
    }

    if (detailProductSearch.trim()) {
      const q = detailProductSearch.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.category_name.toLowerCase().includes(q)
      );
    }

    return list;
  }, [detailStore, detailCategory, detailProductSearch]);

  useEffect(() => {
    setDetailProductPage(1);
  }, [detailProductSearch, detailCategory, detailStore?.id]);

  const paginatedDetailProducts = useMemo(() => {
    const start = (detailProductPage - 1) * detailProductPageSize;
    return detailModalProducts.slice(start, start + detailProductPageSize);
  }, [detailModalProducts, detailProductPage]);

  // Query transactions for the selected product on the active modal store
  const { data: productStoreTxs = [], isLoading: txsLoading } = useQuery({
    queryKey: [
      "transactions",
      "by-store-product",
      detailStore?.id,
      historyProduct?.product_id,
    ],
    queryFn: () => {
      if (!detailStore || !historyProduct) return [];
      return apiRequest<InventoryTransaction[]>(
        `/api/v1/transactions?store_id=${detailStore.id}&product_id=${historyProduct.product_id}&limit=200`
      );
    },
    enabled: Boolean(detailStore && historyProduct),
  });

  const paginatedTxs = useMemo(() => {
    const start = (historyPage - 1) * historyPageSize;
    return productStoreTxs.slice(start, start + historyPageSize);
  }, [productStoreTxs, historyPage]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyProduct?.product_id]);

  // Reset all filters helper
  const resetFilters = () => {
    setSelectedStoreIds([]);
    setSelectedProductIds([]);
    setSelectedCategories([]);
    setOnlyWithStock(false);
    setSearchQuery("");
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & KPI Cards */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A] flex items-center gap-2.5">
            <Warehouse className="h-6 w-6 text-[#8B1D1D]" strokeWidth={2} />
            Склады компании
          </h1>
          <p className="mt-1 text-xs text-[#64748B]">
            Сводный реестр складов, остатков и детальный аудит по каждой производственной точке
          </p>
        </div>

        {/* Executive KPI summary cards */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="bg-white border border-slate-200/90 rounded-xl px-4 py-2.5 shadow-2xs flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Складов в сети
              </div>
              <div className="text-sm font-bold font-mono text-slate-900">
                {kpis.totalStores} <span className="text-xs font-normal text-slate-500">точек</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-xl px-4 py-2.5 shadow-2xs flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <Package className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Товаров в обороте
              </div>
              <div className="text-sm font-bold font-mono text-blue-700">
                {kpis.uniquePositionsCount} <span className="text-xs font-normal text-slate-500">поз.</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-xl px-4 py-2.5 shadow-2xs flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#FEF2F2] text-[#8B1D1D] flex items-center justify-center shrink-0">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Общий остаток
              </div>
              <div className="text-sm font-bold font-mono text-[#8B1D1D]">
                {formatInt(kpis.totalStock)} <span className="text-xs font-normal text-slate-500">ед.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Minimalist Toolbar: Search + Spacious Filter Modal Trigger + Sorting */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-2xs flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Search input (w-full max-w-sm h-9) */}
        <div className="relative w-full md:max-w-sm">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск склада, адреса или товара..."
            className="w-full h-9 pl-9 pr-7 text-xs bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#8B1D1D] focus:ring-1 focus:ring-[#8B1D1D]/20 transition-all text-slate-900 placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Right tools: Big Filter Button + Sort Select */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Big Filter Button */}
          <button
            type="button"
            onClick={() => setFilterModalOpen(true)}
            className={cn(
              "h-9 px-3.5 rounded-lg border text-xs font-medium transition-all flex items-center gap-2 cursor-pointer shadow-2xs select-none",
              activeFiltersCount > 0
                ? "bg-[#FEF2F2] border-[#8B1D1D] text-[#8B1D1D] font-semibold"
                : "bg-white border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50"
            )}
          >
            <Filter className={cn("h-3.5 w-3.5", activeFiltersCount > 0 ? "text-[#8B1D1D]" : "text-slate-400")} />
            <span>Фильтр</span>
            {activeFiltersCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#8B1D1D] text-white">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 text-xs">
            <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 hover:border-slate-300 focus:outline-none focus:border-[#8B1D1D] cursor-pointer shadow-2xs font-medium"
            >
              <option value="stock_desc">По общему остатку (убывание)</option>
              <option value="stock_asc">По общему остатку (возрастание)</option>
              <option value="name_asc">По названию склада (А–Я)</option>
              <option value="name_desc">По названию склада (Я–А)</option>
              <option value="items_desc">По числу позиций в наличии</option>
            </select>
          </div>

          {/* Quick reset button */}
          {(activeFiltersCount > 0 || searchQuery) && (
            <button
              type="button"
              onClick={resetFilters}
              className="h-9 px-2.5 text-xs text-slate-500 hover:text-[#8B1D1D] hover:bg-red-50 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
              title="Сбросить все фильтры"
            >
              <RotateCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Сбросить</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Filter Chips Bar */}
      {activeFiltersCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
            Активные фильтры:
          </span>
          {selectedStoreIds.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs border border-slate-200">
              Склады: <strong>{selectedStoreIds.length}</strong>
              <X
                className="h-3 w-3 hover:text-rose-600 cursor-pointer ml-0.5"
                onClick={() => setSelectedStoreIds([])}
              />
            </span>
          )}
          {selectedProductIds.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs border border-slate-200">
              Товары: <strong>{selectedProductIds.length}</strong>
              <X
                className="h-3 w-3 hover:text-rose-600 cursor-pointer ml-0.5"
                onClick={() => setSelectedProductIds([])}
              />
            </span>
          )}
          {selectedCategories.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs border border-slate-200">
              Категории: <strong>{selectedCategories.length}</strong>
              <X
                className="h-3 w-3 hover:text-rose-600 cursor-pointer ml-0.5"
                onClick={() => setSelectedCategories([])}
              />
            </span>
          )}
          {onlyWithStock && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 text-xs border border-amber-200">
              Только с остатком &gt; 0
              <X
                className="h-3 w-3 hover:text-rose-600 cursor-pointer ml-0.5"
                onClick={() => setOnlyWithStock(false)}
              />
            </span>
          )}
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs text-[#8B1D1D] hover:underline cursor-pointer ml-1 font-medium"
          >
            Очистить все
          </button>
        </div>
      )}

      {/* 3. Main Body: Single Page Full-Width Warehouses Grid (NO RIGHT PANEL!) */}
      {storesLoading ? (
        <div className="bg-white border border-slate-200/80 rounded-xl p-12 text-center text-sm text-slate-500 shadow-2xs">
          Загрузка складских данных...
        </div>
      ) : storesError ? (
        <div className="bg-white border border-rose-200 rounded-xl p-8 text-center text-sm shadow-2xs space-y-3">
          <div className="mx-auto w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertCircle className="h-5 w-5" />
          </div>
          <p className="text-slate-800 font-medium">Не удалось загрузить данные складов</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#8B1D1D] text-white text-xs font-medium hover:bg-[#701717] transition-colors cursor-pointer"
          >
            <RotateCw className="h-3.5 w-3.5" />
            Повторить попытку
          </button>
        </div>
      ) : filteredStores.length === 0 ? (
        <div className="bg-white border border-slate-200/80 rounded-xl p-12 text-center text-sm text-slate-500 shadow-2xs space-y-2">
          <Warehouse className="h-8 w-8 text-slate-300 mx-auto" />
          <div className="text-slate-800 font-medium">Склады по выбранным фильтрам не найдены</div>
          <p className="text-xs text-slate-400">Попробуйте изменить параметры поиска или сбросить фильтр.</p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 text-xs text-[#8B1D1D] bg-red-50 hover:bg-red-100 rounded-lg transition-colors cursor-pointer font-medium"
          >
            Сбросить фильтры
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {paginatedStores.map((store) => {
              // Top-3 products with highest stock on this store
              const topProducts = store.products
                .filter((p) => p.current_store_stock > 0)
                .slice(0, 3);

              return (
                <div
                  key={store.id}
                  onClick={() => {
                    setDetailStore(store);
                    setDetailProductSearch("");
                    setDetailCategory("ALL");
                  }}
                  className="bg-white border border-slate-200/90 hover:border-[#8B1D1D]/50 rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group relative select-none"
                >
                  <div className="space-y-3">
                    {/* Top row: Name, Code badge, Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-slate-900 group-hover:text-[#8B1D1D] transition-colors truncate">
                            {store.name}
                          </h3>
                        </div>

                        {store.address && (
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                            <span className="truncate">{store.address}</span>
                          </div>
                        )}
                      </div>

                      {store.code && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-[#FEF2F2] text-[#8B1D1D] border border-red-100 shrink-0">
                          {store.code}
                        </span>
                      )}
                    </div>

                    {/* Stats metrics block */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                      <div className="bg-slate-50/70 rounded-lg p-2.5 border border-slate-100">
                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          Позиций в наличии
                        </div>
                        <div className="text-base font-bold font-mono text-slate-800 mt-0.5">
                          {store.products_count}{" "}
                          <span className="text-xs font-normal text-slate-400">поз.</span>
                        </div>
                      </div>

                      <div className="bg-slate-50/70 rounded-lg p-2.5 border border-slate-100">
                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          Общий остаток
                        </div>
                        <div className="text-base font-bold font-mono text-[#8B1D1D] mt-0.5">
                          {formatInt(store.total_stock)}{" "}
                          <span className="text-xs font-normal text-slate-400">ед.</span>
                        </div>
                      </div>
                    </div>

                    {/* Top products preview micro-chips */}
                    {topProducts.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          Крупные остатки склада:
                        </div>
                        <div className="space-y-1">
                          {topProducts.map((p) => (
                            <div
                              key={p.product_id}
                              className="flex items-center justify-between text-xs py-0.5 px-2 rounded bg-slate-50 text-slate-700"
                            >
                              <span className="truncate max-w-[180px] font-medium">{p.name}</span>
                              <span className="font-mono font-semibold text-slate-900 shrink-0">
                                {formatInt(p.current_store_stock)} {p.base_unit_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card bottom action button */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-[#8B1D1D] group-hover:text-[#651717]">
                    <span>Просмотреть остатки склада</span>
                    <ArrowRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Warehouses Pagination Controls (no long scrolls!) */}
          <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-2xs">
            <PaginationControls
              currentPage={warehousePage}
              totalItems={filteredStores.length}
              pageSize={warehousePageSize}
              onPageChange={setWarehousePage}
              itemName="складов"
            />
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MODAL 1: КРУТОЙ БОЛЬШОЙ ФИЛЬТР В ОКОШКЕ (SPACIOUS FILTER MODAL) */}
      {/* ========================================================================= */}
      {filterModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-3xl rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in-0 zoom-in-95 duration-150">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200/80 flex items-center justify-between shrink-0 bg-slate-50/40">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#8B1D1D] text-white flex items-center justify-center">
                    <Filter className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Фильтр складов и продукции
                    </h3>
                    <p className="text-xs text-slate-500">
                      Мультивыбор нескольких складов (заводов), товаров, категорий и параметров сортировки
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFilterModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Tabs Navigation */}
              <div className="flex items-center border-b border-slate-200 bg-slate-50 px-6 gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveFilterTab("stores")}
                  className={cn(
                    "py-3 px-3.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2",
                    activeFilterTab === "stores"
                      ? "border-[#8B1D1D] text-[#8B1D1D]"
                      : "border-transparent text-slate-500 hover:text-slate-900"
                  )}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  По складам (Заводам)
                  {selectedStoreIds.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#8B1D1D] text-white font-mono font-bold">
                      {selectedStoreIds.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveFilterTab("products")}
                  className={cn(
                    "py-3 px-3.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2",
                    activeFilterTab === "products"
                      ? "border-[#8B1D1D] text-[#8B1D1D]"
                      : "border-transparent text-slate-500 hover:text-slate-900"
                  )}
                >
                  <Package className="h-3.5 w-3.5" />
                  По продуктам (Товарам)
                  {selectedProductIds.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#8B1D1D] text-white font-mono font-bold">
                      {selectedProductIds.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveFilterTab("params")}
                  className={cn(
                    "py-3 px-3.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2",
                    activeFilterTab === "params"
                      ? "border-[#8B1D1D] text-[#8B1D1D]"
                      : "border-transparent text-slate-500 hover:text-slate-900"
                  )}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Категории и Сортировка
                  {(selectedCategories.length > 0 || onlyWithStock) && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#8B1D1D] text-white font-mono font-bold">
                      {selectedCategories.length + (onlyWithStock ? 1 : 0)}
                    </span>
                  )}
                </button>
              </div>

              {/* Tab Content Body */}
              <div className="p-6 overflow-y-auto flex-1">
                {/* TAB 1: По складам (Заводам) */}
                {activeFilterTab === "stores" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      {/* Search in stores */}
                      <div className="relative flex-1">
                        <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={storeSearchInFilter}
                          onChange={(e) => setStoreSearchInFilter(e.target.value)}
                          placeholder="Быстрый поиск склада по имени или коду..."
                          className="w-full h-8 pl-8 pr-7 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#8B1D1D]"
                        />
                        {storeSearchInFilter && (
                          <button
                            type="button"
                            onClick={() => setStoreSearchInFilter("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {/* Select all / Deselect all */}
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedStoreIds.length === stores.length) {
                            setSelectedStoreIds([]);
                          } else {
                            setSelectedStoreIds(stores.map((s) => s.id));
                          }
                        }}
                        className="text-xs font-semibold text-[#8B1D1D] hover:underline cursor-pointer flex items-center gap-1 shrink-0"
                      >
                        {selectedStoreIds.length === stores.length ? (
                          <>
                            <Square className="h-3.5 w-3.5" />
                            Снять все
                          </>
                        ) : (
                          <>
                            <CheckSquare className="h-3.5 w-3.5" />
                            Выбрать все ({stores.length})
                          </>
                        )}
                      </button>
                    </div>

                    {/* Stores Checkboxes Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto p-1 border border-slate-200 rounded-xl bg-slate-50/40">
                      {stores
                        .filter(
                          (s) =>
                            !storeSearchInFilter.trim() ||
                            s.name.toLowerCase().includes(storeSearchInFilter.toLowerCase().trim()) ||
                            (s.code && s.code.toLowerCase().includes(storeSearchInFilter.toLowerCase().trim()))
                        )
                        .map((store) => {
                          const checked = selectedStoreIds.includes(store.id);
                          return (
                            <label
                              key={store.id}
                              onClick={() => {
                                setSelectedStoreIds((prev) =>
                                  prev.includes(store.id)
                                    ? prev.filter((id) => id !== store.id)
                                    : [...prev, store.id]
                                );
                              }}
                              className={cn(
                                "flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer select-none transition-all",
                                checked
                                  ? "bg-red-50/70 border-red-200 text-slate-900 font-medium"
                                  : "bg-white border-slate-200/80 hover:bg-slate-50 text-slate-700"
                              )}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className={cn(
                                    "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                                    checked
                                      ? "bg-[#8B1D1D] border-[#8B1D1D] text-white"
                                      : "border-slate-300 bg-white"
                                  )}
                                >
                                  {checked && <Check className="h-3 w-3 stroke-[3]" />}
                                </div>
                                <div className="truncate">
                                  <div className="font-semibold truncate">{store.name}</div>
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    {store.code || "Без кода"}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right shrink-0 font-mono text-[11px] text-slate-500">
                                {formatInt(store.total_stock)} ед.
                              </div>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* TAB 2: По продуктам (Товарам) */}
                {activeFilterTab === "products" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      {/* Search in products */}
                      <div className="relative flex-1">
                        <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={prodSearchInFilter}
                          onChange={(e) => setProdSearchInFilter(e.target.value)}
                          placeholder="Поиск товара по названию или штрихкоду..."
                          className="w-full h-8 pl-8 pr-7 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#8B1D1D]"
                        />
                        {prodSearchInFilter && (
                          <button
                            type="button"
                            onClick={() => setProdSearchInFilter("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {/* Select all / Deselect all */}
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedProductIds.length === allProductsList.length) {
                            setSelectedProductIds([]);
                          } else {
                            setSelectedProductIds(allProductsList.map((p) => p.id));
                          }
                        }}
                        className="text-xs font-semibold text-[#8B1D1D] hover:underline cursor-pointer flex items-center gap-1 shrink-0"
                      >
                        {selectedProductIds.length === allProductsList.length ? (
                          <>
                            <Square className="h-3.5 w-3.5" />
                            Снять все
                          </>
                        ) : (
                          <>
                            <CheckSquare className="h-3.5 w-3.5" />
                            Выбрать все ({allProductsList.length})
                          </>
                        )}
                      </button>
                    </div>

                    {/* Products Checklist */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto p-1 border border-slate-200 rounded-xl bg-slate-50/40">
                      {allProductsList
                        .filter(
                          (p) =>
                            !prodSearchInFilter.trim() ||
                            p.name.toLowerCase().includes(prodSearchInFilter.toLowerCase().trim()) ||
                            p.barcode.includes(prodSearchInFilter.trim())
                        )
                        .map((prod) => {
                          const checked = selectedProductIds.includes(prod.id);
                          return (
                            <label
                              key={prod.id}
                              onClick={() => {
                                setSelectedProductIds((prev) =>
                                  prev.includes(prod.id)
                                    ? prev.filter((id) => id !== prod.id)
                                    : [...prev, prod.id]
                                );
                              }}
                              className={cn(
                                "flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer select-none transition-all",
                                checked
                                  ? "bg-red-50/70 border-red-200 text-slate-900 font-medium"
                                  : "bg-white border-slate-200/80 hover:bg-slate-50 text-slate-700"
                              )}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className={cn(
                                    "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                                    checked
                                      ? "bg-[#8B1D1D] border-[#8B1D1D] text-white"
                                      : "border-slate-300 bg-white"
                                  )}
                                >
                                  {checked && <Check className="h-3 w-3 stroke-[3]" />}
                                </div>
                                <div className="truncate">
                                  <div className="font-semibold truncate">{prod.name}</div>
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    {prod.barcode} • {prod.category}
                                  </div>
                                </div>
                              </div>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* TAB 3: Категории и Сортировка */}
                {activeFilterTab === "params" && (
                  <div className="space-y-6">
                    {/* Категории товаров */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-slate-800">
                          Категории продукции ({allCategories.length})
                        </Label>
                        {selectedCategories.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedCategories([])}
                            className="text-xs text-[#8B1D1D] hover:underline"
                          >
                            Сбросить категории
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {allCategories.map((cat) => {
                          const checked = selectedCategories.includes(cat);
                          return (
                            <label
                              key={cat}
                              onClick={() => {
                                setSelectedCategories((prev) =>
                                  prev.includes(cat)
                                    ? prev.filter((c) => c !== cat)
                                    : [...prev, cat]
                                );
                              }}
                              className={cn(
                                "flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition-colors",
                                checked
                                  ? "bg-red-50/70 border-red-200 text-slate-900 font-medium"
                                  : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
                              )}
                            >
                              <div
                                className={cn(
                                  "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
                                  checked ? "bg-[#8B1D1D] border-[#8B1D1D] text-white" : "border-slate-300 bg-white"
                                )}
                              >
                                {checked && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                              </div>
                              <span className="truncate">{cat}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Сортировка */}
                    <div className="space-y-2 pt-4 border-t border-slate-100">
                      <Label className="text-xs font-semibold text-slate-800">
                        Порядок сортировки складов
                      </Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[
                          { val: "stock_desc", label: "По общему остатку (от большего к меньшему)" },
                          { val: "stock_asc", label: "По общему остатку (от меньшего к большему)" },
                          { val: "name_asc", label: "По названию склада (А → Я)" },
                          { val: "name_desc", label: "По названию склада (Я → А)" },
                          { val: "items_desc", label: "По числу позиций в наличии" },
                        ].map((opt) => (
                          <label
                            key={opt.val}
                            onClick={() => setSortBy(opt.val as SortOption)}
                            className={cn(
                              "flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer select-none transition-colors",
                              sortBy === opt.val
                                ? "bg-red-50/70 border-red-200 text-[#8B1D1D] font-semibold"
                                : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
                            )}
                          >
                            <input
                              type="radio"
                              name="sort_modal"
                              checked={sortBy === opt.val}
                              onChange={() => {}}
                              className="text-[#8B1D1D] focus:ring-[#8B1D1D]"
                            />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Дополнительный тумблер: Только склады с остатком > 0 */}
                    <div className="pt-4 border-t border-slate-100">
                      <label className="flex items-center gap-2.5 text-xs text-slate-800 font-medium cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={onlyWithStock}
                          onChange={(e) => setOnlyWithStock(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-[#8B1D1D] focus:ring-[#8B1D1D]"
                        />
                        <span>Показывать только склады с ненулевым общим остатком</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={resetFilters}
                  disabled={activeFiltersCount === 0}
                  className="text-xs text-slate-500 hover:text-[#8B1D1D] font-medium disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                >
                  Сбросить все фильтры
                </button>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                    Выбрано условий: <strong className="text-slate-800">{activeFiltersCount}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setFilterModalOpen(false)}
                    className="h-9 px-5 bg-[#8B1D1D] hover:bg-[#651717] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                  >
                    Применить фильтр ({filteredStores.length} складов)
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ========================================================================= */}
      {/* 5. MODAL 2: ДЕТАЛЬНЫЕ ОСТАТКИ СКЛАДА («В НОВОМ ОКНЕ») С ПАГИНАЦИЕЙ */}
      {/* ========================================================================= */}
      {detailStore &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-5xl rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in-0 zoom-in-95 duration-150">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/50 shrink-0">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-lg font-bold text-slate-900">
                      {detailStore.name}
                    </h2>
                    {detailStore.code && (
                      <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-[#FEF2F2] text-[#8B1D1D] border border-red-200">
                        {detailStore.code}
                      </span>
                    )}
                  </div>
                  {detailStore.address && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                      <MapPin className="h-3 w-3 text-slate-400" />
                      <span>{detailStore.address}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  {/* Stats pills */}
                  <div className="flex items-center gap-3 text-xs bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
                    <div>
                      Позиций:{" "}
                      <strong className="text-slate-900 font-mono">
                        {detailStore.products_count}
                      </strong>
                    </div>
                    <div className="w-px h-3 bg-slate-200" />
                    <div>
                      Общий остаток:{" "}
                      <strong className="text-[#8B1D1D] font-mono">
                        {formatInt(detailStore.total_stock)} ед.
                      </strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDetailStore(null)}
                    className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Modal Search & Category Filter Toolbar */}
              <div className="p-4 border-b border-slate-200/80 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
                <div className="relative flex-1 max-w-sm">
                  <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={detailProductSearch}
                    onChange={(e) => setDetailProductSearch(e.target.value)}
                    placeholder="Поиск товара по названию или штрихкоду..."
                    className="w-full h-8 pl-8 pr-7 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#8B1D1D]"
                  />
                  {detailProductSearch && (
                    <button
                      type="button"
                      onClick={() => setDetailProductSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">Категория:</span>
                  <select
                    value={detailCategory}
                    onChange={(e) => setDetailCategory(e.target.value)}
                    className="h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 hover:border-slate-300 focus:outline-none focus:border-[#8B1D1D] cursor-pointer shadow-2xs font-medium"
                  >
                    <option value="ALL">Все категории</option>
                    {allCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Modal Products Table with Pagination */}
              <div className="flex-1 overflow-x-auto overflow-y-auto">
                {detailModalProducts.length === 0 ? (
                  <div className="p-12 text-center text-sm text-slate-400">
                    По данному запросу товаров на складе не найдено.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200 sticky top-0 z-10">
                        <th className="py-2.5 px-4 w-32">Штрихкод</th>
                        <th className="py-2.5 px-4">Наименование товара</th>
                        <th className="py-2.5 px-4 w-44">Категория</th>
                        <th className="py-2.5 px-4 text-right w-36">Остаток на складе</th>
                        <th className="py-2.5 px-4 text-right w-28">Действие</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {paginatedDetailProducts.map((p) => (
                        <tr key={p.product_id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-mono font-medium text-slate-700">
                            {p.barcode}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{p.name}</div>
                            {p.sku && (
                              <div className="text-[10px] font-mono text-slate-400">
                                Артикул: {p.sku}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              {p.category_name}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-sm font-bold text-[#8B1D1D]">
                            {formatInt(p.current_store_stock)}{" "}
                            <span className="text-xs font-normal text-slate-500">
                              {p.base_unit_name}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setHistoryProduct(p);
                                setExpandedTxId(null);
                              }}
                              className="inline-flex items-center gap-1 text-xs text-[#8B1D1D] hover:text-[#651717] font-semibold hover:underline cursor-pointer"
                            >
                              <span>История</span>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Modal Pagination Footer (no long vertical scroll!) */}
              <div className="shrink-0">
                <PaginationControls
                  currentPage={detailProductPage}
                  totalItems={detailModalProducts.length}
                  pageSize={detailProductPageSize}
                  onPageChange={setDetailProductPage}
                  itemName="товаров"
                />
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ========================================================================= */}
      {/* 6. MODAL 3: ИСТОРИЯ ДВИЖЕНИЯ КОНКРЕТНОГО ТОВАРА НА СКЛАДЕ */}
      {/* ========================================================================= */}
      {historyProduct && detailStore &&
        createPortal(
          <div className="fixed inset-0 z-60 bg-slate-900/50 backdrop-blur-[2px] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-4xl rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[88vh] animate-in fade-in-0 zoom-in-95 duration-150">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/60">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Склад:</span>
                    <strong className="text-slate-900 text-sm">{detailStore.name}</strong>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mt-0.5">
                    {historyProduct.name}
                  </h3>
                  <div className="text-xs font-mono text-slate-500">
                    Штрихкод: {historyProduct.barcode}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setHistoryProduct(null)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Transactions Table Body */}
              <div className="flex-1 overflow-x-auto overflow-y-auto p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-[#8B1D1D]" />
                    <span className="font-semibold text-slate-800 uppercase tracking-wider text-[11px]">
                      Хронология операций (Было → Стало)
                    </span>
                  </div>
                  <span>Всего операций: <strong className="text-slate-800">{productStoreTxs.length}</strong></span>
                </div>

                {txsLoading ? (
                  <div className="py-12 text-center text-sm text-slate-400">
                    Загрузка хронологии операций...
                  </div>
                ) : productStoreTxs.length === 0 ? (
                  <div className="py-12 text-center text-sm text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                    По данному товару на складе еще не проводилось отдельных операций.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                          <th className="py-2.5 px-3.5 w-36">Дата и время</th>
                          <th className="py-2.5 px-3.5 w-28">Тип</th>
                          <th className="py-2.5 px-3.5 text-right w-28">Количество</th>
                          <th className="py-2.5 px-3.5 text-right w-36">Было → Стало</th>
                          <th className="py-2.5 px-3.5 w-36">Исполнитель</th>
                          <th className="py-2.5 px-3.5">Контрагент / Примечания</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {paginatedTxs.map((tx) => {
                          const isInbound = tx.tx_type === "INBOUND";
                          const isExpanded = expandedTxId === tx.id;
                          return (
                            <tr
                              key={tx.id}
                              onClick={() => setExpandedTxId(isExpanded ? null : tx.id)}
                              className={cn(
                                "cursor-pointer transition-colors",
                                isExpanded ? "bg-[#FEF2F2]/40" : "hover:bg-slate-50/70"
                              )}
                            >
                              <td className="py-3 px-3.5 font-mono text-[11px] text-slate-600">
                                {formatDushanbeDateTime(tx.performed_at)}
                              </td>
                              <td className="py-3 px-3.5">
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium",
                                    isInbound
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : "bg-rose-50 text-rose-700 border border-rose-200"
                                  )}
                                >
                                  {isInbound ? (
                                    <ArrowDownToLine className="h-3 w-3" />
                                  ) : (
                                    <ArrowUpFromLine className="h-3 w-3" />
                                  )}
                                  {isInbound ? "Приход" : "Отправка"}
                                </span>
                              </td>
                              <td className="py-3 px-3.5 text-right font-mono font-bold">
                                <span className={isInbound ? "text-emerald-700" : "text-rose-700"}>
                                  {isInbound ? "+" : "-"}
                                  {formatInt(Number(tx.quantity_entered))}
                                </span>{" "}
                                <span className="text-[10px] text-slate-400 font-normal">
                                  {tx.unit.name}
                                </span>
                              </td>
                              <td className="py-3 px-3.5 text-right font-mono text-xs text-slate-900 font-semibold">
                                <span className="text-slate-400 font-normal">
                                  {formatInt(tx.balance_before_store)} →{" "}
                                </span>
                                <span className="text-[#8B1D1D] font-bold">
                                  {formatInt(tx.balance_after_store)}
                                </span>{" "}
                                <span className="text-[10px] text-slate-400 font-normal">
                                  {tx.product.base_unit.name}
                                </span>
                              </td>
                              <td className="py-3 px-3.5 text-slate-700 truncate max-w-[140px]">
                                {tx.performed_by.full_name}
                              </td>
                              <td className="py-3 px-3.5 text-slate-700">
                                <div className="truncate max-w-[200px]" title={tx.counterparty_name}>
                                  {tx.counterparty_name}
                                </div>
                                {isExpanded && tx.custom_attributes && Object.keys(tx.custom_attributes).length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-slate-200/80 text-[11px] text-slate-600 space-y-1">
                                    {Object.entries(tx.custom_attributes).map(([k, v]) => (
                                      <div key={k} className="flex gap-1.5">
                                        <span className="text-slate-400 font-medium">{k}:</span>
                                        <span className="text-slate-900 font-mono">{String(v)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* History Pagination Footer */}
              <div className="shrink-0">
                <PaginationControls
                  currentPage={historyPage}
                  totalItems={productStoreTxs.length}
                  pageSize={historyPageSize}
                  onPageChange={setHistoryPage}
                  itemName="операций"
                />
              </div>

              {/* Close Footer */}
              <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setHistoryProduct(null)}
                  className="h-8 px-4 rounded-lg bg-[#8B1D1D] hover:bg-[#701717] text-white text-xs font-semibold cursor-pointer shadow-xs"
                >
                  Вернуться к складу
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
