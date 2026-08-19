import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Filter, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { FileUploadSection } from "@/components/FileUploadSection";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/usePagination";
import {
  loadZalandoSalePriceState,
  saveZalandoSalePriceFile,
  saveZalandoSalePriceUiState,
} from "@/lib/appPersistence";
import {
  ShopifySalePriceApiError,
  ShopifySalePriceApiResponse,
} from "@/types/shopifySalePrice";
import {
  ZalandoSalePriceResult,
  ZalandoSalePriceRow,
} from "@/types/zalandoSalePrice";
import { exportToCSV } from "@/utils/exporters/csvExporter";
import { exportToXLSX } from "@/utils/exporters/xlsxExporter";
import { parseFile } from "@/utils/fileParser";
import { processZalandoSalePrices } from "@/utils/processors/zalandoSalePriceProcessor";

const ITEMS_PER_PAGE = 25;
const TARGET_STATUS = "ZABLO_01";

type SalePriceAction = "preview" | "update";

interface SalePricePayloadRow {
  rowNumber: number;
  statusDetail: string;
  sku: string;
  ean: string;
  regularPrice: number;
}

interface DisplayRow {
  source: ZalandoSalePriceRow;
  status: string;
  message: string;
  matchingMethod: string;
  productTitle: string;
  productId: string;
  salePrice: string;
}

const statusLabels: Record<string, string> = {
  ready: "Ready to update",
  updated: "Updated",
  update_failed: "Update failed",
  skipped_non_zablo_01: "Skipped: other status",
  error_missing_identifier: "Missing SKU/EAN",
  error_missing_regular_price: "Missing regular price",
  error_invalid_regular_price: "Invalid regular price",
  invalid_price: "Invalid regular price",
  missing_identifier: "Missing SKU/EAN",
  unmatched: "Not found in Shopify",
  ambiguous_sku: "Duplicate Shopify SKU",
  ambiguous_ean: "Duplicate Shopify EAN",
  identifier_conflict: "SKU/EAN conflict",
  product_price_conflict: "Parent price conflict",
  outside_target_status: "Skipped: other status",
  awaiting_shopify_match: "Not matched yet",
};

const statusClassName = (status: string) => {
  if (status === "updated") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "ready") return "bg-blue-50 text-blue-700 ring-blue-200";
  if (status === "skipped_non_zablo_01" || status === "outside_target_status") {
    return "bg-slate-100 text-slate-600 ring-slate-200";
  }
  if (status === "awaiting_shopify_match") return "bg-amber-50 text-amber-800 ring-amber-200";
  if (status.includes("conflict") || status.includes("ambiguous")) {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }
  return "bg-red-50 text-red-700 ring-red-200";
};

const apiErrorMessage = (body: ShopifySalePriceApiError, status: number) =>
  body.message || body.error || `Shopify request failed (${status})`;

const postShopifySalePrices = async (
  action: SalePriceAction,
  rows: SalePricePayloadRow[],
  updateSecret?: string
): Promise<ShopifySalePriceApiResponse> => {
  const response = await fetch("/api/shopify/sale-prices", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(updateSecret ? { "x-sale-price-update-secret": updateSecret } : {}),
    },
    body: JSON.stringify({ action, rows }),
  });

  const raw = await response.text();
  let body: ShopifySalePriceApiResponse | ShopifySalePriceApiError;
  try {
    body = JSON.parse(raw) as ShopifySalePriceApiResponse | ShopifySalePriceApiError;
  } catch {
    throw new Error(
      "The Shopify API is unavailable. Run the app with Vercel development mode instead of the frontend-only Vite server."
    );
  }

  if (!response.ok) {
    throw new Error(apiErrorMessage(body as ShopifySalePriceApiError, response.status));
  }

  return body as ShopifySalePriceApiResponse;
};

const payloadFromResult = (result: ZalandoSalePriceResult): SalePricePayloadRow[] =>
  result.rows
    .filter(
      (row): row is ZalandoSalePriceRow & { regularPrice: number } =>
        row.status === "ready" && row.regularPrice !== null
    )
    .map((row) => ({
      rowNumber: row.sourceRowNumber,
      statusDetail: row.statusDetail,
      sku: row.sku,
      ean: row.ean,
      regularPrice: row.regularPrice,
    }));

export const ZalandoSalePriceTool: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [localResult, setLocalResult] = useState<ZalandoSalePriceResult | null>(null);
  const [shopifyResult, setShopifyResult] = useState<ShopifySalePriceApiResponse | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLoadingPersistedState, setIsLoadingPersistedState] = useState(true);
  const [processingStatus, setProcessingStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [updateSecret, setUpdateSecret] = useState("");
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const tableDragRef = useRef({
    isDragging: false,
    startX: 0,
    scrollLeft: 0,
  });
  const [isTableDragging, setIsTableDragging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadZalandoSalePriceState()
      .then((persisted) => {
        if (cancelled) return;
        setFile(persisted.file);
        setLocalResult(persisted.localResult);
        setShopifyResult(persisted.shopifyResult);
        setSearchTerm(persisted.searchTerm);
        setStatusFilter(persisted.statusFilter);
      })
      .catch((loadError) => {
        console.error("Could not load the saved Sale Prices state:", loadError);
        if (!cancelled) setError("Could not load the saved Sale Prices state.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPersistedState(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isLoadingPersistedState) return;
    saveZalandoSalePriceUiState({
      localResult,
      shopifyResult,
      searchTerm,
      statusFilter,
    }).catch((saveError) => {
      console.error("Could not save the Sale Prices state:", saveError);
    });
  }, [isLoadingPersistedState, localResult, searchTerm, shopifyResult, statusFilter]);

  const payloadRows = useMemo(
    () => (localResult ? payloadFromResult(localResult) : []),
    [localResult]
  );

  const apiRowsByNumber = useMemo(
    () => new Map((shopifyResult?.rows || []).map((row) => [row.rowNumber, row])),
    [shopifyResult]
  );

  const displayRows = useMemo<DisplayRow[]>(
    () =>
      (localResult?.rows || []).map((source) => {
        const apiRow = apiRowsByNumber.get(source.sourceRowNumber);
        const usesApiStatus = source.status === "ready" && apiRow;
        return {
          source,
          status: usesApiStatus
            ? apiRow.status
            : source.status === "ready"
              ? "awaiting_shopify_match"
              : source.status,
          message: usesApiStatus ? apiRow.message || "" : source.message,
          matchingMethod: usesApiStatus ? apiRow.matchingMethod || "" : "",
          productTitle: usesApiStatus ? apiRow.shopifyProduct?.title || "" : "",
          productId: usesApiStatus ? apiRow.shopifyProduct?.id || "" : "",
          salePrice: usesApiStatus
            ? apiRow.salePrice || ""
            : source.salePrice === null
              ? ""
              : source.salePrice.toFixed(2),
        };
      }),
    [apiRowsByNumber, localResult]
  );

  const statuses = useMemo(
    () => Array.from(new Set(displayRows.map((row) => row.status))).sort(),
    [displayRows]
  );

  const filteredRows = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return displayRows.filter((row) => {
      const matchesSearch =
        !search ||
        [
          row.source.sku,
          row.source.ean,
          row.source.articleName,
          row.productTitle,
          row.status,
          row.message,
        ].some((value) => value.toLowerCase().includes(search));
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [displayRows, searchTerm, statusFilter]);

  const salePriceExportRows = useMemo(
    () =>
      displayRows.map((row) => ({
        "CSV row": row.source.sourceRowNumber,
        Status: statusLabels[row.status] || row.status,
        SKU: row.source.sku,
        EAN: row.source.ean,
        Article: row.source.articleName,
        Currency: row.source.currency,
        "Regular price": row.source.regularPrice ?? "",
        "Sale price": row.salePrice,
        "Shopify parent product": row.productTitle,
        "Matched by": row.matchingMethod,
        Message: row.message,
      })),
    [displayRows]
  );

  const { currentPage, totalPages, paginatedItems, goToPage } = usePagination(
    filteredRows,
    ITEMS_PER_PAGE
  );

  const readyProducts = shopifyResult?.products.filter((product) => product.status === "ready").length || 0;
  const updatedProducts = shopifyResult?.products.filter((product) => product.status === "updated").length || 0;
  const hasProcessed = Boolean(localResult);
  const reviewRows = displayRows.filter(
    (row) => !["ready", "updated", "skipped_non_zablo_01"].includes(row.status)
  ).length;
  const processButtonLabel = isProcessing
    ? "Processing..."
    : !file
      ? "Upload Required CSV"
      : "Process and Match Shopify";

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setLocalResult(null);
    setShopifyResult(null);
    setError(null);
    setSearchTerm("");
    setStatusFilter("all");
    setShowConfirmation(false);
    setUpdateSecret("");
    saveZalandoSalePriceFile(selected).catch((saveError) => {
      console.error("Could not save the Sale Prices CSV:", saveError);
    });
  };

  const handleRemoveFile = () => {
    setFile(null);
    setLocalResult(null);
    setShopifyResult(null);
    setError(null);
    setSearchTerm("");
    setStatusFilter("all");
    setShowConfirmation(false);
    setUpdateSecret("");
    saveZalandoSalePriceFile(null).catch((saveError) => {
      console.error("Could not remove the saved Sale Prices CSV:", saveError);
    });
  };

  const resetFiles = async () => {
    setFile(null);
    setLocalResult(null);
    setShopifyResult(null);
    setError(null);
    setSearchTerm("");
    setStatusFilter("all");
    setShowConfirmation(false);
    setUpdateSecret("");

    try {
      await Promise.all([
        saveZalandoSalePriceFile(null),
        saveZalandoSalePriceUiState({
          localResult: null,
          shopifyResult: null,
          searchTerm: "",
          statusFilter: "all",
        }),
      ]);
    } catch (resetError) {
      console.error("Could not reset the saved Sale Prices state:", resetError);
    }
  };

  const clearTable = async () => {
    setLocalResult(null);
    setShopifyResult(null);
    setError(null);
    setSearchTerm("");
    setStatusFilter("all");
    setShowConfirmation(false);
    setUpdateSecret("");

    try {
      await saveZalandoSalePriceUiState({
        localResult: null,
        shopifyResult: null,
        searchTerm: "",
        statusFilter: "all",
      });
    } catch (clearError) {
      console.error("Could not clear the saved Sale Prices results:", clearError);
    }
  };

  const processAndMatch = async () => {
    if (!file) {
      setError("Upload the Zalando Old Season Cleaning CSV first.");
      return;
    }

    try {
      setError(null);
      setShopifyResult(null);
      setIsProcessing(true);
      setProcessingStatus("Parsing the Zalando CSV...");
      const rawRows = await parseFile(file);
      const processed = processZalandoSalePrices(rawRows);
      setLocalResult(processed);

      const rows = payloadFromResult(processed);
      if (rows.length) {
        setProcessingStatus("Matching SKU and EAN values in Shopify...");
        const preview = await postShopifySalePrices("preview", rows);
        setShopifyResult(preview);
      }

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : "Could not process the Sale Prices CSV.");
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  };

  const updateShopify = async () => {
    if (!payloadRows.length || !updateSecret) return;

    const secret = updateSecret;
    setShowConfirmation(false);
    setUpdateSecret("");
    setIsUpdating(true);
    setProcessingStatus("Updating parent product metafields in Shopify...");
    setError(null);

    try {
      const result = await postShopifySalePrices("update", payloadRows, secret);
      setShopifyResult(result);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update Shopify sale prices.");
    } finally {
      setIsUpdating(false);
      setProcessingStatus("");
    }
  };

  const exportResults = () => {
    if (!salePriceExportRows.length) return;
    exportToCSV(salePriceExportRows, `zalando-sale-price-results-${new Date().toISOString().split("T")[0]}`);
  };

  const exportResultsToXlsx = () => {
    if (!salePriceExportRows.length) return;
    exportToXLSX(salePriceExportRows, `zalando-sale-price-results-${new Date().toISOString().split("T")[0]}`);
  };

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
        isLoading={isProcessing || isUpdating}
        message={processingStatus}
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Sale Price operation failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <section className="ops-surface rounded-[8px] p-5">
        <FileUploadSection
          title="ZABLO_01 – Old Season Cleaning CSV"
          onChange={handleFileChange}
          onRemove={handleRemoveFile}
          files={file ? [file] : []}
          acceptedFileTypes=".csv,.txt"
        />
      </section>

      <section className="ops-surface rounded-[8px]">
        <div className="ops-section-header flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-slate-500" />
            <div>
              <h2 className="ops-title">Sale Price Operation</h2>
              <p className="ops-muted">
                Calculate 20% discounts and preview parent Shopify product metafield updates.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-base font-medium text-blue-700">
            {TARGET_STATUS} only
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <div className="text-base text-slate-600">
            Shopify matching happens automatically. Processing does not change Shopify data.
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={resetFiles} className="ops-button-secondary">
              Reset Files
            </button>
            {hasProcessed && (
              <button type="button" onClick={clearTable} className="ops-button-danger">
                Clear Table
              </button>
            )}
            <button
              type="button"
              onClick={processAndMatch}
              disabled={!file || isProcessing || isUpdating}
              className="ops-button-primary px-6"
            >
              {processButtonLabel}
            </button>
          </div>
        </div>
      </section>

      {localResult?.warnings.length ? (
        <Alert>
          <AlertTitle>CSV processing notes</AlertTitle>
          <AlertDescription>
            {localResult.warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}

      {localResult && (
        <section ref={resultsRef} className="ops-surface rounded-[8px]">
          <div className="ops-section-header flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="ops-title">Sale Price Preview</h3>
              <p className="ops-muted mt-1">
                Review every row before updating the parent product metafield. Normal Shopify prices are never changed.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {salePriceExportRows.length ? (
                <>
                  <button type="button" onClick={exportResults} className="ops-button-secondary">
                    <Download className="h-4 w-4" />
                    Export CSV
                  </button>
                  <button type="button" onClick={exportResultsToXlsx} className="ops-button-secondary">
                    <Download className="h-4 w-4" />
                    Export Excel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled
                  className="ops-button-secondary text-slate-400 disabled:cursor-not-allowed"
                >
                  Export Sale Price Results
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowConfirmation(true)}
                disabled={!readyProducts || isUpdating}
                className="ops-button-primary"
              >
                <ShieldCheck className="h-4 w-4" />
                Update {readyProducts.toLocaleString()} Shopify Product{readyProducts === 1 ? "" : "s"}
              </button>
            </div>
          </div>

          <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: "CSV rows", value: localResult.summary.totalRows },
              { label: "Valid ZABLO_01 rows", value: localResult.summary.readyRows },
              { label: "Ready products", value: readyProducts },
              { label: "Updated products", value: updatedProducts },
              { label: "Needs review", value: reviewRows },
            ].map((card) => (
              <div key={card.label} className="ops-summary-card rounded-[8px]">
                <div className="ops-kicker">{card.label}</div>
                <div className="mt-1 text-3xl font-semibold text-slate-950">{card.value.toLocaleString()}</div>
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
                placeholder="Search SKU, EAN, article, or Shopify product"
                className="ops-input w-full pl-10 pr-4"
              />
            </label>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="ops-input"
              >
                <option value="all">All statuses</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status] || status}
                  </option>
                ))}
              </select>
            </div>
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
            <table className="ops-table min-w-[1500px]">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Status</th>
                  <th>SKU</th>
                  <th>EAN</th>
                  <th>Article</th>
                  <th>Regular price</th>
                  <th>Sale price</th>
                  <th>Shopify parent product</th>
                  <th>Matched by</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.length > 0 ? (
                  paginatedItems.map((row) => (
                    <tr key={row.source.sourceRowId}>
                      <td>{row.source.sourceRowNumber}</td>
                      <td>
                        <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-medium ring-1 ${statusClassName(row.status)}`}>
                          {statusLabels[row.status] || row.status}
                        </span>
                      </td>
                      <td className="font-medium">{row.source.sku || "—"}</td>
                      <td>{row.source.ean || "—"}</td>
                      <td>{row.source.articleName || "—"}</td>
                      <td>
                        {row.source.regularPrice === null
                          ? "—"
                          : `${row.source.regularPrice.toFixed(2)} ${row.source.currency}`.trim()}
                      </td>
                      <td className="font-semibold">
                        {row.salePrice ? `${row.salePrice} ${row.source.currency}`.trim() : "—"}
                      </td>
                      <td title={row.productId}>{row.productTitle || "—"}</td>
                      <td>{row.matchingMethod ? row.matchingMethod.replace(/_/g, " + ") : "—"}</td>
                      <td className="max-w-[420px] whitespace-normal text-slate-600">{row.message || "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center">
                      <div className="mx-auto max-w-lg">
                        <div className="text-base font-semibold text-slate-950">No matching sale price rows</div>
                        <div className="mt-1 text-base text-slate-500">
                          Adjust the search or status filter to view processed rows.
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
            <span className="text-base text-slate-600">
              Showing {paginatedItems.length.toLocaleString()} of {filteredRows.length.toLocaleString()} rows
            </span>
            {totalPages > 1 && (
              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={goToPage} />
            )}
          </div>
        </section>
      )}

      {showConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-price-confirmation-title"
            className="w-full max-w-xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="border-b border-slate-200 px-6 py-5">
              <h3 id="sale-price-confirmation-title" className="text-xl font-semibold text-slate-950">
                Confirm Shopify metafield update
              </h3>
              <p className="mt-2 text-base leading-6 text-slate-600">
                This will update custom.attr5 on {readyProducts.toLocaleString()} parent Shopify product{readyProducts === 1 ? "" : "s"}.
                Normal Shopify and variant prices will not change.
              </p>
            </div>
            <div className="space-y-4 px-6 py-5">
              <label className="block">
                <span className="text-base font-medium text-slate-700">Update authorization secret</span>
                <input
                  type="password"
                  value={updateSecret}
                  onChange={(event) => setUpdateSecret(event.target.value)}
                  autoComplete="off"
                  className="ops-input mt-2 w-full"
                  placeholder="Enter the configured update secret"
                  autoFocus
                />
              </label>
              <p className="text-sm text-slate-500">
                The secret is sent only with this update request and is not saved in the browser.
              </p>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  setShowConfirmation(false);
                  setUpdateSecret("");
                }}
                className="ops-button-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={updateShopify}
                disabled={!updateSecret}
                className="ops-button-primary"
              >
                Confirm Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
