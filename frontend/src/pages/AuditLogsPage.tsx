import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/api";
import { formatDushanbeDateTime } from "@/lib/utils";
import type { AuditLog } from "@/types/api";

export function AuditLogsPage() {
  const [actionFilter, setActionFilter] = useState("");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit-logs", actionFilter],
    queryFn: () =>
      apiRequest<AuditLog[]>(
        `/api/v1/audit-logs?limit=150${
          actionFilter.trim()
            ? `&action=${encodeURIComponent(actionFilter.trim())}`
            : ""
        }`
      ),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Журнал аудита безопасности</CardTitle>
            <p className="mt-1 text-xs text-[#64748B]">
              Неизменяемая история всех критических событий, изменений справочников и операций со складом
            </p>
          </div>
          <Input
            className="h-10 w-64 font-mono-tabular"
            placeholder="Фильтр по action (напр. USER_LOGIN)"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Время (UTC+5)</TableHead>
                <TableHead>Пользователь</TableHead>
                <TableHead>Действие</TableHead>
                <TableHead>Сущность</TableHead>
                <TableHead>IP-адрес</TableHead>
                <TableHead>Данные (JSONB)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-[#64748B]">
                    Загрузка аудита...
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs font-mono-tabular text-[#475569]">
                      {formatDushanbeDateTime(log.created_at)}
                    </TableCell>
                    <TableCell>
                      {log.user ? (
                        <div>
                          <div className="font-medium">{log.user.full_name}</div>
                          <div className="text-xs text-[#64748B] font-mono-tabular">
                            {log.user.username} ({log.user.role})
                          </div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="blue" className="font-mono-tabular">
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono-tabular text-xs">
                      {log.entity}
                      {log.entity_id && (
                        <span className="block text-[#64748B] truncate max-w-[140px]">
                          {log.entity_id}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono-tabular text-xs text-[#64748B]">
                      {log.ip_address ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <pre className="max-h-24 overflow-auto rounded border border-[#E2E8F0] bg-[#F8FAFC] p-2 text-[11px] font-mono-tabular text-[#334155]">
                        {JSON.stringify(
                          {
                            ...(log.old_value ? { old: log.old_value } : {}),
                            ...(log.new_value ? { new: log.new_value } : {}),
                            ...(Object.keys(log.payload ?? {}).length > 0
                              ? { meta: log.payload }
                              : {}),
                          },
                          null,
                          2
                        )}
                      </pre>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
