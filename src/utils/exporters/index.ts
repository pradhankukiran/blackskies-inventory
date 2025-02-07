import { IntegratedStockData } from "@/types/stock";
import { ExportFormat, ExportOptions } from "./types";
import { exportToCSV } from "./csvExporter";
import { exportToTSV } from "./tsvExporter";
import { exportToXLSX } from "./xlsxExporter";

const transformDataForExport = (data: (IntegratedStockData & { "ZFS Total": number })[]) => {
  return data.map(item => ({
    "EAN": item.EAN,
    "Partner Variant Size": item.partner_variant_size,
    "Article Name": item["Product Name"],
    "Status Description": item["Status Description"],
    "ZFS Total": item["ZFS Total"],
    "Sellable PF Stock": item["Available Stock"],
    "Status Cluster": item["Status Cluster"]
  }));
};

export const exportData = (
  data: IntegratedStockData[],
  format: ExportFormat,
  options: ExportOptions
) => {
  const filename = options.timestamp
    ? `${options.filename}-${new Date().toISOString().split("T")[0]}`
    : options.filename;

  const transformedData = transformDataForExport(data as (IntegratedStockData & { "ZFS Total": number })[]);

  switch (format) {
    case "csv":
      exportToCSV(transformedData, filename);
      break;
    case "tsv":
      exportToTSV(transformedData, filename);
      break;
    case "xlsx":
      exportToXLSX(transformedData, filename);
      break;
  }
};