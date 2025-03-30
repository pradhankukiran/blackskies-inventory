import { ProcessedSellerboardStock } from '@/types/processors';

export function processSellerboardStock(data: any[]): ProcessedSellerboardStock[] {
  return data.map(item => {
    const fbaQuantity = parseInt(item["FBA/FBM Stock"] || item["Stock"] || item.stock || item["FBA Quantity"] || 0);
    const reservedUnits = parseInt(item["Reserved"] || 0);
    
    return {
      SKU: item.SKU || item.sku || '',
      ASIN: item.ASIN || item.asin || '',
      "Product Name": item.Title || item.title || item["Product Name"] || '',
      "FBA Quantity": fbaQuantity,
      "Internal Stock": parseInt(item["FBA prep. stock Prep center 1 stock"] || 0),
      "Units In Transit": parseInt(item["Sent to FBA"] || 0),
      "Reserved Units": reservedUnits,
      "Total Stock": fbaQuantity + reservedUnits,
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