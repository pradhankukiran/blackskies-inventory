import { ZFSSaleEntry, ArticleRecommendation } from "@/types/sales";
import { calculateSalesMetrics } from "./salesAnalytics";
import { calculateDaysBetween } from "./dateCalculator";
import { safeDivide, safeNumber } from "../formatters/numberFormatter";

function calculateRecommendedDays(metrics: { 
  totalSales: number, 
  uniqueDays: Set<string>
}): number {
  const salesFrequency = safeDivide(
    metrics.totalSales,
    metrics.uniqueDays.size
  );
  
  if (salesFrequency >= 2) return 14;
  if (salesFrequency >= 1) return 21;
  return 30;
}

export function calculateStockRecommendations(
  salesData: ZFSSaleEntry[]
): ArticleRecommendation[] {
  const salesMetrics = calculateSalesMetrics(salesData);
  const recommendations: ArticleRecommendation[] = [];

  salesMetrics.forEach((metrics, articleId) => {
    const daysInPeriod = calculateDaysBetween(
      metrics.firstSaleDate,
      metrics.lastSaleDate
    );

    const averageDailySales = safeDivide(metrics.totalSales, daysInPeriod);
    const recommendedDays = calculateRecommendedDays(metrics);

    recommendations.push({
      articleId,
      articleName: metrics.articleName || 'Unknown Article',
      recommendedDays,
      averageDailySales: safeNumber(averageDailySales),
      recommendedStock: Math.ceil(safeNumber(averageDailySales * recommendedDays)),
      totalSales: metrics.totalSales,
      lastSaleDate: metrics.lastSaleDate,
      firstSaleDate: metrics.firstSaleDate
    });
  });

  return recommendations.sort((a, b) => b.totalSales - a.totalSales);
}