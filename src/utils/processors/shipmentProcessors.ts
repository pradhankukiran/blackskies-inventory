import { ProcessedFBAShipment, ProcessedZFSShipment, ProcessedZFSReceivedShipment } from '@/types/processors';

export function processFBAShipments(data: any[]): ProcessedFBAShipment[] {
  return data.map(item => ({
    SKU: item["Händler-SKU"],
    "FBA Shipped Quantity": parseInt(item["Versendete Einheiten"]) || 0
  }));
}

export function processZFSShipments(data: any[]): ProcessedZFSShipment[] {
  return data.map(item => ({
    EAN: item.EAN,
    "ZFS Shipped Quantity": parseInt(item.Quantity) || 0
  }));
}

export function processZFSReceivedShipments(data: any[]): ProcessedZFSReceivedShipment[] {
  return data.map(item => ({
    EAN: item.EAN,
    "ZFS Received Quantity": parseInt(item.Quantity) || 0
  }));
}