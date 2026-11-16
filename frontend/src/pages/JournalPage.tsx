import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/api";
import { formatDushanbeDateTime, formatQty } from "@/lib/utils";
import type { AnalyticsSummary, InventoryTransaction } from "@/types/api";

export function JournalPage() {
  const [search, setSearch] = useState("");
  const [txTypeFilter, setTxTypeFilter] = useState<string>("ALL");

  const { data: analytics } = useQuery({
    queryKey: ["analytics"],
    queryFn: () => apiRequest<AnalyticsSummary>("/api/v1/transactions/analytics/summary"),
  });

  const queryParams = new URLSearchParams({ limit: "200" });
  if (txTypeFilter !== "ALL") queryParams.set("tx_type", txTypeFilter);
  if (search.trim()) queryParams.set("search", search.trim());

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions", "journal", txTypeFilter, search],
    queryFn: () =>
      apiRequest<InventoryTransaction[]>(`/api/v1/transactions?${queryParams.toString()}`),
  });

  const exportCsv = () => {
    const header = [
      "Дата (Душанбе)",
      "Тип",
      "Штрихкод",
      "Товар",
      "Введено",
      "ЕИ",
      "В базовой ЕИ",
      "Остаток до",
      "Остаток после",
      "Контрагент",
      "Исполнитель",
      "Атрибуты",
      "Примечание",
    ];
    const rows = transactions.map((tx) => [
      formatDushanbeDateTime(tx.performed_at),
      tx.tx_type,
      tx.product.barcode,
      tx.product.name,
      tx.quantity_entered,
      tx.unit.name,
      tx.quantity_base_calculated,
      tx.stock_before_base,
      tx.stock_after_base,
      tx.counterparty_name,
      tx.performed_by.full_name,
      JSON.stringify(tx.custom_attributes),
      tx.notes ?? "",
    ]);

    const csvContent =
      "\uFEFF" +
      [header, ...rows]
        .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
        .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `wms-journal-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {analytics && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                Активных товаров
              </div>
              <div className="mt-1 text-2xl font-bold font-mono-tabular">
                {analytics.total_active_products}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                Нулевой остаток
              </div>
              <div className="mt-1 text-2xl font-bold font-mono-tabular text-[#DC2626]">
                {analytics.zero_stock_products}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                Приход сегодня
              </div>
              <div className="mt-1 text-2xl font-bold font-mono-tabular text-[#16A34A]">
                {analytics.inbound_today_count}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                Расход сегодня
              </div>
              <div className="mt-1 text-2xl font-bold font-mono-tabular text-[#D97706]">
                {analytics.outbound_today_count}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Журнал движений склада</CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
              <Input
                className="h-10 pl-9"
                placeholder="Товар, код, контрагент..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={txTypeFilter} onValueChange={setTxTypeFilter}>
              <SelectTrigger className="h-10 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Все операции</SelectItem>
                <SelectItem value="INBOUND">Приход (Принять)</SelectItem>
                <SelectItem value="OUTBOUND">Расход (Отправить)</SelectItem>
                <SelectItem value="ADJUSTMENT">Корректировки</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="default" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              Экспорт CSV
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Когда (UTC+5)</TableHead>
                <TableHead>Операция</TableHead>
                <TableHead>Товар</TableHead>
                <TableHead>Количество</TableHead>
                <TableHead>Остаток (До → После)</TableHead>
                <TableHead>Контрагент</TableHead>
                <TableHead>Исполнитель</TableHead>
                <TableHead>Доп. атрибуты</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-[#64748B]">
                    Загрузка журнала...
                  </TableCell>
                </TableRow>
              ) : transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-[#64748B]">
                    Записи не найдены
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((tx) => {
                  const attrEntries = Object.entries(tx.custom_attributes ?? {});
                  return (
                    <TableRow key={tx.id}>
                      <TableCell className="whitespace-nowrap text-xs font-mono-tabular text-[#475569]">
                        {formatDushanbeDateTime(tx.performed_at)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            tx.tx_type === "INBOUND"
                              ? "inbound"
                              : tx.tx_type === "OUTBOUND"
                                ? "outbound"
                                : "blue"
                          }
                        >
                          {tx.tx_type === "INBOUND"
                            ? "ПРИХОД"
                            : tx.tx_type === "OUTBOUND"
                              ? "РАСХОД"
                              : "КОРР."}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{tx.product.name}</div>
                        <div className="text-xs text-[#64748B] font-mono-tabular">
                          {tx.product.barcode}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono-tabular whitespace-nowrap">
                        <div className="font-semibold">
                          {formatQty(tx.quantity_entered)} {tx.unit.name}
                        </div>
                        {tx.unit_id !== tx.product.base_unit.id && (
                          <div className="text-xs text-[#64748B]">
                            = {formatQty(tx.quantity_base_calculated)}{" "}
                            {tx.product.base_unit.name}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono-tabular text-xs whitespace-nowrap">
                        {formatQty(tx.stock_before_base)} →{" "}
                        <span className="font-bold text-[#0F172A]">
                          {formatQty(tx.stock_after_base)}
                        </span>{" "}
                        {tx.product.base_unit.name}
                      </TableCell>
                      <TableCell>{tx.counterparty_name}</TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">
                          {tx.performed_by.full_name}
                        </div>
                        <div className="text-xs text-[#64748B]">
                          {tx.performed_by.shift_name ?? tx.performed_by.username}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[280px]">
                        <div className="flex flex-wrap gap-1">
                          {attrEntries.map(([k, v]) => (
                            <span
                              key={k}
                              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"
                            >
                              <span className="text-slate-400">{k}:</span>
                              <strong className="text-slate-900 font-medium">
                                {typeof v === "boolean" ? (v ? "Да" : "Нет") : String(v)}
                              </strong>
                            </span>
                          ))}
                          {tx.notes && (
                            <span className="block w-full text-xs text-slate-500 italic mt-0.5">
                              {tx.notes}
                            </span>
                          )}
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
    </div>
  );
}
