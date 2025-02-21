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
  console.log('Debug - Calculate Sales Metrics Input:', {
    salesCount: sales.length,
    sampleSale: sales[0] || 'no sales',
    hasEANs: sales.some(sale => sale.eanArticle),
    uniqueEANs: new Set(sales.map(sale => sale.eanArticle)).size
  });

  const metricsByArticle = new Map<string, SalesMetrics>();

  sales.forEach(sale => {
    // Use EAN as the key
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

    // Get existing metrics or create new ones
    const current = metricsByArticle.get(key) || {
      totalSales: 0,                    // Initialize total sales
      firstSaleDate: saleDate,          // Set initial first sale date
      lastSaleDate: saleDate,           // Set initial last sale date
      uniqueDays: new Set<string>(),    // Initialize set of unique sale days
      articleName: sale.articleNameShipped,
      eanArticle: key
    };

    // Add the sale quantity to total sales
    current.totalSales += sale.quantity;
    
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