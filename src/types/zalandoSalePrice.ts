export type RawSalePriceRow = Record<string, unknown>;

/**
 * A row is ready when it can be matched to Shopify. Error rows must not be
 * submitted for an update; skipped rows are outside the ZABLO_01 scope.
 */
export type ZalandoSalePriceRowStatus =
  | "ready"
  | "skipped_non_zablo_01"
  | "error_missing_identifier"
  | "error_missing_regular_price"
  | "error_invalid_regular_price";

export interface ZalandoSalePriceRow {
  /** One-based row number from the parsed CSV data, excluding its header. */
  sourceRowNumber: number;
  /** Deterministic row identifier for preview and result tables. */
  sourceRowId: string;
  status: ZalandoSalePriceRowStatus;
  statusDetail: string;
  sku: string;
  ean: string;
  articleName: string;
  currency: string;
  regularPrice: number | null;
  salePrice: number | null;
  message: string;
}

export interface ZalandoSalePriceSummary {
  totalRows: number;
  readyRows: number;
  skippedRows: number;
  invalidRows: number;
  skippedNonZablo01Rows: number;
  missingIdentifierRows: number;
  missingRegularPriceRows: number;
  invalidRegularPriceRows: number;
}

export interface ZalandoSalePriceResult {
  rows: ZalandoSalePriceRow[];
  summary: ZalandoSalePriceSummary;
  warnings: string[];
}
