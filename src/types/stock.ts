import { ArticleRecommendation } from './sales';
import { ProcessedSellerboardStock } from './processors';

export interface ParsedData {
  internal: any[];
  zfs: any[];
  zfsShipments: any[];
  zfsShipmentsReceived: any[];
  skuEanMapper: any[];
  zfsSales: any[];
  integrated: IntegratedStockData[];
  sellerboardStock: ProcessedSellerboardStock[];
}

export interface FileState {
  internal: File | null;
  fba: File | null;
  zfs: File | null;
  zfsShipments: File[];
  zfsShipmentsReceived: File[];
  skuEanMapper: File | null;
  zfsSales: File | null;
  sellerboardExport: File | null;
  sellerboardReturns: File | null;
  storeType?: 'zfs' | 'fba';
}

export interface IntegratedStockData {
  SKU: string;
  EAN: string;
  "Product Name": string;
  "Internal Stock Quantity": number;
  "Available Stock": number;
  "ZFS Quantity": number;
  "ZFS Pending Shipment": number;
  "Status Cluster": string;
  "Status Description": string;
  "country": string;
  "partner_variant_size": string;
}