export interface ProcessedInternalStock {
  SKU: string;
  "Product Name": string;
  "Internal Stock Quantity": number;
  "Available Stock": number;
}

export interface ProcessedZFSStock {
  EAN: string;
  "Product Name": string;
  "ZFS Quantity": number;
  "Status Cluster": string;
  "Status Description": string;
  "country": string;
  "partner_variant_size": string;
}

export interface ProcessedZFSShipment {
  EAN: string;
  "ZFS Shipped Quantity": number;
}

export interface ProcessedZFSReceivedShipment {
  EAN: string;
  "ZFS Received Quantity": number;
}

export interface SKUEANMapping {
  SKU: string;
  EAN: string;
}