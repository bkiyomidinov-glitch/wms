import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Barcode,
  Building2,
  Clock,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  User as UserIcon,
  Wand2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type {
  ConfiguredAttribute,
  Product,
  UnitOfMeasure,
} from "@/types/api";

const APPLIES_TO_LABELS: Record<string, string> = {
  INBOUND: "При приемке",
  OUTBOUND: "При отправке",
  BOTH: "Приемка и отправка",
  PRODUCT: "В карточке товара",
};

const FIELD_TYPE_LABELS: Record<string, string> = {
  TEXT: "Текст",
  NUMBER: "Число",
  DATE: "Дата",
  SELECT: "Список",
  BOOLEAN: "Да / Нет",
};

export function ProductsCatalogPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form basic fields
  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [initialStock, setInitialStock] = useState("0");
  const [baseUnitId, setBaseUnitId] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Dynamic time
  const [currentDateTime, setCurrentDateTime] = useState("");

  // Product configured operational attributes
  const [configuredAttrs, setConfiguredAttrs] = useState<ConfiguredAttribute[]>([]);
  const [productCardValues, setProductCardValues] = useState<Record<string, unknown>>({});

  // Sub-form for adding an attribute
  const [showAddAttrForm, setShowAddAttrForm] = useState(false);
  const [newAttrLabel, setNewAttrLabel] = useState("");
  const [newAttrType, setNewAttrType] = useState<"TEXT" | "NUMBER" | "DATE" | "SELECT">("TEXT");
  const [newAttrOptions, setNewAttrOptions] = useState("");
  const [newAttrAppliesTo, setNewAttrAppliesTo] = useState<"INBOUND" | "OUTBOUND" | "BOTH" | "PRODUCT">("INBOUND");
  const [newAttrRequired, setNewAttrRequired] = useState(false);
  const [attrError, setAttrError] = useState<string | null>(null);

  // Custom unit input state
  const [showCustomUnitInput, setShowCustomUnitInput] = useState(false);
  const [customUnitName, setCustomUnitName] = useState("");
  const [customUnitError, setCustomUnitError] = useState<string | null>(null);

  // Queries
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", "catalog", search],
    queryFn: () =>
      apiRequest<Product[]>(
        `/api/v1/products?include_inactive=true&limit=200${
          search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ""
        }`
      ),
  });

  const { data: units = [] } = useQuery({
    queryKey: ["constructor", "units"],
    queryFn: () => apiRequest<UnitOfMeasure[]>("/api/v1/constructor/units"),
  });

  const handleOpenCreateModal = () => {
    setEditingProduct(null);
    setBarcode("");
    setName("");
    setInitialStock("0");
    setBaseUnitId(units[0]?.id ?? "");
    setIsActive(true);
    setConfiguredAttrs([]);
    setProductCardValues({});
    setFormError(null);
    setShowAddAttrForm(false);
    setShowCustomUnitInput(false);
    setCustomUnitName("");
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
    setModalOpen(true);
  };

  const handleOpenEditModal = (prod: Product) => {
    setEditingProduct(prod);
    setBarcode(prod.barcode);
    setName(prod.name);
    setBaseUnitId(prod.base_unit_id);
    setIsActive(prod.is_active);
    setConfiguredAttrs(prod.configured_attributes || []);
    setProductCardValues(prod.custom_attributes || {});
    setFormError(null);
    setShowAddAttrForm(false);
    setShowCustomUnitInput(false);
    setCustomUnitName("");
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
    setModalOpen(true);
  };

  // Add custom unit of measure mutation
  const createUnitMutation = useMutation({
    mutationFn: async (unitName: string) => {
      const code = `u_${Date.now()}`;
      return apiRequest<UnitOfMeasure>("/api/v1/constructor/units", {
        method: "POST",
        body: JSON.stringify({
          code,
          name: unitName.trim(),
          plural_name: unitName.trim(),
          is_active: true,
        }),
      });
    },
    onSuccess: (newUnit) => {
      queryClient.invalidateQueries({ queryKey: ["constructor", "units"] });
      setBaseUnitId(newUnit.id);
      setShowCustomUnitInput(false);
      setCustomUnitName("");
      setCustomUnitError(null);
    },
    onError: (err) => {
      setCustomUnitError(
        err instanceof ApiError ? err.message : "Ошибка создания единицы"
      );
    },
  });

  const handleSaveCustomUnit = () => {
    if (!customUnitName.trim()) {
      setCustomUnitError("Введите название единицы измерения");
      return;
    }
    createUnitMutation.mutate(customUnitName.trim());
  };

  // Add Attribute to configured list
  const handleAddAttribute = () => {
    setAttrError(null);
    if (!newAttrLabel.trim()) {
      setAttrError("Укажите название атрибута");
      return;
    }

    const key = `attr_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const options =
      newAttrType === "SELECT"
        ? newAttrOptions
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    if (newAttrType === "SELECT" && options.length === 0) {
      setAttrError("Укажите варианты списка через запятую");
      return;
    }

    const newAttr: ConfiguredAttribute = {
      id: key,
      key,
      label: newAttrLabel.trim(),
      field_type: newAttrType,
      options,
      applies_to: newAttrAppliesTo,
      is_required: newAttrRequired,
    };

    setConfiguredAttrs((prev) => [...prev, newAttr]);
    setNewAttrLabel("");
    setNewAttrType("TEXT");
    setNewAttrOptions("");
    setNewAttrAppliesTo("INBOUND");
    setNewAttrRequired(false);
    setShowAddAttrForm(false);
  };

  const handleRemoveAttribute = (attrId: string) => {
    setConfiguredAttrs((prev) => prev.filter((a) => a.id !== attrId && a.key !== attrId));
  };

  // Product Save Mutation
  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (editingProduct) {
        return apiRequest<Product>(`/api/v1/products/${editingProduct.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      return apiRequest<Product>("/api/v1/products", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setModalOpen(false);
    },
    onError: (err) => {
      setFormError(
        err instanceof ApiError ? err.message : "Ошибка сохранения товара"
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (productId: string) => {
      return apiRequest(`/api/v1/products/${productId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const handleGenerateBarcode = () => {
    const rnd = Math.floor(100000 + Math.random() * 899999);
    setBarcode(`487000${rnd}`);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!barcode.trim()) {
      setFormError("Укажите штрихкод товара");
      return;
    }
    if (!name.trim()) {
      setFormError("Укажите наименование товара");
      return;
    }

    const payload: Record<string, unknown> = {
      barcode: barcode.trim(),
      name: name.trim(),
      base_unit_id: baseUnitId || units[0]?.id,
      configured_attributes: configuredAttrs,
      custom_attributes: productCardValues,
      is_active: isActive,
    };

    if (!editingProduct) {
      payload.initial_stock_base = Number(initialStock) || 0;
    }

    saveMutation.mutate(payload);
  };

  // Filtered attributes that apply to product card
  const productCardAttrs = useMemo(() => {
    return configuredAttrs.filter((a) => a.applies_to === "PRODUCT");
  }, [configuredAttrs]);

  return (
    <div className="space-y-6">
      {/* Главная карточка каталога */}
      <Card className="border-slate-200 bg-white shadow-xs">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5">
          <div>
            <CardTitle className="text-xl font-bold text-slate-900">
              Справочник товаров
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Карточки номенклатуры, базовые единицы измерения и настройка атрибутов операций
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-10 pl-9 border-slate-200 focus-visible:ring-slate-900 focus-visible:border-slate-900 text-sm"
                placeholder="Поиск по названию или коду..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button
              type="button"
              className="bg-[#7F1D1D] hover:bg-[#991B1B] text-white shadow-xs font-semibold px-4 cursor-pointer"
              onClick={handleOpenCreateModal}
            >
              <Plus className="h-4 w-4" />
              Добавить товар
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Штрихкод</TableHead>
                <TableHead>Наименование</TableHead>
                <TableHead>Остаток на складе</TableHead>
                <TableHead>Единица учета</TableHead>
                <TableHead>Настроенные атрибуты</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-slate-500">
                    Загрузка справочника товаров...
                  </TableCell>
                </TableRow>
              ) : products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-slate-500">
                    <p className="text-sm font-medium text-slate-900">
                      В справочнике пока нет товаров
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                products.map((p) => {
                  const attrs = p.configured_attributes || [];
                  return (
                    <TableRow key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      <TableCell className="font-mono-tabular font-semibold text-slate-900">
                        {p.barcode}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {p.name}
                      </TableCell>
                      <TableCell className="font-mono-tabular font-bold text-slate-900">
                        {p.stock_display}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600 font-medium">
                        {p.base_unit?.name || "шт"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {attrs.map((attr) => (
                            <span
                              key={attr.key || attr.id}
                              className="inline-flex items-center gap-1 rounded bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs text-slate-700"
                            >
                              <span>{attr.label}</span>
                              <span className="text-[10px] text-slate-400">
                                ({APPLIES_TO_LABELS[attr.applies_to] || attr.applies_to})
                              </span>
                            </span>
                          ))}
                          {attrs.length === 0 && (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.is_active ? "inbound" : "default"}>
                          {p.is_active ? "Активен" : "Скрыт"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditModal(p)}
                            title="Редактировать товар"
                            className="text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            onClick={() => {
                              if (confirm(`Удалить товар «${p.name}»?`)) {
                                deleteMutation.mutate(p.id);
                              }
                            }}
                            title="Удалить товар"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ======================================================== */}
      {/* ЦЕНТРАЛЬНОЕ МОДАЛЬНОЕ ОКНО (CENTERED MODAL)              */}
      {/* ======================================================== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in-0 zoom-in-95 duration-150">
            {/* Шапка окна */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-50 text-[#7F1D1D] flex items-center justify-center">
                  <Barcode className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingProduct ? "Редактирование товара" : "Новый товар"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Укажите реквизиты номенклатуры и настройте атрибуты операций
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Тело окна */}
            <form
              id="product-modal-form"
              onSubmit={handleSaveProduct}
              className="p-6 overflow-y-auto space-y-5 flex-1"
            >
              {formError && (
                <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. Автоматический блок: Кто, Когда, Куда (Склад) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-slate-400 font-medium flex items-center gap-1">
                    <UserIcon className="h-3 w-3" />
                    Кто
                  </div>
                  <div className="font-semibold text-slate-900 mt-0.5 truncate">
                    {user?.full_name || "Администратор"}
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
                    Склад (Store)
                  </div>
                  <div className="font-semibold text-[#7F1D1D] mt-0.5 truncate">
                    {user?.store_name || "Центральный склад"}
                  </div>
                </div>
              </div>

              {/* 2. Основные реквизиты */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">
                    Штрихкод товара <span className="text-red-500">*</span>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      className="font-mono-tabular border-slate-200 focus-visible:ring-[#7F1D1D]"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      placeholder="Например: 4870001001"
                      required
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGenerateBarcode}
                      title="Сгенерировать случайный штрихкод"
                      className="shrink-0 text-xs gap-1.5 font-medium border-slate-200 hover:bg-slate-50"
                    >
                      <Wand2 className="h-3.5 w-3.5 text-slate-600" />
                      Код
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">
                    Наименование товара <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    className="border-slate-200 focus-visible:ring-[#7F1D1D]"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Например: Вода Хаёт 0.5 литров"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {!editingProduct && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-700">Начальный остаток</Label>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        className="font-mono-tabular border-slate-200 focus-visible:ring-[#7F1D1D]"
                        value={initialStock}
                        onChange={(e) => setInitialStock(e.target.value)}
                      />
                    </div>
                  )}

                  {/* Единица измерения с опцией «+ Другое (добавить свою)» */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-slate-700">
                        Единица измерения <span className="text-red-500">*</span>
                      </Label>
                      {!showCustomUnitInput && (
                        <button
                          type="button"
                          onClick={() => setShowCustomUnitInput(true)}
                          className="text-[11px] font-semibold text-[#7F1D1D] hover:underline cursor-pointer"
                        >
                          + Своя единица
                        </button>
                      )}
                    </div>

                    {!showCustomUnitInput ? (
                      <Select
                        value={baseUnitId || (units[0]?.id ?? "")}
                        onValueChange={(val) => {
                          if (val === "__ADD_NEW_UNIT__") {
                            setShowCustomUnitInput(true);
                          } else {
                            setBaseUnitId(val);
                          }
                        }}
                      >
                        <SelectTrigger className="border-slate-200 focus-visible:ring-[#7F1D1D]">
                          <SelectValue placeholder="Выберите единицу..." />
                        </SelectTrigger>
                        <SelectContent>
                          {units.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name}
                            </SelectItem>
                          ))}
                          <SelectItem
                            value="__ADD_NEW_UNIT__"
                            className="text-[#7F1D1D] font-semibold border-t border-slate-100 mt-1"
                          >
                            + Другое (добавить свою единицу)...
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="space-y-2 p-2.5 rounded-lg border border-red-200 bg-red-50/50">
                        {customUnitError && (
                          <div className="text-[11px] text-red-600">{customUnitError}</div>
                        )}
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="Название (рулон, бочка, мешок)..."
                            value={customUnitName}
                            onChange={(e) => setCustomUnitName(e.target.value)}
                            className="bg-white border-slate-200 text-xs h-8"
                            autoFocus
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleSaveCustomUnit}
                            disabled={createUnitMutation.isPending}
                            className="bg-[#7F1D1D] hover:bg-[#991B1B] text-white text-xs h-8 px-3 shrink-0"
                          >
                            {createUnitMutation.isPending ? "..." : "Добавить"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setShowCustomUnitInput(false);
                              setCustomUnitError(null);
                            }}
                            className="h-8 px-2 text-slate-500"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {editingProduct && (
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                    <div>
                      <div className="text-xs font-semibold text-slate-900">
                        Статус активности товара
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Активный товар доступен для операций в терминале
                      </div>
                    </div>
                    <Switch checked={isActive} onCheckedChange={setIsActive} />
                  </div>
                )}
              </div>

              {/* 3. Атрибуты товара (для приемки/отправки) */}
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Атрибуты товара (для приемки/отправки)
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Поля, которые рабочий будет заполнять при проведении операций
                    </div>
                  </div>
                  {!showAddAttrForm && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowAddAttrForm(true);
                        setAttrError(null);
                      }}
                      className="border-[#7F1D1D] text-[#7F1D1D] hover:bg-[#FEF2F2] text-xs h-8 font-medium gap-1 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Добавить атрибут
                    </Button>
                  )}
                </div>

                {/* Sub-form: Add Attribute */}
                {showAddAttrForm && (
                  <div className="rounded-xl border border-slate-300 bg-slate-50/90 p-4 space-y-3 animate-in fade-in-0 duration-150">
                    <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-[#7F1D1D]" />
                        Конструктор атрибута товара
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAddAttrForm(false)}
                        className="text-slate-400 hover:text-slate-600 rounded p-1 hover:bg-slate-200"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {attrError && (
                      <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                        {attrError}
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label className="text-xs">
                        Название атрибута (например: Партия, Линия, Поставщик, Куда/Кому, Срок годности)
                      </Label>
                      <Input
                        value={newAttrLabel}
                        onChange={(e) => setNewAttrLabel(e.target.value)}
                        placeholder="Например: Номер партии..."
                        className="bg-white border-slate-200 text-xs h-9"
                        autoFocus
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Тип поля</Label>
                        <Select
                          value={newAttrType}
                          onValueChange={(v) => setNewAttrType(v as typeof newAttrType)}
                        >
                          <SelectTrigger className="bg-white border-slate-200 text-xs h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="TEXT">Текст (строка)</SelectItem>
                            <SelectItem value="NUMBER">Число (количество/вес)</SelectItem>
                            <SelectItem value="DATE">Дата (срок/производство)</SelectItem>
                            <SelectItem value="SELECT">Выпадающий список</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Где заполнять</Label>
                        <Select
                          value={newAttrAppliesTo}
                          onValueChange={(v) => setNewAttrAppliesTo(v as typeof newAttrAppliesTo)}
                        >
                          <SelectTrigger className="bg-white border-slate-200 text-xs h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="INBOUND">При приемке</SelectItem>
                            <SelectItem value="OUTBOUND">При отправке</SelectItem>
                            <SelectItem value="BOTH">При приемке и отправке</SelectItem>
                            <SelectItem value="PRODUCT">В карточке товара</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {newAttrType === "SELECT" && (
                      <div className="space-y-1">
                        <Label className="text-xs">
                          Варианты выбора (через запятую)
                        </Label>
                        <Input
                          value={newAttrOptions}
                          onChange={(e) => setNewAttrOptions(e.target.value)}
                          placeholder="Например: Смена 1, Смена 2, Смена 3"
                          className="bg-white border-slate-200 text-xs h-9"
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2">
                      <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                        <Switch checked={newAttrRequired} onCheckedChange={setNewAttrRequired} />
                        <span>Обязательное поле для заполнения</span>
                      </label>

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowAddAttrForm(false)}
                          className="h-8 text-xs text-slate-600"
                        >
                          Отмена
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleAddAttribute}
                          className="bg-[#7F1D1D] hover:bg-[#991B1B] text-white text-xs h-8 px-4"
                        >
                          Добавить в товар
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* List of configured attributes */}
                {configuredAttrs.length > 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 divide-y divide-slate-200/80">
                    {configuredAttrs.map((attr) => (
                      <div
                        key={attr.id || attr.key}
                        className="p-3 flex items-center justify-between text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            <span>{attr.label}</span>
                            {attr.is_required && (
                              <span className="text-red-500 font-bold">*</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500">
                            <span className="bg-slate-200/80 px-1.5 py-0.5 rounded text-slate-700">
                              {FIELD_TYPE_LABELS[attr.field_type] || attr.field_type}
                            </span>
                            <span className="bg-red-50 text-[#7F1D1D] px-1.5 py-0.5 rounded border border-red-200 font-medium">
                              {APPLIES_TO_LABELS[attr.applies_to] || attr.applies_to}
                            </span>
                            {attr.options && attr.options.length > 0 && (
                              <span className="text-slate-400">
                                ({attr.options.join(", ")})
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveAttribute(attr.id || attr.key)}
                          className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Удалить этот атрибут"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
                    У товара пока нет настроенных атрибутов для приемки или отправки.
                    Нажмите «Добавить атрибут», чтобы настроить параметры операций.
                  </div>
                )}

                {/* If there are attributes marked for "PRODUCT" (В карточке товара), render their inputs */}
                {productCardAttrs.length > 0 && (
                  <div className="space-y-3 pt-3 border-t border-slate-200">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Значения атрибутов карточки товара
                    </div>
                    <div className="space-y-2">
                      {productCardAttrs.map((attr) => (
                        <div key={attr.key || attr.id} className="space-y-1">
                          <Label className="text-xs">{attr.label}</Label>
                          {attr.field_type === "SELECT" ? (
                            <Select
                              value={String(productCardValues[attr.key] || "")}
                              onValueChange={(val) =>
                                setProductCardValues((prev) => ({ ...prev, [attr.key]: val }))
                              }
                            >
                              <SelectTrigger className="h-9 text-xs border-slate-200">
                                <SelectValue placeholder="Выберите..." />
                              </SelectTrigger>
                              <SelectContent>
                                {(attr.options || []).map((o) => (
                                  <SelectItem key={o} value={o}>
                                    {o}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              type={attr.field_type === "DATE" ? "date" : attr.field_type === "NUMBER" ? "number" : "text"}
                              value={String(productCardValues[attr.key] || "")}
                              onChange={(e) =>
                                setProductCardValues((prev) => ({ ...prev, [attr.key]: e.target.value }))
                              }
                              className="h-9 text-xs border-slate-200"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </form>

            {/* Футер окна */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                disabled={saveMutation.isPending}
                className="border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Отмена
              </Button>
              <Button
                type="submit"
                form="product-modal-form"
                disabled={saveMutation.isPending}
                className="bg-[#7F1D1D] hover:bg-[#991B1B] text-white font-semibold px-6 cursor-pointer shadow-sm"
              >
                {saveMutation.isPending ? "Сохранение..." : "Сохранить товар"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
