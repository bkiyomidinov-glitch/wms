import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Barcode,
  Building2,
  CheckCircle2,
  Clock,
  Layers,
  MapPin,
  Package,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, formatDushanbeDateTime, formatQty } from "@/lib/utils";
import type {
  InventoryTransaction,
  Product,
  Store,
  StoreStockBreakdown,
} from "@/types/api";

export function StoresPage() {
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Search & Product Lookup state
  const [barcodeQuery, setBarcodeQuery] = useState("");
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Selected Store for Drilldown (History)
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  // Store Create / Edit Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  // 1. Fetch all stores
  const { data: stores = [], isLoading: isStoresLoading } = useQuery({
    queryKey: ["stores", "list"],
    queryFn: () => apiRequest<Store[]>("/api/v1/stores?include_inactive=true"),
  });

  // 2. Fetch all products for code/name fallback lookup
  const { data: allProducts = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => apiRequest<Product[]>("/api/v1/products?limit=200"),
  });

  // 3. If a product is active, fetch stock breakdown across stores
  const { data: storesStock = [], isLoading: isStockLoading } = useQuery({
    queryKey: ["product-stores-stock", activeProduct?.id],
    queryFn: () =>
      activeProduct
        ? apiRequest<StoreStockBreakdown[]>(`/api/v1/products/${activeProduct.id}/stores-stock`)
        : Promise.resolve([]),
    enabled: Boolean(activeProduct?.id),
  });

  // 4. Fetch transactions for selected store (optionally filtered by activeProduct)
  const { data: storeTransactions = [], isLoading: isTxLoading } = useQuery({
    queryKey: ["store-transactions", selectedStoreId, activeProduct?.id],
    queryFn: () => {
      if (!selectedStoreId) return Promise.resolve([]);
      let url = `/api/v1/transactions?store_id=${selectedStoreId}&limit=100`;
      if (activeProduct?.id) {
        url += `&product_id=${activeProduct.id}`;
      }
      return apiRequest<InventoryTransaction[]>(url);
    },
    enabled: Boolean(selectedStoreId),
  });

  // Default selection: select the first store if none selected
  useEffect(() => {
    if (stores.length > 0 && !selectedStoreId) {
      setSelectedStoreId(stores[0].id);
    }
  }, [stores, selectedStoreId]);

  // Handle Search submission
  const handleBarcodeSearch = async () => {
    const query = barcodeQuery.trim();
    if (!query) {
      setActiveProduct(null);
      setSearchError(null);
      return;
    }

    setSearchError(null);
    setIsSearching(true);
    try {
      let product: Product | null = null;
      try {
        product = await apiRequest<Product>(
          `/api/v1/products/barcode/${encodeURIComponent(query)}`
        );
      } catch {
        const found = allProducts.find(
          (p) =>
            p.barcode.toLowerCase() === query.toLowerCase() ||
            p.name.toLowerCase().includes(query.toLowerCase()) ||
            p.sku.toLowerCase().includes(query.toLowerCase())
        );
        if (found) {
          product = found;
        } else {
          throw new Error("Товар с таким штрихкодом или наименованием не найден");
        }
      }

      if (product) {
        setActiveProduct(product);
        setBarcodeQuery(product.barcode);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setSearchError(err.message);
      } else if (err instanceof Error) {
        setSearchError(err.message);
      } else {
        setSearchError("Ошибка при поиске товара");
      }
      setActiveProduct(null);
    } finally {
      setIsSearching(false);
    }
  };

  const handleClearSearch = () => {
    setBarcodeQuery("");
    setActiveProduct(null);
    setSearchError(null);
    barcodeInputRef.current?.focus();
  };

  // Create / Edit modal handlers
  const handleOpenCreateModal = () => {
    setEditingStore(null);
    setName("");
    setCode("");
    setAddress("");
    setIsActive(true);
    setFormError(null);
    setModalOpen(true);
  };

  const handleOpenEditModal = (e: React.MouseEvent, store: Store) => {
    e.stopPropagation();
    setEditingStore(store);
    setName(store.name);
    setCode(store.code || "");
    setAddress(store.address || "");
    setIsActive(store.is_active);
    setFormError(null);
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: Partial<Store>) => {
      if (editingStore) {
        return apiRequest<Store>(`/api/v1/stores/${editingStore.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }
      return apiRequest<Store>("/api/v1/stores", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      queryClient.invalidateQueries({ queryKey: ["product-stores-stock"] });
      setModalOpen(false);
    },
    onError: (err) => {
      setFormError(
        err instanceof ApiError ? err.message : "Ошибка сохранения склада"
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (storeId: string) => {
      return apiRequest(`/api/v1/stores/${storeId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      queryClient.invalidateQueries({ queryKey: ["product-stores-stock"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Укажите наименование склада");
      return;
    }
    saveMutation.mutate({
      name: name.trim(),
      code: code.trim() || undefined,
      address: address.trim() || undefined,
      is_active: isActive,
    });
  };

  const selectedStore = stores.find((s) => s.id === selectedStoreId);
  const selectedStoreStock = storesStock.find((s) => s.store_id === selectedStoreId);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* 1. Шапка вкладки «Склады» */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[#8B1D1D]" strokeWidth={1.5} />
            Склады
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Справочник физических складов, остатки товаров и история операций
          </p>
        </div>

        {hasRole("MANAGER", "DIRECTOR", "SUPER_ADMIN") && (
          <Button
            type="button"
            onClick={handleOpenCreateModal}
            className="h-9 px-4 rounded-lg bg-[#8B1D1D] hover:bg-[#701717] text-white text-xs font-medium shadow-2xs flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Добавить склад</span>
          </Button>
        )}
      </div>

      {/* 2. Строка поиска по штрихкоду товара (БЕЗ плашки «Быстрый выбор») */}
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleBarcodeSearch();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Barcode className="h-4 w-4" />
            </div>
            <input
              ref={barcodeInputRef}
              type="text"
              value={barcodeQuery}
              onChange={(e) => {
                const val = e.target.value;
                setBarcodeQuery(val);
                if (!val.trim()) {
                  setActiveProduct(null);
                  setSearchError(null);
                }
              }}
              placeholder="Введите или отсканируйте штрихкод товара для просмотра остатка по складам (например: 4870001001)..."
              className="w-full h-10 pl-10 pr-9 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-[#8B1D1D] focus:ring-1 focus:ring-[#8B1D1D] transition-all"
            />
            {barcodeQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                title="Очистить поиск"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Button
            type="submit"
            disabled={isSearching || !barcodeQuery.trim()}
            className="h-10 px-5 rounded-lg bg-[#8B1D1D] hover:bg-[#701717] text-white text-sm font-medium transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <Search className="h-4 w-4 stroke-[1.5]" />
            {isSearching ? "Поиск..." : "Найти"}
          </Button>
        </form>

        {searchError && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{searchError}</span>
          </div>
        )}
      </div>

      {/* 3. Плашка найденного товара (если штрихкод введен) */}
      {activeProduct && (
        <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-page-enter">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-[#8B1D1D] flex items-center justify-center shrink-0 border border-red-100">
              <Package className="h-5 w-5 stroke-[1.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                  {activeProduct.barcode}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  SKU: {activeProduct.sku}
                </span>
                {activeProduct.category && (
                  <span className="text-xs text-slate-500 font-medium">
                    • {activeProduct.category.name}
                  </span>
                )}
              </div>
              <h2 className="text-base font-bold text-slate-900 mt-0.5">
                {activeProduct.name}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-[#F8FAFC] border border-slate-200/80 rounded-lg px-4 py-2 flex items-center gap-4 shrink-0">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Общий остаток (компания)
                </div>
                <div className="text-sm font-bold font-mono text-[#8B1D1D]">
                  {formatQty(activeProduct.current_stock_base)} {activeProduct.base_unit.plural_name || activeProduct.base_unit.name}
                </div>
              </div>
              {activeProduct.secondary_unit && (
                <>
                  <div className="w-px h-6 bg-slate-200" />
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Вторичный объем
                    </div>
                    <div className="text-sm font-bold font-mono text-slate-800">
                      {formatQty(activeProduct.secondary_stock_calculated ?? "0")}{" "}
                      {activeProduct.secondary_unit.plural_name || activeProduct.secondary_unit.name}
                    </div>
                  </div>
                </>
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearSearch}
              className="h-8 px-2.5 text-xs text-slate-500 hover:text-slate-800 border-slate-200 cursor-pointer"
              title="Сбросить фильтр по товару"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Сбросить
            </Button>
          </div>
        </div>
      )}

      {/* 4. Отображение складов */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#8B1D1D] stroke-[1.5]" />
            {activeProduct
              ? `Остаток товара на складах (${storesStock.length || stores.length})`
              : `Склады компании (${stores.length})`}
          </h3>
          <span className="text-xs text-slate-400">
            Нажмите на склад для просмотра операций
          </span>
        </div>

        {isStoresLoading || (activeProduct && isStockLoading) ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-400">
            Загрузка списка складов...
          </div>
        ) : stores.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
            Склады еще не созданы. Нажмите «+ Добавить склад» выше, чтобы создать первый склад.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stores.map((store) => {
              const isSelected = selectedStoreId === store.id;
              // Stock info if product is active
              const stockItem = storesStock.find((s) => s.store_id === store.id);

              return (
                <div
                  key={store.id}
                  onClick={() => setSelectedStoreId(store.id)}
                  className={cn(
                    "rounded-xl border p-4 cursor-pointer transition-all duration-150 relative bg-white flex flex-col justify-between shadow-2xs hover:shadow-xs",
                    isSelected
                      ? "border-[#8B1D1D] ring-2 ring-[#8B1D1D]/15 bg-red-50/20"
                      : "border-slate-200/80 hover:border-slate-300"
                  )}
                >
                  {/* Select check badge */}
                  {isSelected && (
                    <div className="absolute top-3.5 right-3.5 text-[#8B1D1D]">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-2 pr-6">
                      <span className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                        {store.code || "—"}
                      </span>
                      <span className="text-sm font-bold text-slate-900 truncate">
                        {store.name}
                      </span>
                    </div>

                    {store.address && (
                      <div className="flex items-center gap-1 text-xs text-slate-400 mt-1.5 truncate">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span>{store.address}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      {activeProduct ? (
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Остаток товара
                          </div>
                          <div className="text-sm font-bold font-mono text-slate-900">
                            {stockItem ? stockItem.stock_display : "0"}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Статус
                          </div>
                          <div>
                            {store.is_active ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Активен
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                Отключен
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Admin actions (Edit / Delete) */}
                    {hasRole("MANAGER", "DIRECTOR", "SUPER_ADMIN") && (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => handleOpenEditModal(e, store)}
                          className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Редактировать склад"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {store.is_active && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Деактивировать склад «${store.name}»?`)) {
                                deleteMutation.mutate(store.id);
                              }
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Деактивировать склад"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Детализация по конкретному складу (История операций) */}
      {selectedStore && (
        <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden animate-page-enter">
          {/* Шапка истории склада */}
          <div className="px-6 py-4 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#8B1D1D] text-white flex items-center justify-center font-bold text-xs shrink-0">
                <Building2 className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  История операций: {selectedStore.name} ({selectedStore.code || "—"})
                </h4>
                <p className="text-xs text-slate-500">
                  {activeProduct
                    ? `Строгая детализация по товару «${activeProduct.name}» на складе «${selectedStore.name}»`
                    : `Все складские операции на складе «${selectedStore.name}»`}
                </p>
              </div>
            </div>

            {activeProduct && selectedStoreStock && (
              <div className="text-xs font-mono font-semibold px-3 py-1 rounded-lg bg-white border border-slate-200 text-slate-700">
                Остаток товара: <span className="text-[#8B1D1D]">{selectedStoreStock.stock_display}</span>
              </div>
            )}
          </div>

          {/* Таблица движений */}
          {isTxLoading ? (
            <div className="text-center py-12 text-xs text-slate-400">
              Загрузка операций по складу...
            </div>
          ) : storeTransactions.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
                <Layers className="h-5 w-5" />
              </div>
              <h5 className="text-sm font-semibold text-slate-800">
                На этом складе операций еще не проводилось
              </h5>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                {activeProduct
                  ? `Операций по товару «${activeProduct.name}» на этом складе пока нет.`
                  : "Для добавления операций перейдите в «Терминал» и выберите этот склад при приемке."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 text-xs">
                    <TableHead className="w-[170px] text-slate-500 font-semibold">КОГДА (ДАТА/ВРЕМЯ)</TableHead>
                    <TableHead className="w-[120px] text-slate-500 font-semibold">ТИП ОПЕРАЦИИ</TableHead>
                    <TableHead className="w-[140px] text-slate-500 font-semibold">СКОЛЬКО</TableHead>
                    {!activeProduct && (
                      <TableHead className="w-[200px] text-slate-500 font-semibold">ТОВАР</TableHead>
                    )}
                    <TableHead className="w-[160px] text-slate-500 font-semibold">КТО (ИСПОЛНИТЕЛЬ)</TableHead>
                    <TableHead className="text-slate-500 font-semibold">КОНТРАГЕНТ / АТРИБУТЫ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {storeTransactions.map((tx) => {
                    const isInbound = tx.tx_type === "INBOUND";
                    const customAttrEntries = Object.entries(tx.custom_attributes || {}).filter(
                      ([_, val]) => val !== null && val !== undefined && val !== ""
                    );

                    return (
                      <TableRow key={tx.id} className="text-xs hover:bg-slate-50/60">
                        {/* Когда */}
                        <TableCell className="font-mono text-slate-600 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            <span>{formatDushanbeDateTime(tx.performed_at)}</span>
                          </div>
                        </TableCell>

                        {/* Тип */}
                        <TableCell>
                          {isInbound ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <ArrowDownToLine className="h-3 w-3" />
                              Принят
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                              <ArrowUpFromLine className="h-3 w-3" />
                              Отправлен
                            </span>
                          )}
                        </TableCell>

                        {/* Сколько */}
                        <TableCell className="font-mono font-bold">
                          <span className={isInbound ? "text-emerald-700" : "text-red-700"}>
                            {isInbound ? "+" : "-"}
                            {formatQty(tx.quantity_entered)} {tx.unit.name}
                          </span>
                        </TableCell>

                        {/* Товар (если общий список операций склада) */}
                        {!activeProduct && (
                          <TableCell>
                            <div className="font-medium text-slate-900 truncate">
                              {tx.product.name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {tx.product.barcode}
                            </div>
                          </TableCell>
                        )}

                        {/* Кто */}
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                            <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{tx.performed_by.full_name}</span>
                          </div>
                        </TableCell>

                        {/* Контрагент и атрибуты */}
                        <TableCell>
                          <div className="space-y-1">
                            {tx.counterparty_name && (
                              <div className="font-medium text-slate-700">
                                {tx.counterparty_name}
                              </div>
                            )}

                            {customAttrEntries.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {customAttrEntries.map(([k, v]) => (
                                  <span
                                    key={k}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-600 font-mono border border-slate-200"
                                  >
                                    <Tag className="h-2.5 w-2.5 text-slate-400" />
                                    <span>{k}: {String(v)}</span>
                                  </span>
                                ))}
                              </div>
                            )}

                            {tx.notes && (
                              <div className="text-[11px] text-slate-400 italic">
                                {tx.notes}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* 6. Центральное модальное окно: Создание / Редактирование склада */}
      {modalOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in-0 zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-50 text-[#8B1D1D] flex items-center justify-center">
                  <Building2 className="h-4 w-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingStore ? "Редактировать склад" : "Новый склад"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form id="store-modal-form" onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
              {formError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="store-name" className="text-xs font-semibold text-slate-700">
                  Наименование склада <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="store-name"
                  placeholder="Например: Центральный склад, Склад готовой продукции..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="border-slate-200 focus-visible:ring-[#8B1D1D]"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="store-code" className="text-xs font-semibold text-slate-700">
                  Код / Артикул точки
                </Label>
                <Input
                  id="store-code"
                  placeholder="Например: WH-MAIN, WH-PROD, WH-RAW..."
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="border-slate-200 focus-visible:ring-[#8B1D1D]"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="store-address" className="text-xs font-semibold text-slate-700">
                  Адрес / Местоположение
                </Label>
                <Input
                  id="store-address"
                  placeholder="Например: г. Душанбе, ул. Айни 48..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="border-slate-200 focus-visible:ring-[#8B1D1D]"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div>
                  <div className="text-sm font-medium text-slate-800">Статус склада</div>
                  <div className="text-xs text-slate-500">Доступен для операций и назначения сотрудников</div>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </form>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                className="border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Отмена
              </Button>
              <Button
                type="submit"
                form="store-modal-form"
                disabled={saveMutation.isPending}
                className="bg-[#8B1D1D] hover:bg-[#701717] text-white px-5 cursor-pointer shadow-xs"
              >
                {saveMutation.isPending ? "Сохранение..." : "Сохранить склад"}
              </Button>
            </div>
          </div>
        </div>,
          document.body
        )}
    </div>
  );
}
