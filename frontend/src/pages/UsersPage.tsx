import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Building2,
  CheckSquare,
  Plus,
  ShieldCheck,
  Square,
  UserCog,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { cn, formatDushanbeDateTime, ROLE_LABELS } from "@/lib/utils";
import type { Store, UserRead, UserRole } from "@/types/api";

const PERMISSION_ITEMS: { key: string; label: string; desc: string }[] = [
  { key: "can_inbound", label: "Приемка товаров", desc: "Проведение прихода (INBOUND)" },
  { key: "can_outbound", label: "Отгрузка / Списание", desc: "Проведение расхода (OUTBOUND)" },
  { key: "can_view_stock", label: "Просмотр остатков", desc: "Доступ к вкладке «Склады»" },
  { key: "can_view_movements", label: "Просмотр движений", desc: "Доступ к вкладке «Движение»" },
  { key: "can_manage_products", label: "Каталог товаров", desc: "Управление справочником товаров" },
  { key: "can_manage_stores", label: "Склады компании", desc: "Создание и редактирование складов" },
  { key: "can_manage_users", label: "Сотрудники и права", desc: "Управление пользователями и RBAC" },
];

const PRESETS: Record<string, { label: string; perms: Record<string, boolean> }> = {
  ADMIN: {
    label: "Администратор",
    perms: {
      can_inbound: true,
      can_outbound: true,
      can_view_stock: true,
      can_view_movements: true,
      can_manage_products: true,
      can_manage_stores: true,
      can_manage_users: true,
    },
  },
  MANAGER: {
    label: "Менеджер",
    perms: {
      can_inbound: true,
      can_outbound: true,
      can_view_stock: true,
      can_view_movements: true,
      can_manage_products: true,
      can_manage_stores: false,
      can_manage_users: false,
    },
  },
  STOREKEEPER: {
    label: "Кладовщик",
    perms: {
      can_inbound: true,
      can_outbound: true,
      can_view_stock: true,
      can_view_movements: true,
      can_manage_products: false,
      can_manage_stores: false,
      can_manage_users: false,
    },
  },
  RECEIVER: {
    label: "Приемщик",
    perms: {
      can_inbound: true,
      can_outbound: false,
      can_view_stock: true,
      can_view_movements: false,
      can_manage_products: false,
      can_manage_stores: false,
      can_manage_users: false,
    },
  },
  VIEWER: {
    label: "Наблюдатель",
    perms: {
      can_inbound: false,
      can_outbound: false,
      can_view_stock: true,
      can_view_movements: true,
      can_manage_products: false,
      can_manage_stores: false,
      can_manage_users: false,
    },
  },
};

export function UsersPage() {
  const { user: actor } = useAuth();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserRead | null>(null);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("OPERATOR");
  const [shiftName, setShiftName] = useState("");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({
    can_inbound: true,
    can_outbound: true,
    can_view_stock: true,
    can_view_movements: true,
    can_manage_products: false,
    can_manage_stores: false,
    can_manage_users: false,
  });
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiRequest<UserRead[]>("/api/v1/users"),
  });

  const { data: stores = [] } = useQuery({
    queryKey: ["stores", "list"],
    queryFn: () => apiRequest<Store[]>("/api/v1/stores"),
  });

  const allowedRoles = useMemo<UserRole[]>(() => {
    if (!actor) return [];
    if (actor.role === "SUPER_ADMIN") {
      return ["OPERATOR", "MANAGER", "DIRECTOR", "SUPER_ADMIN"];
    }
    if (actor.role === "DIRECTOR") {
      return ["OPERATOR", "MANAGER"];
    }
    if (actor.role === "MANAGER") {
      return ["OPERATOR"];
    }
    return [];
  }, [actor]);

  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (editing) {
        return apiRequest<UserRead>(`/api/v1/users/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      return apiRequest<UserRead>("/api/v1/users", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setModalOpen(false);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Ошибка сохранения"),
  });

  const openCreate = () => {
    setEditing(null);
    setUsername("");
    setFullName("");
    setPassword("");
    setRole("OPERATOR");
    setShiftName("Смена А");
    setSelectedStoreIds(stores[0] ? [stores[0].id] : []);
    setPermissions(PRESETS.STOREKEEPER.perms);
    setIsActive(true);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (target: UserRead) => {
    setEditing(target);
    setUsername(target.username);
    setFullName(target.full_name);
    setPassword("");
    setRole(target.role);
    setShiftName(target.shift_name ?? "");

    // Populate assigned stores
    const ids = target.store_ids && target.store_ids.length > 0
      ? target.store_ids
      : target.stores && target.stores.length > 0
        ? target.stores.map((s) => s.id)
        : target.store_id
          ? [target.store_id]
          : [];
    setSelectedStoreIds(ids);

    // Populate permissions
    if (target.permissions && Object.keys(target.permissions).length > 0) {
      setPermissions({ ...target.permissions });
    } else if (target.role === "SUPER_ADMIN") {
      setPermissions(PRESETS.ADMIN.perms);
    } else if (target.role === "MANAGER") {
      setPermissions(PRESETS.MANAGER.perms);
    } else {
      setPermissions(PRESETS.STOREKEEPER.perms);
    }

    setIsActive(target.is_active);
    setError(null);
    setModalOpen(true);
  };

  const toggleStore = (id: string) => {
    setSelectedStoreIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAllStores = () => {
    if (selectedStoreIds.length === stores.length) {
      setSelectedStoreIds([]);
    } else {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  };

  const setPermission = (key: string, val: boolean) => {
    setPermissions((prev) => ({ ...prev, [key]: val }));
  };

  const applyPreset = (presetKey: string) => {
    const p = PRESETS[presetKey];
    if (p) {
      setPermissions({ ...p.perms });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <CardTitle className="text-base font-semibold text-slate-900">
              Сотрудники и матрица прав доступа (RBAC)
            </CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              Назначение складов и детальных прав (приход, отгрузка, остатки, движения, справочники)
            </p>
          </div>
          {allowedRoles.length > 0 && (
            <Button
              type="button"
              onClick={openCreate}
              className="bg-[#8B1D1D] hover:bg-[#701717] text-white shadow-xs cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Добавить сотрудника
            </Button>
          )}
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                <TableHead className="font-semibold text-xs text-slate-700">Логин</TableHead>
                <TableHead className="font-semibold text-xs text-slate-700">ФИО</TableHead>
                <TableHead className="font-semibold text-xs text-slate-700">Роль</TableHead>
                <TableHead className="font-semibold text-xs text-slate-700">Склады (Stores)</TableHead>
                <TableHead className="font-semibold text-xs text-slate-700">Права доступа</TableHead>
                <TableHead className="font-semibold text-xs text-slate-700">Смена</TableHead>
                <TableHead className="font-semibold text-xs text-slate-700">Статус</TableHead>
                <TableHead className="font-semibold text-xs text-slate-700">Создан</TableHead>
                <TableHead className="text-right font-semibold text-xs text-slate-700">Действие</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const canEdit = allowedRoles.includes(u.role) || actor?.id === u.id;
                const assignedStores = u.stores && u.stores.length > 0
                  ? u.stores
                  : u.store
                    ? [u.store]
                    : [];

                return (
                  <TableRow key={u.id} className="hover:bg-slate-50/50">
                    <TableCell className="font-mono text-xs font-semibold text-[#8B1D1D]">
                      {u.username}
                    </TableCell>
                    <TableCell className="font-medium text-slate-900 text-xs">
                      {u.full_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.role === "SUPER_ADMIN" ? "blue" : "default"} className="text-[11px]">
                        {ROLE_LABELS[u.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {assignedStores.length > 0 ? (
                        <div className="flex items-center gap-1.5 flex-wrap max-w-xs">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-800 border border-slate-200">
                            <Building2 className="h-3 w-3 text-slate-500" />
                            {assignedStores[0].name}
                          </span>
                          {assignedStores.length > 1 && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-[#FEF2F2] text-[#8B1D1D] border border-red-100 cursor-help"
                              title={assignedStores.map((s) => s.name).join(", ")}
                            >
                              +{assignedStores.length - 1}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const p = u.permissions || {};
                        const all =
                          p.can_inbound &&
                          p.can_outbound &&
                          p.can_view_stock &&
                          p.can_view_movements &&
                          p.can_manage_products &&
                          p.can_manage_stores &&
                          p.can_manage_users;
                        if (all || u.role === "SUPER_ADMIN") {
                          return (
                            <Badge variant="blue" className="text-[10px]">
                              Полный доступ
                            </Badge>
                          );
                        }
                        if (p.can_inbound && p.can_outbound) {
                          return (
                            <Badge variant="default" className="text-[10px] bg-slate-100 text-slate-700 border-slate-200">
                              Приход / Отправка
                            </Badge>
                          );
                        }
                        if (p.can_inbound) {
                          return (
                            <Badge variant="inbound" className="text-[10px]">
                              Только приход
                            </Badge>
                          );
                        }
                        if (p.can_outbound) {
                          return (
                            <Badge variant="danger" className="text-[10px]">
                              Только отправка
                            </Badge>
                          );
                        }
                        if (p.can_view_stock) {
                          return (
                            <Badge variant="default" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                              Только остатки
                            </Badge>
                          );
                        }
                        return <span className="text-xs text-slate-400">Ограничен</span>;
                      })()}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{u.shift_name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={u.is_active ? "inbound" : "danger"} className="text-[10px]">
                        {u.is_active ? "Активен" : "Заблокирован"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-slate-500">
                      {formatDushanbeDateTime(u.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(u)}
                          className="h-7 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                        >
                          <UserCog className="h-3.5 w-3.5" />
                          Изменить
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Модальное окно редактирования/создания сотрудника */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#8B1D1D]" />
              {editing ? `Редактирование: ${editing.username}` : "Новый сотрудник"}
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              if (selectedStoreIds.length === 0) {
                setError("Выберите хотя бы один склад для сотрудника");
                return;
              }

              if (editing) {
                const payload: Record<string, unknown> = {
                  full_name: fullName.trim(),
                  shift_name: shiftName.trim(),
                  store_id: selectedStoreIds[0] || null,
                  store_ids: selectedStoreIds,
                  permissions,
                  is_active: isActive,
                };
                if (allowedRoles.includes(role)) payload.role = role;
                if (password.trim()) payload.password = password;
                mutation.mutate(payload);
              } else {
                mutation.mutate({
                  username: username.trim(),
                  full_name: fullName.trim(),
                  password,
                  role,
                  shift_name: shiftName.trim() || null,
                  store_id: selectedStoreIds[0] || null,
                  store_ids: selectedStoreIds,
                  permissions,
                });
              }
            }}
            className="space-y-4 pt-1"
          >
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-slate-700">Логин (табельный номер)</Label>
                <Input
                  value={username}
                  disabled={Boolean(editing)}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="op_shift_b"
                  required
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-slate-700">ФИО сотрудника</Label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Алишер Саидов"
                  required
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-slate-700">Роль в иерархии</Label>
                <Select
                  value={role}
                  disabled={Boolean(editing && !allowedRoles.includes(editing.role))}
                  onValueChange={(v) => {
                    const r = v as UserRole;
                    setRole(r);
                    if (!editing) {
                      if (r === "SUPER_ADMIN") applyPreset("ADMIN");
                      else if (r === "DIRECTOR" || r === "MANAGER") applyPreset("MANAGER");
                      else applyPreset("STOREKEEPER");
                    }
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedRoles.map((r) => (
                      <SelectItem key={r} value={r} className="text-xs">
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-slate-700">Смена / Подразделение</Label>
                <Input
                  value={shiftName}
                  onChange={(e) => setShiftName(e.target.value)}
                  placeholder="Смена А"
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium text-slate-700">
                {editing ? "Новый пароль (оставьте пустым чтобы не менять)" : "Пароль"}
              </Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={!editing}
                minLength={6}
                placeholder={editing ? "••••••••" : "Минимум 6 символов"}
                className="h-9 text-xs"
              />
            </div>

            {/* 1. Блок мульти-выбора складов */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-[#8B1D1D]" />
                    Привязка к складам
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Выбрано: {selectedStoreIds.length} из {stores.length}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleAllStores}
                  className="text-xs font-medium text-[#8B1D1D] hover:underline cursor-pointer flex items-center gap-1"
                >
                  {selectedStoreIds.length === stores.length ? (
                    <>
                      <Square className="h-3.5 w-3.5" />
                      Снять все
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-3.5 w-3.5" />
                      Выбрать все склады
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1 bg-white rounded-lg border border-slate-200">
                {stores.map((s) => {
                  const checked = selectedStoreIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className={cn(
                        "flex items-center gap-2 p-1.5 rounded-md text-xs cursor-pointer transition-colors border select-none",
                        checked
                          ? "bg-red-50/60 border-red-200 text-slate-900 font-medium"
                          : "border-transparent hover:bg-slate-50 text-slate-600"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleStore(s.id)}
                        className="data-[state=checked]:bg-[#8B1D1D] data-[state=checked]:border-[#8B1D1D]"
                      />
                      <span className="truncate">{s.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 2. Матрица прав доступа (RBAC Matrix) */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#8B1D1D]" />
                    Матрица прав доступа (Permissions)
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Быстрые шаблоны ролей:
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-wrap">
                  {Object.entries(PRESETS).map(([k, p]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => applyPreset(k)}
                      className="px-2 py-0.5 rounded text-[10px] font-medium bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 transition-colors cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 bg-white p-2.5 rounded-lg border border-slate-200">
                {PERMISSION_ITEMS.map((item) => {
                  const checked = Boolean(permissions[item.key]);
                  return (
                    <label
                      key={item.key}
                      className="flex items-center justify-between p-1.5 rounded-md hover:bg-slate-50 text-xs cursor-pointer transition-colors"
                    >
                      <div>
                        <div className="font-medium text-slate-800">{item.label}</div>
                        <div className="text-[10px] text-slate-400">{item.desc}</div>
                      </div>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(val) => setPermission(item.key, Boolean(val))}
                        className="data-[state=checked]:bg-[#8B1D1D] data-[state=checked]:border-[#8B1D1D]"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            {editing && actor?.id !== editing.id && (
              <label className="inline-flex items-center gap-2 text-xs cursor-pointer text-slate-700">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <span>Учетная запись активна</span>
              </label>
            )}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalOpen(false)}
                className="cursor-pointer border-slate-200 text-xs"
              >
                Отмена
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={mutation.isPending}
                className="bg-[#8B1D1D] hover:bg-[#701717] text-white shadow-xs cursor-pointer text-xs"
              >
                {mutation.isPending ? "Сохранение..." : "Сохранить сотрудника"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
