import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  ClipboardList,
  Clock,
  Package,
  RefreshCw,
  Tag,
  User as UserIcon,
  X,
} from "lucide-react";
import { PaginationControls } from "@/components/common/PaginationControls";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  cn,
  formatDushanbeDateShort,
  formatDushanbeDateTime,
  formatDushanbeTimeShort,
  formatInt,
  ROLE_LABELS,
} from "@/lib/utils";
import type { AuditLog } from "@/types/api";

interface ActionMeta {
  label: string;
  badgeClass: string;
  fullTitle: string;
}

const ACTION_META: Record<string, ActionMeta> = {
  USER_LOGIN: {
    label: "Вход в систему",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    fullTitle: "Выполнен вход в систему WMS Core",
  },
  USER_LOGOUT: {
    label: "Выход из системы",
    badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
    fullTitle: "Выполнен выход из учетной записи",
  },
  TRANSACTION_INBOUND: {
    label: "Прием товара",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    fullTitle: "Проведена операция приемки товара на склад",
  },
  TRANSACTION_OUTBOUND: {
    label: "Отправка",
    badgeClass: "bg-red-50 text-[#8B1D1D] border-red-200",
    fullTitle: "Проведена операция отправки товара со склада",
  },
  TRANSACTION_ADJUSTMENT: {
    label: "Корректировка",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    fullTitle: "Проведена корректировка складского остатка",
  },
  PRODUCT_CREATE: {
    label: "Создание товара",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    fullTitle: "Создана новая карточка товара в справочнике",
  },
  PRODUCT_UPDATE: {
    label: "Изменение карточки",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    fullTitle: "Обновлены параметры карточки товара",
  },
  PRODUCT_DELETE: {
    label: "Удаление товара",
    badgeClass: "bg-red-50 text-[#8B1D1D] border-red-200",
    fullTitle: "Деактивирована карточка товара",
  },
  STORE_CREATE: {
    label: "Создание склада",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    fullTitle: "Добавлен новый склад в справочник",
  },
  STORE_UPDATE: {
    label: "Изменение склада",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    fullTitle: "Изменены реквизиты склада",
  },
  STORE_DEACTIVATE: {
    label: "Отключение склада",
    badgeClass: "bg-red-50 text-[#8B1D1D] border-red-200",
    fullTitle: "Склад деактивирован в справочнике",
  },
  USER_CREATE: {
    label: "Создание сотрудника",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    fullTitle: "Зарегистрирован новый сотрудник",
  },
  USER_UPDATE: {
    label: "Изменение сотрудника",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    fullTitle: "Обновлены данные или права сотрудника",
  },
};

const FIELD_LABELS: Record<string, string> = {
  barcode: "Штрихкод",
  name: "Наименование",
  sku: "Артикул (SKU)",
  code: "Код",
  address: "Адрес",
  is_active: "Статус активности",
  stock_base: "Остаток",
  initial_stock_base: "Начальный остаток",
  role: "Роль",
  shift_name: "Смена",
  full_name: "ФИО",
  store_id: "Склад",
  batch_number: "Номер партии",
  waybill_number: "Номер накладной",
  qc_passed: "Контроль качества",
  shift: "Рабочая смена",
  vehicle_number: "Номер машины / ТС",
  expiry_date: "Срок годности",
};

function getActionMeta(action: string): ActionMeta {
  return (
    ACTION_META[action] ?? {
      label: action,
      badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
      fullTitle: `Выполнено действие: ${action}`,
    }
  );
}

function formatFieldValue(val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "boolean") return val ? "Да" : "Нет";
  if (typeof val === "number") return formatInt(val);
  if (typeof val === "object") {
    const entries = Object.entries(val as Record<string, unknown>).filter(
      ([, v]) => v !== null && v !== undefined && v !== ""
    );
    if (entries.length === 0) return "—";
    return entries.map(([k, v]) => `${FIELD_LABELS[k] || k}: ${String(v)}`).join(", ");
  }
  return String(val);
}

function buildShortSummary(log: AuditLog): string {
  const payload = (log.payload ?? {}) as Record<string, unknown>;
  const newVal = (log.new_value ?? {}) as Record<string, unknown>;

  if (log.action === "USER_LOGIN" || log.action === "USER_LOGOUT") {
    const uname = payload.username ? String(payload.username) : log.user?.username || "";
    const storeName = payload.store_name ? ` • ${String(payload.store_name)}` : "";
    return uname ? `Учетная запись ${uname}${storeName}` : "Сеанс пользователя";
  }

  if (log.action.startsWith("TRANSACTION_")) {
    const prodName = payload.product_name
      ? String(payload.product_name)
      : payload.barcode
      ? `Штрихкод ${String(payload.barcode)}`
      : "Товар";
    const qty = payload.quantity_entered !== undefined ? formatInt(String(payload.quantity_entered)) : "";
    const unit = payload.unit_name ? String(payload.unit_name) : "шт";
    const store = payload.store_name
      ? ` • ${String(payload.store_name)}`
      : payload.counterparty
      ? ` • ${String(payload.counterparty)}`
      : "";
    return qty ? `${prodName} — ${qty} ${unit}${store}` : `${prodName}${store}`;
  }

  if (log.entity === "product") {
    const name = newVal.name ? String(newVal.name) : payload.name ? String(payload.name) : "";
    const barcode = newVal.barcode ? ` (${String(newVal.barcode)})` : "";
    return name ? `${name}${barcode}` : "Карточка товара";
  }

  if (log.entity === "store") {
    const name = newVal.name ? String(newVal.name) : "";
    const code = newVal.code ? ` (${String(newVal.code)})` : "";
    return name ? `${name}${code}` : "Справочник складов";
  }

  if (log.entity === "user") {
    const name = newVal.full_name || newVal.username || payload.username || "";
    return name ? String(name) : "Карточка сотрудника";
  }

  return log.entity;
}

export function JournalPage() {
  const { user } = useAuth();
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const {
    data: logs = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["my-history", user?.id],
    queryFn: () => apiRequest<AuditLog[]>("/api/v1/audit-logs/my?limit=200"),
    enabled: Boolean(user?.id),
  });

  const paginatedLogs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return logs.slice(start, start + pageSize);
  }, [logs, page]);

  const renderDetailsModal = () => {
    if (!selectedLog) return null;

    const meta = getActionMeta(selectedLog.action);
    const payload = (selectedLog.payload ?? {}) as Record<string, unknown>;
    const oldVal = (selectedLog.old_value ?? {}) as Record<string, unknown>;
    const newVal = (selectedLog.new_value ?? {}) as Record<string, unknown>;

    const actorName = selectedLog.user?.full_name || user?.full_name || "Пользователь";
    const actorRoleKey = selectedLog.user?.role || user?.role;
    const actorRole = actorRoleKey ? ROLE_LABELS[actorRoleKey] : "";

    const storeInfo =
      (payload.store_name as string | undefined) ||
      (payload.counterparty as string | undefined) ||
      (selectedLog.entity === "store" ? (newVal.name as string | undefined) : undefined) ||
      user?.store_name ||
      null;

    const productName =
      (payload.product_name as string | undefined) ||
      (selectedLog.entity === "product" ? (newVal.name as string | undefined) : undefined) ||
      null;
    const productBarcode =
      (payload.barcode as string | undefined) ||
      (selectedLog.entity === "product" ? (newVal.barcode as string | undefined) : undefined) ||
      null;
    const quantityEntered =
      payload.quantity_entered !== undefined && payload.quantity_entered !== null
        ? `${formatInt(String(payload.quantity_entered))} ${String(payload.unit_name || "шт")}`
        : null;

    // Extract custom attributes (from transaction payload)
    const customAttrsObj =
      payload.custom_attributes && typeof payload.custom_attributes === "object"
        ? (payload.custom_attributes as Record<string, unknown>)
        : {};
    const customAttrs = Object.entries(customAttrsObj).filter(
      ([, v]) => v !== null && v !== undefined && v !== ""
    );

    // Extract changed fields (old_value vs new_value)
    const allDiffKeys = Array.from(new Set([...Object.keys(oldVal), ...Object.keys(newVal)]));
    const changedFields = allDiffKeys
      .map((key) => ({
        key,
        label: FIELD_LABELS[key] || key,
        before: oldVal[key],
        after: newVal[key],
      }))
      .filter((item) => item.before !== undefined || item.after !== undefined);

    const notes = payload.notes ? String(payload.notes) : null;

    return createPortal(
      <div
        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4"
        onClick={() => setSelectedLog(null)}
      >
        <div
          className="bg-white w-full max-w-lg rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in-0 zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-red-50 text-[#8B1D1D] flex items-center justify-center">
                <Clock className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Детали действия</h3>
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border mt-0.5",
                    meta.badgeClass
                  )}
                >
                  {meta.label}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedLog(null)}
              className="text-slate-400 hover:text-slate-700 rounded-lg p-1.5 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-6 overflow-y-auto space-y-4 text-xs">
            {/* Что именно сделал */}
            <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-3.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Что именно сделано
              </div>
              <div className="text-sm font-semibold text-slate-900 mt-1">{meta.fullTitle}</div>
              <div className="text-xs text-slate-600 mt-0.5">{buildShortSummary(selectedLog)}</div>
            </div>

            {/* Основные реквизиты */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200/80 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" strokeWidth={1.5} />
                  Дата и точное время
                </div>
                <div className="font-mono font-semibold text-slate-900 mt-1">
                  {formatDushanbeDateTime(selectedLog.created_at)} (UTC+5)
                </div>
              </div>

              <div className="rounded-lg border border-slate-200/80 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <UserIcon className="h-3 w-3" strokeWidth={1.5} />
                  Сотрудник
                </div>
                <div className="font-semibold text-slate-900 mt-1">{actorName}</div>
                {actorRole && <div className="text-[11px] text-slate-500">{actorRole}</div>}
              </div>
            </div>

            {/* Склад (Откуда / Куда) */}
            {storeInfo && (
              <div className="rounded-lg border border-slate-200/80 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Building2 className="h-3 w-3" strokeWidth={1.5} />
                  Склад (Откуда / Куда)
                </div>
                <div className="font-semibold text-slate-900 mt-1">{storeInfo}</div>
                {Boolean(payload.counterparty) && payload.counterparty !== storeInfo && (
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Контрагент / Направление: {String(payload.counterparty)}
                  </div>
                )}
              </div>
            )}

            {/* Продукция и Количество */}
            {(productName || productBarcode || quantityEntered) && (
              <div className="rounded-lg border border-slate-200/80 p-3 space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Package className="h-3 w-3" strokeWidth={1.5} />
                  Продукция и количество
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    {productName && <div className="text-sm font-semibold text-slate-900">{productName}</div>}
                    {productBarcode && (
                      <div className="text-[11px] font-mono text-slate-500">Штрихкод: {productBarcode}</div>
                    )}
                  </div>
                  {quantityEntered && (
                    <div className="px-2.5 py-1 rounded-md bg-red-50 border border-red-200 font-mono text-sm font-bold text-[#8B1D1D]">
                      {quantityEntered}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Заполненные атрибуты */}
            {customAttrs.length > 0 && (
              <div className="rounded-lg border border-slate-200/80 p-3 space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Tag className="h-3 w-3" strokeWidth={1.5} />
                  Заполненные атрибуты
                </div>
                <div className="divide-y divide-slate-100">
                  {customAttrs.map(([k, v]) => (
                    <div key={k} className="py-1.5 flex items-center justify-between gap-3">
                      <span className="text-slate-500">{FIELD_LABELS[k] || k}</span>
                      <span className="font-medium text-slate-900 text-right">{formatFieldValue(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Измененные поля */}
            {changedFields.length > 0 && (
              <div className="rounded-lg border border-slate-200/80 p-3 space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Измененные поля / Значения
                </div>
                <div className="divide-y divide-slate-100">
                  {changedFields.map((item) => (
                    <div key={item.key} className="py-1.5 flex items-center justify-between gap-3">
                      <span className="text-slate-500">{item.label}</span>
                      <span className="font-mono text-right text-slate-900">
                        {item.before !== undefined && item.after !== undefined ? (
                          <>
                            <span className="text-slate-400 line-through mr-1.5">
                              {formatFieldValue(item.before)}
                            </span>
                            <span className="font-semibold text-slate-900">
                              → {formatFieldValue(item.after)}
                            </span>
                          </>
                        ) : (
                          <span className="font-semibold text-slate-900">
                            {formatFieldValue(item.after !== undefined ? item.after : item.before)}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {notes && (
              <div className="rounded-lg border border-slate-200/80 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Примечание
                </div>
                <div className="text-slate-700 mt-1">{notes}</div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end shrink-0">
            <Button
              type="button"
              onClick={() => setSelectedLog(null)}
              className="h-8 px-4 rounded-lg bg-[#8B1D1D] hover:bg-[#701717] text-white text-xs font-medium cursor-pointer"
            >
              Закрыть
            </Button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  return (
    <div className="space-y-5 max-w-4xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-[#8B1D1D]" strokeWidth={1.5} />
            Личная история действий
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Персональный журнал операций и событий пользователя{" "}
            <span className="font-semibold text-slate-700">{user?.full_name}</span>
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-8 px-3 rounded-lg border-slate-200 bg-white text-xs text-slate-600 hover:text-slate-900 cursor-pointer flex items-center gap-1.5"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} strokeWidth={1.5} />
          <span>Обновить</span>
        </Button>
      </div>

      {/* Minimalist Single-Line History List */}
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-xs text-slate-400">
            Загрузка личной истории...
          </div>
        ) : logs.length === 0 ? (
          <div className="py-14 text-center">
            <Clock className="h-8 w-8 text-slate-300 mx-auto mb-2.5" strokeWidth={1.5} />
            <div className="text-sm font-semibold text-slate-800">История пока пуста</div>
            <p className="text-xs text-slate-400 mt-1">
              Здесь будут отображаться все ваши личные входы, приемки, отправки и изменения.
            </p>
          </div>
        ) : (
          <div>
            {paginatedLogs.map((log) => {
              const meta = getActionMeta(log.action);
              const shortSummary = buildShortSummary(log);
              const timeStr = formatDushanbeTimeShort(log.created_at);
              const dateStr = formatDushanbeDateShort(log.created_at);

              return (
                <div
                  key={log.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 bg-white border-b border-slate-100 last:border-b-0 hover:bg-slate-50/80 transition-colors"
                >
                  {/* Left: Single-line summary */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border shrink-0",
                        meta.badgeClass
                      )}
                    >
                      {meta.label}
                    </span>
                    <span className="text-xs font-medium text-slate-800 truncate">
                      {shortSummary}
                    </span>
                    <span
                      className="text-[11px] font-mono text-slate-400 shrink-0 hidden sm:inline"
                      title={dateStr}
                    >
                      {timeStr}
                    </span>
                  </div>

                  {/* Right: Minimalist Clock SVG icon */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-mono text-slate-400 sm:hidden">
                      {timeStr}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedLog(log)}
                      title="Детали действия"
                      aria-label="Детали действия"
                      className="text-slate-400 hover:text-[#8B1D1D] hover:bg-red-50 p-1.5 rounded-md transition-all cursor-pointer"
                    >
                      <Clock size={18} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {logs.length > 0 && (
          <PaginationControls
            currentPage={page}
            totalItems={logs.length}
            pageSize={pageSize}
            onPageChange={setPage}
            itemName="записей"
          />
        )}
      </div>

      {renderDetailsModal()}
    </div>
  );
}
