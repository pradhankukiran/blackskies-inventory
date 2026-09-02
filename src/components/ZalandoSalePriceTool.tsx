import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import {
  DEFAULT_ZALANDO_DISCOUNT_PERCENTAGE,
  MAXIMUM_ZALANDO_DISCOUNT_PERCENTAGE,
  MINIMUM_ZALANDO_DISCOUNT_PERCENTAGE,
  isValidZalandoDiscountPercentage,
  processZalandoSalePrices,
} from "@/utils/processors/zalandoSalePriceProcessor";

const ITEMS_PER_PAGE = 25;
const TARGET_STATUS = "ZABLO_646";

type SalePriceAction = "preview" | "update";

type SalePriceUpdateApproval = {
  productId: string;
  compareDigest: string | null;
  salePrice: string;
};

type SalePriceUpdateSelection = {
  mode: "selected";
  products: SalePriceUpdateApproval[];
};

interface SalePricePayloadRow {
  rowNumber: number;
  statusDetail: string;
  sku: string;
  ean: string;
  regularPrice: number;
  country: string;
  currency: string;
}

interface DisplayRow {
  source: ZalandoSalePriceRow;
  status: string;
  message: string;
  matchingMethod: string;
  productTitle: string;
  productId: string;
  salePrice: string;
  currentSalePrice: string;
  parentSalePrice: string;
}

interface ShopifyProductReview {
  productId: string;
  productTitle: string;
  calculatedSalePrice: string;
  salePrice: string;
  priceEdited: boolean;
  priceError: string | null;
  currentSalePrice: string;
  compareDigest: string | null;
  currency: string;
  status: string;
  message: string;
  minimumPriceApplied: boolean;
  sourceRowNumbers: number[];
  sourceIdentifiers: string[];
}

const statusLabels: Record<string, string> = {
  ready: "Ready to update",
  updated: "Updated",
  update_failed: "Update failed",
  update_conflict: "Shopify value changed",
  already_up_to_date: "Already up to date",
  skipped_non_zablo_01: "Skipped: other status",
  outside_target_market: "Skipped: other market",
  invalid_currency: "Invalid currency",
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

const MINIMUM_EDITABLE_SALE_PRICE = 15;

const normalizeEditableSalePrice = (value: string): string | null => {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < MINIMUM_EDITABLE_SALE_PRICE) return null;

  return (Math.round((parsed + Number.EPSILON) * 100) / 100).toFixed(2);
};

const editableSalePriceError = (value: string): string | null => {
  if (!value.trim()) return "Enter a proposed price.";

  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized) || !Number.isFinite(Number(normalized))) {
    return "Enter a valid price.";
  }
  if (Number(normalized) < MINIMUM_EDITABLE_SALE_PRICE) {
    return `The proposed price cannot be below €${MINIMUM_EDITABLE_SALE_PRICE.toFixed(2)}.`;
  }

  return null;
};

const statusClassName = (status: string) => {
  if (status === "updated" || status === "already_up_to_date") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }
  if (status === "ready") return "bg-blue-50 text-blue-700 ring-blue-200";
  if (
    status === "skipped_non_zablo_01" ||
    status === "outside_target_status" ||
    status === "outside_target_market"
  ) {
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
  discountPercentage: number,
  selection?: SalePriceUpdateSelection
): Promise<ShopifySalePriceApiResponse> => {
  const response = await fetch("/api/shopify/sale-prices", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action,
      rows,
      discountPercentage,
      ...(selection ? { selection } : {}),
    }),
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
      country: row.country,
      currency: row.currency,
    }));

const renderSourceIdentifiers = (identifiers: string[]) =>
  identifiers.map((identifier, index) => {
    const isSku = identifier.startsWith("SKU:");
    const skuValue = isSku ? identifier.slice("SKU:".length).trim() : "";
    return (
      <React.Fragment key={`${identifier}-${index}`}>
        {index > 0 && <span aria-hidden="true"> · </span>}
        {isSku ? (
          <>
            <span>SKU: </span>
            <span data-selectable-text className="cursor-text select-text">
              {skuValue}
            </span>
          </>
        ) : (
          <span>{identifier}</span>
        )}
      </React.Fragment>
    );
  });

export const ZalandoSalePriceTool: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [localResult, setLocalResult] = useState<ZalandoSalePriceResult | null>(null);
  const [shopifyResult, setShopifyResult] = useState<ShopifySalePriceApiResponse | null>(null);
  const [discountPercentage, setDiscountPercentage] = useState(
    DEFAULT_ZALANDO_DISCOUNT_PERCENTAGE
  );
  const [editedSalePrices, setEditedSalePrices] = useState<Record<string, string>>({});
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isBulkConfirmationOpen, setIsBulkConfirmationOpen] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [productStatusFilter, setProductStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLoadingPersistedState, setIsLoadingPersistedState] = useState(true);
  const [processingStatus, setProcessingStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmationProductId, setConfirmationProductId] = useState<string | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const tableDragRef = useRef({
    isDragging: false,
    container: null as HTMLDivElement | null,
    startX: 0,
    scrollLeft: 0,
  });
  const [draggingTable, setDraggingTable] = useState<"approvals" | "details" | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadZalandoSalePriceState()
      .then((persisted) => {
        if (cancelled) return;
        const persistedDiscountPercentage = isValidZalandoDiscountPercentage(
          persisted.discountPercentage
        )
          ? persisted.discountPercentage
          : DEFAULT_ZALANDO_DISCOUNT_PERCENTAGE;
        const localPreviewIsCurrent =
          !persisted.localResult
          || persisted.localResult.discountPercentage === persistedDiscountPercentage;
        const shopifyPreviewIsCurrent =
          !persisted.shopifyResult
          || persisted.shopifyResult.discountPercentage === persistedDiscountPercentage;

        setFile(persisted.file);
        setDiscountPercentage(persistedDiscountPercentage);
        setLocalResult(localPreviewIsCurrent && shopifyPreviewIsCurrent ? persisted.localResult : null);
        setShopifyResult(localPreviewIsCurrent && shopifyPreviewIsCurrent ? persisted.shopifyResult : null);
        setProductSearchTerm(persisted.productSearchTerm);
        setProductStatusFilter(persisted.productStatusFilter);
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
      discountPercentage,
      productSearchTerm,
      productStatusFilter,
      searchTerm,
      statusFilter,
    }).catch((saveError) => {
      console.error("Could not save the Sale Prices state:", saveError);
    });
  }, [
    isLoadingPersistedState,
    localResult,
    discountPercentage,
    productSearchTerm,
    productStatusFilter,
    searchTerm,
    shopifyResult,
    statusFilter,
  ]);

  useEffect(() => {
    if (!confirmationProductId && !isBulkConfirmationOpen) return;

    const body = document.body;
    const root = document.documentElement;
    const scrollTop = window.scrollY;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyWidth = body.style.width;
    const previousRootOverflow = root.style.overflow;

    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollTop}px`;
    body.style.width = "100%";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setConfirmationProductId(null);
      setIsBulkConfirmationOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.width = previousBodyWidth;
      window.scrollTo({ top: scrollTop, left: 0, behavior: "auto" });
    };
  }, [confirmationProductId, isBulkConfirmationOpen]);

  useEffect(() => {
    const readyProductIds = new Set(
      (shopifyResult?.products || [])
        .filter((product) => product.status === "ready")
        .map((product) => product.productId)
    );

    setSelectedProductIds((current) =>
      current.filter((productId) => readyProductIds.has(productId))
    );
    setEditedSalePrices((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([productId]) => readyProductIds.has(productId))
      )
    );
  }, [shopifyResult]);

  const payloadRows = useMemo(
    () => (localResult ? payloadFromResult(localResult) : []),
    [localResult]
  );

  const apiRowsByNumber = useMemo(
    () => new Map((shopifyResult?.rows || []).map((row) => [row.rowNumber, row])),
    [shopifyResult]
  );

  const apiProductsById = useMemo(
    () => new Map((shopifyResult?.products || []).map((product) => [product.productId, product])),
    [shopifyResult]
  );

  const displayRows = useMemo<DisplayRow[]>(
    () =>
      (localResult?.rows || []).map((source) => {
        const apiRow = apiRowsByNumber.get(source.sourceRowNumber);
        const usesApiStatus = source.status === "ready" && apiRow;
        const productId = usesApiStatus ? apiRow.shopifyProduct?.id || "" : "";
        const apiProduct = productId ? apiProductsById.get(productId) : undefined;
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
          productId,
          salePrice: usesApiStatus
            ? apiRow.salePrice || ""
            : source.salePrice === null
              ? ""
              : source.salePrice.toFixed(2),
          currentSalePrice: usesApiStatus ? apiRow.currentSalePrice || "" : "",
          parentSalePrice: apiProduct?.salePrice || "",
        };
      }),
    [apiProductsById, apiRowsByNumber, localResult]
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
          row.source.country,
          row.source.currency,
          row.productTitle,
          row.status,
          row.message,
        ].some((value) => String(value ?? "").toLowerCase().includes(search));
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
        Market: row.source.country,
        Currency: row.source.currency,
        "Regular price": row.source.regularPrice ?? "",
        "SKU calculated sale price": row.salePrice,
        "Current Shopify parent sale price": row.currentSalePrice,
        "Proposed Shopify parent sale price": row.parentSalePrice,
        "Shopify parent product": row.productTitle,
        "Matched by": row.matchingMethod,
        Message: row.message,
      })),
    [displayRows]
  );

  const shopifyProductReviews = useMemo<ShopifyProductReview[]>(() => {
    const rowsByNumber = new Map(displayRows.map((row) => [row.source.sourceRowNumber, row]));
    const productsById = new Map<string, ShopifyProductReview>();

    for (const product of shopifyResult?.products || []) {
      if (!product.productId) continue;

      const calculatedSalePrice = product.salePrice || "";
      const editedSalePrice = editedSalePrices[product.productId];
      const salePrice = editedSalePrice ?? calculatedSalePrice;
      const normalizedEditedSalePrice =
        editedSalePrice === undefined ? calculatedSalePrice : normalizeEditableSalePrice(editedSalePrice);
      const priceEdited =
        editedSalePrice !== undefined
        && normalizedEditedSalePrice !== calculatedSalePrice;
      const priceError =
        product.status === "ready" ? editableSalePriceError(salePrice) : null;

      const sourceIdentifiers = Array.from(
        new Set(
          product.sourceRowNumbers.flatMap((rowNumber) => {
            const row = rowsByNumber.get(rowNumber);
            if (!row) return [];

            const values: string[] = [];
            if (row.source.sku) values.push(`SKU: ${row.source.sku}`);
            if (row.source.ean) values.push(`EAN: ${row.source.ean}`);
            return values;
          })
        )
      );

      productsById.set(product.productId, {
        productId: product.productId,
        productTitle: product.productTitle || "Untitled Shopify product",
        calculatedSalePrice,
        salePrice,
        priceEdited,
        priceError,
        currentSalePrice: product.currentSalePrice || "",
        compareDigest: product.compareDigest ?? null,
        currency:
          product.sourceRowNumbers
            .map((rowNumber) => rowsByNumber.get(rowNumber)?.source.currency)
            .find(Boolean) || "",
        status: product.status,
        message: product.message || "",
        minimumPriceApplied: Boolean(product.minimumPriceApplied) && !priceEdited,
        sourceRowNumbers: product.sourceRowNumbers,
        sourceIdentifiers,
      });
    }

    return Array.from(productsById.values()).sort((left, right) =>
      left.productTitle.localeCompare(right.productTitle)
    );
  }, [displayRows, editedSalePrices, shopifyResult]);

  const productStatuses = useMemo(
    () => Array.from(new Set(shopifyProductReviews.map((product) => product.status))).sort(),
    [shopifyProductReviews]
  );

  const filteredShopifyProductReviews = useMemo(() => {
    const search = productSearchTerm.trim().toLowerCase();
    return shopifyProductReviews.filter((product) => {
      const matchesSearch =
        !search ||
        [
          product.productTitle,
          product.productId,
          product.status,
          statusLabels[product.status] || "",
          product.message,
          product.salePrice,
          product.calculatedSalePrice,
          product.sourceRowNumbers.join(" "),
          product.sourceIdentifiers.join(" "),
        ].some((value) => String(value ?? "").toLowerCase().includes(search));
      const matchesStatus =
        productStatusFilter === "all" || product.status === productStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [productSearchTerm, productStatusFilter, shopifyProductReviews]);

  const readyShopifyProducts = useMemo(
    () => shopifyProductReviews.filter((product) => product.status === "ready"),
    [shopifyProductReviews]
  );

  const selectedShopifyProducts = useMemo(() => {
    const selectedIds = new Set(selectedProductIds);
    return readyShopifyProducts.filter((product) => selectedIds.has(product.productId));
  }, [readyShopifyProducts, selectedProductIds]);

  const selectedInvalidPriceProducts = useMemo(
    () => selectedShopifyProducts.filter((product) => product.priceError),
    [selectedShopifyProducts]
  );

  const { currentPage, totalPages, paginatedItems, goToPage } = usePagination(
    filteredRows,
    ITEMS_PER_PAGE
  );

  const readyProducts = readyShopifyProducts.length;
  const confirmationProduct = useMemo(
    () =>
      confirmationProductId
        ? readyShopifyProducts.find((product) => product.productId === confirmationProductId) || null
        : null,
    [confirmationProductId, readyShopifyProducts]
  );
  const allReadyProductsSelected =
    readyShopifyProducts.length > 0
    && selectedShopifyProducts.length === readyShopifyProducts.length;
  const updatedProducts = shopifyResult?.products.filter((product) => product.status === "updated").length || 0;
  const alreadyCurrentProducts =
    shopifyResult?.products.filter((product) => product.status === "already_up_to_date").length || 0;
  const hasProcessed = Boolean(localResult);
  const discountPercentageIsValid = isValidZalandoDiscountPercentage(discountPercentage);
  const reviewRows = displayRows.filter(
    (row) =>
      ![
        "ready",
        "updated",
        "already_up_to_date",
        "skipped_non_zablo_01",
        "outside_target_status",
        "outside_target_market",
      ].includes(row.status)
  ).length;
  const processButtonLabel = isProcessing
    ? "Processing..."
    : !file
      ? "Upload Required CSV"
      : !discountPercentageIsValid
        ? "Enter Valid Discount"
        : "Process and Match Shopify";

  const clearPendingApprovals = () => {
    setEditedSalePrices({});
    setSelectedProductIds([]);
    setConfirmationProductId(null);
    setIsBulkConfirmationOpen(false);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setLocalResult(null);
    setShopifyResult(null);
    setError(null);
    setProductSearchTerm("");
    setProductStatusFilter("all");
    setSearchTerm("");
    setStatusFilter("all");
    clearPendingApprovals();
    saveZalandoSalePriceFile(selected).catch((saveError) => {
      console.error("Could not save the Sale Prices CSV:", saveError);
    });
  };

  const handleRemoveFile = () => {
    setFile(null);
    setLocalResult(null);
    setShopifyResult(null);
    setError(null);
    setDiscountPercentage(DEFAULT_ZALANDO_DISCOUNT_PERCENTAGE);
    setProductSearchTerm("");
    setProductStatusFilter("all");
    setSearchTerm("");
    setStatusFilter("all");
    clearPendingApprovals();
    saveZalandoSalePriceFile(null).catch((saveError) => {
      console.error("Could not remove the saved Sale Prices CSV:", saveError);
    });
  };

  const resetFiles = async () => {
    setFile(null);
    setLocalResult(null);
    setShopifyResult(null);
    setError(null);
    setDiscountPercentage(DEFAULT_ZALANDO_DISCOUNT_PERCENTAGE);
    setProductSearchTerm("");
    setProductStatusFilter("all");
    setSearchTerm("");
    setStatusFilter("all");
    clearPendingApprovals();

    try {
      await Promise.all([
        saveZalandoSalePriceFile(null),
        saveZalandoSalePriceUiState({
          localResult: null,
          shopifyResult: null,
          discountPercentage: DEFAULT_ZALANDO_DISCOUNT_PERCENTAGE,
          productSearchTerm: "",
          productStatusFilter: "all",
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
    setProductSearchTerm("");
    setProductStatusFilter("all");
    setSearchTerm("");
    setStatusFilter("all");
    clearPendingApprovals();

    try {
      await saveZalandoSalePriceUiState({
        localResult: null,
        shopifyResult: null,
        discountPercentage,
        productSearchTerm: "",
        productStatusFilter: "all",
        searchTerm: "",
        statusFilter: "all",
      });
    } catch (clearError) {
      console.error("Could not clear the saved Sale Prices results:", clearError);
    }
  };

  const processAndMatch = async () => {
    if (!file) {
      setError("Upload the Zalando Previous Season CSV first.");
      return;
    }
    if (!discountPercentageIsValid) {
      setError(
        `Discount percentage must be between ${MINIMUM_ZALANDO_DISCOUNT_PERCENTAGE} and ${MAXIMUM_ZALANDO_DISCOUNT_PERCENTAGE}.`
      );
      return;
    }

    try {
      setError(null);
      setShopifyResult(null);
      clearPendingApprovals();
      setIsProcessing(true);
      setProcessingStatus("Parsing the Zalando CSV...");
      const rawRows = await parseFile(file);
      const processed = processZalandoSalePrices(rawRows, discountPercentage);
      setLocalResult(processed);
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);

      const rows = payloadFromResult(processed);
      if (rows.length) {
        setProcessingStatus("Matching SKU and EAN values in Shopify...");
        const preview = await postShopifySalePrices("preview", rows, discountPercentage);
        setShopifyResult(preview);
      }

    } catch (processError) {
      setError(processError instanceof Error ? processError.message : "Could not process the Sale Prices CSV.");
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  };

  const closeConfirmation = () => {
    setConfirmationProductId(null);
    setIsBulkConfirmationOpen(false);
  };

  const openConfirmation = (productId: string) => {
    const product = readyShopifyProducts.find((item) => item.productId === productId);
    if (!product || product.priceError) return;
    setIsBulkConfirmationOpen(false);
    setConfirmationProductId(productId);
  };

  const handleProposedPriceChange = (productId: string, value: string) => {
    setEditedSalePrices((current) => ({ ...current, [productId]: value }));
  };

  const normalizeProposedPriceInput = (product: ShopifyProductReview) => {
    const normalized = normalizeEditableSalePrice(product.salePrice);
    if (!normalized) return;

    setEditedSalePrices((current) => {
      const next = { ...current };
      if (normalized === product.calculatedSalePrice) delete next[product.productId];
      else next[product.productId] = normalized;
      return next;
    });
  };

  const resetProposedPrice = (productId: string) => {
    setEditedSalePrices((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    );
  };

  const toggleAllReadyProducts = () => {
    setSelectedProductIds(
      allReadyProductsSelected
        ? []
        : readyShopifyProducts.map((product) => product.productId)
    );
  };

  const openBulkConfirmation = () => {
    if (!selectedShopifyProducts.length || selectedInvalidPriceProducts.length) return;
    setConfirmationProductId(null);
    setIsBulkConfirmationOpen(true);
  };

  const updateShopify = async (products: ShopifyProductReview[]) => {
    if (!payloadRows.length || !products.length) return;

    const approvals: SalePriceUpdateApproval[] = [];
    for (const product of products) {
      const salePrice = normalizeEditableSalePrice(product.salePrice);
      if (!salePrice) {
        setError(`Review the proposed price for ${product.productTitle} before updating Shopify.`);
        return;
      }
      approvals.push({
        productId: product.productId,
        compareDigest: product.compareDigest,
        salePrice,
      });
    }

    const submittedProductIds = new Set(products.map((product) => product.productId));

    setConfirmationProductId(null);
    setIsBulkConfirmationOpen(false);
    setSelectedProductIds((current) =>
      current.filter((productId) => !submittedProductIds.has(productId))
    );
    setIsUpdating(true);
    setProcessingStatus(
      products.length === 1
        ? "Updating one parent product metafield in Shopify..."
        : `Updating ${products.length} parent product metafields in Shopify...`
    );
    setError(null);

    try {
      const result = await postShopifySalePrices(
        "update",
        payloadRows,
        discountPercentage,
        {
          mode: "selected",
          products: approvals,
        }
      );
      setShopifyResult(result);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update Shopify sale prices.");
      try {
        const refreshedPreview = await postShopifySalePrices(
          "preview",
          payloadRows,
          discountPercentage
        );
        setShopifyResult(refreshedPreview);
      } catch (refreshError) {
        console.error("Could not refresh the Shopify sale-price preview:", refreshError);
      }
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

  const handleTablePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    table: "approvals" | "details"
  ) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button,input,select,a,[data-selectable-text]")) return;

    tableDragRef.current = {
      isDragging: true,
      container: event.currentTarget,
      startX: event.clientX,
      scrollLeft: event.currentTarget.scrollLeft,
    };
    setDraggingTable(table);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleTablePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = tableDragRef.current;
    if (!drag.isDragging || drag.container !== event.currentTarget) return;
    event.preventDefault();
    const deltaX = event.clientX - drag.startX;
    event.currentTarget.scrollLeft = drag.scrollLeft - deltaX;
  };

  const stopTableDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!tableDragRef.current.isDragging) return;
    tableDragRef.current.isDragging = false;
    tableDragRef.current.container = null;
    setDraggingTable(null);
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
          title="ZABLO_646 – Previous Season CSV"
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
                Set the discount, then preview parent Shopify product metafield updates.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-base font-medium text-blue-700">
            {TARGET_STATUS} · DE · EUR
          </span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="max-w-xl text-base text-slate-600">
              Shopify matching happens automatically. Processing does not change Shopify data.
            </div>
            <label htmlFor="zalando-discount-percentage" className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Discount percentage
              </span>
              <div className="flex items-center gap-2">
                <input
                  id="zalando-discount-percentage"
                  type="number"
                  min={MINIMUM_ZALANDO_DISCOUNT_PERCENTAGE}
                  max={MAXIMUM_ZALANDO_DISCOUNT_PERCENTAGE}
                  step="0.01"
                  value={discountPercentage}
                  onChange={(event) => {
                    setDiscountPercentage(
                      Number.isNaN(event.target.valueAsNumber)
                        ? 0
                        : event.target.valueAsNumber
                    );
                    setError(null);
                  }}
                  disabled={hasProcessed || isProcessing || isUpdating}
                  aria-invalid={!discountPercentageIsValid}
                  aria-describedby="zalando-discount-help"
                  className="ops-input w-28"
                />
                <span className="text-base font-medium text-slate-700">%</span>
              </div>
              <span
                id="zalando-discount-help"
                className={`mt-1 block text-sm ${
                  discountPercentageIsValid ? "text-slate-500" : "text-red-700"
                }`}
              >
                {discountPercentageIsValid
                  ? hasProcessed
                    ? "Clear the table to change it. €15.00 always takes priority."
                    : `Minimum ${MINIMUM_ZALANDO_DISCOUNT_PERCENTAGE}%. €15.00 always takes priority.`
                  : `Enter a value from ${MINIMUM_ZALANDO_DISCOUNT_PERCENTAGE}% to ${MAXIMUM_ZALANDO_DISCOUNT_PERCENTAGE}%.`}
              </span>
            </label>
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
              disabled={!file || !discountPercentageIsValid || isProcessing || isUpdating}
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
            </div>
          </div>

          <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:grid-cols-2 lg:grid-cols-6">
            {[
              { label: "CSV rows", value: localResult.summary.totalRows },
              { label: `Eligible ${TARGET_STATUS} rows`, value: localResult.summary.readyRows },
              { label: "Ready products", value: readyProducts },
              { label: "Already current", value: alreadyCurrentProducts },
              { label: "Updated products", value: updatedProducts },
              { label: "Needs review", value: reviewRows },
            ].map((card) => (
              <div key={card.label} className="ops-summary-card rounded-[8px]">
                <div className="ops-kicker">{card.label}</div>
                <div className="mt-1 text-3xl font-semibold text-slate-950">{card.value.toLocaleString()}</div>
              </div>
            ))}
          </div>

          {shopifyProductReviews.length > 0 && (
            <div className="border-b border-slate-200">
              <div className="px-5 py-4">
                <h4 className="text-base font-semibold text-slate-950">Parent product approvals</h4>
                <p className="mt-1 text-sm text-slate-600">
                  Edit proposed prices, then review one parent or an explicit bulk selection before updating Shopify.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-5 py-4">
                <label className="relative min-w-0 w-full flex-1 sm:min-w-[260px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={productSearchTerm}
                    onChange={(event) => setProductSearchTerm(event.target.value)}
                    placeholder="Search parent product, SKU, EAN, or product ID"
                    className="ops-input w-full pl-10 pr-4"
                  />
                </label>
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-slate-400" />
                  <select
                    value={productStatusFilter}
                    onChange={(event) => setProductStatusFilter(event.target.value)}
                    className="ops-input"
                  >
                    <option value="all">All statuses</option>
                    {productStatuses.map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status] || status}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-sm text-slate-500">
                  Showing {filteredShopifyProductReviews.length} of {shopifyProductReviews.length} parent products
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={toggleAllReadyProducts}
                    disabled={!readyShopifyProducts.length || isUpdating}
                    className="ops-button-secondary"
                  >
                    {allReadyProductsSelected
                      ? "Clear selection"
                      : `Select all ready parents (${readyShopifyProducts.length})`}
                  </button>
                  <span className="text-sm text-slate-600">
                    {selectedShopifyProducts.length} selected across all filters
                  </span>
                  {selectedInvalidPriceProducts.length > 0 && (
                    <span className="text-sm font-medium text-red-700">
                      Fix {selectedInvalidPriceProducts.length} invalid selected price{selectedInvalidPriceProducts.length === 1 ? "" : "s"}.
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={openBulkConfirmation}
                  disabled={
                    !selectedShopifyProducts.length
                    || selectedInvalidPriceProducts.length > 0
                    || isUpdating
                  }
                  className="ops-button-primary"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Review bulk update ({selectedShopifyProducts.length})
                </button>
              </div>
              <div
                className={`max-h-[480px] overflow-auto border-t border-slate-200 ${
                  draggingTable === "approvals" ? "cursor-grabbing select-none" : "cursor-grab"
                }`}
                title="Drag horizontally to scroll the table"
                onPointerDown={(event) => handleTablePointerDown(event, "approvals")}
                onPointerMove={handleTablePointerMove}
                onPointerUp={stopTableDrag}
                onPointerCancel={stopTableDrag}
                onPointerLeave={stopTableDrag}
              >
                <table className="ops-table min-w-[1380px]">
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Status</th>
                      <th>Shopify parent product</th>
                      <th>Current custom.attr5</th>
                      <th>Proposed custom.attr5</th>
                      <th>Matched SKUs / EANs</th>
                      <th>Review note</th>
                      <th>Approval</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredShopifyProductReviews.length > 0 ? (
                      filteredShopifyProductReviews.map((product) => (
                        <tr key={product.productId}>
                          <td>
                            {product.status === "ready" ? (
                              <input
                                type="checkbox"
                                checked={selectedProductIds.includes(product.productId)}
                                onChange={() => toggleProductSelection(product.productId)}
                                disabled={isUpdating}
                                aria-label={`Select ${product.productTitle}`}
                                className="h-4 w-4 cursor-pointer accent-blue-600"
                              />
                            ) : "—"}
                          </td>
                          <td>
                            <span
                              className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-medium ring-1 ${statusClassName(product.status)}`}
                            >
                              {statusLabels[product.status] || product.status}
                            </span>
                          </td>
                          <td className="font-medium" title={product.productId}>
                            {product.productTitle}
                          </td>
                          <td>
                            {product.currentSalePrice
                              ? `${product.currentSalePrice} ${product.currency}`.trim()
                              : "Not set"}
                          </td>
                          <td className="min-w-[250px]">
                            {product.status === "ready" ? (
                              <div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={product.salePrice}
                                    onChange={(event) =>
                                      handleProposedPriceChange(product.productId, event.target.value)
                                    }
                                    onBlur={() => normalizeProposedPriceInput(product)}
                                    disabled={isUpdating}
                                    aria-label={`Proposed custom.attr5 for ${product.productTitle}`}
                                    aria-invalid={Boolean(product.priceError)}
                                    className={`ops-input w-28 font-semibold ${
                                      product.priceError ? "border-red-500 text-red-800" : ""
                                    }`}
                                  />
                                  <span className="font-medium text-slate-700">
                                    {product.currency}
                                  </span>
                                  {product.priceEdited && (
                                    <button
                                      type="button"
                                      onClick={() => resetProposedPrice(product.productId)}
                                      disabled={isUpdating}
                                      className="text-sm font-medium text-blue-700 hover:text-blue-900"
                                    >
                                      Reset
                                    </button>
                                  )}
                                </div>
                                {product.priceEdited && !product.priceError && (
                                  <div className="mt-1 text-sm font-medium text-blue-700">
                                    Edited manually
                                  </div>
                                )}
                                {product.priceError && (
                                  <div className="mt-1 text-sm font-medium text-red-700">
                                    {product.priceError}
                                  </div>
                                )}
                              </div>
                            ) : product.salePrice ? (
                              <span className="font-semibold">
                                {`${product.salePrice} ${product.currency}`.trim()}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="max-w-[360px] whitespace-normal text-slate-600">
                            <div className="font-medium text-slate-800">
                              Row{product.sourceRowNumbers.length === 1 ? "" : "s"} {product.sourceRowNumbers.join(", ")}
                            </div>
                            <div className="mt-1">
                              {product.sourceIdentifiers.length
                                ? renderSourceIdentifiers(product.sourceIdentifiers)
                                : "—"}
                            </div>
                          </td>
                          <td className="max-w-[340px] whitespace-normal">
                            {product.minimumPriceApplied && (
                              <div className="font-medium text-amber-700">
                                Warning: €15.00 minimum applied.
                              </div>
                            )}
                            {product.priceEdited && !product.priceError && (
                              <div className="font-medium text-blue-700">
                                Manual price replaces the calculated proposal.
                              </div>
                            )}
                            {product.priceError && (
                              <div className="font-medium text-red-700">
                                Fix the proposed price before approval.
                              </div>
                            )}
                            <div className={product.minimumPriceApplied ? "mt-1 text-slate-600" : "text-slate-600"}>
                              {product.message || "—"}
                            </div>
                          </td>
                          <td>
                            {product.status === "ready" ? (
                              <button
                                type="button"
                                onClick={() => openConfirmation(product.productId)}
                                disabled={isUpdating || Boolean(product.priceError)}
                                className="ops-button-primary whitespace-nowrap"
                              >
                                <ShieldCheck className="h-4 w-4" />
                                Review and update
                              </button>
                            ) : (
                              <span className="text-sm text-slate-500">
                                {product.status === "updated" || product.status === "already_up_to_date"
                                  ? "No action required"
                                  : "Reprocess to review"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                          No parent products match this search and status filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
            className={`max-h-[calc(100vh-260px)] overflow-auto ${
              draggingTable === "details" ? "cursor-grabbing select-none" : "cursor-grab"
            }`}
            title="Drag horizontally to scroll the table"
            onPointerDown={(event) => handleTablePointerDown(event, "details")}
            onPointerMove={handleTablePointerMove}
            onPointerUp={stopTableDrag}
            onPointerCancel={stopTableDrag}
            onPointerLeave={stopTableDrag}
          >
            <table className="ops-table min-w-[1840px]">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Status</th>
                  <th>SKU</th>
                  <th>EAN</th>
                  <th>Article</th>
                  <th>Market</th>
                  <th>Regular price</th>
                  <th>SKU calculated price</th>
                  <th>Current parent custom.attr5</th>
                  <th>Proposed parent custom.attr5</th>
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
                      <td className="font-medium">
                        {row.source.sku ? (
                          <span
                            data-selectable-text
                            className="cursor-text select-text"
                          >
                            {row.source.sku}
                          </span>
                        ) : "—"}
                      </td>
                      <td>{row.source.ean || "—"}</td>
                      <td>{row.source.articleName || "—"}</td>
                      <td>{row.source.country || "—"}</td>
                      <td>
                        {row.source.regularPrice === null
                          ? "—"
                          : `${row.source.regularPrice.toFixed(2)} ${row.source.currency}`.trim()}
                      </td>
                      <td className="font-semibold">
                        {row.salePrice ? `${row.salePrice} ${row.source.currency}`.trim() : "—"}
                      </td>
                      <td>
                        {row.currentSalePrice
                          ? `${row.currentSalePrice} ${row.source.currency}`.trim()
                          : "Not set"}
                      </td>
                      <td className="font-semibold">
                        {row.parentSalePrice
                          ? `${row.parentSalePrice} ${row.source.currency}`.trim()
                          : "—"}
                      </td>
                      <td title={row.productId}>{row.productTitle || "—"}</td>
                      <td>{row.matchingMethod ? row.matchingMethod.replace(/_/g, " + ") : "—"}</td>
                      <td className="max-w-[420px] whitespace-normal text-slate-600">{row.message || "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={13} className="px-4 py-12 text-center">
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

      {confirmationProduct && createPortal(
        <div className="fixed inset-0 z-[100] flex h-[100dvh] w-screen overscroll-none items-center justify-center overflow-hidden bg-slate-950/60 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-price-confirmation-title"
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overscroll-contain border border-slate-200 bg-white shadow-2xl"
          >
            <div className="border-b border-slate-200 px-6 py-5">
              <h3 id="sale-price-confirmation-title" className="text-xl font-semibold text-slate-950">
                Confirm parent product update
              </h3>
              <p className="mt-2 text-base leading-6 text-slate-600">
                This approval updates one Shopify parent product. Only custom.attr5 changes.
                Normal Shopify and variant prices will not change.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
              <div className="border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-sm font-medium uppercase tracking-wide text-slate-500">
                    Shopify parent product
                  </div>
                  <div className="mt-1 text-lg font-semibold text-slate-950">
                    {confirmationProduct.productTitle}
                  </div>
                </div>
                <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
                  <div>
                    <div className="text-sm font-medium text-slate-500">Current custom.attr5</div>
                    <div className="mt-1 text-xl font-semibold text-slate-950">
                      {confirmationProduct.currentSalePrice
                        ? `${confirmationProduct.currentSalePrice} ${confirmationProduct.currency}`.trim()
                        : "Not set"}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-500">Proposed custom.attr5</div>
                    <div className="mt-1 text-xl font-semibold text-blue-700">
                      {`${
                        normalizeEditableSalePrice(confirmationProduct.salePrice)
                        ?? confirmationProduct.salePrice
                      } ${confirmationProduct.currency}`.trim()}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {confirmationProduct.priceEdited
                        ? `Manually edited from ${confirmationProduct.calculatedSalePrice} ${confirmationProduct.currency}.`
                        : `Calculated with a ${discountPercentage}% discount.`}
                    </div>
                  </div>
                </div>
                <div className="border-t border-slate-200 px-4 py-4">
                  <div className="text-sm font-medium text-slate-500">Matched SKUs and EANs</div>
                  <div className="mt-2 text-sm font-medium text-slate-800">
                    Row{confirmationProduct.sourceRowNumbers.length === 1 ? "" : "s"} {confirmationProduct.sourceRowNumbers.join(", ")}
                  </div>
                  <div className="mt-1 break-words text-sm leading-6 text-slate-700">
                    {confirmationProduct.sourceIdentifiers.length
                      ? renderSourceIdentifiers(confirmationProduct.sourceIdentifiers)
                      : "—"}
                  </div>
                </div>
              </div>
              {confirmationProduct.minimumPriceApplied && (
                <div className="mt-4 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Warning: the discounted value was below €15.00, so the €15.00 minimum was applied.
                </div>
              )}
              <p className="mt-4 text-base leading-6 text-slate-600">
                Shopify matching, the existing value, and concurrent changes are checked again before writing.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={closeConfirmation}
                autoFocus
                className="ops-button-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => updateShopify([confirmationProduct])}
                disabled={isUpdating}
                className="ops-button-primary"
              >
                Confirm parent update
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isBulkConfirmationOpen && selectedShopifyProducts.length > 0 && createPortal(
        <div className="fixed inset-0 z-[100] flex h-[100dvh] w-screen overscroll-none items-center justify-center overflow-hidden bg-slate-950/60 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-price-bulk-confirmation-title"
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-6xl flex-col overscroll-contain border border-slate-200 bg-white shadow-2xl"
          >
            <div className="border-b border-slate-200 px-6 py-5">
              <h3
                id="sale-price-bulk-confirmation-title"
                className="text-xl font-semibold text-slate-950"
              >
                Confirm bulk parent product update
              </h3>
              <p className="mt-2 text-base leading-6 text-slate-600">
                Review {selectedShopifyProducts.length} selected parent products. Only custom.attr5 changes.
                Normal Shopify and variant prices will not change.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-6 py-5 overscroll-contain">
              <div className="overflow-auto border border-slate-200">
                <table className="ops-table min-w-[860px]">
                  <thead>
                    <tr>
                      <th>Shopify parent product</th>
                      <th>Current custom.attr5</th>
                      <th>Final proposed custom.attr5</th>
                      <th>Price source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedShopifyProducts.map((product) => (
                      <tr key={product.productId}>
                        <td className="font-medium" title={product.productId}>
                          {product.productTitle}
                        </td>
                        <td>
                          {product.currentSalePrice
                            ? `${product.currentSalePrice} ${product.currency}`.trim()
                            : "Not set"}
                        </td>
                        <td className="font-semibold text-blue-700">
                          {`${normalizeEditableSalePrice(product.salePrice)} ${product.currency}`.trim()}
                        </td>
                        <td>
                          {product.priceEdited
                            ? `Manually edited from ${product.calculatedSalePrice} ${product.currency}`
                            : `${discountPercentage}% calculation`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Shopify values are checked again before writing. If any selected parent changed after preview,
                this bulk update stops before changing any product.
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <span className="text-sm text-slate-600">
                {selectedShopifyProducts.length} parent product{selectedShopifyProducts.length === 1 ? "" : "s"} selected
              </span>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={closeConfirmation}
                  autoFocus
                  className="ops-button-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => updateShopify(selectedShopifyProducts)}
                  disabled={isUpdating || selectedInvalidPriceProducts.length > 0}
                  className="ops-button-primary"
                >
                  Confirm and update {selectedShopifyProducts.length} parent product{selectedShopifyProducts.length === 1 ? "" : "s"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
