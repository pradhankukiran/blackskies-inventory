import { parseCSVFile } from '@/utils/fileParser';
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
  
  return parseCSVFile(file, (progress) => {
    self.postMessage({
      type: 'status',
      message: `${message} (${Math.round(progress)}%)`
    });
  });
};

self.onmessage = async (e) => {
  try {
    const { files, timeline } = e.data;
    
    // Process files with progress tracking
    const internal = await processFileWithProgress(
      'Loading internal stock data',
      files.internal
    );
    
    const zfs = await processFileWithProgress(
      'Loading ZFS stock data',
      files.zfs
    );
    
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
    
    const zfsSales = await processFileWithProgress(
      'Processing sales data',
      files.zfsSales
    );

    self.postMessage({ type: 'status', message: 'Flattening shipment data' });
    const flattenedShipments = zfsShipments.flat();
    const flattenedReceived = zfsShipmentsReceived.flat();
    
    self.postMessage({ type: 'status', message: 'Integrating stock data' });
    const integrated = processAndIntegrateData(
      internal,
      zfs,
      flattenedShipments,
      flattenedReceived,
      skuEanMapper
    );

    const processedSales = zfsSales.length > 0 ? processZFSSales(zfsSales) : [];
    
    self.postMessage({ type: 'status', message: 'Calculating stock recommendations' });
    const stockRecommendations = processedSales.length > 0
      ? calculateStockRecommendations(processedSales, integrated, 1, timeline)
      : [];
    
    self.postMessage({ type: 'status', message: 'Finalizing results' });

    self.postMessage({
      type: 'complete',
      success: true,
      data: {
        internal,
        zfs,
        zfsShipments: flattenedShipments,
        zfsShipmentsReceived: flattenedReceived,
        skuEanMapper,
        zfsSales: processedSales,
        integrated,
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