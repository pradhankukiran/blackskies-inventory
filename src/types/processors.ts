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

export interface ProcessedFBAStock {
  SKU: string;
  "FBA Quantity": number;
}

export interface ProcessedFBAShipment {
  SKU: string;
  "FBA Shipped Quantity": number;
}

export interface ProcessedSellerboardStock {
  ASIN: string;
  SKU: string;
  "Product Name": string;
  "FBA Quantity": number;
  "Internal Stock": number;
  "Recommended Quantity": number;
  "Units In Transit": number;
  "Reserved Units": number;
  "Total Stock"?: number;
  "Avg. Daily Sales": number;
  "Avg. Total Sales (30 Days)": number;
  "Avg. Return Rate (%)": number;
  "Status": string;
  "Size": string;
  "Price": number;
  "Restock Level": number;
  "Regular Price": number;
  "Buy Box Price": number;
  "Fulfillment Fee": number;
  "Shipping Type": string;
  "Weight": string;
  "Dimensions": string;
  "Color": string;
  "Marketplace": string;
  "Coverage Period (Days)"?: number;
}

export interface SKUEANMapping {
  SKU: string;
  EAN: string;
}