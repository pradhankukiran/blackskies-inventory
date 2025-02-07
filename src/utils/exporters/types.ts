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
  "ZFS Total": number;
  "Sellable PF Stock": number;
  "Status Cluster": string;
}