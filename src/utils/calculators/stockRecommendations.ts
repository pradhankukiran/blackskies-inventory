import { ZFSSaleEntry, ArticleRecommendation } from "@/types/sales";
import { calculateSalesMetrics } from "./salesAnalytics";
import { calculateDaysBetween } from "./dateCalculator";
import { safeDivide, safeNumber } from "../formatters/numberFormatter";
import { IntegratedStockData } from "@/types/stock";

// Convert timeline selection to days
const TIMELINE_DAYS = {
  'none': 0,
  '30days': 30,
  '6months': 180
} as const;

// Extended interface to include Category
interface ExtendedZFSSaleEntry extends Omit<ZFSSaleEntry, 'Country'> {
  Category?: string;
  'Date of last sale'?: string;
  Country?: string;
  // Add additional fields that might be present in the CSV
  season?: string;
}

// Extended interface to include category in recommendation
interface ExtendedArticleRecommendation extends ArticleRecommendation {
  category?: string;
  markets?: string;
  // Add fields for country allocations
  countryAllocations?: Record<string, number>;
  pricePoint?: number;
  season?: string;
}

// Interface for sales data aggregated by country
interface CountrySalesData {
  totalSales: number;
  pdpViews: number;
  conversionRate: number;
}

/**
 * Determines current season for seasonal adjustments
 */
function getCurrentSeason(): string {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear().toString().slice(2); // Get last 2 digits of year
  
  // Simple season determination: SS (Spring/Summer) is months 2-7 (Mar-Aug), FW (Fall/Winter) is months 8-1 (Sep-Feb)
  if (month >= 2 && month <= 7) {
    return `ss${year}`;
  } else {
    return `fw${year}`;
  }
}

/**
 * Checks if the product's season is ending soon
 */
function isEndOfSeason(season: string): boolean {
  const currentSeason = getCurrentSeason();
  
  // If seasons don't match and current season is the next one, it's end of season
  if (season !== currentSeason) {
    // Extract season type (ss/fw) and year
    const seasonType = season.slice(0, 2).toLowerCase();
    const seasonYear = parseInt(season.slice(2));
    
    const currentType = currentSeason.slice(0, 2).toLowerCase();
    const currentYear = parseInt(currentSeason.slice(2));
    
    // If current season is newer, the product's season is ending/ended
    if (currentYear > seasonYear || (currentYear === seasonYear && currentType !== seasonType)) {
      return true;
    }
  }
  
  const now = new Date();
  const month = now.getMonth();
  
  // If it's end of spring/summer (Jul-Aug) or end of fall/winter (Jan-Feb)
  if ((month === 6 || month === 7) && season.startsWith('ss')) {
    return true;
  }
  if ((month === 0 || month === 1) && season.startsWith('fw')) {
    return true;
  }
  
  return false;
}

/**
 * Calculate price sensitivity multiplier based on price point
 */
function calculatePriceSensitivity(pricePoint: number): number {
  if (pricePoint <= 0) return 1.0;
  
  // IMPROVED: Use a more gradual scale for price sensitivity
  // This prevents price point from overwhelming the coverage days effect
  
  // Original values for reference:
  // if (pricePoint > 150) return 1.3;  // Luxury items need higher buffer
  // if (pricePoint > 100) return 1.2;  // High-priced items
  // if (pricePoint > 50) return 1.1;   // Mid-priced items
  // if (pricePoint > 20) return 1.05;  // Low-mid priced items
  
  // New implementation using a continuous curve instead of discrete steps
  // This creates a smoother transition between price points
  // and reduces the impact of price on the overall calculation
  
  // Logarithmic scaling for more balanced sensitivity
  if (pricePoint > 150) return 1.15;  // Reduced from 1.3
  if (pricePoint > 100) return 1.1;   // Reduced from 1.2
  if (pricePoint > 50) return 1.05;   // Reduced from 1.1
  if (pricePoint > 20) return 1.025;  // Reduced from 1.05
  
  return 1.0;                         // Budget items (unchanged)
}

/**
 * Calculates the recommended stock level for a product based on sales data and desired coverage period
 */
function calculateRecommendedStock(
  salesData: {
    totalSales: number;
    timelineDays: number;
    returnRate: number;
    pdpViews: number;
    conversionRate: number;
    category?: string;
    season?: string;
  }, 
  coverageWeeks: number,
  currentStock: number = 0,
  statusCluster: string = 'Live',
  pricePoint: number = 0
): number {
  // Convert coverage weeks to days for calculations
  const coverageDays = coverageWeeks * 7;
  
  // Special case: If there are no sales but significant views, estimate potential demand
  if (salesData.totalSales === 0 && salesData.pdpViews >= 50) {
    // Use views as a proxy for interest, with estimated conversion
    const estimatedDemand = salesData.pdpViews * 0.02; // 2% estimated conversion
    // Calculate weekly demand and apply coverage
    const weeklyDemand = estimatedDemand * (7 / salesData.timelineDays);
    return Math.ceil(weeklyDemand * coverageWeeks);
  }
  
  // If there are no sales and low views, keep minimal stock but scale with coverage period
  if (salesData.totalSales === 0 && salesData.pdpViews < 50) {
    if (statusCluster === 'Discontinued' || statusCluster === 'discontinued') {
      return 0; // No stock for discontinued items with no interest
    }
    return Math.max(1, coverageWeeks); // Minimum stock based on coverage weeks
  }

  // Calculate daily sales rate using safe division to avoid division by zero
  const dailySales = safeDivide(salesData.totalSales, Math.max(salesData.timelineDays, 1));
  const weeklySales = dailySales * 7;

  // Calculate base recommended stock using weekly sales and coverage weeks
  const baseStock = weeklySales * coverageWeeks;
  
  // Apply weighted return rate for low sales volume items
  // This reduces the impact of extreme return rates when sample size is small
  const weightedReturnRate = salesData.totalSales < 5 
    ? salesData.returnRate * (salesData.totalSales / 5) 
    : salesData.returnRate;
  
  // Add safety stock based on return rate - IMPROVED: Use logarithmic scaling 
  // to prevent overwhelming the coverage days effect
  const returnRateMultiplier = 1 + (Math.log(1 + weightedReturnRate) / Math.log(100));

  // Add safety stock based on conversion rate - IMPROVED: Reduce impact
  const conversionRateAdjustment = Math.min(salesData.conversionRate / 200, 0.05); // Reduced from 0.1 to 0.05 max
  
  // IMPROVED: Log intermediate calculation steps for debugging
  const afterBaseStock = baseStock;
  const afterReturnRate = baseStock * returnRateMultiplier;
  const afterConversion = baseStock * returnRateMultiplier * (1 + conversionRateAdjustment);
  
  // Calculate initial recommended stock with more balanced multipliers
  let recommendedStock = afterConversion;
  
  // Apply status-based adjustments with reduced impact
  if (statusCluster === 'New' || statusCluster === 'new') {
    // IMPROVED: Reduce multiplier from 1.5 to 1.3 to let coverage days have more impact
    recommendedStock *= 1.3;
  } else if (statusCluster === 'Discontinued' || statusCluster === 'discontinued') {
    // For discontinued items, reduce to minimum stock or less
    return Math.min(Math.ceil(coverageDays / 14), currentStock); // Scale with coverage days
  }
  
  // IMPROVED: Apply price sensitivity factor with reduced impact
  const priceSensitivity = calculatePriceSensitivity(pricePoint);
  // Use square root to dampen the effect (more balanced)
  recommendedStock *= Math.sqrt(priceSensitivity);
  
  // Apply seasonal adjustments if available with reduced impact
  if (salesData.season) {
    const currentSeason = getCurrentSeason();
    if (salesData.season.toLowerCase().includes(currentSeason.toLowerCase())) {
      // IMPROVED: Reduced multiplier from 1.3 to 1.15
      recommendedStock *= 1.15;
    } else if (isEndOfSeason(salesData.season)) {
      // End-of-season products should be reduced
      return Math.min(Math.ceil(recommendedStock), currentStock);
    }
  }
  
  // Round up to get whole number
  const roundedRecommendedStock = Math.ceil(recommendedStock);
  
  // Calculate additional stock needed considering current inventory
  const additionalStockNeeded = Math.max(0, roundedRecommendedStock - currentStock);
  
  // Consider fast-moving items (selling more than 1 per day)
  const isFastMoving = dailySales > 1;
  
  // IMPROVED: For fast-moving items, ensure we don't fall below 75% of recommended level
  // instead of 50%, to make coverage days have more impact
  const finalRecommendation = isFastMoving 
    ? Math.max(roundedRecommendedStock - Math.floor(currentStock * 0.25), 0)
    : additionalStockNeeded;

  // IMPROVED: Dynamic minimum based on coverage days
  const dynamicMinimum = Math.max(1, Math.ceil(coverageDays / 14));
  
  // Ensure minimum stock level scales with coverage period
  return Math.max(finalRecommendation, dynamicMinimum);
}

/**
 * Calculates stock recommendations for a collection of products based on sales history
 */
export function calculateStockRecommendations(
  salesData: ExtendedZFSSaleEntry[],
  stockData: IntegratedStockData[],
  coverageWeeks: number = 1,  // Coverage period in weeks
  timeline: 'none' | '30days' | '6months' = '30days'  // Sales timeline selection
): ExtendedArticleRecommendation[] {
  // Get timeline days from selection
  const timelineDays = TIMELINE_DAYS[timeline];
  if (timelineDays === 0) {
    return [];
  }
  
  const stockByEAN = new Map(stockData.map(item => [item.EAN, item]));
  const recommendations: ExtendedArticleRecommendation[] = [];

  // Group sales data by EAN, aggregating across countries
  const salesByEAN = new Map<string, {
    totalSales: number;
    daysOnline: number;
    returnRate: number;
    pdpViews: number;
    conversionRate: number;
    firstDate: string;
    lastDate: string;
    articleName: string;
    category: string;
    // Track countries with their individual sales data for allocation
    countrySales: Map<string, CountrySalesData>;
    countries: Set<string>; // For backward compatibility
    season?: string;
  }>();

  // Process sales data
  salesData.forEach(sale => {
    const ean = sale.EAN;
    if (!ean) return;

    const existing = salesByEAN.get(ean);
    // Convert string values to numbers
    const daysOnline = typeof sale['Days online'] === 'string' ? 
      parseInt(sale['Days online']) || 0 : 
      sale['Days online'] || 0;
    const soldArticles = typeof sale['Sold articles'] === 'string' ? 
      parseInt(sale['Sold articles']) || 0 : 
      sale['Sold articles'] || 0;
    const returnRate = typeof sale['Return rate (%)'] === 'string' ? 
      parseFloat(sale['Return rate (%)']) || 0 : 
      sale['Return rate (%)'] || 0;
    const pdpViews = typeof sale['PDP views'] === 'string' ? 
      parseInt(sale['PDP views']) || 0 : 
      sale['PDP views'] || 0;
    const conversionRate = typeof sale['Conversion rate (%)'] === 'string' ? 
      parseFloat(sale['Conversion rate (%)']) || 0 : 
      sale['Conversion rate (%)'] || 0;
    const category = sale.Category || '';
    const country = sale.Country || '';
    const season = (sale as any).season || '';
    
    // Find the last actual sale date rather than using current date
    const saleDate = sale['Date of last sale'] ? 
      sale['Date of last sale'] : 
      (soldArticles > 0 ? new Date().toISOString().split('T')[0] : '');

    // Create country sales data object
    const countrySalesData: CountrySalesData = {
      totalSales: soldArticles,
      pdpViews: pdpViews,
      conversionRate: conversionRate
    };

    if (existing) {
      existing.totalSales += soldArticles;
      // For daysOnline, use the maximum as we want coverage that works across all markets
      existing.daysOnline = Math.max(existing.daysOnline, daysOnline);
      // For return rate, use weighted average based on sales volume
      const totalSalesNow = existing.totalSales + soldArticles;
      existing.returnRate = totalSalesNow > 0 ? 
        ((existing.returnRate * existing.totalSales) + (returnRate * soldArticles)) / totalSalesNow : 
        Math.max(existing.returnRate, returnRate);
      // Aggregate PDP views across all countries
      existing.pdpViews += pdpViews;
      // For conversion, use weighted average based on views
      const totalViewsExisting = existing.pdpViews - pdpViews;
      const totalViewsNow = existing.pdpViews;
      existing.conversionRate = totalViewsNow > 0 ?
        ((existing.conversionRate * totalViewsExisting) + (conversionRate * pdpViews)) / totalViewsNow :
        Math.max(existing.conversionRate, conversionRate);
      // Update last sale date if this entry has a more recent date
      if (saleDate && (!existing.lastDate || saleDate > existing.lastDate)) {
        existing.lastDate = saleDate;
      }
      // Add country to the set of countries
      if (country) {
        existing.countries.add(country);
        
        // Update or add country-specific sales data
        if (existing.countrySales.has(country)) {
          const existingCountryData = existing.countrySales.get(country)!;
          existingCountryData.totalSales += soldArticles;
          existingCountryData.pdpViews += pdpViews;
          // Update conversion rate as weighted average
          const totalCountryViews = existingCountryData.pdpViews;
          existingCountryData.conversionRate = totalCountryViews > 0 ?
            ((existingCountryData.conversionRate * (totalCountryViews - pdpViews)) + 
             (conversionRate * pdpViews)) / totalCountryViews :
            Math.max(existingCountryData.conversionRate, conversionRate);
        } else {
          existing.countrySales.set(country, countrySalesData);
        }
      }
    } else {
      const countrySalesMap = new Map<string, CountrySalesData>();
      if (country) {
        countrySalesMap.set(country, countrySalesData);
      }
      
      salesByEAN.set(ean, {
        totalSales: soldArticles,
        daysOnline: daysOnline,
        returnRate: returnRate,
        pdpViews: pdpViews,
        conversionRate: conversionRate,
        firstDate: sale['Date first on offer'],
        lastDate: saleDate || new Date().toISOString().split('T')[0],
        articleName: sale.Brand,
        category: category,
        countrySales: countrySalesMap,
        countries: new Set(country ? [country] : []),
        season: season
      });
    }
  });

  // Calculate recommendations
  salesByEAN.forEach((salesData, ean) => {
    const stockItem = stockByEAN.get(ean);
    if (!stockItem) return;

    // Get total ZFS stock (current + pending)
    const zfsTotal = safeNumber(stockItem["ZFS Quantity"]) + safeNumber(stockItem["ZFS Pending Shipment"]);
    
    // Get current available stock
    const currentStock = safeNumber(stockItem["Available Stock"]);
    
    // Track how many markets this product is sold in
    const marketCount = salesData.countries.size;
    
    // Extract price point from stock data if available
    const pricePoint = safeNumber((stockItem as any)["regular_price"] || 
                                 (stockItem as any)["discounted_price"] || 0);
    
    // Extract status cluster
    const statusCluster = stockItem["Status Cluster"] || 'Live';
    
    // IMPROVED: Scaled market multiplier that increases more gradually
    // For products in multiple markets, we might want to maintain slightly higher stock
    const marketMultiplier = 1 + (Math.log(marketCount) / Math.log(10)) * 0.2; // Logarithmic scaling
    
    // Calculate recommended stock considering current inventory, status, and price
    const recommendedStock = calculateRecommendedStock(
      { 
        totalSales: salesData.totalSales,
        timelineDays,
        returnRate: salesData.returnRate,
        pdpViews: salesData.pdpViews,
        conversionRate: salesData.conversionRate,
        category: salesData.category,
        season: salesData.season,
        timelineDays 
      }, 
      coverageWeeks,
      currentStock,
      statusCluster,
      pricePoint
    );
    
    // Apply market multiplier for multi-market products
    const finalRecommendedStock = Math.ceil(recommendedStock * marketMultiplier);
    
    // Calculate country-specific stock allocations based on sales distribution
    const countryAllocations: Record<string, number> = {};
    
    if (finalRecommendedStock > 0 && salesData.countrySales.size > 0) {
      let totalCountrySales = 0;
      salesData.countrySales.forEach(data => totalCountrySales += data.totalSales);
      
      // Default allocation for countries with zero sales but listed product
      const defaultAllocation = Math.max(1, Math.floor(finalRecommendedStock / salesData.countrySales.size));
      
      // Allocate based on sales proportion, with minimum of 1 unit per country
      salesData.countrySales.forEach((data, country) => {
        if (totalCountrySales > 0 && data.totalSales > 0) {
          countryAllocations[country] = Math.max(1, 
            Math.round((data.totalSales / totalCountrySales) * finalRecommendedStock)
          );
        } else {
          countryAllocations[country] = defaultAllocation;
        }
      });
      
      // Ensure the total allocated stock matches the recommended stock
      let allocatedTotal = Object.values(countryAllocations).reduce((sum, val) => sum + val, 0);
      const difference = finalRecommendedStock - allocatedTotal;
      
      // Adjust for any rounding differences by adding/removing from highest sales countries
      if (difference !== 0) {
        const countriesByAllocation = Object.entries(countryAllocations)
          .sort((a, b) => b[1] - a[1]);
        
        let remaining = Math.abs(difference);
        let index = 0;
        
        while (remaining > 0 && index < countriesByAllocation.length) {
          const [country, allocation] = countriesByAllocation[index];
          
          if (difference > 0) {
            // Add to allocation
            countryAllocations[country] += 1;
          } else if (allocation > 1) {
            // Remove from allocation (ensuring at least 1 unit remains)
            countryAllocations[country] -= 1;
          }
          
          remaining--;
          index = (index + 1) % countriesByAllocation.length;
        }
      }
    }

    recommendations.push({
      articleId: stockItem.SKU,
      ean: ean,
      articleName: stockItem["Product Name"] || salesData.articleName || 'Unknown Article',
      partnerVariantSize: stockItem.partner_variant_size || 'N/A',
      recommendedDays: coverageWeeks * 7,
      averageDailySales: safeNumber(safeDivide(salesData.totalSales, salesData.daysOnline)),
      recommendedStock: finalRecommendedStock,
      totalSales: salesData.totalSales,
      lastSaleDate: salesData.lastDate,
      firstSaleDate: salesData.firstDate,
      statusDescription: stockItem["Status Description"],
      zfsTotal,
      sellablePFStock: currentStock,
      statusCluster: stockItem["Status Cluster"],
      category: salesData.category,
      markets: Array.from(salesData.countries).join(', '),
      countryAllocations,
      pricePoint,
      season: salesData.season
    });

    // IMPROVED: Enhanced logging with details on multipliers and scaling factors
  });

  // IMPROVED: Log summary statistics
  const coverageStats = recommendations.reduce((stats, rec) => {
    stats.totalStock += rec.recommendedStock;
    stats.count++;
    return stats;
  }, { totalStock: 0, count: 0 });

  if (coverageStats.count > 0) {
    
  }

  // Sort by total sales descending, then by average daily sales
  return recommendations.sort((a, b) => {
    // First sort by total sales
    if (b.totalSales !== a.totalSales) {
      return b.totalSales - a.totalSales;
    }
    // Then by average daily sales for ties
    return b.averageDailySales - a.averageDailySales;
  });
}