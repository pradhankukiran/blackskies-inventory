import { ProcessedZFSStock } from '@/types/processors';

export function processZFSStock(data: any[]): ProcessedZFSStock[] {
  return data
    .filter(item => String(item.country).toLowerCase() === 'de')
    .map(item => ({
      EAN: item.ean,
      "Product Name": item.article_name,
      "ZFS Quantity": parseInt(item.sellable_zfs_stock) || 0,
      "Status Cluster": item.status_cluster || '',
      "Status Description": item.status_description || '',
      "country": item.country || '',
      "partner_variant_size": item.partner_variant_size || ''
    }));
}