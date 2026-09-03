import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Barcode,
  CheckCircle2,
  Eye,
  Filter,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { FileUploadSection } from "@/components/FileUploadSection";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/usePagination";
import {
  loadBarcodePdfState,
  saveBarcodePdfCsvFile,
  saveBarcodePdfUiState,
} from "@/lib/appPersistence";
import {
  BarcodeBrand,
  BarcodeCsvResult,
  BarcodeLabelRow,
  BarcodeLabelStatusFilter,
  BarcodePdfOutputMode,
} from "@/types/barcode";
import type {
  BarcodePdfBrand,
  BarcodePdfProgress,
} from "@/utils/exporters/barcodePdfExporter";
import { downloadBlob } from "@/utils/exporters/downloadHelper";
import { processBarcodeCsvFile } from "@/utils/processors/barcodeCsvProcessor";

const previewColumns = ["SKU", "Article name", "Color", "Size", "EAN", "Status", "Preview"];
const PREVIEW_PAGE_SIZE = 25;
const brandLabels: Record<BarcodeBrand, string> = {
  blackskies: "Blackskies",
  akitsune: "Akitsune",
};

interface BarcodePdfToolProps {
  shopifyResult: BarcodeCsvResult | null;
  shopifyBrand: BarcodeBrand | null;
  shopifySyncedAt: string | null;
  shopifyError: string | null;
  isShopifyStateLoading: boolean;
  isShopifySyncing: boolean;
  syncingShopifyBrand: BarcodeBrand | null;
  onShopifySync: (brand: BarcodeBrand) => void;
  onCsvSourceActiveChange: (active: boolean) => void;
  onClearShopifyData: () => void | Promise<void>;
}

const getRowKey = (row: BarcodeLabelRow) =>
  `${row.sourceRowNumber}-${row.sku}-${row.ean}`;

const formatSyncedAt = (timestamp: string) => {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export const BarcodePdfTool: React.FC<BarcodePdfToolProps> = ({
  shopifyResult,
  shopifyBrand,
  shopifySyncedAt,
  shopifyError,
  isShopifyStateLoading,
  isShopifySyncing,
  syncingShopifyBrand,
  onShopifySync,
  onCsvSourceActiveChange,
  onClearShopifyData,
}) => {
  const [brand, setBrand] = useState<BarcodePdfBrand>("blackskies");
  const [outputMode, setOutputMode] = useState<BarcodePdfOutputMode>("combined");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvResult, setCsvResult] = useState<BarcodeCsvResult | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<BarcodeLabelStatusFilter>("all");
  const [isLoadingPersistedState, setIsLoadingPersistedState] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<BarcodePdfProgress | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationSuccess, setGenerationSuccess] = useState<string | null>(null);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [selectedPreviewRowKey, setSelectedPreviewRowKey] = useState<string | null>(null);
  const [labelPreviewUrl, setLabelPreviewUrl] = useState<string | null>(null);
  const [isLabelPreviewLoading, setIsLabelPreviewLoading] = useState(false);
  const [labelPreviewError, setLabelPreviewError] = useState<string | null>(null);
  const parseRequestRef = useRef(0);
  const previewRef = useRef<HTMLElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableDragRef = useRef({ isDragging: false, startX: 0, scrollLeft: 0 });
  const [isTableDragging, setIsTableDragging] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadState = async () => {
      try {
        const persisted = await loadBarcodePdfState();
        if (cancelled) return;

        setBrand(persisted.brand);
        setOutputMode(persisted.outputMode);
        setSearchTerm(persisted.searchTerm);
        setStatusFilter(persisted.statusFilter);
        if (persisted.csvFile) {
          onCsvSourceActiveChange(true);
          await onClearShopifyData();
          if (cancelled) return;
          setCsvFile(persisted.csvFile);
          setCsvResult(
            persisted.csvResult ?? await processBarcodeCsvFile(persisted.csvFile)
          );
        }
      } catch (error) {
        console.error("Could not load saved barcode PDF state:", error);
        if (!cancelled) setUploadError("Could not load the saved barcode workspace.");
      } finally {
        if (!cancelled) setIsLoadingPersistedState(false);
      }
    };

    void loadState();
    return () => {
      cancelled = true;
    };
  }, [onClearShopifyData, onCsvSourceActiveChange]);

  useEffect(() => {
    if (isLoadingPersistedState) return;
    saveBarcodePdfUiState({
      brand,
      outputMode,
      searchTerm,
      statusFilter,
      csvResult,
    }).catch((error) => {
      console.error("Could not save barcode PDF state:", error);
    });
  }, [brand, csvResult, isLoadingPersistedState, outputMode, searchTerm, statusFilter]);

  useEffect(
    () => () => onCsvSourceActiveChange(false),
    [onCsvSourceActiveChange]
  );

  const handleCsvChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    const requestId = ++parseRequestRef.current;
    if (!selectedFile.name.toLowerCase().endsWith(".csv")) {
      setCsvFile(null);
      setCsvResult(null);
      setIsParsing(false);
      setUploadError("Upload a CSV file.");
      onCsvSourceActiveChange(false);
      saveBarcodePdfCsvFile(null).catch((error) => {
        console.error("Could not clear the saved barcode CSV:", error);
      });
      return;
    }

    onCsvSourceActiveChange(true);
    setCsvFile(selectedFile);
    setCsvResult(null);
    setUploadError(null);

    try {
      setIsParsing(true);
      await onClearShopifyData();
      saveBarcodePdfCsvFile(selectedFile).catch((error) => {
        console.error("Could not save the barcode CSV:", error);
      });
      const result = await processBarcodeCsvFile(selectedFile);
      if (requestId !== parseRequestRef.current) return;
      setCsvResult(result);
    } catch (error) {
      if (requestId !== parseRequestRef.current) return;
      setUploadError(error instanceof Error ? error.message : "Could not process the CSV file.");
    } finally {
      if (requestId === parseRequestRef.current) setIsParsing(false);
    }
  };

  const handleCsvRemove = () => {
    parseRequestRef.current += 1;
    setCsvFile(null);
    setCsvResult(null);
    setIsParsing(false);
    setUploadError(null);
    setSearchTerm("");
    setStatusFilter("all");
    setSelectedPreviewRowKey(null);
    onCsvSourceActiveChange(false);
    saveBarcodePdfCsvFile(null).catch((error) => {
      console.error("Could not clear the saved barcode CSV:", error);
    });
  };

  const handleShopifySync = (selectedShopifyBrand: BarcodeBrand) => {
    setSearchTerm("");
    setStatusFilter("all");
    setSelectedPreviewRowKey(null);
    onShopifySync(selectedShopifyBrand);
  };

  const handleShopifyClear = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setSelectedPreviewRowKey(null);
    void onClearShopifyData();
  };

  const previewMessage =
    isParsing
      ? "Reading and validating the CSV..."
      : csvFile
        ? uploadError
          ? "Correct the CSV issue to preview its barcode labels."
          : "No product rows are available for preview."
        : isShopifySyncing
          ? "Syncing and validating Shopify product variants..."
          : shopifyResult
            ? "No Shopify product variants are available for preview."
            : "Upload a CSV or sync from Shopify to preview barcode labels.";
  const activeResult = csvFile ? csvResult : shopifyResult;
  const activeBrand = csvFile || !shopifyBrand ? brand : shopifyBrand;
  const previewRows = useMemo(() => activeResult?.rows ?? [], [activeResult]);
  const filteredRows = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return previewRows.filter((row) => {
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      if (!matchesStatus) return false;
      if (!search) return true;
      return [row.sku, row.articleName, row.color, row.size, row.ean, ...row.issues]
        .some((value) => value.toLowerCase().includes(search));
    });
  }, [previewRows, searchTerm, statusFilter]);
  const readyRows = useMemo(
    () => previewRows.filter((row) => row.status === "ready"),
    [previewRows]
  );
  const selectedPreviewRow = useMemo(
    () => readyRows.find((row) => getRowKey(row) === selectedPreviewRowKey) ?? readyRows[0] ?? null,
    [readyRows, selectedPreviewRowKey]
  );
  const readyLabelCount = activeResult?.summary.readyRows ?? 0;
  const invalidLabelCount = activeResult?.summary.invalidRows ?? 0;
  const duplicateLabelCount = activeResult?.summary.duplicateRows ?? 0;
  const skippedLabelCount = invalidLabelCount + duplicateLabelCount;
  const { currentPage, totalPages, paginatedItems, goToPage } = usePagination(
    filteredRows,
    PREVIEW_PAGE_SIZE
  );

  useEffect(() => {
    if (filteredRows.length) goToPage(1);
  }, [activeResult, filteredRows.length, goToPage, searchTerm, statusFilter]);

  useEffect(() => {
    if (!activeResult || !previewRows.length) return;

    const scrollTimer = window.setTimeout(() => {
      previewRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);

    return () => window.clearTimeout(scrollTimer);
  }, [activeResult, previewRows.length]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLabelPreviewUrl(null);
    setLabelPreviewError(null);

    if (!selectedPreviewRow) {
      setIsLabelPreviewLoading(false);
      return;
    }

    setIsLabelPreviewLoading(true);
    import("@/utils/exporters/barcodePdfExporter")
      .then(({ createBarcodeLabelPreviewBlob }) =>
        createBarcodeLabelPreviewBlob(selectedPreviewRow, activeBrand)
      )
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
          return;
        }
        setLabelPreviewUrl(objectUrl);
      })
      .catch((error) => {
        if (!cancelled) {
          setLabelPreviewError(
            error instanceof Error ? error.message : "Could not render the label preview."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLabelPreviewLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [activeBrand, selectedPreviewRow]);

  const selectedBrand = activeBrand === "blackskies" ? "Blackskies" : "Akitsune";
  const selectedSource = csvFile
    ? "CSV upload"
    : shopifyResult || isShopifySyncing
      ? "Shopify"
      : "no data source";
  const selectedOutput = outputMode === "combined" ? "combined PDF" : "individual PDFs";
  const shopifySourceActive = isShopifySyncing || shopifyResult !== null;

  useEffect(() => {
    setIsConfirmationOpen(false);
    setGenerationProgress(null);
    setGenerationError(null);
    setGenerationSuccess(null);
    setSelectedPreviewRowKey(null);
  }, [activeBrand, activeResult, outputMode]);

  useEffect(() => {
    if (!isConfirmationOpen) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsConfirmationOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isConfirmationOpen]);

  const handleGenerate = async () => {
    if (!activeResult || isGenerating) return;

    setIsConfirmationOpen(false);
    setIsGenerating(true);
    setGenerationProgress(null);
    setGenerationError(null);
    setGenerationSuccess(null);

    try {
      const { generateBarcodePdfDownload } = await import(
        "@/utils/exporters/barcodePdfExporter"
      );
      const download = await generateBarcodePdfDownload({
        rows: activeResult.rows,
        brand: activeBrand,
        outputMode,
        onProgress: setGenerationProgress,
      });
      downloadBlob(download.blob, download.filename);
      setGenerationSuccess(
        `${download.labelCount.toLocaleString()} ${
          download.labelCount === 1 ? "label" : "labels"
        } downloaded as ${outputMode === "combined" ? "one PDF" : "a ZIP file"}.`
      );
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Could not generate the PDFs.");
    } finally {
      setIsGenerating(false);
      setGenerationProgress(null);
    }
  };

  const generationButtonLabel = isGenerating
    ? generationProgress?.phase === "archive"
      ? "Creating ZIP..."
      : generationProgress
        ? `Generating ${generationProgress.completed.toLocaleString()}/${generationProgress.total.toLocaleString()}...`
        : "Preparing PDFs..."
    : "Generate PDFs";
  const loadingMessage = isLoadingPersistedState || isShopifyStateLoading
    ? "Loading the saved barcode workspace..."
    : isParsing
      ? "Reading and validating the CSV..."
      : isShopifySyncing
        ? syncingShopifyBrand
          ? `Syncing and validating ${brandLabels[syncingShopifyBrand]} products...`
          : "Syncing and validating Shopify products..."
        : generationButtonLabel;
  const shopifyStatusText = csvFile
    ? "Reset the uploaded CSV before syncing products from Shopify."
    : isShopifySyncing && syncingShopifyBrand
      ? `Syncing ${brandLabels[syncingShopifyBrand]} products...`
      : shopifyResult && shopifyBrand
        ? `${brandLabels[shopifyBrand]}${shopifySyncedAt ? ` · Last synced ${formatSyncedAt(shopifySyncedAt)}` : " synced"} · ${shopifyResult.summary.totalRows.toLocaleString()} variants · ${shopifyResult.summary.readyRows.toLocaleString()} labels ready`
        : "Choose a brand to load its product variants from Shopify.";

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
        isLoading={
          isLoadingPersistedState
          || isShopifyStateLoading
          || isParsing
          || isShopifySyncing
          || isGenerating
        }
        message={loadingMessage}
      />
      <section className="ops-surface rounded-[8px]">
        <div className="ops-section-header flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="ops-title">Shopify Products</h2>
            <p className="ops-muted">Sync one brand at a time using its Shopify vendor.</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-base font-medium text-emerald-700">
            Vendor filtered
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <p
            className={`text-base ${isShopifySyncing ? "font-medium text-emerald-700" : "text-slate-600"}`}
            role="status"
          >
            {shopifyStatusText}
          </p>
          <div className="flex flex-wrap gap-3">
            {(["blackskies", "akitsune"] as const).map((shopifySyncBrand) => (
              <button
                key={shopifySyncBrand}
                type="button"
                onClick={() => handleShopifySync(shopifySyncBrand)}
                disabled={
                  Boolean(csvFile)
                  || isLoadingPersistedState
                  || isShopifyStateLoading
                  || isShopifySyncing
                  || isGenerating
                }
                className="ops-button-primary"
                title={
                  csvFile
                    ? "Reset the uploaded CSV before syncing Shopify products"
                    : `Pull only ${brandLabels[shopifySyncBrand]} products from Shopify`
                }
              >
                {syncingShopifyBrand === shopifySyncBrand ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                )}
                {syncingShopifyBrand === shopifySyncBrand
                  ? `Syncing ${brandLabels[shopifySyncBrand]}...`
                  : `Sync ${brandLabels[shopifySyncBrand]}`}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="ops-surface space-y-2 rounded-[8px] p-5">
        <FileUploadSection
          title="Product CSV"
          files={csvFile ? [csvFile] : []}
          onChange={handleCsvChange}
          onRemove={handleCsvRemove}
          acceptedFileTypes=".csv,text/csv"
          acceptedFileLabel="CSV"
          disabled={
            isLoadingPersistedState
            || isShopifyStateLoading
            || shopifySourceActive
            || isGenerating
          }
          disabledMessage={
            isLoadingPersistedState || isShopifyStateLoading
              ? "Loading the saved barcode workspace."
              : isGenerating
              ? "PDF generation is in progress."
              : isShopifySyncing
              ? "Shopify sync is in progress."
              : "Clear the Shopify table before uploading a CSV."
          }
        />
        <p className="px-1 text-sm text-slate-500">
          Required columns: SKU, EAN, ARTICLE_NAME, COLOR, and SIZE.
        </p>
        {isParsing && (
          <p className="flex items-center gap-2 px-1 text-sm font-medium text-slate-600" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Reading and validating CSV rows...
          </p>
        )}
        {uploadError && (
          <p className="px-1 text-sm font-medium text-red-700" role="alert">
            {uploadError}
          </p>
        )}
        {csvResult && !isParsing && (
          <p className="px-1 text-sm font-medium text-emerald-700" role="status">
            {csvResult.summary.totalRows.toLocaleString()} rows processed ·{" "}
            {csvResult.summary.readyRows.toLocaleString()} labels ready
          </p>
        )}
      </section>

      <section className="ops-surface rounded-[8px]">
        <div className="ops-section-header flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <div>
              <h2 className="ops-title">Barcode Configuration</h2>
              <p className="ops-muted">Choose the label brand and PDF format.</p>
            </div>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-base font-medium text-blue-700">
            90 × 50 mm · EAN-13
          </span>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <label className="block">
            <span className="text-base font-medium text-slate-700">
              Brand{shopifyBrand && !csvFile ? " (from Shopify)" : ""}
            </span>
            <select
              value={activeBrand}
              onChange={(event) => setBrand(event.target.value as BarcodePdfBrand)}
              disabled={
                isLoadingPersistedState
                || isShopifyStateLoading
                || isGenerating
                || isShopifySyncing
                || Boolean(shopifyResult && !csvFile)
              }
              className="ops-input mt-1 w-full"
            >
              <option value="blackskies">Blackskies — www.blackskies.shop</option>
              <option value="akitsune">Akitsune — www.akitsune.com</option>
            </select>
          </label>

          <label className="block">
            <span className="text-base font-medium text-slate-700">PDF output</span>
            <select
              value={outputMode}
              onChange={(event) => setOutputMode(event.target.value as BarcodePdfOutputMode)}
              disabled={isLoadingPersistedState || isShopifyStateLoading || isGenerating}
              className="ops-input mt-1 w-full"
            >
              <option value="combined">Combined PDF</option>
              <option value="individual">Individual PDFs (ZIP)</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-base text-slate-600">
            Current setup: {selectedSource}, {selectedBrand}, {selectedOutput}.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleCsvRemove}
              disabled={!csvFile || isLoadingPersistedState || isGenerating}
              className="ops-button-secondary"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset Files
            </button>
            {shopifyResult && !isShopifySyncing && (
              <button
                type="button"
                onClick={handleShopifyClear}
                disabled={isGenerating}
                className="ops-button-danger"
              >
                Clear Table
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsConfirmationOpen(true)}
              disabled={
                isLoadingPersistedState
                || isShopifyStateLoading
                || isGenerating
                || isParsing
                || isShopifySyncing
                || readyLabelCount === 0
              }
              className="ops-button-primary px-6"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Barcode className="h-4 w-4" aria-hidden="true" />
              )}
              {generationButtonLabel}
            </button>
          </div>
        </div>
      </section>

      {generationError && (
        <Alert variant="destructive">
          <AlertTitle>PDF generation failed</AlertTitle>
          <AlertDescription>{generationError}</AlertDescription>
        </Alert>
      )}

      {generationSuccess && (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Barcode labels generated</AlertTitle>
          <AlertDescription>{generationSuccess}</AlertDescription>
        </Alert>
      )}

      {shopifyError && !csvFile && (
        <Alert variant="destructive">
          <AlertTitle>Shopify sync failed</AlertTitle>
          <AlertDescription>{shopifyError}</AlertDescription>
        </Alert>
      )}

      {activeResult?.warnings.length ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>{csvFile ? "CSV" : "Shopify"} validation notes</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-5">
              {activeResult.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <section
        ref={previewRef}
        className="ops-surface rounded-[8px]"
        aria-labelledby="barcode-preview-title"
      >
        <div className="ops-section-header flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="barcode-preview-title" className="ops-title">
              Barcode Label Preview
            </h2>
            <p className="ops-muted">Review the product data before generating the labels.</p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-base font-medium text-blue-700">
            {readyLabelCount.toLocaleString()} labels ready
          </span>
        </div>

        {activeResult && (
          <>
            <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Total rows", value: activeResult.summary.totalRows, color: "text-slate-950" },
                { label: "Ready labels", value: readyLabelCount, color: "text-emerald-700" },
                { label: "Needs correction", value: invalidLabelCount, color: "text-red-700" },
                { label: "Duplicates", value: duplicateLabelCount, color: "text-amber-700" },
              ].map((card) => (
                <div key={card.label} className="ops-summary-card rounded-[8px]">
                  <div className="ops-kicker">{card.label}</div>
                  <div className={`mt-1 text-3xl font-semibold ${card.color}`}>
                    {card.value.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-4">
              <label className="relative min-w-0 w-full flex-1 sm:min-w-[260px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search SKU, EAN, article, color, or size"
                  className="ops-input w-full pl-10 pr-4"
                />
              </label>
              <label className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <span className="sr-only">Filter barcode rows by status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as BarcodeLabelStatusFilter)}
                  className="ops-input min-w-[190px]"
                >
                  <option value="all">All statuses</option>
                  <option value="ready">Ready</option>
                  <option value="invalid">Needs correction</option>
                  <option value="duplicate">Duplicate</option>
                </select>
              </label>
              <span className="text-base text-slate-500">
                {filteredRows.length.toLocaleString()} of {previewRows.length.toLocaleString()} rows
              </span>
            </div>

            <div className="border-b border-slate-200 px-5 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">PDF label preview</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    This preview uses the same renderer as the downloaded PDF.
                  </p>
                </div>
                {selectedPreviewRow && (
                  <span className="text-sm font-medium text-slate-600">
                    {selectedPreviewRow.sku} · {selectedPreviewRow.ean}
                  </span>
                )}
              </div>

              <div className="mx-auto mt-4 w-full max-w-3xl overflow-hidden border border-slate-300 bg-slate-100 shadow-sm">
                {isLabelPreviewLoading ? (
                  <div
                    className="flex aspect-[9/5] items-center justify-center gap-2 text-base text-slate-600"
                    role="status"
                  >
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    Rendering PDF label preview...
                  </div>
                ) : labelPreviewError ? (
                  <div className="flex aspect-[9/5] items-center justify-center px-6 text-center text-base text-red-700" role="alert">
                    {labelPreviewError}
                  </div>
                ) : labelPreviewUrl ? (
                  <iframe
                    src={`${labelPreviewUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                    title={`Barcode PDF label preview for ${selectedPreviewRow?.sku ?? "selected product"}`}
                    className="aspect-[9/5] w-full bg-white"
                  />
                ) : (
                  <div className="flex aspect-[9/5] items-center justify-center px-6 text-center text-base text-slate-500">
                    No valid label is available to preview.
                  </div>
                )}
              </div>
            </div>
          </>
        )}

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
          <table className="ops-table min-w-[1080px]">
            <thead>
              <tr>
                {previewColumns.map((column) => (
                  <th key={column} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedItems.length ? (
                paginatedItems.map((row) => (
                  <tr key={getRowKey(row)}>
                    <td>{row.sku || "—"}</td>
                    <td>{row.articleName || "—"}</td>
                    <td>{row.color || "—"}</td>
                    <td>{row.size || "—"}</td>
                    <td className="font-medium tabular-nums">{row.ean || "—"}</td>
                    <td>
                      <span
                        className={`inline-flex px-2.5 py-1 text-sm font-medium ${
                          row.status === "ready"
                            ? "bg-emerald-50 text-emerald-700"
                            : row.status === "duplicate"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-red-50 text-red-700"
                        }`}
                      >
                        {row.status === "ready"
                          ? "Ready"
                          : row.status === "duplicate"
                            ? "Duplicate"
                            : "Needs correction"}
                      </span>
                      {row.issues.length > 0 && (
                        <p className="mt-1 min-w-56 text-sm text-slate-500">
                          {row.issues.join(" ")}
                        </p>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => setSelectedPreviewRowKey(getRowKey(row))}
                        disabled={row.status !== "ready"}
                        aria-pressed={selectedPreviewRow ? getRowKey(selectedPreviewRow) === getRowKey(row) : false}
                        className="ops-button-secondary px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
                        title={row.status === "ready" ? "Show this label in the PDF preview" : "Only ready labels can be previewed"}
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                        {selectedPreviewRow && getRowKey(selectedPreviewRow) === getRowKey(row)
                          ? "Viewing"
                          : "Preview"}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={previewColumns.length} className="py-10 text-center text-slate-500">
                    {previewRows.length
                      ? "No barcode rows match the current search and status filter."
                      : previewMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {activeResult && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
            <p className="text-base text-slate-600">
              Showing {filteredRows.length ? (currentPage - 1) * PREVIEW_PAGE_SIZE + 1 : 0}–
              {Math.min(currentPage * PREVIEW_PAGE_SIZE, filteredRows.length)} of{" "}
              {filteredRows.length.toLocaleString()} rows
            </p>
            <Pagination
              currentPage={Math.max(1, currentPage)}
              totalPages={Math.max(1, totalPages)}
              onPageChange={goToPage}
            />
          </div>
        )}
      </section>

      {isConfirmationOpen && activeResult && createPortal(
        <div
          className="fixed inset-0 z-[100] flex h-[100dvh] w-screen overscroll-none items-center justify-center overflow-hidden bg-slate-950/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsConfirmationOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="barcode-pdf-confirmation-title"
            aria-describedby="barcode-pdf-confirmation-description"
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overscroll-contain border border-slate-200 bg-white shadow-2xl"
          >
            <div className="border-b border-slate-200 px-6 py-5">
              <h3 id="barcode-pdf-confirmation-title" className="text-xl font-semibold text-slate-950">
                Generate barcode PDFs?
              </h3>
              <p
                id="barcode-pdf-confirmation-description"
                className="mt-2 text-base leading-6 text-slate-600"
              >
                Review the selected label settings before the download starts.
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
              <dl className="grid overflow-hidden border border-slate-200 sm:grid-cols-2">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 sm:border-r">
                  <dt className="text-sm font-medium text-slate-500">Data source</dt>
                  <dd className="mt-1 text-base font-semibold text-slate-950">{selectedSource}</dd>
                </div>
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <dt className="text-sm font-medium text-slate-500">Brand</dt>
                  <dd className="mt-1 text-base font-semibold text-slate-950">{selectedBrand}</dd>
                </div>
                <div className="border-b border-slate-200 px-4 py-3 sm:border-r">
                  <dt className="text-sm font-medium text-slate-500">Source rows</dt>
                  <dd className="mt-1 text-xl font-semibold text-slate-950">
                    {activeResult.summary.totalRows.toLocaleString()}
                  </dd>
                </div>
                <div className="border-b border-slate-200 px-4 py-3">
                  <dt className="text-sm font-medium text-slate-500">Ready labels</dt>
                  <dd className="mt-1 text-xl font-semibold text-emerald-700">
                    {readyLabelCount.toLocaleString()}
                  </dd>
                </div>
                <div className="border-b border-slate-200 px-4 py-3 sm:border-r">
                  <dt className="text-sm font-medium text-slate-500">PDF output</dt>
                  <dd className="mt-1 text-base font-semibold text-slate-950">
                    {outputMode === "combined" ? "Combined PDF" : "Individual PDFs (ZIP)"}
                  </dd>
                </div>
                <div className="border-b border-slate-200 px-4 py-3">
                  <dt className="text-sm font-medium text-slate-500">Label format</dt>
                  <dd className="mt-1 text-base font-semibold text-slate-950">90 × 50 mm</dd>
                </div>
                <div className="px-4 py-3 sm:border-r">
                  <dt className="text-sm font-medium text-slate-500">Barcode format</dt>
                  <dd className="mt-1 text-base font-semibold text-slate-950">EAN-13</dd>
                </div>
                <div className="px-4 py-3">
                  <dt className="text-sm font-medium text-slate-500">Skipped rows</dt>
                  <dd className={`mt-1 text-base font-semibold ${skippedLabelCount ? "text-amber-700" : "text-slate-950"}`}>
                    {skippedLabelCount.toLocaleString()}
                  </dd>
                </div>
              </dl>

              {skippedLabelCount > 0 && (
                <div className="mt-4 border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                  {invalidLabelCount.toLocaleString()} invalid {invalidLabelCount === 1 ? "row" : "rows"}
                  {" and "}
                  {duplicateLabelCount.toLocaleString()} duplicate {duplicateLabelCount === 1 ? "row" : "rows"}
                  {" will be skipped."}
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setIsConfirmationOpen(false)}
                autoFocus
                className="ops-button-secondary"
              >
                Cancel
              </button>
              <button type="button" onClick={handleGenerate} className="ops-button-primary">
                <Barcode className="h-4 w-4" aria-hidden="true" />
                Generate {readyLabelCount.toLocaleString()} {readyLabelCount === 1 ? "Label" : "Labels"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
