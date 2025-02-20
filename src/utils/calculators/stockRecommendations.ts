import { ZFSSaleEntry, ArticleRecommendation } from "@/types/sales";
import { calculateSalesMetrics } from "./salesAnalytics";
import { calculateDaysBetween } from "./dateCalculator";
import { safeDivide, safeNumber } from "../formatters/numberFormatter";
import { IntegratedStockData } from "@/types/stock";

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
  salesData: ZFSSaleEntry[],
  stockData: IntegratedStockData[]
): ArticleRecommendation[] {
  console.log('Debug - Input Data:', {
    salesDataCount: salesData.length,
    stockDataCount: stockData.length,
    sampleSalesEAN: salesData.length > 0 ? salesData[0].eanArticle : 'no sales data',
    sampleStockEAN: stockData.length > 0 ? stockData[0].EAN : 'no stock data'
  });

  const salesMetrics = calculateSalesMetrics(salesData);
  console.log('Debug - Sales Metrics:', {
    metricsCount: salesMetrics.size,
    sampleMetricEAN: Array.from(salesMetrics.values())[0]?.eanArticle || 'no metrics'
  });

  // Create a map of EAN to stock data for efficient lookup
  const stockByEAN = new Map(
    stockData.map(item => [item.EAN, item])
  );
  console.log('Debug - Stock Map:', {
    stockMapSize: stockByEAN.size,
    sampleStockMapEAN: Array.from(stockByEAN.keys())[0] || 'no stock map entries'
  });

  const recommendations: ArticleRecommendation[] = [];

  salesMetrics.forEach((metrics, articleId) => {
    // Debug logging for each iteration
    console.log('Debug - Processing Article:', {
      articleId,
      ean: metrics.eanArticle,
      hasMatchingStock: metrics.eanArticle ? stockByEAN.has(metrics.eanArticle) : false
    });

    // Skip if no EAN is available
    if (!metrics.eanArticle) {
      console.log('Debug - Skipping: No EAN available for article', articleId);
      return;
    }

    const daysInPeriod = calculateDaysBetween(
      metrics.firstSaleDate,
      metrics.lastSaleDate
    );

    const averageDailySales = safeDivide(metrics.totalSales, daysInPeriod);
    const recommendedDays = calculateRecommendedDays(metrics);

    // Find the corresponding stock data using the EAN from sales metrics
    const stockItem = stockByEAN.get(metrics.eanArticle);

    // Only include recommendations for items that exist in stock data
    if (stockItem) {
      recommendations.push({
        articleId,
        ean: metrics.eanArticle,
        articleName: stockItem["Product Name"] || metrics.articleName || 'Unknown Article',
        partnerVariantSize: stockItem.partner_variant_size || 'N/A',
        recommendedDays,
        averageDailySales: safeNumber(averageDailySales),
        recommendedStock: Math.ceil(safeNumber(averageDailySales * recommendedDays)),
        totalSales: metrics.totalSales,
        lastSaleDate: metrics.lastSaleDate,
        firstSaleDate: metrics.firstSaleDate
      });
    } else {
      console.log('Debug - No matching stock found for EAN:', metrics.eanArticle);
    }
  });

  console.log('Debug - Final Recommendations:', {
    recommendationsCount: recommendations.length,
    sampleRecommendation: recommendations[0] || 'no recommendations'
  });

  return recommendations.sort((a, b) => b.totalSales - a.totalSales);
}