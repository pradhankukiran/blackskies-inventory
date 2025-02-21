import { ZFSSaleEntry, ArticleRecommendation } from "@/types/sales";
import { calculateSalesMetrics } from "./salesAnalytics";
import { calculateDaysBetween } from "./dateCalculator";
import { safeDivide, safeNumber } from "../formatters/numberFormatter";
import { IntegratedStockData } from "@/types/stock";

function calculateRecommendedStock(
  averageDailySales: number,
  returnRate: number,
  coverageDays: number,
  salesFrequency: number
): number {
  // Safety buffer increases for slower-moving items
  const safetyBuffer = salesFrequency >= 2 ? 0.2 : 
                      salesFrequency >= 1 ? 0.3 : 0.4;

  // Convert return rate from percentage to decimal (e.g., 28% -> 0.28)
  const returnRateDecimal = returnRate / 100;

  return Math.ceil(
    averageDailySales * 
    coverageDays * 
    (1 + safetyBuffer) * 
    (1 + returnRateDecimal)
  );
}

export function calculateStockRecommendations(
  salesData: ZFSSaleEntry[],
  stockData: IntegratedStockData[],
  coverageDays: number = 7
): ArticleRecommendation[] {
  const salesMetrics = calculateSalesMetrics(salesData);
  const stockByEAN = new Map(stockData.map(item => [item.EAN, item]));
  const recommendations: ArticleRecommendation[] = [];

  salesMetrics.forEach((metrics, articleId) => {
    if (!metrics.eanArticle) return;

    const daysInPeriod = calculateDaysBetween(
      metrics.firstSaleDate,
      metrics.lastSaleDate
    );

    const averageDailySales = safeDivide(metrics.totalSales, daysInPeriod);
    const salesFrequency = safeDivide(metrics.totalSales, metrics.uniqueDays.size);

    // Find corresponding stock data
    const stockItem = stockByEAN.get(metrics.eanArticle);
    if (!stockItem) return;

    // Get return rate from sales data (default to 0 if not available)
    const returnRate = salesData.find(sale => sale.eanArticle === metrics.eanArticle)?.returnRate || 0;

    const recommendedStock = calculateRecommendedStock(
      averageDailySales,
      returnRate,
      coverageDays,
      salesFrequency
    );

    recommendations.push({
      articleId,
      ean: metrics.eanArticle,
      articleName: stockItem["Product Name"] || metrics.articleName || 'Unknown Article',
      partnerVariantSize: stockItem.partner_variant_size || 'N/A',
      recommendedDays: coverageDays,
      averageDailySales: safeNumber(averageDailySales),
      recommendedStock,
      totalSales: metrics.totalSales,
      lastSaleDate: metrics.lastSaleDate,
      firstSaleDate: metrics.firstSaleDate
    });
  });

  return recommendations.sort((a, b) => b.totalSales - a.totalSales);
}