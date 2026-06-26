import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Filter,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/usePagination";
import { parseFile } from "@/utils/fileParser";
import { processRetaggingDecisions } from "@/utils/processors/retaggingDecisionProcessor";
import { RetaggingDecisionResult, RetaggingDecisionRow, RetaggingSuggestedAction } from "@/types/retagging";
import {
  clearRetaggingResult,
  loadRetaggingState,
  resetRetaggingState,
  saveRetaggingSalesArticleLevelFile,
  saveRetaggingSalesPerformanceFile,
  saveRetaggingUiState,
  saveRetaggingZfsInventoryFile,
} from "@/lib/appPersistence";
import { ExportButton } from "./ExportButton";
import { FileUploadSection } from "./FileUploadSection";

interface RetaggingDecisionToolProps {
  shopifyStockFile: File | null;
  shopifySkuEanMapperFile: File | null;
  onShopifyStockFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onShopifyStockFileRemove: (fileName: string) => void;
  shopifySyncError?: string | null;
  isShopifyStockLoading?: boolean;
}

type RetaggingDecisionFileKey = "salesPerformance" | "salesArticleLevel" | "zfsInventory";

const columns: Array<keyof RetaggingDecisionRow> = [
  "SKU",
  "Zalando SKU",
  "EAN",
  "Article name",
  "Category",
  "Current season",
  "Article status",
  "Zalando issue/status code",
  "ZFS stock",
  "Internal Shopify stock",
  "NMV used as GMV proxy",
  "Units sold last 12 months",
  "Return rate, if available",
  "Size Availability Rate / SAR",
  "Current discount %",
  "Basic Retagging Eligible",
  "Retagging eligibility",
  "Retagging score",
  "Season recommendation",
  "Operational note",
  "Suggested action",
  "Reason / explanation",
  "Missing data / manual review note",
];

const numericColumns = new Set<keyof RetaggingDecisionRow>([
  "ZFS stock",
  "Internal Shopify stock",
  "NMV used as GMV proxy",
  "Units sold last 12 months",
  "Return rate, if available",
  "Size Availability Rate / SAR",
  "Current discount %",
  "Retagging score",
]);

const ITEMS_PER_PAGE = 25;

const getFileSignature = (file: File | null) =>
  file ? `${file.name}:${file.size}:${file.lastModified}` : null;

const getShopifyInputSignature = (stockFile: File | null, mapperFile: File | null) =>
  `${getFileSignature(stockFile) || "no-stock"}|${getFileSignature(mapperFile) || "no-mapper"}`;

export const RetaggingDecisionTool: React.FC<RetaggingDecisionToolProps> = ({
  shopifyStockFile,
  shopifySkuEanMapperFile,
  onShopifyStockFileChange,
  onShopifyStockFileRemove,
  shopifySyncError = null,
  isShopifyStockLoading = false,
}) => {
  const [files, setFiles] = useState<Record<RetaggingDecisionFileKey, File | null>>({
    salesPerformance: null,
    salesArticleLevel: null,
    zfsInventory: null,
  });
  const [sarThreshold, setSarThreshold] = useState(85);
  const [nmvThreshold, setNmvThreshold] = useState(1000);
  const [currentSeasonCode, setCurrentSeasonCode] = useState("FS_26");
  const [requiredDiscountThreshold, setRequiredDiscountThreshold] = useState(20);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [eligibilityFilter, setEligibilityFilter] = useState("all");
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [hasProcessed, setHasProcessed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingPersistedState, setIsLoadingPersistedState] = useState(true);
  const [processingStatus, setProcessingStatus] = useState("");
  const [result, setResult] = useState<RetaggingDecisionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const previousShopifyFileSignatureRef = useRef<string>(getShopifyInputSignature(shopifyStockFile, shopifySkuEanMapperFile));
  const hasInitializedShopifyFileRef = useRef(false);
  const tableDragRef = useRef({
    isDragging: false,
    startX: 0,
    scrollLeft: 0,
  });
  const [isTableDragging, setIsTableDragging] = useState(false);

  const requiredFilesPresent = Boolean(files.salesPerformance && files.zfsInventory);

  const processButtonLabel = isProcessing
    ? "Processing..."
    : !requiredFilesPresent
    ? "Upload Required CSVs"
    : "Process Retagging Decisions";

  useEffect(() => {
    let cancelled = false;

    const loadState = async () => {
      try {
        const persisted = await loadRetaggingState();
        if (cancelled) return;

        setFiles({
          salesPerformance: persisted.salesPerformanceFile,
          salesArticleLevel: persisted.salesArticleLevelFile,
          zfsInventory: persisted.zfsInventoryFile,
        });
        setSarThreshold(persisted.sarThreshold);
        setNmvThreshold(persisted.nmvThreshold);
        setCurrentSeasonCode(persisted.currentSeasonCode);
        setRequiredDiscountThreshold(persisted.requiredDiscountThreshold);
        setSearchTerm(persisted.searchTerm);
        setActionFilter(persisted.actionFilter);
        setEligibilityFilter(persisted.eligibilityFilter);
        setShowMissingOnly(persisted.showMissingOnly);
        setResult(persisted.result);
        setHasProcessed(Boolean(persisted.hasProcessed && persisted.result));
      } catch (err) {
        console.error("Error loading Retagging state:", err);
        if (!cancelled) {
          setError("Could not load saved Retagging state");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPersistedState(false);
        }
      }
    };

    loadState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isLoadingPersistedState) return;
    saveRetaggingUiState({
      sarThreshold,
      nmvThreshold,
      currentSeasonCode,
      requiredDiscountThreshold,
      searchTerm,
      actionFilter,
      eligibilityFilter,
      showMissingOnly,
      hasProcessed,
      result,
    }).catch((err) => {
      console.error("Error saving Retagging state:", err);
    });
  }, [
    actionFilter,
    eligibilityFilter,
    hasProcessed,
    currentSeasonCode,
    isLoadingPersistedState,
    nmvThreshold,
    requiredDiscountThreshold,
    result,
    sarThreshold,
    searchTerm,
    showMissingOnly,
  ]);

  useEffect(() => {
    if (isLoadingPersistedState || isShopifyStockLoading) {
      return;
    }

    const currentSignature = getShopifyInputSignature(shopifyStockFile, shopifySkuEanMapperFile);
    if (!hasInitializedShopifyFileRef.current) {
      previousShopifyFileSignatureRef.current = currentSignature;
      hasInitializedShopifyFileRef.current = true;
      return;
    }

    if (previousShopifyFileSignatureRef.current !== currentSignature) {
      previousShopifyFileSignatureRef.current = currentSignature;
      if (hasProcessed || result) {
        setHasProcessed(false);
        setResult(null);
        clearRetaggingResult().catch((err) => {
          console.error("Error clearing stale Retagging result:", err);
        });
      }
    }
  }, [hasProcessed, isLoadingPersistedState, isShopifyStockLoading, result, shopifySkuEanMapperFile, shopifyStockFile]);

  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    key: RetaggingDecisionFileKey
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFiles((prev) => ({ ...prev, [key]: file }));
    setError(null);
    setHasProcessed(false);
    setResult(null);
    const saveFile = key === "salesPerformance"
      ? saveRetaggingSalesPerformanceFile
      : key === "salesArticleLevel"
      ? saveRetaggingSalesArticleLevelFile
      : saveRetaggingZfsInventoryFile;
    saveFile(file).catch((err) => {
      console.error("Error saving Retagging file:", err);
    });
  };

  const handleRemoveFile = (_fileName: string, key: RetaggingDecisionFileKey) => {
    setFiles((prev) => ({ ...prev, [key]: null }));
    setHasProcessed(false);
    setResult(null);
    const saveFile = key === "salesPerformance"
      ? saveRetaggingSalesPerformanceFile
      : key === "salesArticleLevel"
      ? saveRetaggingSalesArticleLevelFile
      : saveRetaggingZfsInventoryFile;
    saveFile(null).catch((err) => {
      console.error("Error clearing Retagging file:", err);
    });
  };

  const clearStaleResult = () => {
    if (!hasProcessed && !result) return;
    setHasProcessed(false);
    setResult(null);
    clearRetaggingResult().catch((err) => {
      console.error("Error clearing stale Retagging result:", err);
    });
  };

  const handleSarThresholdChange = (value: number) => {
    setSarThreshold(value);
    clearStaleResult();
  };

  const handleNmvThresholdChange = (value: number) => {
    setNmvThreshold(value);
    clearStaleResult();
  };

  const handleCurrentSeasonCodeChange = (value: string) => {
    setCurrentSeasonCode(value);
    clearStaleResult();
  };

  const handleRequiredDiscountThresholdChange = (value: number) => {
    setRequiredDiscountThreshold(value);
    clearStaleResult();
  };

  const resetFiles = async () => {
    setFiles({
      salesPerformance: null,
      salesArticleLevel: null,
      zfsInventory: null,
    });
    onShopifyStockFileRemove(shopifyStockFile?.name || "");
    setError(null);
    setHasProcessed(false);
    setResult(null);
    setSarThreshold(85);
    setNmvThreshold(1000);
    setCurrentSeasonCode("FS_26");
    setRequiredDiscountThreshold(20);
    setSearchTerm("");
    setActionFilter("all");
    setEligibilityFilter("all");
    setShowMissingOnly(false);
    try {
      await resetRetaggingState();
    } catch (err) {
      console.error("Error resetting Retagging state:", err);
    }
  };

  const clearTable = async () => {
    setHasProcessed(false);
    setResult(null);
    setSearchTerm("");
    setActionFilter("all");
    setEligibilityFilter("all");
    setShowMissingOnly(false);
    try {
      await clearRetaggingResult();
    } catch (err) {
      console.error("Error clearing Retagging result:", err);
    }
  };

  const processFiles = async () => {
    if (!requiredFilesPresent) {
      setError("Upload the Sales Performance detail-breakdown CSV and ZFS Inventory CSV first.");
      return;
    }

    try {
      setError(null);
      setIsProcessing(true);
      setProcessingStatus("Parsing Sales Performance file...");
      const salesRows = await parseFile(files.salesPerformance!);

      let salesArticleLevelRows: any[] = [];
      if (files.salesArticleLevel) {
        setProcessingStatus("Parsing Sales Performance article-level file...");
        salesArticleLevelRows = await parseFile(files.salesArticleLevel);
      }

      setProcessingStatus("Parsing ZFS Inventory file...");
      const inventoryRows = await parseFile(files.zfsInventory!);

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

      setProcessingStatus("Calculating retagging decisions...");
      const processed = processRetaggingDecisions({
        salesRows,
        salesArticleLevelRows,
        inventoryRows,
        shopifyStockRows: shopifyRows,
        shopifySkuEanRows,
        config: {
          market: "DE",
          sarThreshold,
          nmvThreshold,
          currentSeasonCode,
          requiredDiscountThreshold,
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
      setError(err instanceof Error ? err.message : "Failed to process Retagging Decision files");
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  };

  const rows = result?.rows || [];
  const summaryCards = [
    { label: "Total Articles", value: result?.summary.totalArticles ?? 0 },
    { label: "Retag Candidates", value: result?.summary.retagCandidates ?? 0 },
    { label: "Basic Eligible", value: result?.summary.basicsCandidates ?? 0 },
    { label: "Manual Review", value: result?.summary.manualReview ?? 0 },
    { label: "Clearance", value: result?.summary.clearance ?? 0 },
  ];

  const filteredRows = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch = !search || [
        row.SKU,
        row["Zalando SKU"],
        row.EAN,
        row["Article name"],
        row.Category,
        row["Season recommendation"],
        row["Operational note"],
        row["Suggested action"],
      ].some((value) => String(value).toLowerCase().includes(search));
      const matchesAction = actionFilter === "all" || row["Suggested action"] === actionFilter;
      const matchesEligibility = eligibilityFilter === "all" || [
        row["Basic Retagging Eligible"],
        row["Retagging eligibility"],
      ].includes(eligibilityFilter as any);
      const matchesMissing = !showMissingOnly || Boolean(row["Missing data / manual review note"]);
      return matchesSearch && matchesAction && matchesEligibility && matchesMissing;
    });
  }, [actionFilter, eligibilityFilter, rows, searchTerm, showMissingOnly]);

  const { currentPage, totalPages, paginatedItems, goToPage } = usePagination(filteredRows, ITEMS_PER_PAGE);

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

  return (
    <div className="space-y-5">
      <LoadingOverlay
        isLoading={isProcessing || isLoadingPersistedState}
        message={isLoadingPersistedState ? "Loading Retagging data..." : processingStatus}
      />

      {(error || shopifySyncError) && (
        <Alert variant="destructive">
          <AlertTitle>{error || shopifySyncError}</AlertTitle>
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <FileUploadSection
            title="Sales Performance Detail Breakdown CSV"
            onChange={(event) => handleFileChange(event, "salesPerformance")}
            onRemove={(fileName) => handleRemoveFile(fileName, "salesPerformance")}
            files={files.salesPerformance ? [files.salesPerformance] : []}
            acceptedFileTypes=".csv,.tsv,.txt,.xlsx,.xls"
          />
          <FileUploadSection
            title="Sales Performance Article Level CSV (Global SAR)"
            onChange={(event) => handleFileChange(event, "salesArticleLevel")}
            onRemove={(fileName) => handleRemoveFile(fileName, "salesArticleLevel")}
            files={files.salesArticleLevel ? [files.salesArticleLevel] : []}
            acceptedFileTypes=".csv,.tsv,.txt,.xlsx,.xls"
          />
          <FileUploadSection
            title="ZFS Inventory CSV"
            onChange={(event) => handleFileChange(event, "zfsInventory")}
            onRemove={(fileName) => handleRemoveFile(fileName, "zfsInventory")}
            files={files.zfsInventory ? [files.zfsInventory] : []}
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
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-gray-500" />
            <div>
              <h3 className="text-base font-semibold text-gray-900">Decision Configuration</h3>
              <p className="text-sm text-gray-500">Thresholds are configurable for the DE MVP.</p>
            </div>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
            NMV is used as GMV proxy
          </span>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">SAR threshold</span>
            <div className="mt-1 flex rounded-lg border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-gray-900">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={sarThreshold}
                onChange={(event) => handleSarThresholdChange(Number(event.target.value))}
                className="w-full rounded-l-lg border-0 px-3 py-2 text-sm text-gray-900 focus:outline-none"
              />
              <span className="flex items-center rounded-r-lg border-l border-gray-200 bg-gray-50 px-3 text-sm text-gray-500">
                %
              </span>
            </div>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">NMV/GMV threshold</span>
            <div className="mt-1 flex rounded-lg border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-gray-900">
              <span className="flex items-center rounded-l-lg border-r border-gray-200 bg-gray-50 px-3 text-sm text-gray-500">
                EUR
              </span>
              <input
                type="number"
                min={0}
                step={100}
                value={nmvThreshold}
                onChange={(event) => handleNmvThresholdChange(Number(event.target.value))}
                className="w-full rounded-r-lg border-0 px-3 py-2 text-sm text-gray-900 focus:outline-none"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Current active season</span>
            <input
              type="text"
              value={currentSeasonCode}
              onChange={(event) => handleCurrentSeasonCodeChange(event.target.value)}
              placeholder="FS_26"
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Required discount</span>
            <div className="mt-1 flex rounded-lg border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-gray-900">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={requiredDiscountThreshold}
                onChange={(event) => handleRequiredDiscountThresholdChange(Number(event.target.value))}
                className="w-full rounded-l-lg border-0 px-3 py-2 text-sm text-gray-900 focus:outline-none"
              />
              <span className="flex items-center rounded-r-lg border-l border-gray-200 bg-gray-50 px-3 text-sm text-gray-500">
                %
              </span>
            </div>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-5 py-4">
          <div className="text-sm text-gray-600">
            Current rules: SAR &gt;= {sarThreshold}%, NMV/GMV &gt;= EUR {nmvThreshold.toLocaleString()}, active season {currentSeasonCode || "not set"}, discount threshold {requiredDiscountThreshold}%.
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
              <h3 className="text-base font-semibold text-gray-900">Retagging Decision Export</h3>
              <p className="mt-1 text-sm text-gray-500">
                {rows.length.toLocaleString()} DE decision rows generated from the uploaded Zalando and Shopify files.
              </p>
            </div>
            {rows.length > 0 ? (
              <ExportButton
                data={rows}
                label="Export Retagging Decision"
                filename="retagging-decision-export"
              />
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex items-center rounded-lg border-2 border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-400 disabled:cursor-not-allowed"
              >
                Export Retagging Decision
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-3 border-b border-gray-200 bg-gray-50 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
          {summaryCards.map((card) => (
            <div key={card.label} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <div className="text-sm font-medium uppercase tracking-wide text-gray-500">{card.label}</div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">
                {card.value.toLocaleString()}
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
              placeholder="Search SKU, EAN, or article name"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </label>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            >
              <option value="all">All season recommendations</option>
              {([
                "Already Basic / no action required",
                "Basic retagging eligible - choose department manually",
                "Retag to next season",
                "Manual review",
                "Clearance / phase out",
              ] satisfies RetaggingSuggestedAction[]).map((action) => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </div>

          <select
            value={eligibilityFilter}
            onChange={(event) => setEligibilityFilter(event.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          >
            <option value="all">All eligibility</option>
            <option value="Yes">Basic eligible: Yes</option>
            <option value="No">Basic eligible: No</option>
            <option value="Eligible">Eligible</option>
            <option value="Not eligible">Not eligible</option>
            <option value="Unknown / missing data">Unknown / missing data</option>
          </select>

          <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showMissingOnly}
              onChange={(event) => setShowMissingOnly(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
            />
            Missing data only
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
          <table className="w-full min-w-[2500px] border-collapse">
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
                  <tr key={`${row.SKU}-${row.EAN}-${index}`} className="hover:bg-gray-50">
                    {columns.map((column) => (
                      <td
                        key={column}
                        className={`px-4 py-3 text-sm text-gray-900 ${
                          numericColumns.has(column) ? "text-right tabular-nums" : ""
                        } ${
                          column === "Operational note" || column === "Reason / explanation" || column === "Missing data / manual review note"
                            ? "min-w-[280px] whitespace-normal"
                            : "whitespace-nowrap"
                        }`}
                      >
                        {row[column] === "" || row[column] === undefined ? "N/A" : row[column]}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center">
                    <div className="mx-auto max-w-lg">
                      <div className="text-sm font-semibold text-gray-900">
                        No matching decision rows
                      </div>
                      <div className="mt-1 text-sm text-gray-500">
                        Adjust the search and filters, or confirm that the uploaded files contain DE rows.
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
          <div className="text-sm text-gray-500">
            Showing {filteredRows.length > 0 ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0} to{" "}
            {Math.min(currentPage * ITEMS_PER_PAGE, filteredRows.length)} of{" "}
            {filteredRows.length.toLocaleString()} entries
          </div>
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
