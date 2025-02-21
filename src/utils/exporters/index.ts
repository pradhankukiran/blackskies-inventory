import { IntegratedStockData } from "@/types/stock";
import { ArticleRecommendation } from "@/types/sales";
import { ExportFormat, ExportOptions } from "./types";
import { exportToCSV } from "./csvExporter";
import { exportToTSV } from "./tsvExporter";
import { exportToXLSX } from "./xlsxExporter";

const transformStockOverview = (data: IntegratedStockData[]) => {
  return data.map(item => ({
    "EAN": item.EAN,
    "Partner Variant Size": item.partner_variant_size || 'N/A',
    "Article Name": item["Product Name"],
    "Status Description": item["Status Description"],
    "ZFS Stock": item["ZFS Quantity"],
    "ZFS Pending": item["ZFS Pending Shipment"],
    "ZFS Total": item["ZFS Quantity"] + item["ZFS Pending Shipment"],
    "Sellable PF Stock": item["Available Stock"],
    "Status Cluster": item["Status Cluster"]
  }));
};

const transformStockRecommendations = (data: ArticleRecommendation[]) => {
  return data.map(item => ({
    "EAN": item.ean,
    "Partner Variant Size": item.partnerVariantSize,
    "Article Name": item.articleName,
    "Recommended Stock": item.recommendedStock,
    "Average Daily Sales": Number(item.averageDailySales.toFixed(2)),
    "Total Sales": item.totalSales,
    "First Sale Date": item.firstSaleDate,
    "Last Sale Date": item.lastSaleDate,
    "Coverage Days": item.recommendedDays
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