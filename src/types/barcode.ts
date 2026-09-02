export type BarcodeLabelRowStatus = "ready" | "invalid" | "duplicate";

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
