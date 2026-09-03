export type BarcodeBrand = "blackskies" | "akitsune";

export type BarcodeLabelRowStatus = "ready" | "invalid" | "duplicate";

export type BarcodeLabelStatusFilter = "all" | BarcodeLabelRowStatus;

export type BarcodePdfOutputMode = "combined" | "individual";

export interface BarcodeLabelRow {
  sourceRowNumber: number;
  sku: string;
  articleName: string;
  color: string;
  size: string;
  ean: string;
  status: BarcodeLabelRowStatus;
  issues: string[];
}

export interface BarcodeCsvSummary {
  totalRows: number;
  readyRows: number;
  invalidRows: number;
  duplicateRows: number;
}

export interface BarcodeCsvResult {
  rows: BarcodeLabelRow[];
  summary: BarcodeCsvSummary;
  warnings: string[];
}

export interface ShopifyBarcodeSourceRow {
  variantId: string;
  sku: string;
  ean: string;
  articleName: string;
  color: string;
  size: string;
}

export interface ShopifyBarcodeApiResponse {
  brand: BarcodeBrand;
  syncedAt: string;
  count: number;
  rows: ShopifyBarcodeSourceRow[];
}

export interface ShopifyBarcodeApiError {
  error?: string;
  message?: string;
}
