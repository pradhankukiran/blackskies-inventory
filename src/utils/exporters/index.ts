import { IntegratedStockData } from "@/types/stock";
import { ArticleRecommendation } from "@/types/sales";
import { ProcessedSellerboardStock } from "@/types/processors";
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

const transformFBAStockOverview = (data: ProcessedSellerboardStock[]): Record<string, any>[] => {
  return data.map(item => ({
    "SKU": item.SKU,
    "ASIN": item.ASIN,
    "Product Name": item["Product Name"],
    "FBA Quantity": item["FBA Quantity"],
    "Units In Transit": item["Units In Transit"],
    "Reserved Units": item["Reserved Units"],
    "Total Stock": item["FBA Quantity"] + item["Units In Transit"] + item["Reserved Units"],
    "Internal Stock": item["Internal Stock"],
    "Avg. Daily Sales": Number(item["Avg. Daily Sales"]?.toFixed(2) || 0),
    "Avg. Total Sales (30 Days)": Number((item["Avg. Daily Sales"] * 30)?.toFixed(2) || 0),
    "Avg. Return Rate (%)": Number(item["Avg. Return Rate (%)"]?.toFixed(2) || 0)
  }));
};

const transformStockRecommendations = (data: ArticleRecommendation[]): Record<string, any>[] => {
  return data.map(item => ({
    "EAN": item.ean,
    "Partner Variant Size": item.partnerVariantSize || 'N/A',
    "Article Name": item.articleName,
    "Status Description": item.statusDescription || 'N/A',
    "ZFS Total": item.zfsTotal || 0,
    "Recommended Stock": item.recommendedStock || 0,
    "Sellable PF Stock": item.sellablePFStock || 0,
    "Avg. Daily Sales": Number(item.averageDailySales?.toFixed(2) || 0),
    "Total Sales": item.totalSales || 0,
    "Avg. Return Rate (%)": Number(item.averageReturnRate?.toFixed(2) || 0),
    "Status Cluster": item.statusCluster || 'N/A',
    "Coverage Days": item.recommendedDays || 0
  }));
};

type ExportDataType = IntegratedStockData[] | ArticleRecommendation[] | ProcessedSellerboardStock[];

export const exportData = (
  data: ExportDataType,
  format: ExportFormat,
  options: ExportOptions
): void => {
  const filename = options.timestamp
    ? `${options.filename}-${new Date().toISOString().split("T")[0]}`
    : options.filename;
    
  let transformedData: Record<string, any>[];
  
  if (options.filename.includes('recommendations')) {
    transformedData = transformStockRecommendations(data as ArticleRecommendation[]);
  } else if (options.filename.includes('fba')) {
    transformedData = transformFBAStockOverview(data as ProcessedSellerboardStock[]);
  } else {
    transformedData = transformStockOverview(data as IntegratedStockData[]);
  }

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
    default:
      throw new Error("Unsupported export format");
  }
};