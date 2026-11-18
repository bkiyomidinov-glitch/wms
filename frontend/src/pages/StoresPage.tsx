import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Building2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
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
import type { Store } from "@/types/api";

export function StoresPage() {
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ["stores", "list"],
    queryFn: () => apiRequest<Store[]>("/api/v1/stores?include_inactive=true"),
  });

  const handleOpenCreateModal = () => {
    setEditingStore(null);
    setName("");
    setCode("");
    setAddress("");
    setIsActive(true);
    setFormError(null);
    setModalOpen(true);
  };

  const handleOpenEditModal = (store: Store) => {
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
      queryClient.invalidateQueries({ queryKey: ["store-movements"] });
      queryClient.invalidateQueries({ queryKey: ["my-history"] });
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
      queryClient.invalidateQueries({ queryKey: ["store-movements"] });
      queryClient.invalidateQueries({ queryKey: ["my-history"] });
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

  const canManage = hasRole("MANAGER", "DIRECTOR", "SUPER_ADMIN");

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[#8B1D1D]" strokeWidth={1.5} />
            Склады
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Актуальный справочник складов и точек хранения компании
          </p>
        </div>

        {canManage && (
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

      {/* Clean Directory Table */}
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-200/80">
                <TableHead className="w-[120px] text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Код
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Наименование склада
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Адрес / Локация
                </TableHead>
                <TableHead className="w-[130px] text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Статус
                </TableHead>
                {canManage && (
                  <TableHead className="w-[110px] text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Действия
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 5 : 4} className="text-center py-12 text-xs text-slate-400">
                    Загрузка справочника складов...
                  </TableCell>
                </TableRow>
              ) : stores.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 5 : 4} className="text-center py-12 text-xs text-slate-500">
                    <Building2 className="mx-auto h-7 w-7 text-slate-300 mb-2" strokeWidth={1.5} />
                    Склады ещё не добавлены
                  </TableCell>
                </TableRow>
              ) : (
                stores.map((store) => (
                  <TableRow
                    key={store.id}
                    className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors"
                  >
                    <TableCell className="font-mono text-xs font-semibold text-slate-600">
                      <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200/80">
                        {store.code || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm font-semibold text-slate-900">
                      {store.name}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" strokeWidth={1.5} />
                        <span>{store.address || "Не указан"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {store.is_active ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Активен
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          Отключен
                        </span>
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(store)}
                            className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                            title="Редактировать склад"
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                          </button>
                          {store.is_active && (
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Деактивировать склад «${store.name}»?`)) {
                                  deleteMutation.mutate(store.id);
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-[#8B1D1D] hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                              title="Удалить / деактивировать склад"
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Centered Modal: Create / Edit Store */}
      {modalOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in-0 zoom-in-95 duration-150">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-red-50 text-[#8B1D1D] flex items-center justify-center">
                    <Building2 className="h-4 w-4" strokeWidth={1.5} />
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
