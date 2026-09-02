import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Barcode, Loader2, SlidersHorizontal } from "lucide-react";
import { FileUploadSection } from "@/components/FileUploadSection";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/usePagination";
import {
  BarcodeCsvResult,
  ShopifyBarcodeApiError,
  ShopifyBarcodeApiResponse,
} from "@/types/barcode";
import {
  processBarcodeCsvFile,
  processShopifyBarcodeRows,
} from "@/utils/processors/barcodeCsvProcessor";

type DataSource = "csv" | "shopify";
type Brand = "blackskies" | "akitsune";
type OutputMode = "combined" | "individual";

const previewColumns = ["SKU", "Article name", "Color", "Size", "EAN", "Status"];
const PREVIEW_PAGE_SIZE = 50;

const shopifyApiErrorMessage = (body: ShopifyBarcodeApiError, status: number) =>
  body.message || body.error || `Shopify request failed (${status})`;

const loadShopifyBarcodeRows = async (): Promise<ShopifyBarcodeApiResponse> => {
  const response = await fetch("/api/shopify/barcodes", {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const raw = await response.text();
  let body: ShopifyBarcodeApiResponse | ShopifyBarcodeApiError;

  try {
    body = JSON.parse(raw) as ShopifyBarcodeApiResponse | ShopifyBarcodeApiError;
  } catch {
    throw new Error(
      "The Shopify API is unavailable. Run the app with Vercel development mode instead of the frontend-only Vite server."
    );
  }

  if (!response.ok) {
    throw new Error(shopifyApiErrorMessage(body as ShopifyBarcodeApiError, response.status));
  }
  if (!Array.isArray((body as ShopifyBarcodeApiResponse).rows)) {
    throw new Error("Shopify returned an invalid barcode product response.");
  }

  return body as ShopifyBarcodeApiResponse;
};

export const BarcodePdfTool: React.FC = () => {
  const [dataSource, setDataSource] = useState<DataSource>("csv");
  const [brand, setBrand] = useState<Brand>("blackskies");
  const [outputMode, setOutputMode] = useState<OutputMode>("combined");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvResult, setCsvResult] = useState<BarcodeCsvResult | null>(null);
  const [shopifyResult, setShopifyResult] = useState<BarcodeCsvResult | null>(null);
  const [shopifySyncedAt, setShopifySyncedAt] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSyncingShopify, setIsSyncingShopify] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [shopifyError, setShopifyError] = useState<string | null>(null);
  const parseRequestRef = useRef(0);

  const handleCsvChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    const requestId = ++parseRequestRef.current;
    if (!selectedFile.name.toLowerCase().endsWith(".csv")) {
      setCsvFile(null);
      setCsvResult(null);
      setIsParsing(false);
      setUploadError("Upload a CSV file.");
      return;
    }

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
  };

  const handleShopifySync = async () => {
    try {
      setIsSyncingShopify(true);
      setShopifyError(null);
      const response = await loadShopifyBarcodeRows();
      setShopifyResult(processShopifyBarcodeRows(response.rows));
      setShopifySyncedAt(response.syncedAt);
    } catch (error) {
      setShopifyError(
        error instanceof Error ? error.message : "Could not load barcode products from Shopify."
      );
    } finally {
      setIsSyncingShopify(false);
    }
  };

  const previewMessage =
    dataSource === "csv"
      ? isParsing
        ? "Reading and validating the CSV..."
        : csvFile
          ? uploadError
            ? "Correct the CSV issue to preview its barcode labels."
            : "No product rows are available for preview."
        : "Upload a CSV to preview its barcode labels."
      : isSyncingShopify
        ? "Syncing and validating Shopify product variants..."
        : shopifyError && !shopifyResult
          ? "Resolve the Shopify issue to preview its barcode labels."
          : shopifyResult
            ? "No Shopify product variants are available for preview."
            : "Load Shopify product data to preview its barcode labels.";
  const activeResult = dataSource === "csv" ? csvResult : shopifyResult;
  const previewRows = activeResult?.rows ?? [];
  const readyLabelCount = activeResult?.summary.readyRows ?? 0;
  const { currentPage, totalPages, paginatedItems, goToPage } = usePagination(
    previewRows,
    PREVIEW_PAGE_SIZE
  );

  useEffect(() => {
    if (previewRows.length) goToPage(1);
  }, [activeResult, dataSource, goToPage, previewRows.length]);

  const selectedBrand = brand === "blackskies" ? "Blackskies" : "Akitsune";
  const selectedSource = dataSource === "csv" ? "CSV upload" : "Shopify";
  const selectedOutput = outputMode === "combined" ? "combined PDF" : "individual PDFs";

  return (
    <div className="space-y-5">
      <section className="ops-surface rounded-[8px]">
        <div className="ops-section-header flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <div>
              <h2 className="ops-title">Barcode Configuration</h2>
              <p className="ops-muted">Choose the product source, label brand, and PDF format.</p>
            </div>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-base font-medium text-blue-700">
            90 × 50 mm · EAN-13
          </span>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
          <label className="block">
            <span className="text-base font-medium text-slate-700">Data source</span>
            <select
              value={dataSource}
              onChange={(event) => setDataSource(event.target.value as DataSource)}
              className="ops-input mt-1 w-full"
            >
              <option value="csv">CSV upload</option>
              <option value="shopify">Shopify</option>
            </select>
          </label>

          <label className="block">
            <span className="text-base font-medium text-slate-700">Brand</span>
            <select
              value={brand}
              onChange={(event) => setBrand(event.target.value as Brand)}
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
              onChange={(event) => setOutputMode(event.target.value as OutputMode)}
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
          <button type="button" disabled className="ops-button-primary px-6">
            <Barcode className="h-4 w-4" aria-hidden="true" />
            Generate PDFs
          </button>
        </div>
      </section>

      {dataSource === "csv" ? (
        <div className="space-y-2">
          <FileUploadSection
            title="Product CSV"
            files={csvFile ? [csvFile] : []}
            onChange={handleCsvChange}
            onRemove={handleCsvRemove}
            acceptedFileTypes=".csv,text/csv"
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
        </div>
      ) : (
        <section className="ops-surface rounded-[8px]" aria-labelledby="shopify-source-title">
          <div className="ops-section-header">
            <h2 id="shopify-source-title" className="ops-title">
              Shopify Product Data
            </h2>
            <p className="ops-muted">
              Load the product details required for the barcode labels.
            </p>
          </div>
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-medium text-slate-700">
                {isSyncingShopify
                  ? "Syncing Shopify product variants..."
                  : shopifyResult
                    ? `${shopifyResult.summary.totalRows.toLocaleString()} variants processed · ${shopifyResult.summary.readyRows.toLocaleString()} labels ready`
                    : "No Shopify products loaded"}
              </p>
              <p className="mt-1 text-base text-slate-500">
                {shopifySyncedAt
                  ? `Last synced ${new Date(shopifySyncedAt).toLocaleString()}.`
                  : "SKU, product title, color, size, and barcode will be loaded from Shopify."}
              </p>
              {shopifyError && (
                <p className="mt-2 text-sm font-medium text-red-700" role="alert">
                  {shopifyError}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleShopifySync}
              disabled={isSyncingShopify}
              className="inline-flex items-center gap-2 whitespace-nowrap bg-emerald-600 px-5 py-3 text-base font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 hover:shadow disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-emerald-600 disabled:hover:shadow-sm"
              title="Pull barcode product data directly from Shopify"
            >
              {isSyncingShopify && (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              )}
              {isSyncingShopify ? "Syncing Shopify..." : "Sync from Shopify"}
            </button>
          </div>
        </section>
      )}

      {activeResult?.warnings.length ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>{dataSource === "csv" ? "CSV" : "Shopify"} validation notes</AlertTitle>
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
    </div>
  );
};
