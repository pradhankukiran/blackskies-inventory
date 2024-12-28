import { SKUEANMapping } from '@/types/processors';

export function processSKUEANMapping(data: any[]): SKUEANMapping[] {
  return data.map(item => ({
    SKU: item.SKU,
    EAN: item.EAN
  }));
}