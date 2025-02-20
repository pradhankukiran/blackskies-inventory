import { ZFSSaleEntry } from "@/types/sales";

interface SalesMetrics {
  totalSales: number;
  firstSaleDate: string;
  lastSaleDate: string;
  uniqueDays: Set<string>;
  articleName: string;
  eanArticle: string;
}

export function calculateSalesMetrics(sales: ZFSSaleEntry[]): Map<string, SalesMetrics> {
  console.log('Debug - Calculate Sales Metrics Input:', {
    salesCount: sales.length,
    sampleSale: sales[0] || 'no sales',
    hasEANs: sales.some(sale => sale.eanArticle),
    uniqueEANs: new Set(sales.map(sale => sale.eanArticle)).size
  });

  const metricsByArticle = new Map<string, SalesMetrics>();

  sales.forEach(sale => {
    // Use EAN as the key instead of articleId
    const key = sale.eanArticle;

    if (!key) {
      console.log('Debug - Skipping sale due to missing EAN:', sale);
      return;
    }

    const saleDate = sale.orderTime.split(' ')[0];
    if (!saleDate) {
      console.log('Debug - Skipping sale due to invalid date:', sale);
      return;
    }

    const current = metricsByArticle.get(key) || {
      totalSales: 0,
      firstSaleDate: saleDate,
      lastSaleDate: saleDate,
      uniqueDays: new Set<string>(),
      articleName: sale.articleNameShipped,
      eanArticle: key
    };

    current.totalSales += sale.quantity;
    current.uniqueDays.add(saleDate);
    
    if (saleDate < current.firstSaleDate) {
      current.firstSaleDate = saleDate;
    }
    if (saleDate > current.lastSaleDate) {
      current.lastSaleDate = saleDate;
    }

    if (sale.articleNameShipped) {
      current.articleName = sale.articleNameShipped;
    }

    metricsByArticle.set(key, current);
  });

  console.log('Debug - Sales Metrics Result:', {
    metricsCount: metricsByArticle.size,
    sampleMetric: Array.from(metricsByArticle.values())[0] || 'no metrics',
    uniqueArticles: metricsByArticle.size
  });

  return metricsByArticle;
}