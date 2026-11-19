import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  X,
  MapPin,
  Package,
  ArrowRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  ChevronRight,
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { cn, formatDushanbeDateTime, formatInt } from "@/lib/utils";
import type {
  StoreInventorySummary,
  StoreProductItem,
  InventoryTransaction,
} from "@/types/api";

export function WarehousesOverviewPage() {
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<StoreProductItem | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);

  // 1. Fetch stores inventory summary
  const { data: stores = [], isLoading: storesLoading } = useQuery({
    queryKey: ["stores", "inventory-summary"],
    queryFn: () => apiRequest<StoreInventorySummary[]>("/api/v1/stores/inventory-summary"),
  });

  // Active store resolution
  const activeStore = useMemo(() => {
    if (!stores.length) return null;
    if (selectedStoreId) {
      const found = stores.find((s) => s.id === selectedStoreId);
      if (found) return found;
    }
    return stores[0];
  }, [stores, selectedStoreId]);

  // Filter products on active store by search query
  const filteredProducts = useMemo(() => {
    if (!activeStore) return [];
    const q = productSearch.trim().toLowerCase();
    if (!q) return activeStore.products;
    return activeStore.products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category_name.toLowerCase().includes(q)
    );
  }, [activeStore, productSearch]);

  // Query transactions for the selected product on the selected store
  const { data: productStoreTxs = [], isLoading: txsLoading } = useQuery({
    queryKey: [
      "transactions",
      "by-store-product",
      activeStore?.id,
      selectedProduct?.product_id,
    ],
    queryFn: () => {
      if (!activeStore || !selectedProduct) return [];
      return apiRequest<InventoryTransaction[]>(
        `/api/v1/transactions?store_id=${activeStore.id}&product_id=${selectedProduct.product_id}&limit=200`
      );
    },
    enabled: Boolean(activeStore && selectedProduct && productModalOpen),
  });

  const handleOpenProductModal = (prod: StoreProductItem) => {
    setSelectedProduct(prod);
    setExpandedTxId(null);
    setProductModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">
          Склады компании
        </h1>
        <p className="mt-1 text-sm text-[#64748B]">
          Двухуровневый учет: выберите склад для просмотра остатков товаров и детальной истории операций
        </p>
      </div>

      {/* Loading state */}
      {storesLoading ? (
        <div className="bg-white border border-slate-200/80 rounded-xl p-12 text-center text-sm text-slate-500 shadow-2xs">
          Загрузка складских данных...
        </div>
      ) : stores.length === 0 ? (
        <div className="bg-white border border-slate-200/80 rounded-xl p-12 text-center text-sm text-slate-500 shadow-2xs">
          Нет доступных складов для вашего аккаунта.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ========================================================= */}
          {/* УРОВЕНЬ 1: Список складов (Группировка) — 4 колонки */}
          {/* ========================================================= */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Склады компании ({stores.length})
              </span>
            </div>

            <div className="space-y-2 max-h-[calc(100vh-210px)] overflow-y-auto pr-1">
              {stores.map((store) => {
                const isSelected = activeStore?.id === store.id;
                return (
                  <div
                    key={store.id}
                    onClick={() => {
                      setSelectedStoreId(store.id);
                      setProductSearch("");
                    }}
                    className={cn(
                      "p-4 rounded-xl border transition-all cursor-pointer select-none text-left relative",
                      isSelected
                        ? "bg-white border-[#8B1D1D] shadow-sm ring-1 ring-[#8B1D1D]/20"
                        : "bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/50 shadow-2xs"
                    )}
                  >
                    {/* Left active line indicator */}
                    {isSelected && (
                      <div className="absolute left-0 top-3 bottom-3 w-1 bg-[#8B1D1D] rounded-r" />
                    )}

                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 leading-snug">
                            {store.name}
                          </span>
                          {store.code && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 text-slate-600 border border-slate-200/60">
                              {store.code}
                            </span>
                          )}
                        </div>

                        {store.address && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                            <span className="truncate max-w-[220px]">{store.address}</span>
                          </div>
                        )}
                      </div>

                      <ChevronRight
                        className={cn(
                          "h-4 w-4 shrink-0 transition-transform mt-0.5",
                          isSelected ? "text-[#8B1D1D] translate-x-0.5" : "text-slate-300"
                        )}
                      />
                    </div>

                    {/* Stock & items stats badges */}
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1 text-slate-500">
                        <Package className="h-3.5 w-3.5 text-slate-400" />
                        <span>{store.products_count} поз.</span>
                      </div>
                      <div className="font-semibold text-slate-900 font-mono">
                        {formatInt(store.total_stock)} <span className="text-slate-500 font-normal">ед.</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ========================================================= */}
          {/* УРОВЕНЬ 2: Минималистичный список продуктов выбранного склада — 8 колонок */}
          {/* ========================================================= */}
          <div className="lg:col-span-8 bg-white border border-slate-200/80 rounded-xl shadow-2xs overflow-hidden flex flex-col min-h-[580px]">
            {/* Header: Warehouse title, stats & compact search */}
            <div className="p-4 sm:p-5 border-b border-slate-200/80 bg-slate-50/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900">
                    {activeStore?.name}
                  </h2>
                  {activeStore?.code && (
                    <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-[#FEF2F2] text-[#8B1D1D] border border-[#8B1D1D]/20">
                      {activeStore.code}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-slate-500 flex items-center gap-3">
                  <span>Позиций в наличии: <strong className="text-slate-700">{filteredProducts.length}</strong></span>
                  <span>•</span>
                  <span>Общий остаток: <strong className="text-slate-700 font-mono">{formatInt(activeStore?.total_stock ?? 0)} ед.</strong></span>
                </div>
              </div>

              {/* Компактный поисковик (w-full max-w-sm h-9) */}
              <div className="relative w-full sm:max-w-xs">
                <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Поиск по названию или штрихкоду..."
                  className="w-full h-9 pl-8 pr-7 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#8B1D1D] focus:ring-1 focus:ring-[#8B1D1D]/20 transition-all text-slate-900 placeholder:text-slate-400"
                />
                {productSearch && (
                  <button
                    type="button"
                    onClick={() => setProductSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Products Table (Minimalist: Barcode, Name, Category, Stock on store) */}
            <div className="flex-1 overflow-x-auto">
              {filteredProducts.length === 0 ? (
                <div className="p-12 text-center text-sm text-slate-500">
                  {productSearch ? "Товары по запросу не найдены" : "На этом складе пока нет товаров с остатком"}
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200/80 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="py-2.5 px-4 w-36">Штрихкод</th>
                      <th className="py-2.5 px-4">Наименование продукта</th>
                      <th className="py-2.5 px-4 w-44">Категория</th>
                      <th className="py-2.5 px-4 text-right w-36">Остаток на складе</th>
                      <th className="py-2.5 px-4 text-center w-28">Действие</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredProducts.map((prod) => (
                      <tr
                        key={prod.product_id}
                        onClick={() => handleOpenProductModal(prod)}
                        className="hover:bg-[#FEF2F2]/30 cursor-pointer transition-colors group"
                      >
                        <td className="py-3 px-4 font-mono font-medium text-slate-700">
                          {prod.barcode}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900 group-hover:text-[#8B1D1D] transition-colors">
                          {prod.name}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          <span className="px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-600">
                            {prod.category_name}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="font-mono font-bold text-sm text-slate-900">
                            {formatInt(prod.current_store_stock)}
                          </span>{" "}
                          <span className="text-[11px] text-slate-500 font-normal">
                            {prod.base_unit_name}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenProductModal(prod);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#8B1D1D] hover:underline"
                          >
                            <span>История</span>
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* УРОВЕНЬ 3: Центральное модальное окно с полной инфой и движениями */}
      {/* ========================================================= */}
      {productModalOpen && selectedProduct && activeStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 bg-slate-50/50 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                    {selectedProduct.barcode}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-mono text-slate-500 bg-slate-100">
                    {selectedProduct.sku}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-[#FEF2F2] text-[#8B1D1D] border border-[#8B1D1D]/20">
                    Склад: {activeStore.name}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 leading-tight">
                  {selectedProduct.name}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Категория: {selectedProduct.category_name}
                </p>
              </div>

              {/* Right: Current Balance Badge */}
              <div className="flex items-center gap-4">
                <div className="text-right bg-white border border-slate-200 px-4 py-2.5 rounded-xl shadow-2xs">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Остаток на этом складе
                  </div>
                  <div className="text-2xl font-bold font-mono text-[#8B1D1D]">
                    {formatInt(selectedProduct.current_store_stock)}{" "}
                    <span className="text-xs font-normal text-slate-600">
                      {selectedProduct.base_unit_name}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  title="Закрыть"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Content: Movements history of this product on this warehouse */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#8B1D1D]" />
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                    Движения этого товара на складе «{activeStore.name}»
                  </h4>
                </div>
                <span className="text-xs text-slate-500">
                  Всего операций: <strong className="text-slate-800">{productStoreTxs.length}</strong>
                </span>
              </div>

              {txsLoading ? (
                <div className="py-12 text-center text-sm text-slate-400">
                  Загрузка истории операций...
                </div>
              ) : productStoreTxs.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500 bg-slate-50 rounded-xl border border-slate-200/60">
                  По данному товару на этом складе не зафиксировано отдельных операций.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                        <th className="py-2.5 px-3.5 w-36">Дата и время</th>
                        <th className="py-2.5 px-3.5 w-28">Тип</th>
                        <th className="py-2.5 px-3.5 text-right w-28">Количество</th>
                        <th className="py-2.5 px-3.5 text-right w-36">Остаток после (Было → Стало)</th>
                        <th className="py-2.5 px-3.5 w-40">Исполнитель</th>
                        <th className="py-2.5 px-3.5">Контрагент / Назначение</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {productStoreTxs.map((tx) => {
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
                            <td className="py-3 px-3.5 text-slate-700 truncate max-w-[150px]">
                              {tx.performed_by.full_name}
                            </td>
                            <td className="py-3 px-3.5 text-slate-700">
                              <div className="truncate max-w-[220px]" title={tx.counterparty_name}>
                                {tx.counterparty_name}
                              </div>
                              {/* If expanded, show attributes */}
                              {isExpanded && tx.custom_attributes && Object.keys(tx.custom_attributes).length > 0 && (
                                <div className="mt-2 pt-2 border-t border-slate-200/80 text-[11px] text-slate-600 space-y-1">
                                  {Object.entries(tx.custom_attributes).map(([k, v]) => (
                                    <div key={k} className="flex gap-1.5">
                                      <span className="text-slate-400 font-medium">{k}:</span>
                                      <span className="text-slate-900 font-mono">{String(v)}</span>
                                    </div>
                                  ))}
                                  {tx.notes && (
                                    <div className="text-slate-500 italic mt-1">
                                      Примечание: {tx.notes}
                                    </div>
                                  )}
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

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span>Нажмите на любую строку операции для раскрытия дополнительных реквизитов</span>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-medium rounded-lg shadow-2xs transition-colors cursor-pointer"
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
