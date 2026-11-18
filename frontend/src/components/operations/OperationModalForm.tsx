import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Barcode,
  Building2,
  Clock,
  User as UserIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatQty } from "@/lib/utils";
import type {
  AttributeDefinition,
  CustomDictionary,
  InventoryTransaction,
  Product,
  TransactionType,
} from "@/types/api";

interface OperationModalFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  txType: TransactionType;
  initialProduct: Product;
  allProducts: Product[];
  txAttributes?: AttributeDefinition[];
  counterpartyDictionary?: CustomDictionary;
  onSuccess: (tx: InventoryTransaction) => void;
}

export function OperationModalForm({
  open,
  onOpenChange,
  txType,
  initialProduct: product,
  onSuccess,
}: OperationModalFormProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [quantity, setQuantity] = useState("1");
  const [attrValues, setAttrValues] = useState<Record<string, unknown>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Formatted live timestamp
  const [currentDateTime, setCurrentDateTime] = useState("");

  useEffect(() => {
    if (open) {
      setQuantity("1");
      setAttrValues({});
      setFormError(null);
      const now = new Date();
      setCurrentDateTime(
        now.toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }
  }, [open, product.id]);

  const unitLabel = useMemo(() => {
    if (!product.base_unit) return "шт";
    return product.base_unit.name || "шт";
  }, [product]);

  // Operational attributes configured for this product in catalog
  const operationalAttributes = useMemo(() => {
    const list = product.configured_attributes || [];
    return list.filter((attr) => {
      if (txType === "INBOUND") {
        return (
          attr.applies_to === "INBOUND" ||
          attr.applies_to === "BOTH" ||
          (attr.applies_to as string) === "TX_INBOUND"
        );
      }
      return (
        attr.applies_to === "OUTBOUND" ||
        attr.applies_to === "BOTH" ||
        (attr.applies_to as string) === "TX_OUTBOUND"
      );
    });
  }, [product, txType]);

  // Stock calculation preview
  const calculatedStockAfter = useMemo(() => {
    const entered = parseFloat(quantity);
    if (isNaN(entered) || entered <= 0) return null;
    const current = parseFloat(product.current_stock_base) || 0;
    const next = txType === "INBOUND" ? current + entered : current - entered;
    return formatQty(next);
  }, [quantity, product.current_stock_base, txType]);

  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      return apiRequest<InventoryTransaction>("/api/v1/transactions", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (tx) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      onSuccess(tx);
      onOpenChange(false);
    },
    onError: (err) => {
      setFormError(
        err instanceof ApiError ? err.message : "Ошибка проведения операции"
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      setFormError("Укажите корректное количество больше 0");
      return;
    }

    // Check required attributes
    for (const attr of operationalAttributes) {
      if (attr.is_required && !attrValues[attr.key]) {
        setFormError(`Заполните обязательное поле «${attr.label}»`);
        return;
      }
    }

    const payload: Record<string, unknown> = {
      tx_type: txType,
      product_id: product.id,
      quantity_entered: qty,
      unit_id: product.base_unit_id,
      store_id: user?.store_id || null,
      counterparty_name: user?.store_name || "Центральный склад",
      custom_attributes: attrValues,
    };

    mutation.mutate(payload);
  };

  if (!open) return null;

  const isIncoming = txType === "INBOUND";

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in-0 zoom-in-95 duration-150">
        {/* 1. Заголовок окна: «Принять товар» или «Отправить товар» + Название товара и штрихкод */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900">
                {isIncoming ? "Принять товар" : "Отправить товар"}
              </h3>
              <span
                className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                  isIncoming
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-red-50 text-[#7F1D1D] border border-red-200"
                }`}
              >
                {isIncoming ? "Приход" : "Расход"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
              <span className="font-semibold text-slate-800">{product.name}</span>
              <span className="inline-flex items-center gap-1 font-mono text-slate-500">
                <Barcode className="h-3 w-3" />
                {product.barcode}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1.5 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Тело окна */}
        <form
          id="operation-modal-form"
          onSubmit={handleSubmit}
          className="p-6 overflow-y-auto space-y-5 flex-1"
        >
          {formError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* 2. Автоматический блок (Кто / Когда / Куда) */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <div className="text-slate-400 font-medium flex items-center gap-1">
                <UserIcon className="h-3 w-3" />
                Кто
              </div>
              <div className="font-semibold text-slate-900 mt-0.5 truncate">
                {user?.full_name || "Сотрудник"}
              </div>
            </div>
            <div>
              <div className="text-slate-400 font-medium flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Когда
              </div>
              <div className="font-semibold text-slate-900 mt-0.5 truncate">
                {currentDateTime}
              </div>
            </div>
            <div>
              <div className="text-slate-400 font-medium flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {isIncoming ? "Куда (Склад)" : "Откуда (Склад)"}
              </div>
              <div className="font-semibold text-[#7F1D1D] mt-0.5 truncate">
                {user?.store_name || "Центральный склад"}
              </div>
            </div>
          </div>

          {/* 3. Поле «Количество (Сколько)» с указанием единицы измерения товара */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="qty-input" className="text-xs font-semibold text-slate-700">
                Количество <span className="text-red-500">*</span>
              </Label>
              <span className="text-xs text-slate-500">
                Текущий остаток:{" "}
                <strong className="text-slate-900">
                  {formatQty(product.current_stock_base)} {unitLabel}
                </strong>
              </span>
            </div>
            <div className="relative flex items-center">
              <Input
                id="qty-input"
                type="number"
                step="any"
                min="0.0001"
                autoFocus
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="text-lg font-bold font-mono h-12 pr-16 border-slate-200 focus-visible:ring-[#7F1D1D]"
                required
              />
              <span className="absolute right-3.5 text-sm font-semibold text-slate-500 pointer-events-none select-none">
                {unitLabel}
              </span>
            </div>
            {calculatedStockAfter !== null && (
              <div className="text-xs text-slate-500 font-mono mt-1">
                Расчетный остаток после:{" "}
                <span className="font-semibold text-slate-800">
                  {calculatedStockAfter} {unitLabel}
                </span>
              </div>
            )}
          </div>

          {/* 4. Поля атрибутов из Справочника товаров */}
          {operationalAttributes.length > 0 && (
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Характеристики операции (из карточки товара)
              </div>

              <div className="space-y-3">
                {operationalAttributes.map((attr) => {
                  const val = attrValues[attr.key] ?? "";
                  return (
                    <div key={attr.key || attr.id} className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-700 flex items-center justify-between">
                        <span>
                          {attr.label}{" "}
                          {attr.is_required && <span className="text-red-500">*</span>}
                        </span>
                      </Label>

                      {attr.field_type === "SELECT" ? (
                        <Select
                          value={String(val)}
                          onValueChange={(newVal) =>
                            setAttrValues((prev) => ({ ...prev, [attr.key]: newVal }))
                          }
                        >
                          <SelectTrigger className="h-10 text-sm border-slate-200 focus-visible:ring-[#7F1D1D]">
                            <SelectValue placeholder={`Выберите ${attr.label.toLowerCase()}...`} />
                          </SelectTrigger>
                          <SelectContent>
                            {(attr.options || []).map((opt) => (
                              <SelectItem key={opt} value={opt}>
                                {opt}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : attr.field_type === "DATE" ? (
                        <Input
                          type="date"
                          value={String(val)}
                          onChange={(e) =>
                            setAttrValues((prev) => ({ ...prev, [attr.key]: e.target.value }))
                          }
                          className="h-10 text-sm border-slate-200 focus-visible:ring-[#7F1D1D]"
                        />
                      ) : attr.field_type === "NUMBER" ? (
                        <Input
                          type="number"
                          step="any"
                          value={String(val)}
                          onChange={(e) =>
                            setAttrValues((prev) => ({ ...prev, [attr.key]: e.target.value }))
                          }
                          placeholder={`Введите ${attr.label.toLowerCase()}...`}
                          className="h-10 text-sm font-mono border-slate-200 focus-visible:ring-[#7F1D1D]"
                        />
                      ) : (
                        <Input
                          type="text"
                          value={String(val)}
                          onChange={(e) =>
                            setAttrValues((prev) => ({ ...prev, [attr.key]: e.target.value }))
                          }
                          placeholder={`Введите ${attr.label.toLowerCase()}...`}
                          className="h-10 text-sm border-slate-200 focus-visible:ring-[#7F1D1D]"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </form>

        {/* 5. Кнопки: «Отмена» и «Принять» / «Отправить» (#7F1D1D) */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
            className="border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            Отмена
          </Button>
          <Button
            type="submit"
            form="operation-modal-form"
            disabled={mutation.isPending}
            className="bg-[#7F1D1D] hover:bg-[#991B1B] text-white font-semibold px-6 cursor-pointer shadow-sm"
          >
            {mutation.isPending
              ? "Проведение..."
              : isIncoming
              ? "Принять товар"
              : "Отправить товар"}
          </Button>
        </div>
      </div>
    </div>
  );
}
