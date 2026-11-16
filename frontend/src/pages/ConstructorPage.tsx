import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import type {
  AttributeDefinition,
  AttributeTargetType,
  FieldType,
} from "@/types/api";

const TARGET_LABELS: Record<AttributeTargetType, string> = {
  PRODUCT: "Карточка товара",
  TX_INBOUND: "Форма «Принять»",
  TX_OUTBOUND: "Форма «Отправить»",
};

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  TEXT: "Текст",
  NUMBER: "Число",
  DATE: "Дата",
  SELECT: "Выпадающий список",
  BOOLEAN: "Да / Нет",
};

export function ConstructorPage() {
  const queryClient = useQueryClient();

  const { data: attributes = [], isLoading } = useQuery({
    queryKey: ["constructor", "attributes", "all"],
    queryFn: () =>
      apiRequest<AttributeDefinition[]>(
        "/api/v1/constructor/attributes?include_inactive=true"
      ),
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAttr, setEditingAttr] = useState<AttributeDefinition | null>(null);
  const [label, setLabel] = useState("");
  const [targetType, setTargetType] = useState<AttributeTargetType>("PRODUCT");
  const [fieldType, setFieldType] = useState<FieldType>("TEXT");
  const [optionsText, setOptionsText] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (editingAttr) {
        return apiRequest(`/api/v1/constructor/attributes/${editingAttr.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      return apiRequest("/api/v1/constructor/attributes", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["constructor", "attributes"] });
      setModalOpen(false);
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : "Ошибка сохранения поля"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (attrId: string) => {
      return apiRequest(`/api/v1/constructor/attributes/${attrId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["constructor", "attributes"] });
    },
  });

  const openCreateModal = () => {
    setEditingAttr(null);
    setLabel("");
    setTargetType("PRODUCT");
    setFieldType("TEXT");
    setOptionsText("");
    setIsRequired(false);
    setIsActive(true);
    setError(null);
    setModalOpen(true);
  };

  const openEditModal = (attr: AttributeDefinition) => {
    setEditingAttr(attr);
    setLabel(attr.label);
    setTargetType(attr.target_type);
    setFieldType(attr.field_type);
    const existingOpts = attr.dictionary?.items.map((i) => i.value).join(", ") ?? "";
    setOptionsText(existingOpts);
    setIsRequired(attr.is_required);
    setIsActive(attr.is_active);
    setError(null);
    setModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setError("Укажите название поля");
      return;
    }

    const payload: Record<string, unknown> = {
      label: trimmedLabel,
      field_type: fieldType,
      is_required: isRequired,
      is_active: isActive,
    };

    if (!editingAttr) {
      payload.target_type = targetType;
    }

    if (fieldType === "SELECT") {
      const parsedOptions = optionsText
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);

      if (parsedOptions.length === 0) {
        setError("Для выпадающего списка укажите варианты значений через запятую");
        return;
      }
      payload.options = parsedOptions;
    }

    saveMutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <Card className="border-[#E5E7EB] bg-white shadow-xs">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Конструктор полей и списков</CardTitle>
            <p className="mt-1 text-xs text-[#6B7280]">
              Создание дополнительных полей для карточки товара и форм «Принять» / «Отправить»
            </p>
          </div>
          <Button
            type="button"
            className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
            onClick={openCreateModal}
          >
            <Plus className="h-4 w-4" />
            + Создать поле / список
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название поля</TableHead>
                <TableHead>Где отображается</TableHead>
                <TableHead>Тип данных</TableHead>
                <TableHead>Обязательное</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-[#6B7280]">
                    Загрузка...
                  </TableCell>
                </TableRow>
              ) : attributes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-[#6B7280]">
                    Нет созданных полей. Нажмите кнопку «+ Создать поле / список», чтобы добавить первое поле.
                  </TableCell>
                </TableRow>
              ) : (
                attributes.map((attr) => {
                  const optionsList = attr.dictionary?.items.map((i) => i.value) ?? [];
                  return (
                    <TableRow key={attr.id}>
                      <TableCell className="font-semibold text-[#111827]">
                        {attr.label}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            attr.target_type === "PRODUCT"
                              ? "default"
                              : attr.target_type === "TX_INBOUND"
                                ? "inbound"
                                : "outbound"
                          }
                        >
                          {TARGET_LABELS[attr.target_type]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">
                          {FIELD_TYPE_LABELS[attr.field_type]}
                        </span>
                        {optionsList.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1 max-w-xs">
                            {optionsList.slice(0, 4).map((opt) => (
                              <span
                                key={opt}
                                className="inline-block rounded bg-[#F3F4F6] px-1.5 py-0.5 text-xs text-[#4B5563]"
                              >
                                {opt}
                              </span>
                            ))}
                            {optionsList.length > 4 && (
                              <span className="text-xs text-[#9CA3AF]">
                                +{optionsList.length - 4}
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {attr.is_required ? (
                          <span className="text-xs font-semibold text-[#DC2626]">Да</span>
                        ) : (
                          <span className="text-xs text-[#9CA3AF]">Нет</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={attr.is_active ? "inbound" : "default"}>
                          {attr.is_active ? "Активно" : "Скрыто"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(attr)}
                            title="Изменить"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-[#9CA3AF] hover:text-[#DC2626]"
                            onClick={() => {
                              if (confirm(`Удалить поле «${attr.label}»?`)) {
                                deleteMutation.mutate(attr.id);
                              }
                            }}
                            title="Удалить"
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

      {/* Модальное окно создания / редактирования поля */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingAttr ? `Редактирование: ${editingAttr.label}` : "Новое поле / список"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded border border-[#FECACA] bg-[#FEF2F2] p-3 text-sm text-[#B91C1C]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Название поля (на русском)</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Например: Единица измерения / Тара / Номер партии"
                autoFocus
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Где показывать это поле</Label>
              <Select
                value={targetType}
                disabled={Boolean(editingAttr)}
                onValueChange={(v) => setTargetType(v as AttributeTargetType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRODUCT">В Карточке товара</SelectItem>
                  <SelectItem value="TX_INBOUND">В форме «Принять»</SelectItem>
                  <SelectItem value="TX_OUTBOUND">В форме «Отправить»</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Тип данных</Label>
              <Select
                value={fieldType}
                onValueChange={(v) => setFieldType(v as FieldType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEXT">Текст</SelectItem>
                  <SelectItem value="NUMBER">Число</SelectItem>
                  <SelectItem value="DATE">Дата</SelectItem>
                  <SelectItem value="SELECT">Выпадающий список</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {fieldType === "SELECT" && (
              <div className="space-y-1.5">
                <Label>Варианты для списка (через запятую)</Label>
                <Input
                  value={optionsText}
                  onChange={(e) => setOptionsText(e.target.value)}
                  placeholder="шт, литр, упаковка, паллета"
                  required
                />
                <p className="text-[11px] text-[#6B7280]">
                  Введите варианты через запятую. Они будут предложены в выпадающем списке.
                </p>
              </div>
            )}

            <div className="flex items-center gap-6 pt-1">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={isRequired} onCheckedChange={setIsRequired} />
                <span>Обязательное поле</span>
              </label>

              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <span>Активно</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-[#E5E7EB] pt-4">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Отмена
              </Button>
              <Button
                type="submit"
                className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
