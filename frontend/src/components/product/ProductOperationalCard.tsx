import { ArrowDownToLine, ArrowUpFromLine, Barcode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatQty } from "@/lib/utils";
import type { AttributeDefinition, Product, TransactionType } from "@/types/api";

interface ProductOperationalCardProps {
  product: Product;
  productAttributes: AttributeDefinition[];
  onStartOperation: (txType: TransactionType) => void;
}

function formatUnitRu(name: string, code: string): string {
  const map: Record<string, string> = {
    pcs: "шт",
    l: "л",
    kg: "кг",
    g: "г",
    ml: "мл",
    m: "м",
    cm: "см",
    pack: "упаковка",
    box: "коробка",
    pallet: "паллета",
    pack12: "упаковка",
  };
  const key = code.toLowerCase().trim();
  if (map[key]) return map[key];
  return name.replace(/\([a-zA-Z\s0-9]+\)/g, "").trim() || name;
}

export function ProductOperationalCard({
  product,
  productAttributes,
  onStartOperation,
}: ProductOperationalCardProps) {
  const enabledSet = new Set(product.enabled_attribute_ids);
  const visibleAttrs = productAttributes.filter(
    (attr) =>
      attr.is_active &&
      (enabledSet.size === 0 || enabledSet.has(attr.id)) &&
      product.custom_attributes[attr.key] !== undefined &&
      product.custom_attributes[attr.key] !== null &&
      product.custom_attributes[attr.key] !== ""
  );

  const baseUnitRu = formatUnitRu(product.base_unit.name, product.base_unit.code);
  const secondaryUnit = product.secondary_unit;
  const secondaryUnitRu = secondaryUnit ? formatUnitRu(secondaryUnit.name, secondaryUnit.code) : "";
  const secondaryStock =
    product.secondary_stock_calculated !== undefined && product.secondary_stock_calculated !== null
      ? Number(product.secondary_stock_calculated)
      : product.conversion_factor
        ? Number(product.current_stock_base) * Number(product.conversion_factor)
        : null;

  const isVolume = secondaryUnitRu === "л" || secondaryUnitRu.toLowerCase().includes("литр");
  const secondaryLabel = isVolume ? "ОБЪЕМ (Л)" : `ВЕС / ОБЪЕМ (${secondaryUnitRu.toUpperCase()})`;
  const secondaryDisplayUnit = isVolume ? "л" : secondaryUnitRu;

  return (
    <div className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
      {/* 1. Верхняя часть (Header + Блок Остатков) */}
      <div className="p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-mono text-xs font-medium mb-2">
            <Barcode className="h-3.5 w-3.5 text-slate-500" />
            {product.barcode}
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            {product.name}
          </h2>
          {product.category && (
            <p className="mt-1 text-xs text-slate-500 font-medium">
              Категория: {product.category.name}
            </p>
          )}
        </div>

        {/* Табло остатка — разделенное на четкие колонки */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-lg px-5 py-3.5 flex items-center gap-6 shrink-0">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              ОСТАТОК ({baseUnitRu.toUpperCase()})
            </div>
            <div className="mt-0.5 text-2xl font-bold font-mono text-slate-900">
              {formatQty(product.current_stock_base)} {baseUnitRu}
            </div>
          </div>

          {secondaryUnit && secondaryStock !== null && (
            <>
              <div className="w-px h-8 bg-slate-200" />
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {secondaryLabel}
                </div>
                <div className="mt-0.5 text-2xl font-bold font-mono text-[#7F1D1D]">
                  {formatQty(secondaryStock)} {secondaryDisplayUnit}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 2. Средняя часть (Динамические характеристики товара, если они есть) */}
      {visibleAttrs.length > 0 && (
        <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {visibleAttrs.map((attr) => {
            const val = product.custom_attributes[attr.key];
            const display =
              typeof val === "boolean" ? (val ? "Да" : "Нет") : String(val);
            return (
              <div key={attr.id} className="space-y-0.5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {attr.label}
                </div>
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {display}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. Нижняя панель действий (Action Footer — БЕЗ «СВЕТОФОРА» И БЕЗ «КОРРЕКТИРОВКИ») */}
      <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-200 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          Выберите операцию для изменения складского остатка
        </span>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={() => onStartOperation("INBOUND")}
            className="h-10 px-6 rounded-lg bg-[#7F1D1D] hover:bg-[#651717] text-white text-sm font-medium shadow-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <ArrowDownToLine className="h-4 w-4" />
            Принять
          </Button>
          <Button
            type="button"
            onClick={() => onStartOperation("OUTBOUND")}
            className="h-10 px-6 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-sm font-medium shadow-2xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <ArrowUpFromLine className="h-4 w-4" />
            Отправить
          </Button>
        </div>
      </div>
    </div>
  );
}