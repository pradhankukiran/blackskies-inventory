import { useState, useEffect, useRef } from 'react';
import { ParsedData, FileState } from '@/types/stock';
import { ArticleRecommendation } from '@/types/sales';
import { TimelineType } from '@/types/common';
import { 
  storeFiles, 
  getFiles, 
  clearFiles, 
  getStoredData, 
  storeData, 
  clearStoredData,
  storeBlacklist,
  getBlacklist
} from '@/lib/indexedDB';

export function useFileProcessing() {
  const [files, setFiles] = useState<FileState>({
    internal: null,
    fba: null,
    zfs: [],
    zfsShipments: [],
    zfsShipmentsReceived: [],
    skuEanMapper: null,
    zfsSales: null,
    sellerboardExport: null,
    sellerboardReturns: null,
    fbaSales: null,
    storeType: 'zfs'
  });

  const [parsedData, setParsedData] = useState<ParsedData>({
    internal: [],
    zfs: [],
    zfsShipments: [],
    zfsShipmentsReceived: [],
    skuEanMapper: [],
    zfsSales: [],
    integrated: [],
    sellerboardStock: []
  });

  const [recommendations, setRecommendations] = useState<ArticleRecommendation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [blacklist, setBlacklist] = useState<string[]>([]);
  const blacklistRef = useRef<string[]>([]);
  useEffect(() => {
    blacklistRef.current = blacklist;
  }, [blacklist]);

  // Initialize timeline from localStorage if available
  const [timeline, setTimeline] = useState<TimelineType>(() => {
    const savedTimeline = localStorage.getItem('zfsTimeline');
    return (savedTimeline as TimelineType) || 'none';
  });
  const [worker, setWorker] = useState<Worker | null>(null);

  // Wrap the setTimeline function to save to IndexedDB
  const handleTimelineChange = async (newTimeline: TimelineType) => {
    setTimeline(newTimeline);
    
    // Save the timeline to localStorage for persistence across tab changes
    localStorage.setItem('zfsTimeline', newTimeline);
    
    // Save the updated timeline to IndexedDB
    try {
      const savedData = await getStoredData('zfs');
      if (savedData) {
        await storeData({
          ...savedData,
          timeline: newTimeline,
          blacklist: blacklistRef.current
        }, 'zfs');
      } else {
        await storeData({
          parsedData: {
            internal: [],
            zfs: [],
            zfsShipments: [],
            zfsShipmentsReceived: [],
            skuEanMapper: [],
            zfsSales: [],
            integrated: [],
            sellerboardStock: []
          },
          recommendations: [],
          timeline: newTimeline,
          coverageDays: 14,
          blacklist: blacklistRef.current
        }, 'zfs');
      }
    } catch (err) {
      console.error("Error saving timeline:", err);
    }
  };

  // Load data from IndexedDB on mount
  useEffect(() => {
    const loadSavedData = async () => {
      const savedData = await getStoredData('zfs');
      if (savedData) {
        if (savedData.parsedData) {
          setParsedData(savedData.parsedData);
        }
        if (savedData.recommendations) {
          setRecommendations(savedData.recommendations);
        }
        if (savedData.timeline) {
          setTimeline(savedData.timeline);
        }
        if (savedData.blacklist) {
          setBlacklist(savedData.blacklist.map((sku) => sku.trim().toUpperCase()).filter(Boolean));
        }
      } else {
        const storedBlacklist = await getBlacklist('zfs');
        if (storedBlacklist.length > 0) {
          setBlacklist(storedBlacklist.map((sku) => sku.trim().toUpperCase()).filter(Boolean));
        }
      }
    };
    loadSavedData();
  }, []);

  useEffect(() => {
    const loadSavedFiles = async () => {
      const savedFiles = await getFiles('zfs');
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
            sellerboardStock: data.sellerboardStock || []
          });
          try {
            const currentBlacklist = blacklistRef.current;
            await storeData({ 
              parsedData: data, 
              recommendations: data.recommendations,
              timeline: timeline,
              blacklist: currentBlacklist
            }, 'zfs');
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
    
    const storeType = type.startsWith('zfs') ? 'zfs' : 'fba';

    if (Array.isArray(files[type])) {
      setFiles((prev) => ({
        ...prev,
        storeType,
        [type]: [...(prev[type] as File[]), ...Array.from(newFiles)],
      }));
    } else {
      setFiles((prev) => ({
        ...prev,
        storeType,
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

  const processFiles = async (timeline: TimelineType) => {
    if (!worker) {
      setError('Worker not initialized');
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);
      setProcessingStatus('Initializing...');
      // Use the current timeline value from state and also update it
      handleTimelineChange(timeline);
      const currentBlacklist = blacklistRef.current;
      worker.postMessage({ files, timeline, blacklist: currentBlacklist });
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
      zfs: [],
      zfsShipments: [],
      zfsShipmentsReceived: [],
      skuEanMapper: null,
      zfsSales: null,
      sellerboardExport: null,
      sellerboardReturns: null,
      fbaSales: null,
      storeType: 'zfs',
    });
    clearTables();
    // Reset timeline to 'none'
    setTimeline('none');
    // Also clear from localStorage
    localStorage.removeItem('zfsTimeline');
    
    // Update stored data to reset coverageDays to default value
    getStoredData('zfs').then(savedData => {
      if (savedData) {
        storeData({
          ...savedData,
          timeline: 'none',
          coverageDays: 14,
          blacklist: blacklistRef.current
        }, 'zfs').catch(() => {});
      } else if (blacklist.length > 0) {
        storeBlacklist(blacklistRef.current, 'zfs').catch(() => {});
      }
    }).catch(() => {});

    clearFiles('zfs').catch(() => {});
    clearStoredData('zfs').then(() => {
      if (blacklistRef.current.length > 0) {
        storeBlacklist(blacklistRef.current, 'zfs').catch(() => {});
      }
    }).catch(() => {});
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
      sellerboardStock: []
    });
    setRecommendations([]);
    
    // Clear data from storage while preserving timeline
    getStoredData('zfs').then(savedData => {
      if (savedData) {
        storeData({
          ...savedData,
          parsedData: {
            internal: [],
            zfs: [],
            zfsShipments: [],
            zfsShipmentsReceived: [],
            skuEanMapper: [],
            zfsSales: [],
            integrated: [],
            sellerboardStock: []
          },
          recommendations: []
        }, 'zfs').catch(err => {
          console.error("Error updating stored data:", err);
        });
      }
    }).catch(err => {
      console.error("Error retrieving stored data:", err);
    });
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
    timeline,
    error,
    isProcessing,
    processingStatus,
    handleFileChange,
    handleRemoveFile,
    processFiles,
    setTimeline: handleTimelineChange,
    resetFiles,
    clearTables,
    resetAll,
    setError,
    blacklist,
    addToBlacklist: async (value: string) => {
      const normalized = value.trim().toUpperCase();
      if (!normalized) return;
      setBlacklist((prev) => {
        if (prev.includes(normalized)) {
          return prev;
        }
        const updated = [...prev, normalized];
        storeBlacklist(updated, 'zfs').catch(() => {});
        return updated;
      });
    },
    removeFromBlacklist: async (value: string) => {
      const normalized = value.trim().toUpperCase();
      setBlacklist((prev) => {
        const updated = prev.filter((item) => item !== normalized);
        storeBlacklist(updated, 'zfs').catch(() => {});
        return updated;
      });
    },
    setBlacklist,
  };
}
