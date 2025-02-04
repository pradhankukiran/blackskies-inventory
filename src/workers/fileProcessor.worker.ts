import { parseCSVFile } from '@/utils/fileParser';
import { processAndIntegrateData } from '@/utils/dataIntegration';
import { processZFSSales } from '@/utils/processors/zfsSalesProcessor';
import { calculateStockRecommendations } from '@/utils/calculators/stockRecommendations';

// Helper function to add delay and update status
const withDelay = async (message: string, operation: () => Promise<any> | any) => {
  self.postMessage({ type: 'status', message });
  // Add a minimum delay of 800ms for each step
  const [result] = await Promise.all([
    operation(),
    new Promise(resolve => setTimeout(resolve, 2500))
  ]);
  return result;
};

self.onmessage = async (e) => {
  try {
    const { files } = e.data;
    
    // Process files
    const internal = await withDelay(
      'Loading internal stock data',
      () => files.internal ? parseCSVFile(files.internal) : []
    );
    
    const zfs = await withDelay(
      'Loading ZFS stock data',
      () => files.zfs ? parseCSVFile(files.zfs) : []
    );
    
    const zfsShipments = await withDelay(
      'Processing ZFS shipment data',
      () => Promise.all(files.zfsShipments.map((file) => parseCSVFile(file)))
    );
    
    const zfsShipmentsReceived = await withDelay(
      'Processing received shipments',
      () => Promise.all(files.zfsShipmentsReceived.map((file) => parseCSVFile(file)))
    );
    
    const skuEanMapper = await withDelay(
      'Loading SKU-EAN mapping data',
      () => files.skuEanMapper ? parseCSVFile(files.skuEanMapper) : []
    );
    
    const zfsSales = await withDelay(
      'Processing sales data',
      () => files.zfsSales ? parseCSVFile(files.zfsSales) : []
    );

    // Process data integration
    const [flattenedShipments, flattenedReceived] = await withDelay(
      'Flattening shipment data',
      () => [zfsShipments.flat(), zfsShipmentsReceived.flat()]
    );
    
    const integrated = await withDelay(
      'Integrating stock data',
      () => processAndIntegrateData(
        internal,
        zfs,
        flattenedShipments,
        flattenedReceived,
        skuEanMapper
      )
    );

    const processedSales = zfsSales.length > 0 ? processZFSSales(zfsSales) : [];
    const stockRecommendations = await withDelay(
      'Calculating stock recommendations',
      () => processedSales.length > 0
        ? calculateStockRecommendations(processedSales)
        : []
    );

    await withDelay('Finalizing results', () => Promise.resolve());

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