import { parseFile } from '@/utils/fileParser';
import { processAndIntegrateData } from '@/utils/dataIntegration';
import { processZFSSales } from '@/utils/processors/zfsSalesProcessor';
import { calculateStockRecommendations } from '@/utils/calculators/stockRecommendations';

// Helper function to process file with progress updates
const processFileWithProgress = async (
  message: string,
  file: File | null,
  defaultValue: any[] = []
) => {
  self.postMessage({ type: 'status', message });

  if (!file) return defaultValue;

  return parseFile(file, (progress) => {
    self.postMessage({
      type: 'status',
      message: `${message} (${Math.round(progress)}%)`
    });
  });
};

self.onmessage = async (e) => {
  try {
    const { files, timeline, blacklist = [] } = e.data as {
      files: typeof e.data.files;
      timeline: typeof e.data.timeline;
      blacklist?: string[];
    };
    const normalizedBlacklist = Array.isArray(blacklist)
      ? blacklist
          .map((entry) => (typeof entry === 'string' ? entry.trim().toUpperCase() : ''))
          .filter(Boolean)
      : [];
    const blacklistedSkus = new Set<string>(normalizedBlacklist);
    const blacklistedEans = new Set<string>(normalizedBlacklist);
    
    // Process files with progress tracking
    const internal = await processFileWithProgress(
      'Loading internal stock data',
      files.internal
    );

    // Process multiple ZFS stock files in parallel
    let zfsFiles: any[][] = [];
    if (files.zfs.length > 0) {
      self.postMessage({ type: 'status', message: 'Processing ZFS stock files' });
      const zfsPromises = files.zfs.map((file: File, i: number) =>
        processFileWithProgress(
          `Processing ZFS stock file ${i + 1}/${files.zfs.length}`,
          file
        )
      );
      zfsFiles = await Promise.all(zfsPromises);
    }

    // Process multiple shipment files in parallel
    self.postMessage({ type: 'status', message: 'Processing ZFS shipment files' });
    const zfsShipmentsPromises = files.zfsShipments.map((file: File, i: number) =>
      processFileWithProgress(
        `Processing ZFS shipment file ${i + 1}/${files.zfsShipments.length}`,
        file
      )
    );
    const zfsShipments = await Promise.all(zfsShipmentsPromises);
    
    // Process multiple received shipment files in parallel
    self.postMessage({ type: 'status', message: 'Processing received shipment files' });
    const zfsShipmentsReceivedPromises = files.zfsShipmentsReceived.map((file: File, i: number) => 
      processFileWithProgress(
        `Processing received shipment file ${i + 1}/${files.zfsShipmentsReceived.length}`,
        file
      )
    );
    const zfsShipmentsReceived = await Promise.all(zfsShipmentsReceivedPromises);
    
    const skuEanMapper = await processFileWithProgress(
      'Loading SKU-EAN mapping data',
      files.skuEanMapper
    );

    const normalizeSkuValue = (value: any) => typeof value === 'string' ? value.trim().toUpperCase() : '';
    const normalizeEanValue = (value: any) => typeof value === 'string' ? value.trim().toUpperCase() : '';

    const filteredSkuEanMapper = Array.isArray(skuEanMapper)
      ? skuEanMapper.filter((item: Record<string, any>) => {
          const sku = normalizeSkuValue(item?.SKU ?? item?.sku);
          const ean = normalizeEanValue(item?.EAN ?? item?.ean);
          if (sku && blacklistedSkus.has(sku) && ean) {
            blacklistedEans.add(ean);
          }
          if (ean && blacklistedEans.has(ean) && sku) {
            blacklistedSkus.add(sku);
          }
          return !blacklistedSkus.has(sku) && !blacklistedEans.has(ean);
        })
      : [];

    const filteredInternal = Array.isArray(internal)
      ? internal.filter((item: Record<string, any>) => {
          const sku = normalizeSkuValue(item?.articleNumber ?? item?.SKU ?? item?.sku);
          return !blacklistedSkus.has(sku);
        })
      : [];

    // Flatten and filter ZFS files
    const flattenedZfs = zfsFiles.flat();
    const filteredZfs = Array.isArray(flattenedZfs)
      ? flattenedZfs.filter((item: Record<string, any>) => {
          const ean = normalizeEanValue(item?.EAN ?? item?.ean);
          return !blacklistedEans.has(ean);
        })
      : [];

    const filteredShipments = Array.isArray(zfsShipments)
      ? zfsShipments.map((shipment: any[]) =>
          Array.isArray(shipment)
            ? shipment.filter((row: Record<string, any>) => {
                const ean = normalizeEanValue(row?.EAN ?? row?.ean);
                return !blacklistedEans.has(ean);
              })
            : []
        )
      : [];

    const filteredShipmentsReceived = Array.isArray(zfsShipmentsReceived)
      ? zfsShipmentsReceived.map((shipment: any[]) =>
          Array.isArray(shipment)
            ? shipment.filter((row: Record<string, any>) => {
                const ean = normalizeEanValue(row?.EAN ?? row?.ean);
                return !blacklistedEans.has(ean);
              })
            : []
        )
      : [];

    const zfsSalesRaw = await processFileWithProgress(
      'Processing sales data',
      files.zfsSales
    );

    const filteredZfsSales = Array.isArray(zfsSalesRaw)
      ? zfsSalesRaw.filter((item: Record<string, any>) => {
          const ean = normalizeEanValue(item?.EAN ?? item?.ean);
          return !blacklistedEans.has(ean);
        })
      : [];

    self.postMessage({ type: 'status', message: 'Flattening shipment data' });
    const flattenedShipments = filteredShipments.flat();
    const flattenedReceived = filteredShipmentsReceived.flat();
    
    self.postMessage({ type: 'status', message: 'Integrating stock data' });
    const integrated = processAndIntegrateData(
      filteredInternal,
      filteredZfs,
      flattenedShipments,
      flattenedReceived,
      filteredSkuEanMapper
    );

    const processedSales = filteredZfsSales.length > 0 ? processZFSSales(filteredZfsSales) : [];

    const filteredIntegrated = Array.isArray(integrated)
      ? integrated.filter((item: Record<string, any>) => {
          const sku = normalizeSkuValue(item?.SKU);
          const ean = normalizeEanValue(item?.EAN);
          return !blacklistedSkus.has(sku) && !blacklistedEans.has(ean);
        })
      : [];

    const filteredProcessedSales = processedSales.filter((item: Record<string, any>) => {
      const ean = normalizeEanValue(item?.EAN);
      return !blacklistedEans.has(ean);
    });
    
    self.postMessage({ type: 'status', message: 'Calculating stock recommendations' });
    const stockRecommendations = filteredProcessedSales.length > 0
      ? calculateStockRecommendations(filteredProcessedSales, filteredIntegrated, 1, timeline)
      : [];
    
    self.postMessage({ type: 'status', message: 'Finalizing results' });

    self.postMessage({
      type: 'complete',
      success: true,
      data: {
        internal: filteredInternal,
        zfs: filteredZfs,
        zfsShipments: flattenedShipments,
        zfsShipmentsReceived: flattenedReceived,
        skuEanMapper: filteredSkuEanMapper,
        zfsSales: filteredProcessedSales,
        integrated: filteredIntegrated,
        recommendations: stockRecommendations
      }
    });
  } catch (error) {
    self.postMessage({
      type: 'complete',
      success: false,
      error: error instanceof Error ? error.message : 'An error occurred'
    });
  }
};
