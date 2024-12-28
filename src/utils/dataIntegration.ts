import { IntegratedStockData } from "@/types/stock";
import { processInternalStock } from "./processors/internalStockProcessor";
import { processZFSStock } from "./processors/zfsStockProcessor";
import {
  processZFSShipments,
  processZFSReceivedShipments,
} from "./processors/shipmentProcessors";
import { processSKUEANMapping } from "./processors/skuEanProcessor";
import { calculateZFSPendingShipments } from "./calculators/pendingShipments";
import { integrateStockData } from "./mergers/dataIntegrator";

export function processAndIntegrateData(
  internal: any[],
  zfs: any[],
  zfsShipments: any[],
  zfsShipmentsReceived: any[],
  skuEanMapper: any[]
): IntegratedStockData[] {
  // Process individual data sources
  const processedInternal = processInternalStock(internal);
  const processedZFS = processZFSStock(zfs);
  const processedZFSShipments = processZFSShipments(zfsShipments);
  const processedZFSReceived =
    processZFSReceivedShipments(zfsShipmentsReceived);
  const processedMapping = processSKUEANMapping(skuEanMapper);

  // Calculate pending shipments
  const zfsPendingShipments = calculateZFSPendingShipments(
    processedZFSShipments,
    processedZFSReceived
  );

  // Integrate all data
  return integrateStockData(
    processedInternal,
    processedZFS,
    processedMapping,
    zfsPendingShipments
  );
}
