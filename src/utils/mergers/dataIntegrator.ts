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
  const skuToEanMap = new Map(
    skuEanMapping.map((item) => [item.SKU, item.EAN])
  );
  const eanToSkuMap = new Map(
    skuEanMapping.map((item) => [item.EAN, item.SKU])
  );
  const integratedMap = new Map<string, IntegratedStockData>();

  // Process internal stock
  internalStock.forEach((item) => {
    const ean = skuToEanMap.get(item.SKU) || "";
    integratedMap.set(item.SKU, {
      SKU: item.SKU,
      EAN: ean,
      "Product Name": item["Product Name"],
      "Internal Stock Quantity": item["Internal Stock Quantity"],
      "ZFS Quantity": 0,
      "ZFS Pending Shipment": 0,
    });
  });

  // Process ZFS stock
  zfsStock.forEach((item) => {
    const sku = eanToSkuMap.get(item.EAN);
    if (sku && integratedMap.has(sku)) {
      const record = integratedMap.get(sku)!;
      record["ZFS Quantity"] = item["ZFS Quantity"];
      record["ZFS Pending Shipment"] = zfsPendingShipments.get(item.EAN) || 0;
      if (!record["Product Name"]) {
        record["Product Name"] = item["Product Name"];
      }
      integratedMap.set(sku, record);
    }
  });

  const integrated = Array.from(integratedMap.values()).sort((a, b) =>
    a.SKU.localeCompare(b.SKU)
  );

  return filterDuplicates(integrated);
}