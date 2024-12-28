import { CategoryRecommendation } from './sales';

export interface ParsedData {
  internal: any[];
  zfs: any[];
  zfsShipments: any[];
  zfsShipmentsReceived: any[];
  skuEanMapper: any[];
  zfsSales: any[];
  integrated: IntegratedStockData[];
}

export interface FileState {
  internal: File | null;
  fba: File | null;
  zfs: File | null;
  zfsShipments: File[];
  zfsShipmentsReceived: File[];
  skuEanMapper: File | null;
  zfsSales: File | null;
}

export interface IntegratedStockData {
  SKU: string;
  EAN: string;
  "Product Name": string;
  "Internal Stock Quantity": number;
  "ZFS Quantity": number;
  "ZFS Pending Shipment": number;
}