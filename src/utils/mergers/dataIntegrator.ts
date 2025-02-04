import { IntegratedStockData } from "@/types/stock";
import {
  ProcessedInternalStock,
  ProcessedZFSStock,
  SKUEANMapping,
} from "@/types/processors";
import { filterDuplicates } from "../filters/duplicateFilter";

export function integrateStockData(
  internalStock: ProcessedInternalStock[],
  zfsStock: ProcessedZFSStock[],
  skuEanMapping: SKUEANMapping[],
  zfsPendingShipments: Map<string, number>
): IntegratedStockData[] {
  // Start with SKU-EAN mapping as the base
  const integrated = skuEanMapping.map((mapping) => {
    // Find matching internal stock (LEFT JOIN)
    const internalData = internalStock.find(item => item.SKU === mapping.SKU) || {
      "Product Name": "",
      "Internal Stock Quantity": 0
    };

    // Find matching ZFS stock (LEFT JOIN)
    const zfsData = zfsStock.find(item => item.EAN === mapping.EAN) || {
      "Product Name": "",
      "ZFS Quantity": 0
    };

    // Get pending shipments for this EAN
    const pendingShipment = zfsPendingShipments.get(mapping.EAN) || 0;

    // Combine the data, preferring internal product name if available
    return {
      SKU: mapping.SKU,
      EAN: mapping.EAN,
      "Product Name": internalData["Product Name"] || zfsData["Product Name"] || "Unknown",
      "Internal Stock Quantity": internalData["Internal Stock Quantity"],
      "ZFS Quantity": zfsData["ZFS Quantity"],
      "ZFS Pending Shipment": pendingShipment
    };
  });

  return filterDuplicates(integrated);
}