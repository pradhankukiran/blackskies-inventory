import { ZFSSaleEntry } from "@/types/sales";

interface SalesMetrics {
  totalSales: number;          // Total quantity sold
  firstSaleDate: string;       // Date of first sale
  lastSaleDate: string;        // Date of most recent sale
  uniqueDays: Set<string>;     // Set of unique days with sales
  articleName: string;         // Product name
  eanArticle: string;          // Product EAN
}

export function calculateSalesMetrics(sales: ZFSSaleEntry[]): Map<string, SalesMetrics> {
  const metricsByArticle = new Map<string, SalesMetrics>();

  sales.forEach(sale => {
    // Use EAN as the key
    const key = sale.EAN;

    if (!key) {
      return;
    }

    const saleDate = sale['Date first on offer'];
    if (!saleDate) {
      return;
    }

    // Get existing metrics or create new ones
    const current = metricsByArticle.get(key) || {
      totalSales: 0,                    // Initialize total sales
      firstSaleDate: saleDate,          // Set initial first sale date
      lastSaleDate: saleDate,           // Set initial last sale date
      uniqueDays: new Set<string>(),    // Initialize set of unique sale days
      articleName: sale['Article variant'],
      eanArticle: key
    };

    // Add the sale quantity to total sales
    current.totalSales += sale['Sold articles'];
    
    // Add this sale date to unique days
    current.uniqueDays.add(saleDate);
    
    // Update first sale date if this sale is earlier
    if (saleDate < current.firstSaleDate) {
      current.firstSaleDate = saleDate;
    }
    
    // Update last sale date if this sale is more recent
    if (saleDate > current.lastSaleDate) {
      current.lastSaleDate = saleDate;
    }

    // Update article name if available
    if (sale['Article variant']) {
      current.articleName = sale['Article variant'];
    }

    metricsByArticle.set(key, current);
  });

  return metricsByArticle;
}