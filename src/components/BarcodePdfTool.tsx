import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Barcode,
  CheckCircle2,
  Loader2,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { FileUploadSection } from "@/components/FileUploadSection";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/usePagination";
import { BarcodeBrand, BarcodeCsvResult } from "@/types/barcode";
import type {
  BarcodePdfBrand,
  BarcodePdfOutputMode,
  BarcodePdfProgress,
} from "@/utils/exporters/barcodePdfExporter";
import { downloadBlob } from "@/utils/exporters/downloadHelper";
import { processBarcodeCsvFile } from "@/utils/processors/barcodeCsvProcessor";

const previewColumns = ["SKU", "Article name", "Color", "Size", "EAN", "Status"];
const PREVIEW_PAGE_SIZE = 50;
const brandLabels: Record<BarcodeBrand, string> = {
  blackskies: "Blackskies",
  akitsune: "Akitsune",
};

interface BarcodePdfToolProps {
  shopifyResult: BarcodeCsvResult | null;
  shopifyBrand: BarcodeBrand | null;
  shopifyError: string | null;
  isShopifySyncing: boolean;
  syncingShopifyBrand: BarcodeBrand | null;
  onShopifySync: (brand: BarcodeBrand) => void;
  onCsvSourceActiveChange: (active: boolean) => void;
  onClearShopifyData: () => void;
}

export const BarcodePdfTool: React.FC<BarcodePdfToolProps> = ({
  shopifyResult,
  shopifyBrand,
  shopifyError,
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
  const [isParsing, setIsParsing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<BarcodePdfProgress | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationSuccess, setGenerationSuccess] = useState<string | null>(null);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const parseRequestRef = useRef(0);

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
      return;
    }

    onClearShopifyData();
    onCsvSourceActiveChange(true);
    setCsvFile(selectedFile);
    setCsvResult(null);
    setUploadError(null);

    try {
      setIsParsing(true);
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
    onCsvSourceActiveChange(false);
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
  const previewRows = activeResult?.rows ?? [];
  const readyLabelCount = activeResult?.summary.readyRows ?? 0;
  const invalidLabelCount = activeResult?.summary.invalidRows ?? 0;
  const duplicateLabelCount = activeResult?.summary.duplicateRows ?? 0;
  const skippedLabelCount = invalidLabelCount + duplicateLabelCount;
  const { currentPage, totalPages, paginatedItems, goToPage } = usePagination(
    previewRows,
    PREVIEW_PAGE_SIZE
  );

  useEffect(() => {
    if (previewRows.length) goToPage(1);
  }, [activeResult, goToPage, previewRows.length]);

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
  const shopifyStatusText = csvFile
    ? "Reset the uploaded CSV before syncing products from Shopify."
    : isShopifySyncing && syncingShopifyBrand
      ? `Syncing ${brandLabels[syncingShopifyBrand]} products...`
      : shopifyResult && shopifyBrand
        ? `${brandLabels[shopifyBrand]} synced · ${shopifyResult.summary.totalRows.toLocaleString()} variants · ${shopifyResult.summary.readyRows.toLocaleString()} labels ready`
        : "Choose a brand to load its product variants from Shopify.";

  return (
    <div className="space-y-5">
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
                onClick={() => onShopifySync(shopifySyncBrand)}
                disabled={Boolean(csvFile) || isShopifySyncing || isGenerating}
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
          disabled={shopifySourceActive || isGenerating}
          disabledMessage={
            isGenerating
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
              disabled={isGenerating || isShopifySyncing || Boolean(shopifyResult && !csvFile)}
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
              disabled={isGenerating}
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
              disabled={!csvFile || isGenerating}
              className="ops-button-secondary"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset Files
            </button>
            {shopifyResult && !isShopifySyncing && (
              <button
                type="button"
                onClick={onClearShopifyData}
                disabled={isGenerating}
                className="ops-button-danger"
              >
                Clear Table
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsConfirmationOpen(true)}
              disabled={isGenerating || isParsing || isShopifySyncing || readyLabelCount === 0}
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

      <section className="ops-surface rounded-[8px]" aria-labelledby="barcode-preview-title">
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

        <div className="overflow-x-auto">
          <table className="ops-table min-w-full">
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
              {previewRows.length ? (
                paginatedItems.map((row) => (
                  <tr key={`${row.sourceRowNumber}-${row.ean}-${row.sku}`}>
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
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={previewColumns.length} className="py-10 text-center text-slate-500">
                    {previewMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
            <p className="text-base text-slate-600">
              Showing {(currentPage - 1) * PREVIEW_PAGE_SIZE + 1}–
              {Math.min(currentPage * PREVIEW_PAGE_SIZE, previewRows.length)} of{" "}
              {previewRows.length.toLocaleString()} rows
            </p>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
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
