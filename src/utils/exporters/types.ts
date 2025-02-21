export type ExportFormat = "csv" | "tsv" | "xlsx";

export interface ExportOptions {
  filename: string;
  timestamp?: boolean;
}

export interface ExportableStockData {
  "EAN": string;
  "Partner Variant Size": string;
  "Article Name": string;
  "Status Description": string;
  "ZFS Stock": number;
  "ZFS Pending": number;
  "ZFS Total": number;
  "Sellable PF Stock": number;
  "Status Cluster": string;
}

export interface ExportableRecommendationData {
  "EAN": string;
  "Partner Variant Size": string;
  "Article Name": string;
  "Recommended Stock": number;
  "Average Daily Sales": number;
  "Total Sales": number;
  "First Sale Date": string;
  "Last Sale Date": string;
  "Coverage Days": number;
}