import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpDown,
  ArrowUpFromLine,
  Barcode,
  Building2,
  Check,
  Filter,
  Package,
  RotateCcw,
  User,
  Warehouse,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/api";
import { cn, formatDushanbeDateTime, formatInt } from "@/lib/utils";
import type { Product, Store, StoreMovementRow } from "@/types/api";

type SortKey = "store_name" | "product_name" | "quantity_entered" | "current_store_stock" | "performed_at";
type SortDir = "asc" | "desc";

export function WarehousesOverviewPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("performed_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filterRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const { data: stores = [] } = useQuery({
    queryKey: ["stores", "list"],
    queryFn: () => apiRequest<Store[]>("/api/v1/stores?include_inactive=false"),
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => apiRequest<Product[]>("/api/v1/products?limit=200"),
  });

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["store-movements"],
    queryFn: () => apiRequest<StoreMovementRow[]>("/api/v1/stores/movements?limit=500"),
  });

  const toggleStoreFilter = (storeId: string) => {
    setSelectedStoreIds((prev) =>
      prev.includes(storeId) ? prev.filter((id) => id !== storeId) : [...prev, storeId]
    );
  };

  const toggleProductFilter = (productId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const handleResetFilters = () => {
    setSelectedStoreIds([]);
    setSelectedProductIds([]);
    setSearchQuery("");
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "performed_at" || key === "quantity_entered" || key === "current_store_stock" ? "desc" : "asc");
    }
  };

  const filteredAndSortedRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = movements.filter((row) => {
      if (selectedStoreIds.length > 0 && (!row.store_id || !selectedStoreIds.includes(row.store_id))) {
        return false;
      }
      if (selectedProductIds.length > 0 && !selectedProductIds.includes(row.product_id)) {
        return false;
      }
      if (q) {
        const matchBarcode = row.barcode.toLowerCase().includes(q);
        const matchName = row.product_name.toLowerCase().includes(q);
        const matchStore = row.store_name.toLowerCase().includes(q);
        const matchCounterparty = (row.counterparty_name || "").toLowerCase().includes(q);
        if (!matchBarcode && !matchName && !matchStore && !matchCounterparty) {
          return false;
        }
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "store_name") {
        cmp = a.store_name.localeCompare(b.store_name, "ru");
      } else if (sortKey === "product_name") {
        cmp = a.product_name.localeCompare(b.product_name, "ru");
      } else if (sortKey === "quantity_entered") {
        cmp = a.quantity_entered - b.quantity_entered;
      } else if (sortKey === "current_store_stock") {
        cmp = a.current_store_stock - b.current_store_stock;
      } else {
        cmp = new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime();
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [movements, searchQuery, selectedStoreIds, selectedProductIds, sortKey, sortDir]);

  const activeFiltersCount = selectedStoreIds.length + selectedProductIds.length;

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="h-3 w-3 text-slate-300" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 text-[#8B1D1D]" />
    ) : (
      <ArrowDown className="h-3 w-3 text-[#8B1D1D]" />
    );
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-[#8B1D1D]" strokeWidth={1.5} />
            Склады и движения товаров
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Таблица остатков и перенаправлений товаров по складам с мгновенной фильтрацией
          </p>
        </div>
        <div className="text-xs font-medium text-slate-500 bg-white border border-slate-200/80 rounded-lg px-3 py-1.5">
          Записей в таблице: <span className="font-bold text-slate-900 font-mono">{filteredAndSortedRows.length}</span>
        </div>
      </div>

      {/* Top Control Bar: Search + Smart 2-Section Filter Dropdown */}
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs p-3.5 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* Instant Barcode / Product Name Search */}
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Barcode className="h-4 w-4" strokeWidth={1.5} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по штрихкоду или названию товара..."
              className="w-full h-10 pl-10 pr-9 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-[#8B1D1D] focus:ring-1 focus:ring-[#8B1D1D] transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                title="Очистить поиск"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Dropdown Panel: Фильтр и сортировка (2 Sections) */}
          <div className="relative" ref={filterRef}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFilterOpen((o) => !o)}
              className={cn(
                "h-10 px-4 rounded-lg text-xs font-medium flex items-center gap-2 cursor-pointer transition-colors border",
                activeFiltersCount > 0 || filterOpen
                  ? "border-[#8B1D1D] bg-red-50/50 text-[#8B1D1D]"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              <Filter className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>Фильтр и сортировка</span>
              {activeFiltersCount > 0 && (
                <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#8B1D1D] text-white text-[10px] font-bold">
                  {activeFiltersCount}
                </span>
              )}
            </Button>

            {filterOpen && (
              <div className="absolute right-0 mt-2 w-[360px] sm:w-[480px] bg-white border border-slate-200 rounded-xl shadow-lg z-40 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                  <span className="text-xs font-bold text-slate-900">Фильтр и сортировка</span>
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-[#8B1D1D] cursor-pointer transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Сбросить фильтр
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 max-h-[340px]">
                  {/* Раздел 1 — По складу (Складам) */}
                  <div className="p-3 overflow-y-auto max-h-[340px]">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-1 flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-[#8B1D1D]" strokeWidth={1.5} />
                      По складу
                    </div>
                    <div className="space-y-1">
                      {stores.length === 0 ? (
                        <div className="text-xs text-slate-400 px-2 py-2">Нет складов</div>
                      ) : (
                        stores.map((st) => {
                          const checked = selectedStoreIds.includes(st.id);
                          return (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() => toggleStoreFilter(st.id)}
                              className={cn(
                                "w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs text-left transition-colors cursor-pointer",
                                checked
                                  ? "bg-red-50 text-[#8B1D1D] font-semibold"
                                  : "text-slate-700 hover:bg-slate-50"
                              )}
                            >
                              <span className="truncate">{st.name}</span>
                              <span
                                className={cn(
                                  "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                                  checked
                                    ? "bg-[#8B1D1D] border-[#8B1D1D] text-white"
                                    : "border-slate-300 bg-white"
                                )}
                              >
                                {checked && <Check className="h-3 w-3" />}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Раздел 2 — По продукту (Продуктам) */}
                  <div className="p-3 overflow-y-auto max-h-[340px]">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-1 flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5 text-[#8B1D1D]" strokeWidth={1.5} />
                      По продукту
                    </div>
                    <div className="space-y-1">
                      {products.length === 0 ? (
                        <div className="text-xs text-slate-400 px-2 py-2">Нет товаров</div>
                      ) : (
                        products.map((pr) => {
                          const checked = selectedProductIds.includes(pr.id);
                          return (
                            <button
                              key={pr.id}
                              type="button"
                              onClick={() => toggleProductFilter(pr.id)}
                              className={cn(
                                "w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs text-left transition-colors cursor-pointer",
                                checked
                                  ? "bg-red-50 text-[#8B1D1D] font-semibold"
                                  : "text-slate-700 hover:bg-slate-50"
                              )}
                            >
                              <div className="min-w-0">
                                <div className="truncate">{pr.name}</div>
                                <div className="text-[10px] font-mono text-slate-400">{pr.barcode}</div>
                              </div>
                              <span
                                className={cn(
                                  "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                                  checked
                                    ? "bg-[#8B1D1D] border-[#8B1D1D] text-white"
                                    : "border-slate-300 bg-white"
                                )}
                              >
                                {checked && <Check className="h-3 w-3" />}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Сбросить фильтр
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setFilterOpen(false)}
                    className="h-7 px-3 text-xs bg-[#8B1D1D] hover:bg-[#701717] text-white cursor-pointer"
                  >
                    Готово
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Active Filter Chips */}
        {(selectedStoreIds.length > 0 || selectedProductIds.length > 0 || searchQuery.trim()) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
            <span className="text-[11px] font-medium text-slate-400 mr-1">Активные фильтры:</span>

            {selectedStoreIds.map((sid) => {
              const st = stores.find((s) => s.id === sid);
              const label = st?.name || movements.find((m) => m.store_id === sid)?.store_name || "Склад";
              return (
                <span
                  key={sid}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-50 border border-red-200/80 text-xs font-medium text-[#8B1D1D]"
                >
                  <Building2 className="h-3 w-3" strokeWidth={1.5} />
                  <span>{label}</span>
                  <button
                    type="button"
                    onClick={() => toggleStoreFilter(sid)}
                    className="hover:bg-red-100 rounded p-0.5 cursor-pointer"
                    title="Убрать фильтр"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}

            {selectedProductIds.map((pid) => {
              const pr = products.find((p) => p.id === pid);
              const label = pr?.name || movements.find((m) => m.product_id === pid)?.product_name || "Товар";
              return (
                <span
                  key={pid}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-xs font-medium text-slate-800"
                >
                  <Package className="h-3 w-3 text-[#8B1D1D]" strokeWidth={1.5} />
                  <span>{label}</span>
                  <button
                    type="button"
                    onClick={() => toggleProductFilter(pid)}
                    className="hover:bg-slate-200 rounded p-0.5 cursor-pointer"
                    title="Убрать фильтр"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}

            {searchQuery.trim() && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700">
                <span>Поиск: «{searchQuery.trim()}»</span>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="hover:bg-slate-200 rounded p-0.5 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={handleResetFilters}
              className="ml-auto text-[11px] font-medium text-slate-500 hover:text-[#8B1D1D] cursor-pointer px-2 py-1"
            >
              Сбросить все
            </button>
          </div>
        )}
      </div>

      {/* Strict Interactive Table */}
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-200/80">
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <button
                    type="button"
                    onClick={() => handleSort("store_name")}
                    className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                  >
                    <span>Склад</span>
                    {renderSortIcon("store_name")}
                  </button>
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Штрихкод
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <button
                    type="button"
                    onClick={() => handleSort("product_name")}
                    className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                  >
                    <span>Продукт</span>
                    {renderSortIcon("product_name")}
                  </button>
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Тип движения / Направление
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <button
                    type="button"
                    onClick={() => handleSort("quantity_entered")}
                    className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                  >
                    <span>Количество</span>
                    {renderSortIcon("quantity_entered")}
                  </button>
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <button
                    type="button"
                    onClick={() => handleSort("current_store_stock")}
                    className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                  >
                    <span>Текущий остаток на складе</span>
                    {renderSortIcon("current_store_stock")}
                  </button>
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <button
                    type="button"
                    onClick={() => handleSort("performed_at")}
                    className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                  >
                    <span>Дата</span>
                    {renderSortIcon("performed_at")}
                  </button>
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Кто провел
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-xs text-slate-400">
                    Загрузка данных по складам...
                  </TableCell>
                </TableRow>
              ) : filteredAndSortedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-xs text-slate-500">
                    По заданным фильтрам записи не найдены.
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedRows.map((row) => {
                  const isInbound = row.tx_type === "INBOUND";
                  const isOutbound = row.tx_type === "OUTBOUND";
                  const isInitial = row.tx_type === "INITIAL_STOCK";
                  const isStoreFiltered = row.store_id ? selectedStoreIds.includes(row.store_id) : false;
                  const isProductFiltered = selectedProductIds.includes(row.product_id);

                  return (
                    <TableRow
                      key={row.id}
                      className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors text-xs"
                    >
                      {/* Склад (Clickable) */}
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => row.store_id && toggleStoreFilter(row.store_id)}
                          title="Нажмите, чтобы отфильтровать по этому складу"
                          className={cn(
                            "inline-flex items-center gap-1.5 text-left rounded-md px-2 py-1 -mx-2 transition-colors cursor-pointer",
                            isStoreFiltered
                              ? "bg-red-50 text-[#8B1D1D] font-semibold"
                              : "text-slate-900 font-medium hover:bg-red-50/60 hover:text-[#8B1D1D]"
                          )}
                        >
                          <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" strokeWidth={1.5} />
                          <span className="truncate max-w-[160px]">{row.store_name}</span>
                        </button>
                      </TableCell>

                      {/* Штрихкод (Clickable) */}
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => toggleProductFilter(row.product_id)}
                          title="Нажмите, чтобы отфильтровать по этому товару"
                          className={cn(
                            "font-mono text-[11px] px-2 py-0.5 rounded border transition-colors cursor-pointer",
                            isProductFiltered
                              ? "bg-red-50 border-red-200 text-[#8B1D1D] font-semibold"
                              : "bg-slate-50 border-slate-200 text-slate-700 hover:border-[#8B1D1D]/40 hover:text-[#8B1D1D]"
                          )}
                        >
                          {row.barcode}
                        </button>
                      </TableCell>

                      {/* Продукт (Clickable) */}
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => toggleProductFilter(row.product_id)}
                          title="Нажмите, чтобы отфильтровать по этому товару"
                          className={cn(
                            "text-left font-medium transition-colors cursor-pointer hover:underline",
                            isProductFiltered ? "text-[#8B1D1D] font-semibold" : "text-slate-900 hover:text-[#8B1D1D]"
                          )}
                        >
                          {row.product_name}
                        </button>
                      </TableCell>

                      {/* Тип движения / Направление */}
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <div>
                            {isInbound && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <ArrowDownToLine className="h-3 w-3" />
                                Приход
                              </span>
                            )}
                            {isOutbound && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-[#8B1D1D] border border-red-200">
                                <ArrowUpFromLine className="h-3 w-3" />
                                Отправка
                              </span>
                            )}
                            {isInitial && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                Начальный остаток
                              </span>
                            )}
                            {!isInbound && !isOutbound && !isInitial && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                Корректировка
                              </span>
                            )}
                          </div>
                          {row.counterparty_name && !isInitial && (
                            <span className="text-[11px] text-slate-500 truncate max-w-[190px]">
                              {isInbound ? "От: " : isOutbound ? "Куда: " : ""}
                              {row.counterparty_name}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Количество (Строго целое) */}
                      <TableCell className="font-mono font-bold whitespace-nowrap">
                        <span
                          className={
                            isInbound
                              ? "text-emerald-700"
                              : isOutbound
                              ? "text-[#8B1D1D]"
                              : "text-slate-700"
                          }
                        >
                          {isInbound ? "+" : isOutbound ? "-" : ""}
                          {formatInt(row.quantity_entered)} {row.unit_name}
                        </span>
                      </TableCell>

                      {/* Текущий остаток на складе (Строго целое) */}
                      <TableCell className="font-mono font-bold text-slate-900 whitespace-nowrap">
                        {formatInt(row.current_store_stock)} {row.base_unit_name}
                      </TableCell>

                      {/* Дата */}
                      <TableCell className="font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {formatDushanbeDateTime(row.performed_at)}
                      </TableCell>

                      {/* Кто провел */}
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-slate-700 whitespace-nowrap">
                          <User className="h-3.5 w-3.5 text-slate-400 shrink-0" strokeWidth={1.5} />
                          <span>{row.performed_by_name}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
