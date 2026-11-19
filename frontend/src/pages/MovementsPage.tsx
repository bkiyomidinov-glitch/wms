import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Search,
  Filter,
  X,
  Building2,
  Package,
  Check,
  Clock,
  ChevronDown,
  TrendingDown,
  TrendingUp,
  Warehouse,
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { cn, formatDushanbeDateTime, formatInt } from "@/lib/utils";
import type {
  InventoryTransaction,
  Product,
  Store,
  ProductMovementSummary,
} from "@/types/api";

export function MovementsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [productSearchInDropdown, setProductSearchInDropdown] = useState("");

  // Filters
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<"stores" | "products">("stores");
  const [storeSearchInFilter, setStoreSearchInFilter] = useState("");
  const [prodSearchInFilter, setProdSearchInFilter] = useState("");

  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [selectedProductIdsInFilter, setSelectedProductIdsInFilter] = useState<string[]>([]);
  const [txTypeFilter, setTxTypeFilter] = useState<"ALL" | "INBOUND" | "OUTBOUND">("ALL");

  // Modal
  const [detailModalTx, setDetailModalTx] = useState<InventoryTransaction | null>(null);

  const filterRef = useRef<HTMLDivElement>(null);
  const productDropdownRef = useRef<HTMLDivElement>(null);

  // Close popovers on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setFilterOpen(false);
      }
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target as Node)) {
        setProductDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 1. Fetch stores
  const { data: stores = [] } = useQuery({
    queryKey: ["stores"],
    queryFn: () => apiRequest<Store[]>("/api/v1/stores"),
  });

  // 2. Fetch products
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => apiRequest<Product[]>("/api/v1/products?limit=200"),
  });

  // 3. Fetch product movement summary if a single product is selected
  const { data: productSummary } = useQuery({
    queryKey: ["transactions", "product-summary", selectedProductId],
    queryFn: () =>
      apiRequest<ProductMovementSummary>(
        `/api/v1/transactions/product/${selectedProductId}/summary`
      ),
    enabled: Boolean(selectedProductId),
  });

  // 4. Fetch general transactions feed
  const { data: allTransactions = [], isLoading: txLoading } = useQuery({
    queryKey: [
      "transactions",
      "feed",
      selectedProductId,
      selectedStoreIds.join(","),
      selectedProductIdsInFilter.join(","),
      txTypeFilter,
      searchQuery,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "250");
      if (selectedProductId) {
        params.set("product_id", selectedProductId);
      } else if (selectedProductIdsInFilter.length === 1) {
        params.set("product_id", selectedProductIdsInFilter[0]);
      }
      if (selectedStoreIds.length === 1) {
        params.set("store_id", selectedStoreIds[0]);
      }
      if (txTypeFilter !== "ALL") {
        params.set("tx_type", txTypeFilter);
      }
      if (searchQuery.trim()) {
        params.set("search", searchQuery.trim());
      }
      return apiRequest<InventoryTransaction[]>(`/api/v1/transactions?${params.toString()}`);
    },
  });

  // Client-side multi-filter refinement
  const displayedTransactions = useMemo(() => {
    let list = allTransactions;

    // Multi-store filter
    if (selectedStoreIds.length > 1) {
      list = list.filter((t) => t.store_id && selectedStoreIds.includes(t.store_id));
    }
    // Multi-product filter
    if (selectedProductIdsInFilter.length > 1 && !selectedProductId) {
      list = list.filter((t) => selectedProductIdsInFilter.includes(t.product_id));
    }
    // Search query fallback
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.product.name.toLowerCase().includes(q) ||
          t.product.barcode.toLowerCase().includes(q) ||
          t.counterparty_name.toLowerCase().includes(q) ||
          (t.store?.name && t.store.name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [allTransactions, selectedStoreIds, selectedProductIdsInFilter, selectedProductId, searchQuery]);

  // Selected product object
  const activeProductObj = useMemo(() => {
    if (!selectedProductId) return null;
    return products.find((p) => p.id === selectedProductId) || null;
  }, [products, selectedProductId]);

  // Active filter count for badge
  const activeFilterCount =
    (selectedStoreIds.length > 0 ? 1 : 0) +
    (selectedProductIdsInFilter.length > 0 ? 1 : 0) +
    (txTypeFilter !== "ALL" ? 1 : 0);

  const resetAllFilters = () => {
    setSelectedStoreIds([]);
    setSelectedProductIdsInFilter([]);
    setTxTypeFilter("ALL");
    setSearchQuery("");
  };

  // Products filtered inside top dropdown
  const dropdownProducts = useMemo(() => {
    const q = productSearchInDropdown.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q)
    );
  }, [products, productSearchInDropdown]);

  // Products filtered inside popover tab
  const filterTabProducts = useMemo(() => {
    const q = prodSearchInFilter.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q)
    );
  }, [products, prodSearchInFilter]);

  // Stores filtered inside popover tab
  const filterTabStores = useMemo(() => {
    const q = storeSearchInFilter.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.code && s.code.toLowerCase().includes(q))
    );
  }, [stores, storeSearchInFilter]);

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">
          Движение товаров
        </h1>
        <p className="mt-1 text-sm text-[#64748B]">
          Сквозной трекинг перемещений: выберите конкретный товар для анализа баланса или просматривайте общую ленту операций
        </p>
      </div>

      {/* 2. Top Controls Bar: Product Selector + Compact Search + Filter Button */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left: Product Selector with Live Search Dropdown */}
        <div className="relative w-full md:w-80" ref={productDropdownRef}>
          <button
            type="button"
            onClick={() => setProductDropdownOpen(!productDropdownOpen)}
            className="w-full h-9 px-3 bg-white border border-slate-200 hover:border-slate-300 rounded-lg flex items-center justify-between gap-2 text-xs font-medium text-slate-800 transition-colors cursor-pointer shadow-2xs"
          >
            <div className="flex items-center gap-2 truncate">
              <Package className="h-4 w-4 text-[#8B1D1D] shrink-0" />
              <span className="truncate">
                {activeProductObj ? activeProductObj.name : "Все товары (сквозной поток)"}
              </span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          </button>

          {/* Product Dropdown Popover */}
          {productDropdownOpen && (
            <div className="absolute left-0 top-10 z-40 w-80 bg-white border border-slate-200 rounded-xl shadow-xl p-2 animate-in fade-in zoom-in-95 duration-100">
              <div className="relative mb-2">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={productSearchInDropdown}
                  onChange={(e) => setProductSearchInDropdown(e.target.value)}
                  placeholder="Поиск по названию или штрихкоду..."
                  className="w-full h-8 pl-8 pr-6 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-[#8B1D1D] text-slate-800 placeholder:text-slate-400"
                  autoFocus
                />
                {productSearchInDropdown && (
                  <button
                    type="button"
                    onClick={() => setProductSearchInDropdown("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              <div className="max-h-56 overflow-y-auto space-y-0.5 scrollbar-thin text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProductId("");
                    setProductDropdownOpen(false);
                  }}
                  className={cn(
                    "w-full px-2.5 py-1.5 rounded-md text-left flex items-center justify-between transition-colors",
                    !selectedProductId
                      ? "bg-[#FEF2F2] text-[#8B1D1D] font-semibold"
                      : "hover:bg-slate-50 text-slate-700"
                  )}
                >
                  <span>Все товары (общая лента)</span>
                  {!selectedProductId && <Check className="h-3.5 w-3.5" />}
                </button>

                {dropdownProducts.map((p) => {
                  const isSelected = selectedProductId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedProductId(p.id);
                        setProductDropdownOpen(false);
                      }}
                      className={cn(
                        "w-full px-2.5 py-1.5 rounded-md text-left flex items-center justify-between transition-colors",
                        isSelected
                          ? "bg-[#FEF2F2] text-[#8B1D1D] font-semibold"
                          : "hover:bg-slate-50 text-slate-700"
                      )}
                    >
                      <div className="truncate pr-2">
                        <div className="truncate">{p.name}</div>
                        <div className="text-[10px] font-mono text-slate-400">{p.barcode}</div>
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Compact Search Bar (max-w-sm h-9) + Filter Popover Button */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          {/* Компактный поисковик */}
          <div className="relative w-full md:w-72">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по контрагенту, штрихкоду..."
              className="w-full h-9 pl-8 pr-7 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#8B1D1D] focus:ring-1 focus:ring-[#8B1D1D]/20 text-slate-900 placeholder:text-slate-400 transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Кнопка "Фильтр" с темно-бордовым бейджем */}
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => setFilterOpen(!filterOpen)}
              className={cn(
                "h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-2xs",
                filterOpen || activeFilterCount > 0
                  ? "bg-[#FEF2F2] border-[#8B1D1D] text-[#8B1D1D] font-semibold"
                  : "bg-white border-slate-200 hover:border-slate-300 text-slate-700"
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              <span>Фильтр</span>
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#8B1D1D] text-white text-[10px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* ========================================================= */}
            {/* РАЗДЕЛ 4: Новый дизайн поповера «Фильтр» (четкие вкладки) */}
            {/* ========================================================= */}
            {filterOpen && (
              <div className="absolute right-0 top-11 z-50 w-84 bg-white border border-slate-200 rounded-xl shadow-xl p-3 animate-in fade-in zoom-in-95 duration-100">
                {/* 1. Header with Tabs Switcher */}
                <div className="bg-slate-100 p-1 rounded-lg grid grid-cols-2 gap-1 mb-3">
                  <button
                    type="button"
                    onClick={() => setFilterTab("stores")}
                    className={cn(
                      "py-1.5 text-xs rounded-md transition-all font-medium flex items-center justify-center gap-1.5",
                      filterTab === "stores"
                        ? "bg-white shadow-2xs text-[#8B1D1D] font-semibold"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    <span>По складам</span>
                    {selectedStoreIds.length > 0 && (
                      <span className="w-4 h-4 rounded-full bg-[#8B1D1D] text-white text-[9px] font-bold flex items-center justify-center">
                        {selectedStoreIds.length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterTab("products")}
                    className={cn(
                      "py-1.5 text-xs rounded-md transition-all font-medium flex items-center justify-center gap-1.5",
                      filterTab === "products"
                        ? "bg-white shadow-2xs text-[#8B1D1D] font-semibold"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    <span>По продуктам</span>
                    {selectedProductIdsInFilter.length > 0 && (
                      <span className="w-4 h-4 rounded-full bg-[#8B1D1D] text-white text-[9px] font-bold flex items-center justify-center">
                        {selectedProductIdsInFilter.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* 2. Type Selector: Все / Приход / Отправка */}
                <div className="mb-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                    Тип операции
                  </span>
                  <div className="grid grid-cols-3 gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200/60 text-xs">
                    {(["ALL", "INBOUND", "OUTBOUND"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTxTypeFilter(t)}
                        className={cn(
                          "py-1 rounded text-center transition-colors font-medium text-[11px]",
                          txTypeFilter === t
                            ? "bg-white text-[#8B1D1D] font-semibold shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                        )}
                      >
                        {t === "ALL" ? "Все" : t === "INBOUND" ? "Приход" : "Отправка"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Tab Contents */}
                {filterTab === "stores" ? (
                  <div className="space-y-2">
                    {/* Compact store search if stores > 5 */}
                    {stores.length > 5 && (
                      <div className="relative">
                        <Search className="h-3 w-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          value={storeSearchInFilter}
                          onChange={(e) => setStoreSearchInFilter(e.target.value)}
                          placeholder="Поиск склада..."
                          className="w-full h-7 pl-7 pr-6 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-[#8B1D1D]"
                        />
                      </div>
                    )}

                    <div className="max-h-48 overflow-y-auto space-y-1 pr-1 scrollbar-thin text-xs">
                      {filterTabStores.map((store) => {
                        const checked = selectedStoreIds.includes(store.id);
                        return (
                          <label
                            key={store.id}
                            className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-slate-50 cursor-pointer select-none"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setSelectedStoreIds(
                                  checked
                                    ? selectedStoreIds.filter((id) => id !== store.id)
                                    : [...selectedStoreIds, store.id]
                                );
                              }}
                              className="rounded border-slate-300 text-[#8B1D1D] focus:ring-[#8B1D1D]"
                            />
                            <span className="truncate flex-1 text-slate-800">{store.name}</span>
                            {store.code && (
                              <span className="text-[10px] font-mono text-slate-400">
                                {store.code}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Quick search input for products */}
                    <div className="relative">
                      <Search className="h-3 w-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={prodSearchInFilter}
                        onChange={(e) => setProdSearchInFilter(e.target.value)}
                        placeholder="Поиск продукта по имени..."
                        className="w-full h-7 pl-7 pr-6 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-[#8B1D1D]"
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

                    <div className="max-h-48 overflow-y-auto space-y-1 pr-1 scrollbar-thin text-xs">
                      {filterTabProducts.map((p) => {
                        const checked = selectedProductIdsInFilter.includes(p.id);
                        return (
                          <label
                            key={p.id}
                            className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-slate-50 cursor-pointer select-none"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setSelectedProductIdsInFilter(
                                  checked
                                    ? selectedProductIdsInFilter.filter((id) => id !== p.id)
                                    : [...selectedProductIdsInFilter, p.id]
                                );
                              }}
                              className="rounded border-slate-300 text-[#8B1D1D] focus:ring-[#8B1D1D]"
                            />
                            <div className="truncate flex-1">
                              <div className="truncate text-slate-800">{p.name}</div>
                              <div className="text-[10px] font-mono text-slate-400">{p.barcode}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 4. Single Reset button (bottom-left) + Apply button (bottom-right) */}
                <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="text-xs text-slate-500 hover:text-[#8B1D1D] font-medium transition-colors"
                  >
                    Сбросить
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterOpen(false)}
                    className="h-8 px-4 bg-[#8B1D1D] hover:bg-[#651717] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors"
                  >
                    Применить
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Product KPI Summary (If specific product is selected) */}
      {activeProductObj && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Всего приходов
              </div>
              <div className="text-xl font-bold font-mono text-emerald-700">
                +{formatInt(productSummary?.total_inbound ?? 0)}{" "}
                <span className="text-xs font-normal text-slate-500">
                  {activeProductObj.base_unit.name}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center shrink-0">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Всего отправок
              </div>
              <div className="text-xl font-bold font-mono text-rose-700">
                -{formatInt(productSummary?.total_outbound ?? 0)}{" "}
                <span className="text-xs font-normal text-slate-500">
                  {activeProductObj.base_unit.name}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#FEF2F2] text-[#8B1D1D] flex items-center justify-center shrink-0">
              <Warehouse className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Остаток по всем складам
              </div>
              <div className="text-xl font-bold font-mono text-[#8B1D1D]">
                {formatInt(productSummary?.total_stock_all_stores ?? Number(activeProductObj.current_stock_base))}{" "}
                <span className="text-xs font-normal text-slate-500">
                  {activeProductObj.base_unit.name}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Chronological Movements Feed Table */}
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200/80 bg-slate-50/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#8B1D1D]" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              {activeProductObj
                ? `Лента движения «${activeProductObj.name}»`
                : "Хронология движения по всем складам"}
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Записей: <strong className="text-slate-800 font-mono">{displayedTransactions.length}</strong>
          </span>
        </div>

        <div className="overflow-x-auto">
          {txLoading ? (
            <div className="p-12 text-center text-sm text-slate-400">
              Загрузка хронологии движений...
            </div>
          ) : displayedTransactions.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              Движения по выбранным параметрам не найдены.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-4 w-36">Дата и время</th>
                  <th className="py-2.5 px-4 w-44">Склад</th>
                  <th className="py-2.5 px-4">Товар</th>
                  <th className="py-2.5 px-4 w-28">Тип</th>
                  <th className="py-2.5 px-4 text-right w-28">Количество</th>
                  <th className="py-2.5 px-4 text-right w-36">Остаток после операции</th>
                  <th className="py-2.5 px-4 w-36">Исполнитель</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {displayedTransactions.map((tx) => {
                  const isInbound = tx.tx_type === "INBOUND";
                  return (
                    <tr
                      key={tx.id}
                      onClick={() => setDetailModalTx(tx)}
                      className="hover:bg-[#FEF2F2]/30 cursor-pointer transition-colors group"
                    >
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                        {formatDushanbeDateTime(tx.performed_at)}
                      </td>
                      <td className="py-3 px-4 text-slate-800 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[150px]">
                            {tx.store?.name || "Основной склад"}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 group-hover:text-[#8B1D1D] transition-colors">
                          {tx.product.name}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {tx.product.barcode}
                        </div>
                      </td>
                      <td className="py-3 px-4">
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
                      <td className="py-3 px-4 text-right font-mono font-bold">
                        <span className={isInbound ? "text-emerald-700" : "text-rose-700"}>
                          {isInbound ? "+" : "-"}
                          {formatInt(Number(tx.quantity_entered))}
                        </span>{" "}
                        <span className="text-[10px] text-slate-400 font-normal">
                          {tx.unit.name}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold">
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
                      <td className="py-3 px-4 text-slate-600 truncate max-w-[140px]">
                        {tx.performed_by.full_name}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 5. Centered Modal «Детали операции» */}
      {detailModalTx && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setDetailModalTx(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center",
                    detailModalTx.tx_type === "INBOUND"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-rose-100 text-rose-800"
                  )}
                >
                  {detailModalTx.tx_type === "INBOUND" ? (
                    <ArrowDownToLine className="h-5 w-5" />
                  ) : (
                    <ArrowUpFromLine className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Детали операции: {detailModalTx.tx_type === "INBOUND" ? "Приход товара" : "Отправка товара"}
                  </h3>
                  <div className="text-[11px] text-slate-500 font-mono">
                    ID: {detailModalTx.id}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalTx(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-xs">
              {/* Product Info */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Товар
                </div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">
                  {detailModalTx.product.name}
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  Штрихкод: {detailModalTx.product.barcode} • SKU: {detailModalTx.product.sku}
                </div>
              </div>

              {/* Grid with Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Склад
                  </div>
                  <div className="text-sm font-semibold text-slate-900 mt-0.5">
                    {detailModalTx.store?.name || "Основной склад"}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Дата и время
                  </div>
                  <div className="text-sm font-mono font-semibold text-slate-900 mt-0.5">
                    {formatDushanbeDateTime(detailModalTx.performed_at)}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Количество операции
                  </div>
                  <div className="text-sm font-mono font-bold text-[#8B1D1D] mt-0.5">
                    {detailModalTx.tx_type === "INBOUND" ? "+" : "-"}
                    {formatInt(Number(detailModalTx.quantity_entered))} {detailModalTx.unit.name}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Остаток на складе
                  </div>
                  <div className="text-sm font-mono font-semibold text-slate-900 mt-0.5">
                    <span className="text-slate-400">
                      {formatInt(detailModalTx.balance_before_store)} →{" "}
                    </span>
                    <span className="text-emerald-700 font-bold">
                      {formatInt(detailModalTx.balance_after_store)} {detailModalTx.product.base_unit.name}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Исполнитель
                  </div>
                  <div className="text-sm font-medium text-slate-900 mt-0.5">
                    {detailModalTx.performed_by.full_name}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {detailModalTx.performed_by.role}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Контрагент / Откуда-Куда
                  </div>
                  <div className="text-sm font-medium text-slate-900 mt-0.5">
                    {detailModalTx.counterparty_name}
                  </div>
                </div>
              </div>

              {/* Dynamic Attributes */}
              {detailModalTx.custom_attributes && Object.keys(detailModalTx.custom_attributes).length > 0 && (
                <div className="pt-3 border-t border-slate-100">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Дополнительные атрибуты
                  </div>
                  <div className="grid grid-cols-2 gap-2 bg-slate-50/70 p-3 rounded-lg border border-slate-200/60">
                    {Object.entries(detailModalTx.custom_attributes).map(([k, v]) => (
                      <div key={k}>
                        <span className="text-[10px] text-slate-400 block">{k}:</span>
                        <span className="text-xs font-semibold font-mono text-slate-800">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {detailModalTx.notes && (
                <div className="pt-2 border-t border-slate-100">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Примечание
                  </div>
                  <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200/60 italic">
                    {detailModalTx.notes}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setDetailModalTx(null)}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-medium rounded-lg shadow-2xs transition-colors cursor-pointer text-xs"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
