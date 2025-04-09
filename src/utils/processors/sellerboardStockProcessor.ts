import { ProcessedSellerboardStock } from '@/types/processors';

export function processSellerboardStock(data: any[], salesReturnsData?: any[] | null): ProcessedSellerboardStock[] {
  // Create a map of SKU to total sales in the last 30 days
  const salesMap: Record<string, number> = {};
  
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
    relevantSalesData.forEach((item, index) => {
      // Look for data under the "Totals" section and find the "Sales" column
      const sku = item.SKU || '';

      // --- Enhanced Sales Value Parsing ---
      const originalSalesValue = item.Totals;

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
      
      // Attempt to parse the cleaned value
      const sales = parseFloat(cleanedSalesValue || 0);
      
      if (sku && !isNaN(sales)) {
        // Use normalized SKU for the map
        const normalizedSku = normalizeSkuForMapping(sku);
        // If we already have a value for this SKU, add to it (handling potential duplicates)
        salesMap[normalizedSku] = (salesMap[normalizedSku] || 0) + sales;
      }
    }); // End forEach
  }
  
  // Log the sales map for debugging
  // console.log('Sales map entries:', Object.keys(salesMap).length); // Logging removed
  // console.log('Full Sales map contents:', salesMap); // Logging removed
  
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
  return Array.from(uniqueItems.values()).map((item, index) => {
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
    
    // --- Remove logging --- 
    // if (index < 3) { ... logging removed ... }
    // --- End Logging ---
    
    return {
      SKU: sku,
      ASIN: item.ASIN || item.asin || '',
      "Product Name": item.Title || item.title || item["Product Name"] || '',
      "FBA Quantity": fbaQuantity,
      "Internal Stock": parseInt(item["FBA prep. stock Prep center 1 stock"] || 0),
      "Units In Transit": sentToFBAValue,
      "Reserved Units": reservedUnits,
      "Total Stock": fbaQuantity + reservedUnits,
      "Avg. Daily Sales": parseFloat(item["Estimated\nSales\nVelocity"] || 0),
      "Avg. Total Sales (30 Days)": avgSales3Days,
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
} 