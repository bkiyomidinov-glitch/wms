import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { DynamicAttributeFields } from "@/components/dynamic/DynamicAttributeFields";
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
import { SlideOverDrawer } from "@/components/ui/SlideOverDrawer";
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
  AttributeDefinition,
  FieldType,
  Product,
  UnitOfMeasure,
} from "@/types/api";

export function ProductsCatalogPage() {
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();

  // Search & List state
  const [search, setSearch] = useState("");

  // Slide-over Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form fields
  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [initialStock, setInitialStock] = useState("0");
  const [baseUnitId, setBaseUnitId] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [customAttrs, setCustomAttrs] = useState<Record<string, unknown>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Inline Constructor sub-form state
  const [showConstructor, setShowConstructor] = useState(false);
  const [newAttrLabel, setNewAttrLabel] = useState("");
  const [newAttrType, setNewAttrType] = useState<FieldType>("TEXT");
  const [newAttrOptions, setNewAttrOptions] = useState("");
  const [newAttrRequired, setNewAttrRequired] = useState(false);
  const [constructorError, setConstructorError] = useState<string | null>(null);
  const [constructorSuccess, setConstructorSuccess] = useState<string | null>(null);

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

  const { data: productAttrs = [] } = useQuery({
    queryKey: ["constructor", "attributes", "PRODUCT"],
    queryFn: () =>
      apiRequest<AttributeDefinition[]>(
        "/api/v1/constructor/attributes?target_type=PRODUCT"
      ),
  });

  const { data: units = [] } = useQuery({
    queryKey: ["constructor", "units"],
    queryFn: () => apiRequest<UnitOfMeasure[]>("/api/v1/constructor/units"),
  });

  // Drawer Open Handlers
  const handleOpenCreateDrawer = () => {
    setEditingProduct(null);
    setBarcode("");
    setName("");
    setInitialStock("0");
    setBaseUnitId(units[0]?.id ?? "");
    setIsActive(true);
    setCustomAttrs({});
    setFormError(null);
    setShowConstructor(false);
    resetConstructorForm();
    setDrawerOpen(true);
  };

  const handleOpenEditDrawer = (product: Product) => {
    setEditingProduct(product);
    setBarcode(product.barcode);
    setName(product.name);
    setBaseUnitId(product.base_unit_id);
    setIsActive(product.is_active);
    setCustomAttrs(product.custom_attributes ?? {});
    setFormError(null);
    setShowConstructor(false);
    resetConstructorForm();
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
  };

  const resetConstructorForm = () => {
    setNewAttrLabel("");
    setNewAttrType("TEXT");
    setNewAttrOptions("");
    setNewAttrRequired(false);
    setConstructorError(null);
    setConstructorSuccess(null);
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
      setDrawerOpen(false);
    },
    onError: (err) => {
      setFormError(
        err instanceof ApiError ? err.message : "Ошибка сохранения товара"
      );
    },
  });

  // Product Delete Mutation
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

  // Inline Attribute Create Mutation
  const createAttrMutation = useMutation({
    mutationFn: async () => {
      if (!newAttrLabel.trim()) {
        throw new Error("Укажите название характеристики / поля");
      }

      const payload: Record<string, unknown> = {
        target_type: "PRODUCT",
        label: newAttrLabel.trim(),
        field_type: newAttrType,
        is_required: newAttrRequired,
        sort_order: productAttrs.length + 1,
        is_active: true,
      };

      if (newAttrType === "SELECT") {
        const opts = newAttrOptions
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (opts.length === 0) {
          throw new Error(
            "Для выпадающего списка укажите варианты через запятую (например: ПЭТ, Стекло, Тетрапак)"
          );
        }
        payload.options = opts;
      }

      return apiRequest<AttributeDefinition>("/api/v1/constructor/attributes", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (newAttr) => {
      queryClient.invalidateQueries({
        queryKey: ["constructor", "attributes", "PRODUCT"],
      });
      setConstructorSuccess(`Поле «${newAttr.label}» создано и доступно для заполнения!`);
      setTimeout(() => setConstructorSuccess(null), 3500);
      resetConstructorForm();
      setShowConstructor(false);
    },
    onError: (err) => {
      setConstructorError(
        err instanceof Error ? err.message : "Ошибка создания характеристики"
      );
    },
  });

  // Delete Attribute Definition Mutation
  const deleteAttrMutation = useMutation({
    mutationFn: async (attrId: string) => {
      return apiRequest(`/api/v1/constructor/attributes/${attrId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["constructor", "attributes", "PRODUCT"],
      });
    },
  });

  const handleGenerateBarcode = () => {
    const rnd = Math.floor(100000 + Math.random() * 899999);
    setBarcode(`487000${rnd}`);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const payload: Record<string, unknown> = {
      barcode: barcode.trim(),
      name: name.trim(),
      custom_attributes: customAttrs,
      is_active: isActive,
    };

    if (baseUnitId) {
      payload.base_unit_id = baseUnitId;
    } else if (units[0]?.id && !editingProduct) {
      payload.base_unit_id = units[0].id;
    }

    if (!editingProduct) {
      payload.initial_stock_base = Number(initialStock) || 0;
    }

    saveMutation.mutate(payload);
  };

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
              Карточки номенклатуры, текущие остатки и управление характеристиками
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-10 pl-9 border-slate-200 focus-visible:ring-slate-900 focus-visible:border-slate-900"
                placeholder="Поиск по названию или коду..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button
              type="button"
              className="bg-slate-900 hover:bg-slate-800 text-white shadow-xs font-semibold px-4 cursor-pointer"
              onClick={handleOpenCreateDrawer}
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
                <TableHead>Характеристики</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-slate-500">
                    Загрузка справочника товаров...
                  </TableCell>
                </TableRow>
              ) : products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <p className="text-sm font-medium text-slate-900">
                        В справочнике пока нет товаров
                      </p>
                      <p className="text-xs text-slate-500">
                        Нажмите кнопку «Добавить товар», чтобы создать первую позицию
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                products.map((p) => {
                  const customAttrEntries = Object.entries(p.custom_attributes ?? {});
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
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5 max-w-sm">
                          {customAttrEntries.map(([k, v]) => (
                            <span
                              key={k}
                              className="inline-flex items-center gap-1 rounded bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs text-slate-700"
                            >
                              <span className="font-medium text-slate-500">{k}:</span>
                              <strong className="text-slate-900">
                                {typeof v === "boolean" ? (v ? "Да" : "Нет") : String(v)}
                              </strong>
                            </span>
                          ))}
                          {customAttrEntries.length === 0 && (
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
                            onClick={() => handleOpenEditDrawer(p)}
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
      {/* ПРАВАЯ ВЫЕЗЖАЮЩАЯ ПАНЕЛЬ (SLIDE-OVER DRAWER ВО ВСЮ ВЫСОТУ) */}
      {/* ======================================================== */}
      <SlideOverDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        title={editingProduct ? "Карточка товара" : "Новый товар"}
        subtitle={
          editingProduct
            ? `Редактирование: ${editingProduct.name}`
            : "Заполните реквизиты товара и управляйте характеристиками"
        }
        badge={
          <Badge variant={editingProduct ? "default" : "red"}>
            {editingProduct ? "Редактирование" : "Создание"}
          </Badge>
        }
        maxWidthClass="max-w-[560px]"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseDrawer}
              disabled={saveMutation.isPending}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              form="product-drawer-form"
              className="bg-slate-900 hover:bg-slate-800 text-white font-medium min-w-[140px] shadow-xs cursor-pointer"
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Сохранение..." : "Сохранить товар"}
            </Button>
          </>
        }
      >
        <form
          id="product-drawer-form"
          onSubmit={handleSaveProduct}
          className="space-y-6"
        >
          {formError && (
            <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* 1. Базовые реквизиты товара */}
          <div className="space-y-4">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Основные данные товара
            </div>

            <div className="space-y-1.5">
              <Label>
                Штрихкод товара <span className="text-rose-600">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  className="font-mono-tabular"
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
              <Label>
                Наименование товара <span className="text-rose-600">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Вода Хаёт 0.5 литров"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {!editingProduct && (
                <div className="space-y-1.5">
                  <Label>Начальный остаток</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    className="font-mono-tabular"
                    value={initialStock}
                    onChange={(e) => setInitialStock(e.target.value)}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Базовая единица учета</Label>
                <Select
                  value={baseUnitId || (units[0]?.id ?? "")}
                  onValueChange={setBaseUnitId}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Выберите единицу..." />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} ({u.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {editingProduct && (
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/80 p-3.5">
                <div>
                  <div className="text-sm font-medium text-slate-900">
                    Статус активности товара
                  </div>
                  <div className="text-xs text-slate-500">
                    Скрытый товар недоступен для проведения новых операций в терминале
                  </div>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            )}
          </div>

          {/* 2. Характеристики товара (Динамические поля) */}
          <div className="space-y-3 pt-3 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Характеристики номенклатуры ({productAttrs.length})
              </div>
              <span className="text-[11px] text-slate-400">
                Динамические поля
              </span>
            </div>

            {productAttrs.length > 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-4">
                <DynamicAttributeFields
                  definitions={productAttrs}
                  values={customAttrs}
                  onChange={(k, v) =>
                    setCustomAttrs((prev) => ({ ...prev, [k]: v }))
                  }
                />

                {/* Удаление характеристик из системы директором / админом */}
                {hasRole("DIRECTOR", "SUPER_ADMIN") && (
                  <div className="pt-3 border-t border-slate-200/80">
                    <div className="text-[11px] text-slate-500 mb-2 font-medium">
                      Управление полями номенклатуры (удаление из системы):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {productAttrs.map((attr) => (
                        <span
                          key={attr.id}
                          className="inline-flex items-center gap-1 rounded bg-white border border-slate-200 px-2 py-1 text-xs text-slate-700 shadow-2xs"
                        >
                          <span>{attr.label}</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                confirm(
                                  `Удалить характеристику «${attr.label}» из справочника всех товаров?`
                                )
                              ) {
                                deleteAttrMutation.mutate(attr.id);
                              }
                            }}
                            className="text-slate-400 hover:text-rose-600 ml-1 cursor-pointer transition-colors"
                            title="Удалить это поле"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4 text-center">
                <p className="text-xs text-slate-500">
                  У товаров пока нет настроенных характеристик. Вы можете создать любое
                  поле прямо сейчас.
                </p>
              </div>
            )}
          </div>

          {/* 3. Встроенный Конструктор новых полей */}
          <div className="pt-3 border-t border-slate-200">
            {constructorSuccess && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 animate-page-enter">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{constructorSuccess}</span>
              </div>
            )}

            {!showConstructor ? (
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 border-dashed border-slate-300 hover:border-slate-400 text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2 text-sm font-medium transition-colors cursor-pointer"
                onClick={() => {
                  resetConstructorForm();
                  setShowConstructor(true);
                }}
              >
                <Plus className="h-4 w-4 text-slate-500" />
                + Добавить своё поле / выпадающий список для товара
              </Button>
            ) : (
              <div className="rounded-xl border border-slate-300 bg-slate-50/80 p-4 space-y-4 animate-page-enter">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Sparkles className="h-4 w-4 text-slate-700" />
                    Конструктор нового поля товара
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowConstructor(false)}
                    className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {constructorError && (
                  <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-white p-2.5 text-xs text-rose-700">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{constructorError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs">Название поля (на русском)</Label>
                  <Input
                    className="h-10 text-sm bg-white border-slate-200"
                    value={newAttrLabel}
                    onChange={(e) => setNewAttrLabel(e.target.value)}
                    placeholder="Например: Цвет, Тара, Срок годности, Категория..."
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Тип значения</Label>
                  <Select
                    value={newAttrType}
                    onValueChange={(v) => setNewAttrType(v as FieldType)}
                  >
                    <SelectTrigger className="h-10 text-sm bg-white border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TEXT">Текст (строка)</SelectItem>
                      <SelectItem value="NUMBER">Число (вес / объем / штуки)</SelectItem>
                      <SelectItem value="SELECT">Выпадающий список с вариантами</SelectItem>
                      <SelectItem value="DATE">Дата (срок годности / дата пр-ва)</SelectItem>
                      <SelectItem value="BOOLEAN">Да / Нет (переключатель)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {newAttrType === "SELECT" && (
                  <div className="space-y-1.5 animate-page-enter">
                    <Label className="text-xs">
                      Варианты списка (через запятую)
                    </Label>
                    <Input
                      className="h-10 text-sm bg-white border-slate-200"
                      value={newAttrOptions}
                      onChange={(e) => setNewAttrOptions(e.target.value)}
                      placeholder="Например: ПЭТ, Стекло, Тетрапак или шт, литр, упаковка"
                    />
                    <p className="text-[11px] text-slate-500">
                      Разделяйте варианты запятыми — система сама создаст список
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <Switch
                      checked={newAttrRequired}
                      onCheckedChange={setNewAttrRequired}
                    />
                    <span>Обязательное поле для заполнения</span>
                  </label>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowConstructor(false)}
                      className="h-8 text-xs text-slate-600"
                    >
                      Отмена
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 px-4 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white"
                      disabled={createAttrMutation.isPending || !newAttrLabel.trim()}
                      onClick={() => createAttrMutation.mutate()}
                    >
                      {createAttrMutation.isPending ? "Создание..." : "Создать поле"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </form>
      </SlideOverDrawer>
    </div>
  );
}
