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
  const integrated = skuEanMapping
    .map((mapping) => {
      // Find matching internal stock (LEFT JOIN)
      const internalData =
        internalStock.find((item) => item.SKU === mapping.SKU) || {
          "Product Name": "",
          "Internal Stock Quantity": 0,
          "Available Stock": 0
        };

      // Find matching ZFS stock (without a fallback)
      const zfsData = zfsStock.find((item) => item.EAN === mapping.EAN);

      // If there's no matching ZFS stock record, skip this mapping
      if (!zfsData) {
        return null;
      }

      // Get pending shipments for this EAN
      const pendingShipment = zfsPendingShipments.get(mapping.EAN) || 0;

      // Combine the data, preferring the internal product name if available
      return {
        SKU: mapping.SKU,
        EAN: mapping.EAN,
        "Product Name": internalData["Product Name"] || zfsData["Product Name"] || "Unknown",
        "Internal Stock Quantity": internalData["Internal Stock Quantity"],
        "Available Stock": internalData["Available Stock"],
        "ZFS Quantity": zfsData["ZFS Quantity"],
        "ZFS Pending Shipment": pendingShipment,
        "Status Cluster": zfsData["Status Cluster"] || "Unknown",
        "Status Description": zfsData["Status Description"] || "Nil",
        "country": zfsData.country,
        "partner_variant_size": zfsData.partner_variant_size
      };
    })
    .filter((item): item is IntegratedStockData => item !== null);

  return filterDuplicates(integrated);
}