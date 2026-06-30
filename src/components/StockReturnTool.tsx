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

const FORECAST_PERIOD_OPTIONS = [14, 30, 45, 60, 90];
const ITEMS_PER_PAGE = 25;

const columns: Array<keyof StockReturnReviewRow> = [
  "EAN",
  "Article name",
  "Zalando article variant / SKU",
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

export const StockReturnTool: React.FC = () => {
  const [files, setFiles] = useState<Record<StockReturnFileKey, File | null>>({
    inventory: null,
    sales: null,
  });
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

  const requiredFilesPresent = Boolean(files.inventory && files.sales);
  const rows = result?.rows || [];

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

      setProcessingStatus("Calculating return quantities...");
      const processed = processStockReturns({
        inventoryRows,
        salesRows,
        config: {
          market: "DE",
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
        row["Article name"],
        row["Zalando article variant / SKU"],
      ].some((value) => String(value).toLowerCase().includes(search));
      const matchesReturnFilter = !showReturnOnly || row["Suggested return qty"] > 0;
      return matchesSearch && matchesReturnFilter;
    });
  }, [rows, searchTerm, showReturnOnly]);

  const { currentPage, totalPages, paginatedItems, goToPage } = usePagination(filteredRows, ITEMS_PER_PAGE);

  const exportZalandoCsv = () => {
    if (!result?.exportRows.length) return;
    exportToCSV(result.exportRows, `zfs-stock-return-${new Date().toISOString().split("T")[0]}`);
  };

  const processButtonLabel = isProcessing
    ? "Processing..."
    : !requiredFilesPresent
      ? "Upload Required CSVs"
      : "Process Stock Returns";

  const summaryCards = [
    { label: "Total EANs", value: result?.summary.totalArticles ?? 0 },
    { label: "Return Candidates", value: result?.summary.returnCandidates ?? 0 },
    { label: "Total Return Qty", value: result?.summary.totalReturnQty ?? 0 },
    { label: "Estimated Savings", value: `EUR ${(result?.summary.estimatedSavings ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  ];

  return (
    <div className="space-y-5">
      <LoadingOverlay
        isLoading={isProcessing || isLoadingPersistedState}
        message={isLoadingPersistedState ? "Loading Stock Return data..." : processingStatus}
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}

      {hasProcessed && result?.warnings.length ? (
        <Alert>
          <AlertTitle>Processing warnings</AlertTitle>
          <div className="mt-2 space-y-1 text-sm text-gray-700">
            {result.warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        </Alert>
      ) : null}

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
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
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-gray-500" />
            <div>
              <h3 className="text-base font-semibold text-gray-900">Return Configuration</h3>
              <p className="text-sm text-gray-500">DE-only ZFS overstock return calculation.</p>
            </div>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
            Export uses EAN + return qty only
          </span>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Forecast period</span>
            <select
              value={forecastPeriodDays}
              onChange={(event) => {
                setForecastPeriodDays(Number(event.target.value));
                clearStaleResult();
              }}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            >
              {FORECAST_PERIOD_OPTIONS.map((days) => (
                <option key={days} value={days}>{days} days</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Safety buffer</span>
            <div className="mt-1 flex rounded-lg border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-gray-900">
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
                className="w-full rounded-l-lg border-0 px-3 py-2 text-sm text-gray-900 focus:outline-none"
              />
              <span className="flex items-center rounded-r-lg border-l border-gray-200 bg-gray-50 px-3 text-sm text-gray-500">
                %
              </span>
            </div>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Storage fee per unit per day</span>
            <div className="mt-1 flex rounded-lg border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-gray-900">
              <span className="flex items-center rounded-l-lg border-r border-gray-200 bg-gray-50 px-3 text-sm text-gray-500">
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
                className="w-full rounded-r-lg border-0 px-3 py-2 text-sm text-gray-900 focus:outline-none"
              />
            </div>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-5 py-4">
          <div className="text-sm text-gray-600">
            Current rules: keep selected-period demand plus {safetyBufferPercent}% buffer, then return excess ZFS stock.
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={resetFiles}
              className="inline-flex items-center rounded-lg border-2 border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50"
            >
              Reset Files
            </button>
            {hasProcessed && (
              <button
                type="button"
                onClick={clearTable}
                className="inline-flex items-center rounded-lg border-2 border-red-200 bg-white px-5 py-2.5 text-sm font-medium text-red-700 transition-all hover:border-red-300 hover:bg-red-50"
              >
                Clear Table
              </button>
            )}
            <button
              type="button"
              onClick={processFiles}
              disabled={!requiredFilesPresent || isProcessing}
              className="inline-flex items-center rounded-lg bg-black px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-gray-800 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-black disabled:hover:shadow-md"
            >
              {processButtonLabel}
            </button>
          </div>
        </div>
      </section>

      {hasProcessed && (
        <section ref={resultsRef} className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">ZFS Stock Return Dashboard</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {rows.length.toLocaleString()} DE EAN rows generated from uploaded ZFS inventory and sales files.
                </p>
              </div>
              <button
                type="button"
                onClick={exportZalandoCsv}
                disabled={!result?.exportRows.length}
                className="inline-flex items-center gap-2 rounded-lg border-2 border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:border-gray-200 disabled:hover:bg-white"
              >
                <Download className="h-4 w-4" />
                Export Zalando CSV
              </button>
            </div>
          </div>

          <div className="grid gap-3 border-b border-gray-200 bg-gray-50 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map((card) => (
              <div key={card.label} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                <div className="text-sm font-medium uppercase tracking-wide text-gray-500">{card.label}</div>
                <div className="mt-1 text-2xl font-semibold text-gray-900">
                  {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-5 py-4">
            <label className="relative min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search EAN, article name, or Zalando SKU"
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </label>

            <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
              <Filter className="h-4 w-4 text-gray-400" />
              <input
                type="checkbox"
                checked={showReturnOnly}
                onChange={(event) => setShowReturnOnly(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
              />
              Return candidates only
            </label>
          </div>

          <div className="max-h-[calc(100vh-260px)] overflow-auto">
            <table className="w-full min-w-[1250px] border-collapse">
              <thead className="sticky top-0 z-20 bg-white shadow-sm">
                <tr className="border-b border-gray-200 bg-gray-50">
                  {columns.map((column) => (
                    <th
                      key={column}
                      className="whitespace-nowrap px-4 py-3 text-left text-sm font-medium uppercase text-gray-500"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedItems.length > 0 ? (
                  paginatedItems.map((row, index) => (
                    <tr key={`${row.EAN}-${index}`} className="hover:bg-gray-50">
                      {columns.map((column) => (
                        <td
                          key={column}
                          className={`px-4 py-3 text-sm text-gray-900 ${
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
                        <div className="text-sm font-semibold text-gray-900">No matching return rows</div>
                        <div className="mt-1 text-sm text-gray-500">
                          Adjust the search/filter, or confirm the uploaded files contain DE rows.
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-gray-200 px-5 py-4">
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
