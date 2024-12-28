import { ProcessedInternalStock } from '@/types/processors';

export function processInternalStock(data: any[]): ProcessedInternalStock[] {
  return data.map(item => ({
    SKU: item.articleNumber,
    "Product Name": item.articleName,
    "Internal Stock Quantity": parseInt(item.availableStock) || 0
  }));
}