export type ExportFormat = "csv" | "tsv" | "xlsx";

export interface ExportOptions {
  filename: string;
  timestamp?: boolean;
}
