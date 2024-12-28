import { ProcessedFBAStock } from '@/types/processors';

export function processFBAStock(data: any[]): ProcessedFBAStock[] {
  return data.map(item => ({
    SKU: item["seller-sku"],
    "FBA Quantity": parseInt(item["Quantity Available"]) || 0
  }));
}