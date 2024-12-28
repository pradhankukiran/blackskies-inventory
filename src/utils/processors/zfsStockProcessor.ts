import { ProcessedZFSStock } from '@/types/processors';

export function processZFSStock(data: any[]): ProcessedZFSStock[] {
  return data.map(item => ({
    EAN: item.ean,
    "Product Name": item.article_name,
    "ZFS Quantity": parseInt(item.sellable_zfs_stock) || 0
  }));
}