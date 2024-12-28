import { useState, useEffect } from 'react';
import { ParsedData, FileState } from '@/types/stock';
import { CategoryRecommendation } from '@/types/sales';
import { parseCSVFile } from '@/utils/fileParser';
import { processAndIntegrateData } from '@/utils/dataIntegration';
import { processZFSSales } from '@/utils/processors/zfsSalesProcessor';
import { calculateStockRecommendations } from '@/utils/calculators/stockRecommendations';
import { storeFiles, getFiles, clearFiles } from '@/lib/indexedDB';

export function useFileProcessing() {
  const [files, setFiles] = useState<FileState>({
    internal: null,
    fba: null,
    zfs: null,
    zfsShipments: [],
    zfsShipmentsReceived: [],
    skuEanMapper: null,
    zfsSales: null,
  });

  const [parsedData, setParsedData] = useState<ParsedData>({
    internal: [],
    zfs: [],
    zfsShipments: [],
    zfsShipmentsReceived: [],
    skuEanMapper: [],
    zfsSales: [],
    integrated: [],
  });

  const [recommendations, setRecommendations] = useState<CategoryRecommendation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const loadSavedFiles = async () => {
      const savedFiles = await getFiles();
      if (savedFiles) {
        setFiles(savedFiles);
      }
    };
    loadSavedFiles();
  }, []);

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
    type: keyof FileState
  ) => {
    const newFiles = event.target.files;
    if (!newFiles) return;

    if (Array.isArray(files[type])) {
      setFiles((prev) => ({
        ...prev,
        [type]: [...(prev[type] as File[]), ...Array.from(newFiles)],
      }));
    } else {
      setFiles((prev) => ({
        ...prev,
        [type]: newFiles[0],
      }));
    }
  };

  const handleRemoveFile = (fileName: string, type: keyof FileState) => {
    if (Array.isArray(files[type])) {
      setFiles((prev) => ({
        ...prev,
        [type]: (prev[type] as File[]).filter((f) => f.name !== fileName),
      }));
    } else {
      setFiles((prev) => ({
        ...prev,
        [type]: null,
      }));
    }
  };

  const processFiles = async () => {
    try {
      setIsProcessing(true);
      setError(null);

      const internal = files.internal ? await parseCSVFile(files.internal) : [];
      const zfs = files.zfs ? await parseCSVFile(files.zfs) : [];
      const zfsShipments = await Promise.all(
        files.zfsShipments.map((file) => parseCSVFile(file))
      );
      const zfsShipmentsReceived = await Promise.all(
        files.zfsShipmentsReceived.map((file) => parseCSVFile(file))
      );
      const skuEanMapper = files.skuEanMapper
        ? await parseCSVFile(files.skuEanMapper)
        : [];
      const zfsSales = files.zfsSales ? await parseCSVFile(files.zfsSales) : [];

      const flattenedShipments = zfsShipments.flat();
      const flattenedReceived = zfsShipmentsReceived.flat();
      const integrated = processAndIntegrateData(
        internal,
        zfs,
        flattenedShipments,
        flattenedReceived,
        skuEanMapper
      );

      const processedSales = zfsSales.length > 0 ? processZFSSales(zfsSales) : [];
      const stockRecommendations =
        processedSales.length > 0
          ? calculateStockRecommendations(processedSales)
          : [];

      setParsedData({
        internal,
        zfs,
        zfsShipments: flattenedShipments,
        zfsShipmentsReceived: flattenedReceived,
        skuEanMapper,
        zfsSales: processedSales,
        integrated,
      });

      setRecommendations(stockRecommendations);
      await storeFiles(files);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred while processing files");
    } finally {
      setIsProcessing(false);
    }
  };

  const resetAll = async () => {
    setFiles({
      internal: null,
      fba: null,
      zfs: null,
      zfsShipments: [],
      zfsShipmentsReceived: [],
      skuEanMapper: null,
      zfsSales: null,
    });
    setParsedData({
      internal: [],
      zfs: [],
      zfsShipments: [],
      zfsShipmentsReceived: [],
      skuEanMapper: [],
      zfsSales: [],
      integrated: [],
    });
    setRecommendations([]);
    setError(null);
    await clearFiles();
  };

  return {
    files,
    parsedData,
    recommendations,
    error,
    isProcessing,
    handleFileChange,
    handleRemoveFile,
    processFiles,
    resetAll,
  };
}