import { useState, useEffect } from 'react';
import { ParsedData, FileState } from '@/types/stock';
import { CategoryRecommendation } from '@/types/sales';
import { 
  storeFiles, 
  getFiles, 
  clearFiles, 
  getStoredData, 
  storeData, 
  clearStoredData 
} from '@/lib/indexedDB';

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
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [worker, setWorker] = useState<Worker | null>(null);

  // Load data from localStorage on mount
  useEffect(() => {
    const loadSavedData = async () => {
      const savedData = await getStoredData();
      if (savedData?.parsedData && savedData?.recommendations) {
        setParsedData(savedData.parsedData);
        setRecommendations(savedData.recommendations);
      }
    };
    loadSavedData();
  }, []);

  useEffect(() => {
    const loadSavedFiles = async () => {
      const savedFiles = await getFiles();
      if (savedFiles) {
        setFiles(savedFiles);
      }
    };
    loadSavedFiles();

    // Initialize worker
    const newWorker = new Worker(
      new URL('../workers/fileProcessor.worker.ts', import.meta.url),
      { type: 'module' }
    );

    newWorker.onmessage = async (e) => {
      if (e.data.type === 'status') {
        setProcessingStatus(e.data.message);
        return;
      }

      if (e.data.type === 'complete') {
        if (e.data.success) {
          const { data } = e.data;
          setParsedData({
            internal: data.internal,
            zfs: data.zfs,
            zfsShipments: data.zfsShipments,
            zfsShipmentsReceived: data.zfsShipmentsReceived,
            skuEanMapper: data.skuEanMapper,
            zfsSales: data.zfsSales,
            integrated: data.integrated,
          });
          try {
            await storeData({ parsedData: data, recommendations: data.recommendations });
          } catch (error) {
            // Silently handle storage errors
          }
          setRecommendations(data.recommendations);
        } else {
          setError(e.data.error);
        }
        setIsProcessing(false);
        setProcessingStatus('');
      }
    };

    setWorker(newWorker);

    return () => {
      newWorker.terminate();
    };
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
    if (!worker) {
      setError('Worker not initialized');
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);
      setProcessingStatus('Initializing...');
      worker.postMessage({ files });
      await storeFiles(files);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred while processing files");
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const resetFiles = () => {
    setFiles({
      internal: null,
      fba: null,
      zfs: null,
      zfsShipments: [],
      zfsShipmentsReceived: [],
      skuEanMapper: null,
      zfsSales: null,
    });
    clearTables();
    clearFiles().catch(() => {});
    clearStoredData().catch(() => {});
  };

  const clearTables = () => {
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
  };

  const resetAll = async () => {
    resetFiles();
    clearTables();
    setError(null);
    setProcessingStatus('');
  };

  return {
    files,
    parsedData,
    recommendations,
    error,
    isProcessing,
    processingStatus,
    handleFileChange,
    handleRemoveFile,
    processFiles,
    resetFiles,
    clearTables,
    resetAll,
  };
}