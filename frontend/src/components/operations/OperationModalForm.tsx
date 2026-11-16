import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Plus,
  Scale,
  Sparkles,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { SlideOverDrawer } from "@/components/ui/SlideOverDrawer";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatQty, nowDushanbeLocalInput, ROLE_LABELS } from "@/lib/utils";
import type {
  AttributeDefinition,
  CustomDictionary,
  InventoryTransaction,
  Product,
  TransactionType,
  UnitOfMeasure,
} from "@/types/api";

interface OperationField {
  id: string;
  key: string;
  label: string;
  type: "TEXT" | "NUMBER" | "DATE" | "SELECT";
  options: string[];
  isCustom?: boolean;
}

interface OperationModalFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  txType: TransactionType;
  initialProduct: Product;
  allProducts: Product[];
  txAttributes: AttributeDefinition[];
  counterpartyDictionary?: CustomDictionary;
  onSuccess: (tx: InventoryTransaction) => void;
}

const baseFormSchema = z.object({
  product_id: z.string().min(1, "Выберите товар"),
  quantity_entered: z
    .string()
    .refine((v) => Number(v) > 0, "Количество должно быть больше 0"),
  unit_id: z.string().min(1, "Выберите единицу измерения"),
  counterparty_name: z.string().trim().min(1, "Укажите контрагента / получателя / отправителя"),
});

function formatUnitRu(name: string, code: string): string {
  const map: Record<string, string> = {
    pcs: "шт",
    l: "литр",
    kg: "кг",
    g: "г",
    ml: "мл",
    m: "метр",
    cm: "см",
    pack: "упаковка",
    box: "коробка",
    pallet: "паллета",
    pack12: "упаковка (12 шт)",
  };
  const key = code.toLowerCase().trim();
  if (map[key]) return map[key];

  let cleaned = name.replace(/\([a-zA-Z\s0-9]+\)/g, "").trim();
  return cleaned || name;
}

export function OperationModalForm({
  open,
  onOpenChange,
  txType,
  initialProduct,
  allProducts,
  txAttributes,
  counterpartyDictionary,
  onSuccess,
}: OperationModalFormProps) {
  const { user, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const canEditTimestamp = hasRole("MANAGER", "DIRECTOR", "SUPER_ADMIN");

  const [productId, setProductId] = useState(initialProduct.id);
  const [quantity, setQuantity] = useState("1");
  const [unitId, setUnitId] = useState(initialProduct.base_unit_id);
  const [counterparty, setCounterparty] = useState("");
  const [performedAt, setPerformedAt] = useState(nowDushanbeLocalInput);
  const [notes, setNotes] = useState("");
  const [adjustmentDirection, setAdjustmentDirection] = useState<"INCREASE" | "DECREASE">(
    "INCREASE"
  );

  // Dynamic fields list & values
  const [activeFields, setActiveFields] = useState<OperationField[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [customSelectValues, setCustomSelectValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 1. Custom unit inline form state
  const [showCustomUnitForm, setShowCustomUnitForm] = useState(false);
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitMultiplier, setNewUnitMultiplier] = useState("1");
  const [customUnitError, setCustomUnitError] = useState<string | null>(null);

  // 2. Add field constructor inline state
  const [showAddFieldConstructor, setShowAddFieldConstructor] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<"TEXT" | "NUMBER" | "DATE" | "SELECT">("TEXT");
  const [newFieldOptions, setNewFieldOptions] = useState<string[]>([]);
  const [optionInput, setOptionInput] = useState("");
  const [saveForFuture, setSaveForFuture] = useState(true);
  const [fieldConstructorError, setFieldConstructorError] = useState<string | null>(null);

  // Fetch all registered units
  const { data: allUnits = [] } = useQuery({
    queryKey: ["constructor", "units"],
    queryFn: () => apiRequest<UnitOfMeasure[]>("/api/v1/constructor/units"),
    enabled: open,
  });

  const selectedProduct = useMemo(
    () => allProducts.find((p) => p.id === productId) ?? initialProduct,
    [allProducts, productId, initialProduct]
  );

  useEffect(() => {
    if (!open) return;
    setProductId(initialProduct.id);
    setUnitId(initialProduct.base_unit_id);
    setQuantity("1");
    setPerformedAt(nowDushanbeLocalInput());
    setNotes("");
    setAdjustmentDirection("INCREASE");
    setFieldErrors({});
    setSubmitError(null);

    // Reset unit creation
    setShowCustomUnitForm(false);
    setNewUnitName("");
    setNewUnitMultiplier("1");
    setCustomUnitError(null);

    // Reset field constructor
    setShowAddFieldConstructor(false);
    setNewFieldName("");
    setNewFieldType("TEXT");
    setNewFieldOptions([]);
    setOptionInput("");
    setSaveForFuture(true);
    setFieldConstructorError(null);

    // Map system constructor attributes to active fields
    const initialAttrFields: OperationField[] = txAttributes.map((attr) => {
      let opts: string[] = [];
      if (attr.dictionary?.items) {
        opts = attr.dictionary.items
          .filter((i) => i.is_active)
          .map((i) => (typeof i === "object" ? String(i.label || i.value) : String(i)));
      }
      return {
        id: attr.id,
        key: attr.key,
        label: attr.label,
        type: (attr.field_type as "TEXT" | "NUMBER" | "DATE" | "SELECT") || "TEXT",
        options: opts,
        isCustom: false,
      };
    });
    setActiveFields(initialAttrFields);

    const initialValues: Record<string, unknown> = {};
    for (const attr of txAttributes) {
      if (attr.default_value !== null && attr.default_value !== undefined) {
        initialValues[attr.key] = attr.default_value;
      }
    }
    setFieldValues(initialValues);
    setCustomSelectValues({});

    const firstCp = counterpartyDictionary?.items.find((i) => i.is_active)?.value ?? "";
    setCounterparty(firstCp);
  }, [open, initialProduct, txAttributes, counterpartyDictionary]);

  // Combined available units purely in Russian without English suffixes
  const availableUnits = useMemo(() => {
    const list: Array<{ id: string; nameRu: string; multiplier: number; isBase?: boolean }> = [];

    // Base unit
    list.push({
      id: selectedProduct.base_unit.id,
      nameRu: formatUnitRu(selectedProduct.base_unit.name, selectedProduct.base_unit.code),
      multiplier: 1,
      isBase: true,
    });

    // Secondary unit
    if (selectedProduct.secondary_unit && selectedProduct.secondary_unit.id !== selectedProduct.base_unit_id) {
      list.push({
        id: selectedProduct.secondary_unit.id,
        nameRu: formatUnitRu(selectedProduct.secondary_unit.name, selectedProduct.secondary_unit.code),
        multiplier: selectedProduct.conversion_factor ? Number(selectedProduct.conversion_factor) : 1,
      });
    }

    // Allowed units
    for (const au of selectedProduct.allowed_units ?? []) {
      if (!list.some((u) => u.id === au.unit.id)) {
        list.push({
          id: au.unit.id,
          nameRu: formatUnitRu(au.unit.name, au.unit.code),
          multiplier: Number(au.multiplier_to_base),
        });
      }
    }

    // Include other standard catalog units
    for (const u of allUnits) {
      if (!list.some((item) => item.id === u.id)) {
        list.push({
          id: u.id,
          nameRu: formatUnitRu(u.name, u.code),
          multiplier: 1,
        });
      }
    }

    return list;
  }, [selectedProduct, allUnits]);

  // Multiplier of current selected unit to base unit
  const currentMultiplier = useMemo(() => {
    if (unitId === selectedProduct.base_unit_id) return 1;
    const match = availableUnits.find((u) => u.id === unitId);
    return match ? match.multiplier : 1;
  }, [unitId, selectedProduct.base_unit_id, availableUnits]);

  const calculatedBaseQty = useMemo(() => {
    const num = Number(quantity);
    if (!num || num <= 0) return 0;
    return num * currentMultiplier;
  }, [quantity, currentMultiplier]);

  const projectedStock = useMemo(() => {
    const current = Number(selectedProduct.current_stock_base);
    if (txType === "INBOUND") return current + calculatedBaseQty;
    if (txType === "OUTBOUND") return current - calculatedBaseQty;
    return adjustmentDirection === "INCREASE"
      ? current + calculatedBaseQty
      : current - calculatedBaseQty;
  }, [selectedProduct.current_stock_base, calculatedBaseQty, txType, adjustmentDirection]);

  const counterpartyItems = useMemo(
    () => counterpartyDictionary?.items.filter((i) => i.is_active) ?? [],
    [counterpartyDictionary]
  );

  // 1. Quick Unit Creation Mutation
  const createUnitMutation = useMutation({
    mutationFn: async (payload: { name: string; code: string; multiplier_to_base: number }) => {
      return apiRequest<{ unit: UnitOfMeasure; multiplier_to_base: number }>(
        `/api/v1/products/${selectedProduct.id}/units`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["constructor", "units"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setUnitId(data.unit.id);
      setShowCustomUnitForm(false);
      setNewUnitName("");
      setNewUnitMultiplier("1");
      setCustomUnitError(null);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setCustomUnitError(err.message);
      } else {
        setCustomUnitError("Не удалось сохранить единицу измерения");
      }
    },
  });

  const handleSaveCustomUnit = () => {
    setCustomUnitError(null);
    const cleanName = newUnitName.trim();
    const multNum = Number(newUnitMultiplier);

    if (!cleanName) {
      setCustomUnitError("Укажите наименование единицы (например: упаковка, блок, коробка)");
      return;
    }
    if (isNaN(multNum) || multNum <= 0) {
      setCustomUnitError("Количество базовых единиц должно быть положительным числом больше нуля");
      return;
    }

    // Slug from name
    const codeSlug = cleanName
      .toLowerCase()
      .replace(/[^a-zа-я0-9]/gi, "_")
      .slice(0, 20);

    createUnitMutation.mutate({
      name: cleanName,
      code: codeSlug || "unit_custom",
      multiplier_to_base: multNum,
    });
  };

  // 2. Add Field Constructor handlers
  const handleAddOptionTag = () => {
    const clean = optionInput.trim();
    if (!clean) return;
    if (!newFieldOptions.includes(clean)) {
      setNewFieldOptions((prev) => [...prev, clean]);
    }
    setOptionInput("");
  };

  const handleRemoveOptionTag = (opt: string) => {
    setNewFieldOptions((prev) => prev.filter((o) => o !== opt));
  };

  const handleAddFieldToForm = async () => {
    setFieldConstructorError(null);
    const cleanName = newFieldName.trim();
    if (!cleanName) {
      setFieldConstructorError("Укажите название поля (например: Номер машины, Смена, Температура)");
      return;
    }

    if (activeFields.some((f) => f.label.toLowerCase() === cleanName.toLowerCase())) {
      setFieldConstructorError(`Поле «${cleanName}» уже добавлено в форму`);
      return;
    }

    const fieldKey = `attr_${cleanName.toLowerCase().replace(/[^a-zа-я0-9]/gi, "_")}_${Date.now().toString(36)}`;

    // If saving for future and user has permissions, persist to DB constructor
    if (saveForFuture && hasRole("SUPER_ADMIN", "DIRECTOR")) {
      try {
        await apiRequest("/api/v1/constructor/attributes", {
          method: "POST",
          body: JSON.stringify({
            target_type: txType === "INBOUND" ? "TX_INBOUND" : "TX_OUTBOUND",
            label: cleanName,
            field_type: newFieldType,
            options: newFieldType === "SELECT" ? newFieldOptions : undefined,
            is_required: false,
          }),
        });
        queryClient.invalidateQueries({ queryKey: ["constructor", "attributes"] });
      } catch (err) {
        console.warn("Could not persist attribute definition to schema:", err);
      }
    }

    const newField: OperationField = {
      id: crypto.randomUUID(),
      key: fieldKey,
      label: cleanName,
      type: newFieldType,
      options: [...newFieldOptions],
      isCustom: true,
    };

    setActiveFields((prev) => [...prev, newField]);
    setShowAddFieldConstructor(false);
    setNewFieldName("");
    setNewFieldType("TEXT");
    setNewFieldOptions([]);
    setOptionInput("");
    setSaveForFuture(true);
  };

  const handleRemoveField = (fieldKey: string) => {
    setActiveFields((prev) => prev.filter((f) => f.key !== fieldKey));
    setFieldValues((prev) => {
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
  };

  // Main transaction execution mutation
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
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      onSuccess(tx);
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.details && typeof err.details === "object") {
          setFieldErrors(err.details as Record<string, string>);
        }
        setSubmitError(err.message);
      } else {
        setSubmitError("Ошибка при проведении операции");
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setFieldErrors({});

    const validated = baseFormSchema.safeParse({
      product_id: productId,
      quantity_entered: quantity,
      unit_id: unitId,
      counterparty_name: counterparty,
    });

    if (!validated.success) {
      const errors: Record<string, string> = {};
      for (const issue of validated.error.issues) {
        const fieldName = String(issue.path[0]);
        errors[fieldName] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    if (
      txType === "OUTBOUND" &&
      !selectedProduct.allow_negative_stock &&
      projectedStock < 0
    ) {
      setSubmitError(
        `Недостаточно товара на складе! Доступно: ${selectedProduct.stock_display}, запрошено: ${formatQty(
          calculatedBaseQty
        )} ${selectedProduct.base_unit.name}`
      );
      return;
    }

    // Build final custom_attributes
    const finalCustomAttrs: Record<string, unknown> = {};
    for (const field of activeFields) {
      let val = fieldValues[field.key];
      if (val === "__CUSTOM_OPTION__") {
        val = customSelectValues[field.key] || "";
      }
      if (val !== undefined && val !== null && val !== "") {
        if (field.type === "NUMBER") {
          const num = Number(val);
          finalCustomAttrs[field.label] = !isNaN(num) ? num : val;
        } else {
          finalCustomAttrs[field.label] = val;
        }
      }
    }

    const payload: Record<string, unknown> = {
      tx_type: txType,
      product_id: productId,
      quantity_entered: Number(quantity),
      unit_id: unitId,
      unit_multiplier_to_base: currentMultiplier,
      counterparty_name: counterparty.trim(),
      performed_at: new Date(performedAt).toISOString(),
      custom_attributes: finalCustomAttrs,
      notes: notes.trim() || null,
      adjustment_direction: txType === "ADJUSTMENT" ? adjustmentDirection : null,
    };

    mutation.mutate(payload);
  };

  const titleText =
    txType === "INBOUND"
      ? "Прием товара на склад"
      : txType === "OUTBOUND"
        ? "Отправка товара со склада"
        : "Корректировка остатка";

  return (
    <SlideOverDrawer
      open={open}
      onClose={() => onOpenChange(false)}
      title={titleText}
      subtitle={`Номенклатура: ${selectedProduct.name} (${selectedProduct.barcode})`}
      badge={
        <Badge
          variant={
            txType === "INBOUND"
              ? "inbound"
              : txType === "OUTBOUND"
                ? "outbound"
                : "blue"
          }
        >
          {txType === "INBOUND"
            ? "ПРИХОД"
            : txType === "OUTBOUND"
              ? "РАСХОД"
              : "КОРРЕКТИРОВКА"}
        </Badge>
      }
      maxWidthClass="max-w-[560px]"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
            className="cursor-pointer"
          >
            Отмена
          </Button>
          <Button
            type="submit"
            form="operation-drawer-form"
            className="bg-[#7F1D1D] hover:bg-[#651717] text-white min-w-[160px] font-medium shadow-xs cursor-pointer transition-colors"
            disabled={mutation.isPending}
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            {mutation.isPending
              ? "Проведение..."
              : txType === "INBOUND"
                ? "Принять"
                : txType === "OUTBOUND"
                  ? "Отправить"
                  : "Сохранить"}
          </Button>
        </>
      }
    >
      <form
        id="operation-drawer-form"
        onSubmit={handleSubmit}
        className="space-y-6"
      >
        {submitError && (
          <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Информационная карточка выбранного товара */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-mono text-xs text-slate-500 font-medium">
                {selectedProduct.barcode}
              </div>
              <div className="mt-0.5 text-base font-bold text-slate-900">
                {selectedProduct.name}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Базовая единица: <strong>{selectedProduct.base_unit.name}</strong>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Остаток
              </div>
              <div className="mt-0.5 font-mono font-bold text-slate-900 text-base">
                {selectedProduct.stock_display}
              </div>
            </div>
          </div>
        </div>

        {/* 1. Количество и единица измерения */}
        <div className="space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Параметры движения
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>
                Количество <span className="text-rose-600">*</span>
              </Label>
              <Input
                type="number"
                step="any"
                min="0.0001"
                autoFocus
                className="h-11 font-mono text-base focus-visible:ring-[#7F1D1D]/15 focus-visible:border-[#7F1D1D]"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="1"
                required
              />
              {fieldErrors.quantity_entered && (
                <p className="text-xs text-rose-600">{fieldErrors.quantity_entered}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Единица измерения</Label>
              </div>
              <Select
                value={unitId}
                onValueChange={(val) => {
                  if (val === "__CUSTOM__") {
                    setShowCustomUnitForm(true);
                  } else {
                    setUnitId(val);
                  }
                }}
              >
                <SelectTrigger className="h-11 focus:ring-[#7F1D1D]/15 focus:border-[#7F1D1D]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableUnits.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nameRu} {u.isBase ? "(базовая)" : u.multiplier !== 1 ? `[x${u.multiplier}]` : ""}
                    </SelectItem>
                  ))}
                  <SelectItem
                    value="__CUSTOM__"
                    className="text-[#7F1D1D] font-semibold border-t border-slate-100 mt-1 cursor-pointer"
                  >
                    + Другое (добавить свою единицу)...
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 1. Встроенная форма добавления своей единицы измерения («+ Другое») */}
          {showCustomUnitForm && (
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3 animate-page-enter">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <Scale className="h-3.5 w-3.5 text-[#7F1D1D]" />
                  <span>Новая единица измерения</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCustomUnitForm(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {customUnitError && (
                <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 p-2 rounded">
                  {customUnitError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-600">
                  Название новой единицы *
                </label>
                <Input
                  placeholder="например: упаковка, блок, паллета, коробка..."
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  className="h-9 text-xs bg-white focus-visible:ring-[#7F1D1D]/15 focus-visible:border-[#7F1D1D]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-600">
                  Сколько базовых единиц внутри ({selectedProduct.base_unit.name})
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-mono shrink-0">1 новая ЕИ =</span>
                  <Input
                    type="number"
                    step="any"
                    min="0.0001"
                    placeholder="1"
                    value={newUnitMultiplier}
                    onChange={(e) => setNewUnitMultiplier(e.target.value)}
                    className="h-9 text-xs font-mono bg-white max-w-[120px] focus-visible:ring-[#7F1D1D]/15 focus-visible:border-[#7F1D1D]"
                  />
                  <span className="text-xs text-slate-700 font-medium">
                    {selectedProduct.base_unit.name}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">
                  По умолчанию 1 (например 1 упаковка = 12 шт).
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCustomUnitForm(false)}
                  className="h-8 text-xs cursor-pointer"
                >
                  Отмена
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={createUnitMutation.isPending}
                  onClick={handleSaveCustomUnit}
                  className="h-8 text-xs bg-[#7F1D1D] hover:bg-[#651717] text-white font-medium cursor-pointer shadow-xs"
                >
                  {createUnitMutation.isPending ? "Сохранение..." : "Сохранить и выбрать"}
                </Button>
              </div>
            </div>
          )}

          {/* Предпросмотр пересчета остатка */}
          <div className="rounded-lg border border-slate-200 bg-white p-3.5 flex items-center justify-between text-xs">
            <div className="text-slate-500">
              {currentMultiplier !== 1 && (
                <div className="mb-0.5">
                  В базовой ЕИ:{" "}
                  <strong className="font-mono text-slate-800">
                    {formatQty(calculatedBaseQty)} {selectedProduct.base_unit.name}
                  </strong>{" "}
                  <span className="text-[11px] text-slate-400">
                    (x{currentMultiplier})
                  </span>
                </div>
              )}
              <span>Расчетный остаток после:</span>
            </div>
            <div
              className={`font-mono text-base font-bold ${
                projectedStock < 0 ? "text-rose-600" : "text-slate-900"
              }`}
            >
              {formatQty(projectedStock)} {selectedProduct.base_unit.name}
            </div>
          </div>
        </div>

        {/* 2. Контроль (Кто, Когда, Контрагент, Примечание) */}
        <div className="space-y-4 pt-3 border-t border-slate-200">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Контроль и контрагент
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Исполнитель</Label>
              <div className="flex h-11 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800">
                <UserIcon className="h-4 w-4 text-slate-500 shrink-0" />
                <span className="font-medium whitespace-nowrap text-sm">{user?.full_name}</span>
                <span className="ml-auto text-xs text-slate-500 whitespace-nowrap">
                  {user ? ROLE_LABELS[user.role] : ""}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Дата и время</Label>
              <div className="relative flex items-center">
                <Clock className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
                <Input
                  type="datetime-local"
                  className="h-11 pl-9 font-mono text-sm focus-visible:ring-[#7F1D1D]/15 focus-visible:border-[#7F1D1D]"
                  value={performedAt}
                  disabled={!canEditTimestamp}
                  onChange={(e) => setPerformedAt(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>
              {txType === "INBOUND"
                ? "Поставщик / Отправитель / Линия"
                : txType === "OUTBOUND"
                  ? "Получатель / Заказчик / Маркет"
                  : "Основание"}
              <span className="ml-1 text-rose-600">*</span>
            </Label>
            {counterpartyItems.length > 0 ? (
              <Select value={counterparty} onValueChange={setCounterparty}>
                <SelectTrigger className="h-11 focus:ring-[#7F1D1D]/15 focus:border-[#7F1D1D]">
                  <SelectValue placeholder="Выберите из справочника..." />
                </SelectTrigger>
                <SelectContent>
                  {counterpartyItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                className="h-11 focus-visible:ring-[#7F1D1D]/15 focus-visible:border-[#7F1D1D]"
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                placeholder="Наименование контрагента..."
              />
            )}
            {fieldErrors.counterparty_name && (
              <p className="text-xs text-rose-600">{fieldErrors.counterparty_name}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Примечание / Комментарий к операции</Label>
            <Input
              className="h-11 focus-visible:ring-[#7F1D1D]/15 focus-visible:border-[#7F1D1D]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Номер накладной, комментарий..."
            />
          </div>
        </div>

        {/* 3. ДИНАМИЧЕСКИЕ ДОПОЛНИТЕЛЬНЫЕ АТРИБУТЫ ОПЕРАЦИИ */}
        <div className="space-y-4 pt-3 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[#7F1D1D]" />
                Дополнительные атрибуты операции
              </div>
              <p className="text-[11px] text-slate-500">
                Номер машины, смена, температура, склад получателя и другие параметры
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddFieldConstructor((prev) => !prev)}
              className="h-8 text-xs font-semibold text-slate-700 border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-50 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              + Добавить поле / атрибут
            </Button>
          </div>

          {/* Inline Конструктор нового поля */}
          {showAddFieldConstructor && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3.5 animate-page-enter">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Конструктор нового поля
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddFieldConstructor(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {fieldConstructorError && (
                <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 p-2 rounded">
                  {fieldConstructorError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">
                    Название поля *
                  </label>
                  <Input
                    placeholder="Номер машины, Смена, Температура..."
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    className="h-9 text-xs bg-white focus-visible:ring-[#7F1D1D]/15 focus-visible:border-[#7F1D1D]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">
                    Тип поля
                  </label>
                  <Select
                    value={newFieldType}
                    onValueChange={(val: "TEXT" | "NUMBER" | "DATE" | "SELECT") => setNewFieldType(val)}
                  >
                    <SelectTrigger className="h-9 text-xs bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TEXT">Текст</SelectItem>
                      <SelectItem value="NUMBER">Число</SelectItem>
                      <SelectItem value="SELECT">Выпадающий список</SelectItem>
                      <SelectItem value="DATE">Дата</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Если выбран «Выпадающий список» — ввод вариантов */}
              {newFieldType === "SELECT" && (
                <div className="space-y-2 rounded-lg bg-white p-3 border border-slate-200">
                  <label className="text-[11px] font-semibold text-slate-700">
                    Варианты выпадающего списка
                  </label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Введите вариант и нажмите Enter или +"
                      value={optionInput}
                      onChange={(e) => setOptionInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddOptionTag();
                        }
                      }}
                      className="h-8 text-xs focus-visible:ring-[#7F1D1D]/15 focus-visible:border-[#7F1D1D]"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddOptionTag}
                      className="h-8 px-3 text-xs bg-slate-800 hover:bg-slate-900 text-white cursor-pointer"
                    >
                      +
                    </Button>
                  </div>

                  {newFieldOptions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {newFieldOptions.map((opt) => (
                        <span
                          key={opt}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs border border-slate-200"
                        >
                          {opt}
                          <button
                            type="button"
                            onClick={() => handleRemoveOptionTag(opt)}
                            className="text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400">
                    В списке также автоматически будет пункт «+ Другое (ввести своё значение)».
                  </p>
                </div>
              )}

              {/* Чекбокс: Сохранить для всех будущих операций */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="saveForFutureCheckbox"
                  checked={saveForFuture}
                  onChange={(e) => setSaveForFuture(e.target.checked)}
                  className="rounded border-slate-300 text-[#7F1D1D] focus:ring-[#7F1D1D]"
                />
                <label htmlFor="saveForFutureCheckbox" className="text-xs text-slate-700 cursor-pointer select-none">
                  Сохранить это поле для всех будущих операций
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/80">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddFieldConstructor(false)}
                  className="h-8 text-xs cursor-pointer"
                >
                  Отмена
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddFieldToForm}
                  className="h-8 text-xs bg-[#7F1D1D] hover:bg-[#651717] text-white font-medium cursor-pointer shadow-xs"
                >
                  Добавить поле
                </Button>
              </div>
            </div>
          )}

          {/* Отображение всех добавленных динамических полей */}
          {activeFields.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center bg-slate-50/40">
              <p className="text-xs text-slate-400">
                Нет добавленных полей. Нажмите «+ Добавить поле / атрибут», чтобы указать номер машины, температуру или склад.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeFields.map((field) => {
                const currentVal = fieldValues[field.key] ?? "";
                const isCustomChoice = currentVal === "__CUSTOM_OPTION__";

                return (
                  <div
                    key={field.key}
                    className="rounded-lg border border-slate-200 bg-white p-3 space-y-2 shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-slate-700">
                        {field.label}
                      </Label>
                      {field.isCustom && (
                        <button
                          type="button"
                          onClick={() => handleRemoveField(field.key)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                          title="Удалить поле"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {field.type === "DATE" ? (
                      <Input
                        type="date"
                        value={String(currentVal)}
                        onChange={(e) =>
                          setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className="h-9 text-xs font-mono focus-visible:ring-[#7F1D1D]/15 focus-visible:border-[#7F1D1D]"
                      />
                    ) : field.type === "NUMBER" ? (
                      <Input
                        type="number"
                        step="any"
                        placeholder="0"
                        value={String(currentVal)}
                        onChange={(e) =>
                          setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className="h-9 text-xs font-mono focus-visible:ring-[#7F1D1D]/15 focus-visible:border-[#7F1D1D]"
                      />
                    ) : field.type === "SELECT" ? (
                      <div className="space-y-2">
                        <Select
                          value={String(currentVal)}
                          onValueChange={(val) =>
                            setFieldValues((prev) => ({ ...prev, [field.key]: val }))
                          }
                        >
                          <SelectTrigger className="h-9 text-xs focus:ring-[#7F1D1D]/15 focus:border-[#7F1D1D]">
                            <SelectValue placeholder="Выберите из списка..." />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options.map((opt) => (
                              <SelectItem key={opt} value={opt}>
                                {opt}
                              </SelectItem>
                            ))}
                            <SelectItem
                              value="__CUSTOM_OPTION__"
                              className="text-[#7F1D1D] font-medium border-t border-slate-100 mt-1 cursor-pointer"
                            >
                              + Другое (ввести своё значение)...
                            </SelectItem>
                          </SelectContent>
                        </Select>

                        {/* Если выбрано «+ Другое (ввести своё значение)» */}
                        {isCustomChoice && (
                          <div className="pt-1">
                            <Input
                              placeholder="Введите своё значение..."
                              value={customSelectValues[field.key] ?? ""}
                              onChange={(e) =>
                                setCustomSelectValues((prev) => ({
                                  ...prev,
                                  [field.key]: e.target.value,
                                }))
                              }
                              className="h-8 text-xs bg-slate-50 focus-visible:ring-[#7F1D1D]/15 focus-visible:border-[#7F1D1D]"
                              autoFocus
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <Input
                        placeholder="Введите значение..."
                        value={String(currentVal)}
                        onChange={(e) =>
                          setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className="h-9 text-xs focus-visible:ring-[#7F1D1D]/15 focus-visible:border-[#7F1D1D]"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </form>
    </SlideOverDrawer>
  );
}