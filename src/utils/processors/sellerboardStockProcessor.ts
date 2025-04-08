import { ProcessedSellerboardStock } from '@/types/processors';

export function processSellerboardStock(data: any[], salesReturnsData?: any[] | null): ProcessedSellerboardStock[] {
  // Create a map of SKU to total sales in the last 30 days
  const salesMap: Record<string, number> = {};
  
  if (salesReturnsData && salesReturnsData.length > 0) {
    salesReturnsData.forEach(item => {
      // Look for data under the "Totals" section and find the "Sales" column
      const sku = item.SKU || '';
      // Get the sales value from the Totals column (as shown in the image)
      const sales = parseFloat(item.Totals || 0);
      
      if (sku && !isNaN(sales)) {
        salesMap[sku] = sales;
      }
    });
  }
  
  return data.map(item => {
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
    // Calculate average daily sales from the Sales + Returns data
    // Divide by 30 to get the daily average
    const avgDailySales30Days = salesMap[sku] ? salesMap[sku] / 30 : 0;
    
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
      "Avg. Total Sales (30 Days)": avgDailySales30Days,
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
      "Color": item.Color || ''
    };
  });
} 