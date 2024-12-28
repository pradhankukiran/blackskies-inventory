import { ZFSSaleEntry } from "@/types/sales";

interface SalesMetrics {
  totalSales: number;
  firstSaleDate: string;
  lastSaleDate: string;
  uniqueDays: Set<string>;
  articleName: string;
}

export function calculateSalesMetrics(sales: ZFSSaleEntry[]): Map<string, SalesMetrics> {
  const metricsByArticle = new Map<string, SalesMetrics>();

  sales.forEach(sale => {
    const articleId = sale.articleId;
    const saleDate = sale.orderTime.split(' ')[0];

    if (!articleId) return; // Skip if no article ID

    const current = metricsByArticle.get(articleId) || {
      totalSales: 0,
      firstSaleDate: saleDate,
      lastSaleDate: saleDate,
      uniqueDays: new Set<string>(),
      articleName: sale.articleNameShipped // Use the article name from the current sale
    };

    current.totalSales += sale.quantity;
    current.uniqueDays.add(saleDate);
    
    if (saleDate < current.firstSaleDate) {
      current.firstSaleDate = saleDate;
    }
    if (saleDate > current.lastSaleDate) {
      current.lastSaleDate = saleDate;
    }

    // Always update the article name if it exists in the current sale
    if (sale.articleNameShipped) {
      current.articleName = sale.articleNameShipped;
    }

    metricsByArticle.set(articleId, current);
  });

  return metricsByArticle;
}