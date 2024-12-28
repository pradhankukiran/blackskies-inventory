import { IntegratedStockData } from "@/types/stock";

export function filterDuplicates(data: IntegratedStockData[]): IntegratedStockData[] {
  const seen = new Set<string>();
  
  return data.filter(item => {
    const key = `${item.SKU}-${item.EAN}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}