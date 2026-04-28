import { ProcessedInternalStock } from '@/types/processors';

export function processInternalStock(data: any[]): ProcessedInternalStock[] {
  return data
    .filter(item => item.SKU && String(item.SKU).trim() !== '')
    .map(item => {
      const qty = parseInt(item.Lager) || 0;
      return {
        SKU: String(item.SKU).trim(),
        "Product Name": item.Title || '',
        "Internal Stock Quantity": qty,
        "Available Stock": qty,
      };
    });
}