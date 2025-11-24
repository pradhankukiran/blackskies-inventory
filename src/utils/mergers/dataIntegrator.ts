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
  // Helper to normalize SKUs for robust matching
  const normalizeSku = (sku: string) => (sku || '').trim().toUpperCase();

  // Precompute normalized internal SKUs for quick lookups
  const internalWithNorm = internalStock.map((item) => ({
    ...item,
    _normSKU: normalizeSku(item.SKU),
  }));

  const integrated = skuEanMapping
    .map((mapping) => {
      const normMappingSKU = normalizeSku(mapping.SKU);

      // Try exact match first (case-insensitive)
      let internalData = internalWithNorm.find((item) => item._normSKU === normMappingSKU);

      // If not found, try to aggregate variant SKUs that share the same base (prefix match)
      if (!internalData) {
        const variantMatches = internalWithNorm.filter((item) =>
          item._normSKU === normMappingSKU || item._normSKU.startsWith(`${normMappingSKU}-`)
        );

        if (variantMatches.length > 0) {
          // Aggregate stock across variants
          const aggregated = variantMatches.reduce(
            (acc, cur) => ({
              SKU: mapping.SKU,
              "Product Name": acc["Product Name"] || cur["Product Name"] || '',
              "Internal Stock Quantity": acc["Internal Stock Quantity"] + (cur["Internal Stock Quantity"] || 0),
              "Available Stock": acc["Available Stock"] + (cur["Available Stock"] || 0),
            }),
            { SKU: mapping.SKU, "Product Name": '', "Internal Stock Quantity": 0, "Available Stock": 0 }
          );
          internalData = { ...aggregated, _normSKU: normMappingSKU } as any;
        }
      }

      // Default if still no internal match
      const internalFinal = internalData || {
        "Product Name": "",
        "Internal Stock Quantity": 0,
        "Available Stock": 0,
      };

      // Find matching ZFS stock (by EAN); allow missing and default to zeros
      const zfsData = zfsStock.find((item) => item.EAN === mapping.EAN) || {
        EAN: mapping.EAN,
        "Product Name": "",
        "ZFS Quantity": 0,
        "Status Cluster": "Unknown",
        "Status Description": "Nil",
        country: '',
        partner_variant_size: '',
      } as ProcessedZFSStock;

      // Get pending shipments for this EAN
      const pendingShipment = zfsPendingShipments.get(mapping.EAN) || 0;

      // Combine the data, preferring the internal product name if available
      return {
        SKU: mapping.SKU,
        EAN: mapping.EAN,
        "Product Name": internalFinal["Product Name"] || zfsData["Product Name"] || "Unknown",
        "Internal Stock Quantity": internalFinal["Internal Stock Quantity"],
        "Available Stock": internalFinal["Available Stock"],
        "ZFS Quantity": zfsData["ZFS Quantity"],
        "ZFS Pending Shipment": pendingShipment,
        "Status Cluster": zfsData["Status Cluster"] || "Unknown",
        "Status Description": zfsData["Status Description"] || "Nil",
        "country": (zfsData as any).country || '',
        "partner_variant_size": (zfsData as any).partner_variant_size || ''
      };
    });

  return filterDuplicates(integrated);
}
