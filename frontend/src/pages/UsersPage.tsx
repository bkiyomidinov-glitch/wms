import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Plus, UserCog } from "lucide-react";
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
import { useAuth } from "@/lib/auth";
import { formatDushanbeDateTime, ROLE_LABELS } from "@/lib/utils";
import type { UserRead, UserRole } from "@/types/api";

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
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiRequest<UserRead[]>("/api/v1/users"),
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
    setIsActive(target.is_active);
    setError(null);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Сотрудники и иерархия доступа (RBAC)</CardTitle>
            <p className="mt-1 text-xs text-[#64748B]">
              Закрытая регистрация сотрудников внутри корпоративной иерархии
            </p>
          </div>
          {allowedRoles.length > 0 && (
            <Button type="button" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Зарегистрировать сотрудника
            </Button>
          )}
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Логин</TableHead>
                <TableHead>ФИО</TableHead>
                <TableHead>Роль</TableHead>
                <TableHead>Смена / Отдел</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Создан</TableHead>
                <TableHead className="text-right">Действие</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const canEdit = allowedRoles.includes(u.role) || actor?.id === u.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono-tabular font-semibold text-[#0284C7]">
                      {u.username}
                    </TableCell>
                    <TableCell className="font-medium">{u.full_name}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "SUPER_ADMIN" ? "blue" : "default"}>
                        {ROLE_LABELS[u.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>{u.shift_name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={u.is_active ? "inbound" : "danger"}>
                        {u.is_active ? "Активен" : "Заблокирован"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono-tabular text-[#64748B]">
                      {formatDushanbeDateTime(u.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(u)}
                        >
                          <UserCog className="h-4 w-4" />
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

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Сотрудник: ${editing.username}` : "Новый сотрудник"}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              if (editing) {
                const payload: Record<string, unknown> = {
                  full_name: fullName.trim(),
                  shift_name: shiftName.trim(),
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
                });
              }
            }}
            className="space-y-4"
          >
            {error && (
              <div className="flex items-center gap-2 rounded border border-[#FECACA] bg-[#FEF2F2] p-3 text-sm text-[#B91C1C]">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Логин (табельный номер / телефон)</Label>
              <Input
                value={username}
                disabled={Boolean(editing)}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="op_shift_b"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>ФИО сотрудника</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Алишер Саидов"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Роль в иерархии</Label>
              <Select
                value={role}
                disabled={Boolean(editing && !allowedRoles.includes(editing.role))}
                onValueChange={(v) => setRole(v as UserRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowedRoles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Смена / Подразделение</Label>
              <Input
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value)}
                placeholder="Смена А"
              />
            </div>

            <div className="space-y-1.5">
              <Label>
                {editing ? "Новый пароль (оставьте пустым чтобы не менять)" : "Пароль"}
              </Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={!editing}
                minLength={6}
              />
            </div>

            {editing && actor?.id !== editing.id && (
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <span>Учетная запись активна</span>
              </label>
            )}

            <div className="flex justify-end gap-2 border-t border-[#E2E8F0] pt-4">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                Сохранить
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
