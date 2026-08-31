export type ShopifySalePriceRowStatus =
  | "ready"
  | "updated"
  | "update_failed"
  | "skipped_non_zablo_01"
  | "invalid_price"
  | "missing_identifier"
  | "unmatched"
  | "ambiguous_sku"
  | "ambiguous_ean"
  | "identifier_conflict"
  | "product_price_conflict"
  | "already_up_to_date"
  | "update_conflict"
  | "outside_target_market"
  | "invalid_currency"
  | "outside_target_status";

export interface ShopifySalePriceApiRow {
  rowNumber: number;
  statusDetail: string | null;
  sku: string | null;
  ean: string | null;
  regularPrice: number | null;
  salePrice: string | null;
  currentSalePrice: string | null;
  compareDigest: string | null;
  minimumPriceApplied: boolean;
  status: ShopifySalePriceRowStatus;
  message: string | null;
  matchingMethod: "sku" | "ean" | "sku_and_ean" | null;
  shopifyVariant: {
    id: string;
    sku: string | null;
    barcode: string | null;
  } | null;
  shopifyProduct: {
    id: string;
    title: string;
  } | null;
}

export type ShopifySalePriceProductStatus =
  | "ready"
  | "updated"
  | "update_failed"
  | "already_up_to_date"
  | "update_conflict"
  | "product_price_conflict";

export interface ShopifySalePriceApiProduct {
  productId: string;
  productTitle: string;
  salePrice: string | null;
  currentSalePrice: string | null;
  compareDigest: string | null;
  minimumPriceApplied: boolean;
  status: ShopifySalePriceProductStatus;
  message: string | null;
  sourceRowNumbers: number[];
}

export interface ShopifySalePriceApiSummary {
  totalRows: number;
  matchedRows: number;
  readyRows: number;
  invalidPriceRows: number;
  missingIdentifierRows: number;
  unmatchedRows: number;
  ambiguousSkuRows: number;
  ambiguousEanRows: number;
  identifierConflictRows: number;
  productPriceConflictRows: number;
  outsideTargetStatusRows: number;
  outsideTargetMarketRows: number;
  invalidCurrencyRows: number;
  readyProducts: number;
  productPriceConflicts: number;
  minimumPriceAppliedRows: number;
  alreadyUpToDateRows: number;
  alreadyUpToDateProducts: number;
  updateConflictRows: number;
  updateConflictProducts: number;
  updatedProducts?: number;
  failedProducts?: number;
  conflictedProducts?: number;
}

export interface ShopifySalePriceApiResponse {
  action: "preview" | "update";
  metafield: {
    namespace: "custom";
    key: "attr5";
    definitionType: string;
  };
  summary: ShopifySalePriceApiSummary;
  rows: ShopifySalePriceApiRow[];
  products: ShopifySalePriceApiProduct[];
}

export interface ShopifySalePriceApiError {
  error?: string;
  message?: string;
}
