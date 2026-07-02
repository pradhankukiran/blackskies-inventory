export interface StockReturnConfig {
  market: "DE";
  salesHistoryDays: number;
  forecastPeriodDays: number;
  safetyBufferPercent: number;
  storageFeePerUnitPerDay: number;
}

export interface StockReturnReviewRow {
  "EAN": string;
  "SKU": string;
  "Article name": string;
  "Zalando article variant": string;
  "Current ZFS stock": number;
  "Units sold in selected period": number;
  "Average daily sales": number;
  "Stock to keep": number;
  "Suggested return qty": number;
  "Estimated savings": number;
}

export interface StockReturnExportRow {
  "EAN": string;
  "SKU": string;
  "Article name": string;
  "Current ZFS stock": number;
  "Units sold in selected period": number;
  "Stock to keep": number;
  "Estimated savings": number;
  "return qty": number;
}

export interface StockReturnSummary {
  totalArticles: number;
  returnCandidates: number;
  totalReturnQty: number;
  estimatedSavings: number;
}

export interface StockReturnResult {
  rows: StockReturnReviewRow[];
  exportRows: StockReturnExportRow[];
  summary: StockReturnSummary;
  warnings: string[];
}
