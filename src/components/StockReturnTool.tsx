import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Filter, Search, SlidersHorizontal } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/usePagination";
import { FileUploadSection } from "@/components/FileUploadSection";
import { parseFile } from "@/utils/fileParser";
import { processStockReturns } from "@/utils/processors/stockReturnProcessor";
import { exportToCSV } from "@/utils/exporters/csvExporter";
import { StockReturnResult, StockReturnReviewRow } from "@/types/stockReturn";
import {
  clearStockReturnResult,
  loadStockReturnState,
  resetStockReturnState,
  saveStockReturnInventoryFile,
  saveStockReturnSalesFile,
  saveStockReturnUiState,
} from "@/lib/appPersistence";

type StockReturnFileKey = "inventory" | "sales";

interface StockReturnToolProps {
  shopifyStockFile: File | null;
  shopifySkuEanMapperFile: File | null;
  onShopifyStockFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onShopifyStockFileRemove: (fileName: string) => void;
  onShopifySkuEanMapperFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onShopifySkuEanMapperFileRemove: (fileName: string) => void;
  shopifySyncError?: string | null;
  isShopifyStockLoading?: boolean;
}

const FORECAST_PERIOD_OPTIONS = [14, 30, 45, 60, 90];
const SALES_HISTORY_PERIOD_OPTIONS = [14, 30, 45, 60, 90, 180, 365];
const ITEMS_PER_PAGE = 25;

const columns: Array<keyof StockReturnReviewRow> = [
  "EAN",
  "SKU",
  "Article name",
  "Zalando article variant",
  "Current ZFS stock",
  "Units sold in selected period",
  "Average daily sales",
  "Stock to keep",
  "Suggested return qty",
  "Estimated savings",
];

const numericColumns = new Set<keyof StockReturnReviewRow>([
  "Current ZFS stock",
  "Units sold in selected period",
  "Average daily sales",
  "Stock to keep",
  "Suggested return qty",
  "Estimated savings",
]);

const getShopifyInputSignature = (stockFile: File | null, mapperFile: File | null) => (
  `${stockFile?.name || ""}:${stockFile?.size || 0}:${mapperFile?.name || ""}:${mapperFile?.size || 0}`
);

export const StockReturnTool: React.FC<StockReturnToolProps> = ({
  shopifyStockFile,
  shopifySkuEanMapperFile,
  onShopifyStockFileChange,
  onShopifyStockFileRemove,
  onShopifySkuEanMapperFileChange,
  onShopifySkuEanMapperFileRemove,
  shopifySyncError = null,
  isShopifyStockLoading = false,
}) => {
  const [files, setFiles] = useState<Record<StockReturnFileKey, File | null>>({
    inventory: null,
    sales: null,
  });
  const [salesHistoryDays, setSalesHistoryDays] = useState(30);
  const [forecastPeriodDays, setForecastPeriodDays] = useState(30);
  const [safetyBufferPercent, setSafetyBufferPercent] = useState(20);
  const [storageFeePerUnitPerDay, setStorageFeePerUnitPerDay] = useState(0.0128);
  const [searchTerm, setSearchTerm] = useState("");
  const [showReturnOnly, setShowReturnOnly] = useState(false);
  const [hasProcessed, setHasProcessed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingPersistedState, setIsLoadingPersistedState] = useState(true);
  const [processingStatus, setProcessingStatus] = useState("");
  const [result, setResult] = useState<StockReturnResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const previousShopifyFileSignatureRef = useRef<string>(getShopifyInputSignature(shopifyStockFile, shopifySkuEanMapperFile));
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const tableDragRef = useRef({
    isDragging: false,
    startX: 0,
    scrollLeft: 0,
  });
  const [isTableDragging, setIsTableDragging] = useState(false);

  const requiredFilesPresent = Boolean(files.inventory && files.sales);
  const rows = result?.rows || [];
  const stockReturnExportRows = useMemo(() => (
    rows
      .filter((row) => row["Suggested return qty"] > 0)
      .map((row) => ({
        "EAN": row.EAN,
        "SKU": row.SKU,
        "Article name": row["Article name"],
        "Current ZFS stock": row["Current ZFS stock"],
        "Units sold in selected period": row["Units sold in selected period"],
        "Stock to keep": row["Stock to keep"],
        "Estimated savings": row["Estimated savings"],
        "return qty": row["Suggested return qty"],
      }))
  ), [rows]);

  useEffect(() => {
    if (isLoadingPersistedState || isShopifyStockLoading) return;

    const currentSignature = getShopifyInputSignature(shopifyStockFile, shopifySkuEanMapperFile);
    if (previousShopifyFileSignatureRef.current === currentSignature) return;

    previousShopifyFileSignatureRef.current = currentSignature;
    if (!hasProcessed && !result) return;

    setHasProcessed(false);
    setResult(null);
    clearStockReturnResult().catch((err) => {
      console.error("Error clearing stale Stock Return result:", err);
    });
  }, [hasProcessed, isLoadingPersistedState, isShopifyStockLoading, result, shopifySkuEanMapperFile, shopifyStockFile]);

  useEffect(() => {
    let cancelled = false;

    const loadState = async () => {
      try {
        const persisted = await loadStockReturnState();
        if (cancelled) return;

        setFiles({
          inventory: persisted.inventoryFile,
          sales: persisted.salesFile,
        });
        setSalesHistoryDays(persisted.salesHistoryDays);
        setForecastPeriodDays(persisted.forecastPeriodDays);
        setSafetyBufferPercent(persisted.safetyBufferPercent);
        setStorageFeePerUnitPerDay(persisted.storageFeePerUnitPerDay);
        setSearchTerm(persisted.searchTerm);
        setShowReturnOnly(persisted.showReturnOnly);
        setResult(persisted.result);
        setHasProcessed(Boolean(persisted.hasProcessed && persisted.result));
      } catch (err) {
        console.error("Error loading Stock Return state:", err);
        if (!cancelled) setError("Could not load saved Stock Return state");
      } finally {
        if (!cancelled) setIsLoadingPersistedState(false);
      }
    };

    loadState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isLoadingPersistedState) return;
    saveStockReturnUiState({
      salesHistoryDays,
      forecastPeriodDays,
      safetyBufferPercent,
      storageFeePerUnitPerDay,
      searchTerm,
      showReturnOnly,
      hasProcessed,
      result,
    }).catch((err) => {
      console.error("Error saving Stock Return state:", err);
    });
  }, [
    forecastPeriodDays,
    hasProcessed,
    isLoadingPersistedState,
    result,
    salesHistoryDays,
    safetyBufferPercent,
    searchTerm,
    showReturnOnly,
    storageFeePerUnitPerDay,
  ]);

  const clearStaleResult = () => {
    if (!hasProcessed && !result) return;
    setHasProcessed(false);
    setResult(null);
    clearStockReturnResult().catch((err) => {
      console.error("Error clearing stale Stock Return result:", err);
    });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, key: StockReturnFileKey) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFiles((prev) => ({ ...prev, [key]: file }));
    setError(null);
    setHasProcessed(false);
    setResult(null);

    const saveFile = key === "inventory" ? saveStockReturnInventoryFile : saveStockReturnSalesFile;
    saveFile(file).catch((err) => {
      console.error("Error saving Stock Return file:", err);
    });
  };

  const handleRemoveFile = (_fileName: string, key: StockReturnFileKey) => {
    setFiles((prev) => ({ ...prev, [key]: null }));
    setHasProcessed(false);
    setResult(null);

    const saveFile = key === "inventory" ? saveStockReturnInventoryFile : saveStockReturnSalesFile;
    saveFile(null).catch((err) => {
      console.error("Error clearing Stock Return file:", err);
    });
  };

  const resetFiles = async () => {
    setFiles({ inventory: null, sales: null });
    onShopifyStockFileRemove(shopifyStockFile?.name || "");
    onShopifySkuEanMapperFileRemove(shopifySkuEanMapperFile?.name || "");
    setSalesHistoryDays(30);
    setForecastPeriodDays(30);
    setSafetyBufferPercent(20);
    setStorageFeePerUnitPerDay(0.0128);
    setSearchTerm("");
    setShowReturnOnly(false);
    setHasProcessed(false);
    setResult(null);
    setError(null);

    try {
      await resetStockReturnState();
    } catch (err) {
      console.error("Error resetting Stock Return state:", err);
    }
  };

  const clearTable = async () => {
    setHasProcessed(false);
    setResult(null);
    setSearchTerm("");
    setShowReturnOnly(false);

    try {
      await clearStockReturnResult();
    } catch (err) {
      console.error("Error clearing Stock Return result:", err);
    }
  };

  const processFiles = async () => {
    if (!requiredFilesPresent) {
      setError("Upload the ZFS Inventory CSV and Sales Performance CSV first.");
      return;
    }

    try {
      setError(null);
      setIsProcessing(true);
      setProcessingStatus("Parsing ZFS Inventory file...");
      const inventoryRows = await parseFile(files.inventory!);

      setProcessingStatus("Parsing Sales Performance file...");
      const salesRows = await parseFile(files.sales!);

      let shopifyRows: any[] = [];
      if (shopifyStockFile) {
        setProcessingStatus("Parsing Shopify Internal Stock file...");
        shopifyRows = await parseFile(shopifyStockFile);
      }

      let shopifySkuEanRows: any[] = [];
      if (shopifySkuEanMapperFile) {
        setProcessingStatus("Parsing Shopify SKU/EAN mapper file...");
        shopifySkuEanRows = await parseFile(shopifySkuEanMapperFile);
      }

      setProcessingStatus("Calculating return quantities...");
      const processed = processStockReturns({
        inventoryRows,
        salesRows,
        shopifyStockRows: shopifyRows,
        shopifySkuEanRows,
        config: {
          market: "DE",
          salesHistoryDays,
          forecastPeriodDays,
          safetyBufferPercent,
          storageFeePerUnitPerDay,
        },
      });

      setResult(processed);
      setHasProcessed(true);
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process Stock Return files");
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  };

  const filteredRows = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch = !search || [
        row.EAN,
        row.SKU,
        row["Article name"],
        row["Zalando article variant"],
      ].some((value) => String(value).toLowerCase().includes(search));
      const matchesReturnFilter = !showReturnOnly || row["Suggested return qty"] > 0;
      return matchesSearch && matchesReturnFilter;
    });
  }, [rows, searchTerm, showReturnOnly]);

  const { currentPage, totalPages, paginatedItems, goToPage } = usePagination(filteredRows, ITEMS_PER_PAGE);

  const exportZalandoCsv = () => {
    if (!stockReturnExportRows.length) return;
    exportToCSV(stockReturnExportRows, `zfs-stock-return-${new Date().toISOString().split("T")[0]}`);
  };

  const processButtonLabel = isProcessing
    ? "Processing..."
    : !requiredFilesPresent
      ? "Upload Required CSVs"
      : "Process Stock Returns";

  const handleTablePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !tableScrollRef.current) return;
    const target = event.target as HTMLElement;
    if (target.closest("button,input,select,a")) return;

    tableDragRef.current = {
      isDragging: true,
      startX: event.clientX,
      scrollLeft: tableScrollRef.current.scrollLeft,
    };
    setIsTableDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleTablePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!tableDragRef.current.isDragging || !tableScrollRef.current) return;
    event.preventDefault();
    const deltaX = event.clientX - tableDragRef.current.startX;
    tableScrollRef.current.scrollLeft = tableDragRef.current.scrollLeft - deltaX;
  };

  const stopTableDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!tableDragRef.current.isDragging) return;
    tableDragRef.current.isDragging = false;
    setIsTableDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const summaryCards = [
    { label: "Total EANs", value: result?.summary.totalArticles ?? 0 },
    { label: "Return Candidates", value: result?.summary.returnCandidates ?? 0 },
    { label: "Total Return Qty", value: result?.summary.totalReturnQty ?? 0 },
    { label: "Estimated Savings", value: `EUR ${(result?.summary.estimatedSavings ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  ];

  return (
    <div className="space-y-5">
      <LoadingOverlay
        isLoading={isProcessing}
        message={processingStatus}
      />

      {(error || shopifySyncError) && (
        <Alert variant="destructive">
          <AlertTitle>{error || shopifySyncError}</AlertTitle>
        </Alert>
      )}

      {hasProcessed && result?.warnings.length ? (
        <Alert>
          <AlertTitle>Processing warnings</AlertTitle>
          <div className="mt-2 space-y-1 text-base text-slate-700">
            {result.warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        </Alert>
      ) : null}

      <section className="ops-surface rounded-[8px] p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <FileUploadSection
            title="ZFS Inventory CSV"
            onChange={(event) => handleFileChange(event, "inventory")}
            onRemove={(fileName) => handleRemoveFile(fileName, "inventory")}
            files={files.inventory ? [files.inventory] : []}
            acceptedFileTypes=".csv,.tsv,.txt,.xlsx,.xls"
          />
          <FileUploadSection
            title="Sales Performance CSV"
            onChange={(event) => handleFileChange(event, "sales")}
            onRemove={(fileName) => handleRemoveFile(fileName, "sales")}
            files={files.sales ? [files.sales] : []}
            acceptedFileTypes=".csv,.tsv,.txt,.xlsx,.xls"
          />
          <FileUploadSection
            title="Shopify Internal Stock"
            onChange={onShopifyStockFileChange}
            onRemove={onShopifyStockFileRemove}
            files={shopifyStockFile ? [shopifyStockFile] : []}
            acceptedFileTypes=".csv,.tsv,.txt,.xlsx,.xls"
            syncedFromShopify={shopifyStockFile?.name === "shopify-internal-stocks.csv"}
          />
          <FileUploadSection
            title="Shopify SKU/EAN Mapper"
            onChange={onShopifySkuEanMapperFileChange}
            onRemove={onShopifySkuEanMapperFileRemove}
            files={shopifySkuEanMapperFile ? [shopifySkuEanMapperFile] : []}
            acceptedFileTypes=".csv,.tsv,.txt,.xlsx,.xls"
            syncedFromShopify={shopifySkuEanMapperFile?.name === "shopify-sku-ean.csv"}
          />
        </div>
      </section>

      <section className="ops-surface rounded-[8px]">
        <div className="ops-section-header flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-slate-500" />
            <div>
              <h3 className="ops-title">Return Configuration</h3>
              <p className="ops-muted">DE-only ZFS overstock return calculation.</p>
            </div>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-base font-medium text-blue-700">
            Sales history and forecast period are separate
          </span>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="text-base font-medium text-slate-700">Sales history period</span>
            <select
              value={salesHistoryDays}
              onChange={(event) => {
                setSalesHistoryDays(Number(event.target.value));
                clearStaleResult();
              }}
              className="ops-input mt-1 w-full"
            >
              {SALES_HISTORY_PERIOD_OPTIONS.map((days) => (
                <option key={days} value={days}>{days} days</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-base font-medium text-slate-700">Forecast period</span>
            <select
              value={forecastPeriodDays}
              onChange={(event) => {
                setForecastPeriodDays(Number(event.target.value));
                clearStaleResult();
              }}
              className="ops-input mt-1 w-full"
            >
              {FORECAST_PERIOD_OPTIONS.map((days) => (
                <option key={days} value={days}>{days} days</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-base font-medium text-slate-700">Safety buffer</span>
            <div className="mt-1 flex border border-slate-300 bg-white shadow-sm focus-within:ring-2 focus-within:ring-slate-900/10">
              <input
                type="number"
                min={0}
                max={500}
                step={1}
                value={safetyBufferPercent}
                onChange={(event) => {
                  setSafetyBufferPercent(Number(event.target.value));
                  clearStaleResult();
                }}
                className="w-full border-0 px-4 py-3 text-base text-slate-900 focus:outline-none"
              />
              <span className="flex items-center border-l border-slate-200 bg-slate-50 px-4 text-base text-slate-500">
                %
              </span>
            </div>
          </label>

          <label className="block">
            <span className="text-base font-medium text-slate-700">Storage fee per unit per day</span>
            <div className="mt-1 flex border border-slate-300 bg-white shadow-sm focus-within:ring-2 focus-within:ring-slate-900/10">
              <span className="flex items-center border-r border-slate-200 bg-slate-50 px-4 text-base text-slate-500">
                EUR
              </span>
              <input
                type="number"
                min={0}
                step={0.0001}
                value={storageFeePerUnitPerDay}
                onChange={(event) => {
                  setStorageFeePerUnitPerDay(Number(event.target.value));
                  clearStaleResult();
                }}
                className="w-full border-0 px-4 py-3 text-base text-slate-900 focus:outline-none"
              />
            </div>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <div className="text-base text-slate-600">
            Current rules: use {salesHistoryDays} days of sales history to forecast {forecastPeriodDays} days of demand, keep demand plus {safetyBufferPercent}% buffer, then return excess ZFS stock.
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={resetFiles}
              className="ops-button-secondary"
            >
              Reset Files
            </button>
            {hasProcessed && (
              <button
                type="button"
                onClick={clearTable}
                className="ops-button-danger"
              >
                Clear Table
              </button>
            )}
            <button
              type="button"
              onClick={processFiles}
              disabled={!requiredFilesPresent || isProcessing}
              className="ops-button-primary px-6"
            >
              {processButtonLabel}
            </button>
          </div>
        </div>
      </section>

      {hasProcessed && (
        <section ref={resultsRef} className="ops-surface rounded-[8px]">
          <div className="ops-section-header">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="ops-title">ZFS Stock Return Dashboard</h3>
                <p className="ops-muted mt-1">
                  {rows.length.toLocaleString()} DE EAN rows generated from uploaded ZFS inventory and sales files.
                </p>
              </div>
              <button
                type="button"
                onClick={exportZalandoCsv}
                disabled={!stockReturnExportRows.length}
                className="ops-button-secondary disabled:cursor-not-allowed disabled:text-slate-400"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>
          </div>

          <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map((card) => (
              <div key={card.label} className="ops-summary-card rounded-[8px]">
                <div className="ops-kicker">{card.label}</div>
                <div className="mt-1 text-3xl font-semibold text-slate-950">
                  {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-4">
            <label className="relative min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search EAN, SKU, article name, or Zalando variant"
                className="ops-input w-full pl-10 pr-4"
              />
            </label>

            <label className="ops-button-secondary">
              <Filter className="h-4 w-4 text-slate-400" />
              <input
                type="checkbox"
                checked={showReturnOnly}
                onChange={(event) => setShowReturnOnly(event.target.checked)}
                className="h-4 w-4 border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              Return candidates only
            </label>
          </div>

          <div
            ref={tableScrollRef}
            className={`max-h-[calc(100vh-260px)] overflow-auto ${
              isTableDragging ? "cursor-grabbing select-none" : "cursor-grab"
            }`}
            title="Drag horizontally to scroll the table"
            onPointerDown={handleTablePointerDown}
            onPointerMove={handleTablePointerMove}
            onPointerUp={stopTableDrag}
            onPointerCancel={stopTableDrag}
            onPointerLeave={stopTableDrag}
          >
            <table className="ops-table min-w-[1250px]">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedItems.length > 0 ? (
                  paginatedItems.map((row, index) => (
                    <tr key={`${row.EAN}-${index}`}>
                      {columns.map((column) => (
                        <td
                          key={column}
                          className={`${
                            numericColumns.has(column) ? "text-right tabular-nums" : ""
                          } ${column === "Article name" ? "min-w-[260px] whitespace-normal" : "whitespace-nowrap"}`}
                        >
                          {row[column]}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-12 text-center">
                      <div className="mx-auto max-w-lg">
                        <div className="text-base font-semibold text-slate-950">No matching return rows</div>
                        <div className="mt-1 text-base text-slate-500">
                          Adjust the search/filter, or confirm the uploaded files contain DE rows.
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-200 bg-slate-50 px-5 py-4">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={goToPage}
            />
          </div>
        </section>
      )}
    </div>
  );
};
