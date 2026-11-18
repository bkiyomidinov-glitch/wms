import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Barcode,
  CheckCircle2,
  ScanBarcode,
  Search,
  X,
} from "lucide-react";
import { OperationModalForm } from "@/components/operations/OperationModalForm";
import { ProductOperationalCard } from "@/components/product/ProductOperationalCard";
import { Button } from "@/components/ui/button";
import { apiRequest, ApiError } from "@/lib/api";
import { formatQty } from "@/lib/utils";
import type {
  AttributeDefinition,
  CustomDictionary,
  InventoryTransaction,
  Product,
  TransactionType,
} from "@/types/api";

interface TerminalPageProps {
  onNavigate?: (route: "terminal" | "products" | "history" | "users") => void;
}

export function TerminalPage({}: TerminalPageProps = {}) {
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const [barcodeInput, setBarcodeInput] = useState("");
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);

  const [opModalOpen, setOpModalOpen] = useState(false);
  const [opType, setOpType] = useState<TransactionType>("INBOUND");
  const [lastSuccessTx, setLastSuccessTx] = useState<InventoryTransaction | null>(null);

  // Queries
  const { data: allProducts = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => apiRequest<Product[]>("/api/v1/products?limit=200"),
  });

  const { data: attributes = [] } = useQuery({
    queryKey: ["constructor", "attributes"],
    queryFn: () => apiRequest<AttributeDefinition[]>("/api/v1/constructor/attributes"),
  });

  const { data: dictionaries = [] } = useQuery({
    queryKey: ["constructor", "dictionaries"],
    queryFn: () => apiRequest<CustomDictionary[]>("/api/v1/constructor/dictionaries"),
  });

  const productAttrs = useMemo(
    () => attributes.filter((a) => a.target_type === "PRODUCT"),
    [attributes]
  );

  const txAttrs = useMemo(() => {
    const target = opType === "INBOUND" ? "TX_INBOUND" : "TX_OUTBOUND";
    return attributes.filter((a) => a.target_type === target && a.is_active);
  }, [attributes, opType]);

  const counterpartyDict = useMemo(
    () => dictionaries.find((d) => d.slug === "counterparties"),
    [dictionaries]
  );

  // Sync activeProduct with refreshed list after transactions
  useEffect(() => {
    if (!activeProduct) return;
    const fresh = allProducts.find((p) => p.id === activeProduct.id);
    if (fresh) setActiveProduct(fresh);
  }, [allProducts, activeProduct]);

  const handleScanLookup = async (codeOverride?: string) => {
    const code = (codeOverride ?? barcodeInput).trim();
    if (!code) return;

    setScanError(null);
    setScanLoading(true);
    try {
      const product = await apiRequest<Product>(
        `/api/v1/products/barcode/${encodeURIComponent(code)}`
      );
      setActiveProduct(product);
      setBarcodeInput(code);
      setLastSuccessTx(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setScanError(err.message);
      } else {
        setScanError("Товар с таким штрихкодом не найден");
      }
      setActiveProduct(null);
    } finally {
      setScanLoading(false);
    }
  };

  const handleStartOperation = (type: TransactionType) => {
    setOpType(type);
    setOpModalOpen(true);
  };

  return (
    <div className="space-y-6 pt-2 pb-12">
      {/* 3.А. Строка поиска / сканирования штрихкода (Executive ERP Search Bar) */}
      <div className="max-w-4xl mx-auto mb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleScanLookup();
          }}
          className="bg-white border border-slate-200 rounded-xl shadow-xs p-2 flex items-center gap-2 focus-within:border-[#7F1D1D] focus-within:ring-2 focus-within:ring-[#7F1D1D]/10 transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <Barcode className="h-5 w-5" />
          </div>

          <input
            ref={barcodeInputRef}
            type="text"
            value={barcodeInput}
            onChange={(e) => {
              const val = e.target.value;
              setBarcodeInput(val);
              if (!val.trim()) {
                setActiveProduct(null);
                setScanError(null);
              }
            }}
            placeholder="Сканируйте штрихкод или введите код товара..."
            className="flex-1 h-10 px-3 text-base font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none border-none bg-transparent"
          />

          {barcodeInput && (
            <button
              type="button"
              onClick={() => {
                setBarcodeInput("");
                setActiveProduct(null);
                setScanError(null);
                barcodeInputRef.current?.focus();
              }}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer transition-colors"
              title="Очистить"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          <Button
            type="submit"
            disabled={scanLoading || !barcodeInput.trim()}
            className="h-10 px-5 rounded-lg bg-[#7F1D1D] hover:bg-[#651717] text-white text-sm font-medium transition-colors shadow-xs cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <Search className="h-4 w-4" />
            {scanLoading ? "Поиск..." : "Найти"}
          </Button>
        </form>

        {scanError && (
          <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{scanError}</span>
          </div>
        )}
      </div>

      {/* Уведомление об успешной операции */}
      {lastSuccessTx && (
        <div className="max-w-4xl mx-auto mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800 animate-page-enter">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>
              <strong>
                {lastSuccessTx.tx_type === "INBOUND" ? "Приход успешно проведен" : "Расход успешно проведен"}:
              </strong>{" "}
              {lastSuccessTx.product.name} — {formatQty(lastSuccessTx.quantity_entered)} {lastSuccessTx.unit.name}
            </span>
          </div>
          <div className="text-xs font-mono font-semibold text-emerald-700">
            Остаток на складе: {formatQty(lastSuccessTx.stock_after_base)} {lastSuccessTx.product.base_unit.name}
          </div>
        </div>
      )}

      {/* 3.Б. Карточка товара (Executive Product Card) */}
      {activeProduct ? (
        <div className="animate-page-enter">
          <ProductOperationalCard
            product={activeProduct}
            productAttributes={productAttrs}
            onStartOperation={handleStartOperation}
          />
        </div>
      ) : (
        <div className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-xl shadow-xs p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 mb-4">
            <ScanBarcode className="h-7 w-7" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            Товар не выбран
          </h3>
          <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
            Отсканируйте штрихкод сканером или введите номер товара в строке поиска выше.
          </p>
        </div>
      )}

      {/* Правая выезжающая панель «Принять» / «Отправить» */}
      {activeProduct && (
        <OperationModalForm
          open={opModalOpen}
          onOpenChange={(open) => {
            setOpModalOpen(open);
            if (!open) {
              setTimeout(() => barcodeInputRef.current?.focus(), 50);
            }
          }}
          txType={opType}
          initialProduct={activeProduct}
          allProducts={allProducts}
          txAttributes={txAttrs}
          counterpartyDictionary={counterpartyDict}
          onSuccess={(tx) => setLastSuccessTx(tx)}
        />
      )}
    </div>
  );
}