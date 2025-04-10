import { ProcessedSellerboardStock } from '@/types/processors';

export function processSellerboardStock(data: any[], salesReturnsData?: any[] | null, coverageDays: number = 14): ProcessedSellerboardStock[] {
  // Create a map of SKU to total sales in the last 30 days
  const salesMap: Record<string, number> = {};
  // Create a map for SKU to refund percentage
  const refundsMap: Record<string, number> = {};
  // Track which SKUs have already had sales processed from __EMPTY_22/undefined_22
  const processedSalesSKUs: Record<string, boolean> = {};
  
  // Helper function to normalize SKUs (trim, uppercase)
  const normalizeSkuForMapping = (sku: string): string => {
    return sku.trim().toUpperCase();
  };
  
  if (salesReturnsData && salesReturnsData.length > 0) {
    // First check if the sales data has marketplace information
    const hasSalesMarketplace = salesReturnsData.some(item => 
      (item.Marketplace || item.marketplace) !== undefined
    );
    
    // If sales data also has marketplace info, filter for Amazon.de only
    const relevantSalesData = hasSalesMarketplace 
      ? salesReturnsData.filter(item => {
          const marketplace = item.Marketplace || item.marketplace || '';
          return marketplace.includes('Amazon.de') || !marketplace.includes('Amazon.co.uk');
        })
      : salesReturnsData;
    
    // Process filtered sales data
    relevantSalesData.forEach((item) => {
      // Look for data under the "Totals" section and find the "Sales" column
      const sku = item.SKU || '';

      // --- Enhanced Sales Value Parsing ---
      // Prioritize __EMPTY_22/undefined_22 fields over Totals for sales data
      const originalSalesValue = item.__EMPTY_22 || item["__EMPTY_22"] || 
                           item.undefined_22 || item["undefined_22"] ||
                           item.Totals;
      
      // --- Extract Refund Percentage, ensuring we catch the exact field name ---
      // Look for the field by exact name
      const originalRefundValue = item.__EMPTY_24 || item["__EMPTY_24"] || 
                           item.undefined_24 || item["undefined_24"] || 
                           item["% Refunds"];

      // --- Check if this row is a header --- 
      if (typeof originalSalesValue === 'string' && originalSalesValue.toLowerCase() === 'sales') {
        // Skip this row if it looks like a header
        return; 
      }
      // --- End Header Check ---

      // Clean the value: remove currency symbols (€, $, £), thousand separators (,), 
      // replace comma decimal separator with period, and trim whitespace.
      const cleanedSalesValue = typeof originalSalesValue === 'string' 
        ? originalSalesValue.replace(/[€$£]/g, '').replace(/,/g, '').trim()
        : originalSalesValue; // Keep as is if not a string
      
      // Clean the refund value: remove '%', trim whitespace
      const cleanedRefundValue = typeof originalRefundValue === 'string'
        ? originalRefundValue.replace(/%/g, '').trim()
        : originalRefundValue; // Keep as is if not a string
      
      // Attempt to parse the cleaned values
      const sales = parseFloat(cleanedSalesValue || 0);
      const refundPercentage = parseFloat(cleanedRefundValue || 0);

      // Store the return rate directly if SKU exists and __EMPTY_24 exists
      if (sku && (item.__EMPTY_24 !== undefined || item["__EMPTY_24"] !== undefined || 
          item.undefined_24 !== undefined || item["undefined_24"] !== undefined)) {
        const returnRate = parseFloat(item.__EMPTY_24 || item["__EMPTY_24"] || 
                                     item.undefined_24 || item["undefined_24"] || 0);
        if (!isNaN(returnRate)) {
          // Store with normalized SKU
          const normalizedSku = normalizeSkuForMapping(sku);
          // Store directly in our global refundsMap
          refundsMap[normalizedSku] = returnRate;
        }
      }

      // Store the sales value directly if SKU exists and __EMPTY_22 exists
      if (sku && (item.__EMPTY_22 !== undefined || item["__EMPTY_22"] !== undefined || 
          item.undefined_22 !== undefined || item["undefined_22"] !== undefined)) {
        const salesValue = parseFloat(item.__EMPTY_22 || item["__EMPTY_22"] || 
                                     item.undefined_22 || item["undefined_22"] || 0);
        if (!isNaN(salesValue)) {
          // Store with normalized SKU
          const normalizedSku = normalizeSkuForMapping(sku);
          // Store directly in our global salesMap
          salesMap[normalizedSku] = (salesMap[normalizedSku] || 0) + salesValue;
          // Mark this SKU as already processed for sales
          processedSalesSKUs[normalizedSku] = true;
          
          // Debug log
          if (sku === 'DE-10-F-S') { // Log for a specific SKU to avoid console spam
            console.log(`Using __EMPTY_22/_22 value for ${sku}: ${salesValue}`);
          }
        }
      }

      if (sku && !isNaN(sales) && !processedSalesSKUs[normalizeSkuForMapping(sku)]) {
        // Only add sales from Totals if we haven't already processed this SKU from __EMPTY_22
        // Use normalized SKU for the map
        const normalizedSku = normalizeSkuForMapping(sku);
        // If we already have a value for this SKU, add to it (handling potential duplicates)
        salesMap[normalizedSku] = (salesMap[normalizedSku] || 0) + sales;
        
        // Debug log
        if (sku === 'DE-10-F-S') { // Log for a specific SKU to avoid console spam
          console.log(`Using Totals value for ${sku}: ${sales}`);
        }
      }
      
      // ALWAYS set the refund percentage if we have a valid value, regardless of sales source
      if (sku && !isNaN(refundPercentage)) {
        const normalizedSku = normalizeSkuForMapping(sku);
        refundsMap[normalizedSku] = refundPercentage;
      }
    }); // End forEach
  }
  
  // Filter out Amazon.co.uk entries and only keep Amazon.de entries
  const filteredData = data.filter(item => {
    const marketplace = item.Marketplace || item.marketplace || '';
    return marketplace.includes('Amazon.de') || !marketplace.includes('Amazon.co.uk');
  });
  
  // Create a map to deduplicate SKUs, keeping only one entry per SKU
  const uniqueItems = new Map();
  
  filteredData.forEach(item => {
    const sku = item.SKU || item.sku || '';
    // If we already have this SKU and the current item is from Amazon.de, replace the existing one
    const existingItem = uniqueItems.get(sku);
    const currentMarketplace = item.Marketplace || item.marketplace || '';
    
    if (!existingItem || currentMarketplace.includes('Amazon.de')) {
      uniqueItems.set(sku, item);
    }
  });
  
  // Convert map back to array for processing
  const results = Array.from(uniqueItems.values()).map((item) => {
    const fbaQuantity = parseInt(item["FBA/FBM Stock"] || item["Stock"] || item.stock || item["FBA Quantity"] || 0);
    const reservedUnits = parseInt(item["Reserved"] || 0);
    
    // Find the "Sent to FBA" key which might have a line break
    let sentToFBAValue = 0;
    for (const key in item) {
      if (key === "Sent to FBA" || key === "Sent" || key === "Sent \nto FBA") {
        sentToFBAValue = parseInt(item[key] || 0);
        break;
      }
    }
    
    const sku = item.SKU || item.sku || '';
    // Use normalized SKU for looking up sales data
    const normalizedSku = normalizeSkuForMapping(sku);
    // Get the total sales value from the map
    const totalSalesFromMap = salesMap[normalizedSku] || 0; 
    // Calculate the average over 3 days
    const avgSales3Days = totalSalesFromMap ? totalSalesFromMap / 3 : 0;

    // Get Refund Percentage from the refunds map
    const refundPercentageFromMap = refundsMap[normalizedSku] || 0;
    
    // Calculate daily sales
    const dailySales = parseFloat(item["Estimated\nSales\nVelocity"] || 0);
    
    return {
      SKU: sku,
      ASIN: item.ASIN || item.asin || '',
      "Product Name": item.Title || item.title || item["Product Name"] || '',
      "FBA Quantity": fbaQuantity,
      "Internal Stock": parseInt(item["FBA prep. stock Prep center 1 stock"] || 0),
      "Recommended Quantity": Math.round(
        dailySales * 
        coverageDays * 
        (1 - (refundPercentageFromMap / 100)) * 
        ((dailySales * 30) > 10 ? 1.2 : 1)  - 
        (fbaQuantity + sentToFBAValue + reservedUnits)
      ),
      "Units In Transit": sentToFBAValue,
      "Reserved Units": reservedUnits,
      "Total Stock": fbaQuantity + sentToFBAValue + reservedUnits,
      "Avg. Daily Sales": dailySales,
      "Avg. Total Sales (30 Days)": dailySales * 30,
      "Avg. Return Rate (%)": refundPercentageFromMap,
      "Status": item.Status || item.status || '',
      "Size": item.Size || item.size || item["Child ASIN size"] || '',
      "Price": parseFloat(item.Price || item["Regular Price"] || 0),
      "Restock Level": parseInt(item["Restock level"] || item["Min. stock"] || 0),
      "Regular Price": parseFloat(item["Regular Price"] || 0),
      "Buy Box Price": parseFloat(item["Buy Box price"] || item["Buy Box Price"] || 0),
      "Fulfillment Fee": parseFloat(item["Fulfillment Fee"] || 0),
      "Shipping Type": item["Shipping Type"] || '',
      "Weight": item.Weight || '',
      "Dimensions": item.Dimensions || item["Dimensions (cm/inch)"] || '',
      "Color": item.Color || '',
      "Marketplace": item.Marketplace || item.marketplace || ''
    };
  });
  
  // Log some sample data for debugging purposes
  // Find a few SKUs for debugging
  const sampleSKUs = Object.keys(salesMap).slice(0, 3);
  if (sampleSKUs.length > 0) {
    console.log('Sample sales data (30 days total / 3 = avg):', 
      sampleSKUs.map(sku => ({
        SKU: sku,
        TotalSales: salesMap[sku],
        AvgSales: salesMap[sku] / 3
      }))
    );
  }
  
  return results;
} 