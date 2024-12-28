import { IntegratedStockData } from "@/types/stock";
import { ExportFormat, ExportOptions } from "./types";
import { exportToCSV } from "./csvExporter";
import { exportToTSV } from "./tsvExporter";
import { exportToXLSX } from "./xlsxExporter";

export const exportData = (
  data: IntegratedStockData[],
  format: ExportFormat,
  options: ExportOptions
) => {
  const filename = options.timestamp
    ? `${options.filename}-${new Date().toISOString().split("T")[0]}`
    : options.filename;

  switch (format) {
    case "csv":
      exportToCSV(data, filename);
      break;
    case "tsv":
      exportToTSV(data, filename);
      break;
    case "xlsx":
      exportToXLSX(data, filename);
      break;
  }
};
