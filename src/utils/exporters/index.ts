import { IntegratedStockData } from "@/types/stock";
import { ArticleRecommendation } from "@/types/sales";
import { ExportFormat, ExportOptions } from "./types";
import { exportToCSV } from "./csvExporter";
import { exportToTSV } from "./tsvExporter";
import { exportToXLSX } from "./xlsxExporter";

const transformStockOverview = (data: IntegratedStockData[]): Record<string, any>[] => {
  return data.map(item => ({
    "EAN": item.EAN,
    "Partner Variant Size": item.partner_variant_size || 'N/A',
    "Article Name": item["Product Name"],
    "Status Description": item["Status Description"],
    "ZFS Total": item["ZFS Quantity"] + item["ZFS Pending Shipment"],
    "Sellable PF Stock": item["Available Stock"],
    "Status Cluster": item["Status Cluster"]
  }));
};

const transformStockRecommendations = (data: ArticleRecommendation[]): Record<string, any>[] => {
  return data.map(item => ({
    "EAN": item.ean,
    "Partner Variant Size": item.partnerVariantSize,
    "Article Name": item.articleName,
    "Status Description": item.statusDescription || 'N/A',
    "ZFS Total": item.zfsTotal || 0,
    "Recommended Stock": item.recommendedStock || 0,
    "Sellable PF Stock": item.sellablePFStock || 0,
    "Avg. Daily Sales": Number(item.averageDailySales.toFixed(2)),
    "Total Sales": item.totalSales || 0,
    "Avg. Return Rate (%)": Number(item.averageReturnRate.toFixed(2)),
    "Status Cluster": item.statusCluster || 'N/A',
    "Coverage Days": item.recommendedDays || 0
  }));
};

export const exportData = (
  data: IntegratedStockData[] | ArticleRecommendation[],
  format: ExportFormat,
  options: ExportOptions
) => {
  const filename = options.timestamp
    ? `${options.filename}-${new Date().toISOString().split("T")[0]}`
    : options.filename;

  // Determine the type of data and transform accordingly
  const transformedData = options.filename.includes('recommendations')
    ? transformStockRecommendations(data as ArticleRecommendation[])
    : transformStockOverview(data as IntegratedStockData[]);

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